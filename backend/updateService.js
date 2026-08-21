const fs = require('fs');
const path = require('path');
const docker = require('./dockerService').docker; // Use existing docker instance

// Lit les mises à jour OS si le fichier update-notifier est monté
async function getOSUpdates() {
    const notifierPath = '/host/update-notifier/updates-available';
    try {
        if (fs.existsSync(notifierPath)) {
            const content = fs.readFileSync(notifierPath, 'utf8');
            return {
                available: true,
                rawText: content,
                supported: true
            };
        } else {
            return {
                available: false,
                rawText: "Le fichier update-notifier n'est pas disponible ou le volume n'est pas monté.",
                supported: false
            };
        }
    } catch (err) {
        console.error("Erreur lecture OS updates:", err);
        return { available: false, rawText: err.message, supported: false };
    }
}

// Lance un conteneur Watchtower pour mettre à jour un conteneur spécifique
async function applyDockerUpdate(containerName) {
    console.log(`Lancement de Watchtower pour mettre à jour : ${containerName}`);
    
    try {
        // S'assurer que l'image Watchtower est présente pour éviter l'erreur 404
        await new Promise((resolve) => {
            docker.pull('containrrr/watchtower:latest', (err, stream) => {
                if (err) return resolve();
                docker.modem.followProgress(stream, () => resolve());
            });
        });

        // Lance watchtower en tant que conteneur éphémère
        const data = await docker.run('containrrr/watchtower:latest', [containerName, '--run-once'], process.stdout, {
            Env: [
                'DOCKER_API_VERSION=1.40'
            ],
            HostConfig: {
                AutoRemove: true,
                Binds: ['/var/run/docker.sock:/var/run/docker.sock']
            }
        });
        
        const output = data[0];
        
        console.log(`Watchtower terminé avec le code : ${output.StatusCode}`);
        if (output.StatusCode !== 0) {
            throw new Error(`Watchtower a échoué avec le code ${output.StatusCode}`);
        }
        
        return { success: true, message: `Conteneur ${containerName} mis à jour avec succès.` };
    } catch (err) {
        console.error("Erreur Watchtower:", err);
        throw new Error("Erreur lors de la mise à jour Docker : " + err.message);
    }
}

// Cache d'endpoints d'authentification par registre (pour éviter de re-prober à chaque conteneur)
const authEndpointCache = {};

// Récupère le jeton d'auth pour n'importe quel registre OCI
// Utilise une découverte dynamique via WWW-Authenticate pour les registres non-standards
// (lscr.io, Quay.io, registres privés, etc.)
async function getRegistryAuthToken(registry, repo) {
    try {
        let authUrl = '';

        if (registry === 'registry-1.docker.io' || registry === 'docker.io' || registry === 'hub.docker.com') {
            // Docker Hub : endpoint connu
            authUrl = `https://auth.docker.io/token?service=registry.docker.io&scope=repository:${repo}:pull`;
        } else if (authEndpointCache[registry]) {
            // Utilise l'endpoint mis en cache pour ce registre
            authUrl = `${authEndpointCache[registry]}&scope=repository:${repo}:pull`;
        } else {
            // Registre inconnu : on sonde le endpoint /v2/ pour découvrir l'endpoint d'auth
            // via le header WWW-Authenticate (standard OCI Registry Spec)
            const probeRes = await fetch(`https://${registry}/v2/`, {
                headers: { Accept: 'application/json' }
            });
            const wwwAuth = probeRes.headers.get('www-authenticate');

            if (wwwAuth) {
                const realmMatch = wwwAuth.match(/realm="([^"]+)"/);
                const serviceMatch = wwwAuth.match(/service="([^"]+)"/);
                if (realmMatch) {
                    const realm = realmMatch[1];
                    const service = serviceMatch ? serviceMatch[1] : '';
                    const base = `${realm}?service=${service}`;
                    authEndpointCache[registry] = base; // Mise en cache
                    authUrl = `${base}&scope=repository:${repo}:pull`;
                }
            }

            if (!authUrl) {
                // Fallback : pattern courant
                authUrl = `https://${registry}/token?scope=repository:${repo}:pull`;
            }
        }

        const authRes = await fetch(authUrl);
        if (authRes.ok) {
            const authData = await authRes.json();
            return authData.token || authData.access_token || '';
        }
    } catch (e) {
        // Registre public sans authentification
    }
    return '';
}

// Récupère le digest distant d'un tag via l'API Registry V2 (standard OCI)
// C'est exactement ce que fait Watchtower pour détecter les mises à jour
async function getRemoteDigest(registry, repo, tag, token) {
    const headers = {
        'Accept': [
            'application/vnd.docker.distribution.manifest.list.v2+json',
            'application/vnd.oci.image.index.v1+json',
            'application/vnd.docker.distribution.manifest.v2+json',
            'application/vnd.oci.image.manifest.v1+json'
        ].join(', ')
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`https://${registry}/v2/${repo}/manifests/${tag}`, { headers });
    if (!res.ok) return null;
    return res.headers.get('docker-content-digest');
}

// Détermine si un tag est "flottant" (non-versionné numériquement)
// Tags flottants : latest, stable, release, main, edge, etc.
// Tags versionnés : 2026.7.4, v1.9.0, 3.22.0, etc.
function isVersionedTag(tag) {
    return /[0-9]/.test(tag); // Si le tag contient un chiffre, c'est versionné
}

// Comparaison de versions simplifiée qui gère les formats HA (2026.7.4) et SemVer (v1.9.0)
// Retourne true si versionB est strictement plus récente que versionA
function isNewerVersion(versionA, versionB) {
    const normalize = (v) => v.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
    const a = normalize(versionA);
    const b = normalize(versionB);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const ai = a[i] || 0;
        const bi = b[i] || 0;
        if (bi > ai) return true;
        if (bi < ai) return false;
    }
    return false;
}

// Récupère les dernières versions disponibles via GitHub Releases
// Utilisé pour agréger les changelogs des versions intermédiaires
async function getRecentGitHubReleases(githubRepo) {
    try {
        const res = await fetch(`https://api.github.com/repos/${githubRepo}/releases?per_page=100`, {
            headers: { 'User-Agent': 'GestionServeur-App' }
        });
        if (!res.ok) return [];
        return await res.json();
    } catch (e) {
        return [];
    }
}

// Vérifie les mises à jour et les changelogs pour tous les conteneurs
async function checkDockerUpdates() {
    const containers = await docker.listContainers();
    const results = [];
    
    // Récupérer la liste des conteneurs ignorés
    const ignoreRow = await getQuery(`SELECT value FROM settings WHERE key = 'ignore_updates_containers'`);
    let ignoredContainers = [];
    if (ignoreRow.length > 0 && ignoreRow[0].value) {
        try {
            ignoredContainers = JSON.parse(ignoreRow[0].value);
        } catch (e) {
            ignoredContainers = [];
        }
    }

    for (const container of containers) {
        const cName = container.Names[0] ? container.Names[0].replace(/^\//, '') : '';
        if (cName === 'gestion_serveur' || cName === 'gestion_serveur_dev') continue;
        if (ignoredContainers.includes(cName)) continue;

        let imageName = container.Image;
        
        try {
            // Si container.Image est juste un hash sha256 (arrive souvent avec docker-compose), 
            // on essaie de récupérer le vrai nom d'image depuis la config du conteneur.
            const cInfo = await docker.getContainer(container.Id).inspect();
            if ((imageName.startsWith('sha256:') || !imageName.includes(':')) && cInfo.Config.Image && !cInfo.Config.Image.startsWith('sha256:')) {
                imageName = cInfo.Config.Image;
            }
        } catch (e) {
            // Ignorer si on n'arrive pas à inspecter
        }

        let tag = 'latest';
        
        // On retire d'abord le digest (@sha256:...) s'il y en a un
        if (imageName.includes('@')) {
            imageName = imageName.split('@')[0];
        }

        // Ensuite on extrait le tag
        if (imageName.includes(':')) {
            const parts = imageName.split(':');
            imageName = parts[0];
            tag = parts[1];
        }

        let registry = 'registry-1.docker.io';
        let repo = imageName;

        const imgParts = imageName.split('/');
        if (imgParts.length > 1 && imgParts[0].includes('.')) {
            registry = imgParts[0];
            repo = imgParts.slice(1).join('/');
        } else {
            if (!repo.includes('/')) {
                repo = `library/${repo}`;
            }
        }

        let hasUpdate = false;
        let currentVersion = tag;
        let newVersion = tag; // Par défaut, pas de changement
        let changelog = null;
        let isBreaking = false;
        let isUpdatableViaUI = true;

        try {
            const imageInfo = await docker.getImage(container.Image).inspect();
            // Les digests locaux sont sous la forme "registry/repo@sha256:..."
            const localDigests = imageInfo.RepoDigests || [];
            // On extrait juste les parties sha256 pour simplifier la comparaison
            const localDigestSet = new Set(localDigests.map(d => d.split('@')[1]).filter(Boolean));

            const token = await getRegistryAuthToken(registry, repo);
            const labels = imageInfo.Config.Labels || {};
            const sourceLabel = labels['org.opencontainers.image.source'] || labels['org.label-schema.vcs-url'] || '';
            const githubRepo = sourceLabel.includes('github.com')
                ? sourceLabel.replace('https://github.com/', '').replace('.git', '').trim()
                : null;
            
            if (isVersionedTag(tag) && githubRepo) {
                // --- STRATÉGIE A : Tag versionné + source GitHub connue ---
                // On compare la version actuelle avec la dernière release GitHub.
                // Fonctionne pour : HA (2026.7.4), Mealie (v1.9.0), Immich, etc.
                isUpdatableViaUI = false;
                const releases = await getRecentGitHubReleases(githubRepo);
                if (releases && releases.length > 0) {
                    const latestRelease = releases[0];
                    const latestTag = latestRelease.tag_name;
                    if (isNewerVersion(tag, latestTag)) {
                        hasUpdate = true;
                        newVersion = latestTag;
                        
                        let aggregatedChangelog = "";
                        let foundBreaking = false;
                        
                        for (const release of releases) {
                            if (isNewerVersion(tag, release.tag_name)) {
                                if (release.body) {
                                    aggregatedChangelog += `\n\n### Version ${release.tag_name}\n${release.body}`;
                                    if (release.body.includes('BREAKING') || release.body.includes('Breaking') || release.body.includes('MAJOR')) {
                                        foundBreaking = true;
                                    }
                                }
                            } else {
                                break;
                            }
                        }
                        
                        changelog = aggregatedChangelog.trim() || latestRelease.body || null;
                        isBreaking = foundBreaking;
                    }
                }
            } else {
                // --- STRATÉGIE B : Digest universel (comme Watchtower) ---
                // Pour les tags flottants (latest, stable, release...) ou quand pas de source GitHub.
                // On compare le digest local avec le digest distant du même tag.
                const remoteDigest = await getRemoteDigest(registry, repo, tag, token);
                if (remoteDigest) {
                    if (!localDigestSet.has(remoteDigest)) {
                        hasUpdate = true;
                        newVersion = remoteDigest.substring(7, 19);
                        // Bonus : si la source GitHub est connue, on récupère aussi le changelog
                        if (githubRepo) {
                            const releases = await getRecentGitHubReleases(githubRepo);
                            if (releases && releases.length > 0) {
                                const ghRelease = releases[0];
                                newVersion = ghRelease.tag_name || newVersion;
                                
                                // On utilise la date de création de l'image locale pour savoir jusqu'où remonter
                                const localImageDate = new Date(imageInfo.Created);
                                
                                let aggregatedChangelog = "";
                                let foundBreaking = false;
                                
                                for (const release of releases) {
                                    const releaseDate = new Date(release.published_at || release.created_at);
                                    if (releaseDate > localImageDate) {
                                        if (release.body) {
                                            aggregatedChangelog += `\n\n### Version ${release.tag_name}\n${release.body}`;
                                            if (release.body.includes('BREAKING') || release.body.includes('Breaking') || release.body.includes('MAJOR')) {
                                                foundBreaking = true;
                                            }
                                        }
                                    } else {
                                        break; // On a atteint les versions que l'utilisateur a déjà
                                    }
                                }
                                
                                changelog = aggregatedChangelog.trim() || ghRelease.body || null;
                                isBreaking = foundBreaking;
                            }
                        }
                    }
                }
            }
        } catch (err) {
            console.error(`Erreur vérif MAJ pour ${imageName}:`, err.message);
        }

        results.push({
            id: container.Id,
            name: container.Names[0].replace('/', ''),
            image: container.Image,
            tag,
            hasUpdate,
            currentVersion,
            newVersion,
            changelog,
            isBreaking,
            isUpdatableViaUI
        });
    }
    
    return results;
}

const cron = require('node-cron');
const { getQuery } = require('./db');

async function checkAndNotifyUpdates() {
    try {
        const webhookRow = await getQuery(`SELECT value FROM settings WHERE key = 'mattermost_webhook_url'`);
        const webhookUrl = webhookRow.length > 0 ? webhookRow[0].value : null;
        
        if (!webhookUrl) return; // Pas de webhook configuré

        const notifyPref = await getQuery(`SELECT value FROM settings WHERE key = 'notify_updates'`);
        if (notifyPref.length > 0 && notifyPref[0].value === 'false') return;

        let message = "";
        
        // Check OS updates
        const osUpdates = await getOSUpdates();
        if (osUpdates.available) {
            message += `📦 **Mises à jour OS disponibles !**\n${osUpdates.rawText}\n\n`;
        }
        
        // Check Docker updates
        const dockerUpdates = await checkDockerUpdates();
        const availableDockerUpdates = dockerUpdates.filter(u => u.hasUpdate);
        
        if (availableDockerUpdates.length > 0) {
            message += `🐳 **Mises à jour Docker disponibles :**\n`;
            for (const u of availableDockerUpdates) {
                message += `- **${u.name}** : \`${u.currentVersion}\` ➡️ \`${u.newVersion}\` ${u.isBreaking ? '⚠️ *(Breaking Change)*' : ''}\n`;
            }
        }
        
        if (message) {
            const finalMessage = `🔔 **Rapport de Mises à Jour (Gestion Serveur)**\n\n` + message;
            await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: finalMessage })
            });
        }
    } catch (err) {
        console.error("Erreur lors de la notification des mises à jour :", err);
    }
}

let updateCronJob = null;

async function startUpdateNotifier() {
    const cronRow = await getQuery(`SELECT value FROM settings WHERE key = 'update_cron_schedule'`);
    let schedule = cronRow.length > 0 && cronRow[0].value ? cronRow[0].value : '0 9 * * *';
    
    if (!cron.validate(schedule)) {
        console.warn(`[CRON] L'expression '${schedule}' n'est pas valide. Utilisation par défaut '0 9 * * *'`);
        schedule = '0 9 * * *';
    }

    if (updateCronJob) {
        updateCronJob.stop();
    }

    updateCronJob = cron.schedule(schedule, () => {
        console.log("[CRON] Démarrage de la vérification des mises à jour...");
        checkAndNotifyUpdates();
    });
    console.log(`[CRON] Notificateur de MAJ planifié avec l'expression : ${schedule}`);
}

module.exports = {
    getOSUpdates,
    applyDockerUpdate,
    checkDockerUpdates,
    startUpdateNotifier
};
