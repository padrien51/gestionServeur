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

const semver = require('semver');

// Vérifie les mises à jour et les changelogs pour tous les conteneurs
async function checkDockerUpdates() {
    const containers = await docker.listContainers();
    const results = [];

    for (const container of containers) {
        if (container.Names.some(n => n.includes('gestion_serveur'))) continue;

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

        const repoPath = imageName.includes('/') ? imageName : `library/${imageName}`;

        let hasUpdate = false;
        let currentVersion = tag !== 'latest' ? tag : container.ImageID.substring(7, 19);
        let newVersion = 'Inconnu';
        let changelog = null;
        let isBreaking = false;
        let isUpdatableViaUI = true;

        try {
            const imageInfo = await docker.getImage(container.Image).inspect();
            const localDigests = imageInfo.RepoDigests || [];
            
            if (tag === 'latest' || tag === '') {
                // Logique par Digest pour 'latest'
                const response = await fetch(`https://hub.docker.com/v2/repositories/${repoPath}/tags/latest`);
                if (response.ok) {
                    const data = await response.json();
                    const remoteDigest = data.digest;
                    if (remoteDigest) {
                        newVersion = remoteDigest.substring(7, 19);
                        if (!localDigests.some(d => d.includes(remoteDigest))) {
                            hasUpdate = true;
                        } else {
                            newVersion = currentVersion;
                        }
                    }
                }
            } else {
                // Logique SemVer pour tags fixes (ex: 4.1.2)
                isUpdatableViaUI = false; // Ne pas permettre la maj via Watchtower si c'est un tag fixe
                
                const cleanTag = semver.clean(tag) || semver.coerce(tag);
                if (cleanTag) {
                    const response = await fetch(`https://hub.docker.com/v2/repositories/${repoPath}/tags?page_size=100`);
                    if (response.ok) {
                        const data = await response.json();
                        let highestVersion = cleanTag;
                        let foundNewer = false;

                        for (const t of data.results) {
                            const parsed = semver.clean(t.name) || semver.coerce(t.name);
                            if (parsed && semver.gt(parsed, highestVersion)) {
                                highestVersion = parsed;
                                foundNewer = true;
                            }
                        }

                        if (foundNewer) {
                            hasUpdate = true;
                            newVersion = highestVersion.version;
                        } else {
                            newVersion = currentVersion;
                        }
                    }
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
