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

// Fonction utilitaire pour récupérer un jeton d'authentification Registry V2
// Fonctionne avec tous les registres publics : Docker Hub, GHCR, Quay.io, etc.
async function getRegistryAuthToken(registry, repo) {
    try {
        let authUrl = '';
        if (registry === 'registry-1.docker.io' || registry === 'docker.io' || registry === 'hub.docker.com') {
            authUrl = `https://auth.docker.io/token?service=registry.docker.io&scope=repository:${repo}:pull`;
        } else {
            // Standard OCI : le registre expose son endpoint d'auth via le header WWW-Authenticate
            // On essaie d'abord le pattern le plus courant (GHCR, Quay, etc.)
            authUrl = `https://${registry}/token?scope=repository:${repo}:pull`;
        }
        const authRes = await fetch(authUrl);
        if (authRes.ok) {
            const authData = await authRes.json();
            return authData.token || authData.access_token || '';
        }
    } catch (e) {
        // Certains registres publics n'ont pas besoin de jeton
    }
    return '';
}

// Récupère le digest distant d'un tag via l'API Registry V2 (standard OCI)
// C'est exactement ce que fait Watchtower pour détecter les mises à jour
async function getRemoteDigest(registry, repo, tag, token) {
    const headers = {
        // On accepte tous les types de manifests connus (multi-arch, OCI, Docker)
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
        if (cName.includes('gestion_serveur')) continue;
        if (ignoredContainers.includes(cName)) continue;

        let imageName = container.Image;
        let tag = 'latest';
        
        if (imageName.includes(':')) {
            const parts = imageName.split(':');
            imageName = parts[0];
            tag = parts[1];
        }
        if (imageName.includes('@')) {
            imageName = imageName.split('@')[0];
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
            
            // --- STRATÉGIE UNIVERSELLE : Comparaison de Digest (comme Watchtower) ---
            // On interroge le registre pour le digest ACTUEL du même tag que celui en cours d'exécution.
            // Si le digest distant diffère du digest local → une mise à jour est disponible.
            // Cela fonctionne pour tous les types de tags : latest, stable, release, 2024.6.0, v1.9.0, etc.
            const remoteDigest = await getRemoteDigest(registry, repo, tag, token);

            if (remoteDigest) {
                if (!localDigestSet.has(remoteDigest)) {
                    hasUpdate = true;
                    newVersion = remoteDigest.substring(7, 19); // Courte représentation du digest
                } else {
                    newVersion = tag; // Déjà à jour
                }
            }

            // Fetch Changelog from GitHub
            if (hasUpdate) {
                const labels = imageInfo.Config.Labels || {};
                const source = labels['org.opencontainers.image.source'] || labels['org.label-schema.vcs-url'];
                
                if (source && source.includes('github.com')) {
                    const githubRepo = source.replace('https://github.com/', '').replace('.git', '');
                    const ghRes = await fetch(`https://api.github.com/repos/${githubRepo}/releases/latest`, {
                        headers: { 'User-Agent': 'GestionServeur-App' }
                    });
                    if (ghRes.ok) {
                        const ghData = await ghRes.json();
                        changelog = ghData.body;
                        if (changelog && (changelog.includes('BREAKING') || changelog.includes('Breaking') || changelog.includes('MAJOR'))) {
                            isBreaking = true;
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
