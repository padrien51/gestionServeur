const Docker = require('dockerode');
const { runQuery, getQuery } = require('./db');
const fs = require('fs');
const path = require('path');

// On monte le socket docker via docker-compose
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

async function getContainers() {
    try {
        const containers = await docker.listContainers({ all: true });
        return containers.map(c => ({
            id: c.Id,
            name: c.Names[0].replace('/', ''),
            image: c.Image,
            state: c.State,
            status: c.Status,
            project: (c.Labels && c.Labels['com.docker.compose.project']) ? c.Labels['com.docker.compose.project'] : 'Indépendants'
        }));
    } catch (error) {
        console.error("Erreur lors de la récupération des conteneurs:", error);
        throw new Error("Impossible de communiquer avec le démon Docker.");
    }
}

async function getNetworks() {
    try {
        const networks = await docker.listNetworks();
        return networks.map(n => ({
            id: n.Id,
            name: n.Name,
            driver: n.Driver,
            scope: n.Scope,
            subnet: (n.IPAM && n.IPAM.Config && n.IPAM.Config.length > 0) ? n.IPAM.Config[0].Subnet : 'N/A',
            gateway: (n.IPAM && n.IPAM.Config && n.IPAM.Config.length > 0) ? n.IPAM.Config[0].Gateway : 'N/A',
            containers: n.Containers ? Object.keys(n.Containers).length : 0
        }));
    } catch (error) {
        console.error("Erreur lors de la récupération des réseaux:", error);
        throw new Error("Impossible de récupérer les réseaux Docker.");
    }
}

async function startContainer(id) {
    const container = docker.getContainer(id);
    await container.start();
}

async function stopContainer(id) {
    const container = docker.getContainer(id);
    const info = await container.inspect();
    if (info.Name.includes('gestion_serveur')) {
        throw new Error("Opération non autorisée : Vous ne pouvez pas arrêter le gestionnaire lui-même !");
    }
    await container.stop();
}

async function restartContainer(id) {
    const container = docker.getContainer(id);
    const info = await container.inspect();
    if (info.Name.includes('gestion_serveur')) {
        throw new Error("Opération non autorisée : Le redémarrage du gestionnaire est désactivé depuis l'interface.");
    }
    await container.restart();
}



async function handleProjectAction(projectName, action) {
    const containers = await getContainers();
    const projectContainers = containers.filter(c => c.project === projectName);
    
    if (projectContainers.length === 0) {
        throw new Error(`Aucun conteneur trouvé pour le projet ${projectName}`);
    }

    for (const c of projectContainers) {
        try {
            if (action === 'start' && c.state !== 'running') {
                await startContainer(c.id);
            } else if (action === 'stop' && c.state === 'running') {
                await stopContainer(c.id);
            } else if (action === 'restart') {
                await restartContainer(c.id);
            }
        } catch (err) {
            console.error(`Erreur sur le conteneur ${c.name} :`, err.message);
        }
    }
}

// Récupérer toutes les applications (regroupement par projet Docker Compose)
async function getApplications() {
    const containers = await docker.listContainers({ all: true });
    const appsMap = {};

    for (const c of containers) {
        const labels = c.Labels || {};
        const projectName = labels['com.docker.compose.project'];
        const workingDir = labels['com.docker.compose.project.working_dir'];
        const configFiles = labels['com.docker.compose.project.config_files'];

        if (projectName && workingDir) {
            if (!appsMap[projectName]) {
                appsMap[projectName] = {
                    name: projectName,
                    working_dir: workingDir,
                    containers: []
                };
                
                // Sauvegarder dans la base de données
                try {
                    await runQuery(
                        `INSERT INTO compose_projects (name, working_dir, config_files, last_seen)
                         VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                         ON CONFLICT(name) DO UPDATE SET 
                            working_dir=excluded.working_dir,
                            config_files=excluded.config_files,
                            last_seen=CURRENT_TIMESTAMP`,
                        [projectName, workingDir, configFiles || null]
                    );
                } catch (dbErr) {
                    console.error(`Erreur DB upsert pour le projet ${projectName}:`, dbErr);
                }
            }
            appsMap[projectName].containers.push({
                id: c.Id,
                name: c.Names[0].replace(/^\//, ''),
                state: c.State
            });
        }
    }

    // Récupérer les projets connus depuis la DB
    try {
        const savedProjects = await getQuery(`SELECT * FROM compose_projects`);
        for (const proj of savedProjects) {
            if (!appsMap[proj.name]) {
                // Le projet est down, on l'ajoute avec 0 conteneur
                // MAIS on vérifie d'abord que le dossier existe physiquement sur l'hôte
                const vmPath = '/hostOS' + translateToVMPath(proj.working_dir);
                if (fs.existsSync(vmPath)) {
                    appsMap[proj.name] = {
                        name: proj.name,
                        working_dir: proj.working_dir,
                        containers: []
                    };
                } else {
                    // Le dossier a été supprimé ! On purge la BDD
                    console.log(`Le dossier ${proj.working_dir} n'existe plus. Suppression du projet ${proj.name} de la base.`);
                    await runQuery(`DELETE FROM compose_projects WHERE name = ?`, [proj.name]);
                }
            }
        }
    } catch (dbErr) {
        console.error("Erreur lors de la récupération des projets depuis la base:", dbErr);
    }

    return Object.values(appsMap).sort((a, b) => a.name.localeCompare(b.name));
}

// Translate Windows path to Docker Desktop Linux VM path
function translateToVMPath(hostPath) {
    if (!hostPath) return hostPath;
    // Supporte C:\ et C:/
    if (/^[a-zA-Z]:[\\/]/.test(hostPath)) {
        const drive = hostPath.charAt(0).toLowerCase();
        return `/run/desktop/mnt/host/${drive}/` + hostPath.substring(3).replace(/\\/g, '/');
    }
    return hostPath;
}

async function runComposeAction(projectName, action) {
    const containersList = await docker.listContainers({ all: true });
    const projectContainer = containersList.find(c => c.Labels && c.Labels['com.docker.compose.project'] === projectName);
    
    let rawWorkingDir = null;
    let rawConfigFiles = null;

    if (projectContainer) {
        rawWorkingDir = projectContainer.Labels['com.docker.compose.project.working_dir'];
        rawConfigFiles = projectContainer.Labels['com.docker.compose.project.config_files'];
    } else {
        // Le projet est peut-être down, on cherche dans la base de données
        const savedProject = await getQuery(`SELECT * FROM compose_projects WHERE name = ?`, [projectName]);
        if (savedProject && savedProject.length > 0) {
            rawWorkingDir = savedProject[0].working_dir;
            rawConfigFiles = savedProject[0].config_files;
        }
    }
    
    if (!rawWorkingDir) {
        throw new Error(`Aucune configuration trouvée pour le projet ${projectName} (ni conteneur ni base de données).`);
    }
    
    let composeArgs = [];
    if (rawConfigFiles) {
        const files = rawConfigFiles.split(',');
        for (const file of files) {
            composeArgs.push('-f', translateToVMPath(file.trim()));
        }
    }

    let cmdArgs = ['docker', 'compose'];
    
    if (composeArgs.length > 0) {
        cmdArgs = cmdArgs.concat(composeArgs);
    } else if (rawWorkingDir) {
        cmdArgs.push('--project-directory', translateToVMPath(rawWorkingDir));
    }
    
    if (action === 'pull') {
        cmdArgs.push('pull');
    } else if (action === 'down') {
        cmdArgs.push('down');
    } else if (action === 'kill') {
        cmdArgs.push('down', '-v', '--rmi', 'all');
    } else if (action === 'up') {
        cmdArgs.push('up', '-d');
    } else {
        throw new Error("Action compose non supportée.");
    }

    const translatedWorkingDir = translateToVMPath(rawWorkingDir);
    console.log(`Exécution de compose via conteneur : ${cmdArgs.join(' ')} (Binds: ${rawWorkingDir} -> ${translatedWorkingDir})`);

    // Recherche de la configuration Docker de l'hôte pour l'authentification (pull images privées)
    let dockerConfigBase64 = '';
    const osPaths = [
        '/root/.docker/config.json',
        '/hostOS/root/.docker/config.json'
    ];
    try {
        if (fs.existsSync('/hostOS/home')) {
            const users = fs.readdirSync('/hostOS/home');
            users.forEach(u => osPaths.push(`/hostOS/home/${u}/.docker/config.json`));
        }
        // Support Windows Docker Desktop (via WSL2 /run/desktop/mnt/host/c)
        if (fs.existsSync('/hostOS/run/desktop/mnt/host/c/Users')) {
            const winUsers = fs.readdirSync('/hostOS/run/desktop/mnt/host/c/Users');
            winUsers.forEach(u => osPaths.push(`/hostOS/run/desktop/mnt/host/c/Users/${u}/.docker/config.json`));
        }
    } catch(e) {}

    for (const p of osPaths) {
        if (fs.existsSync(p)) {
            try {
                const content = fs.readFileSync(p, 'utf8');
                try {
                    const parsed = JSON.parse(content);
                    // On ne garde QUE les auths pour éviter les crashs avec "currentContext": "desktop-linux"
                    // ou "credsStore" qui nécessitent des binaires absents d'Alpine.
                    const safeConfig = {};
                    if (parsed.auths) safeConfig.auths = parsed.auths;
                    dockerConfigBase64 = Buffer.from(JSON.stringify(safeConfig)).toString('base64');
                } catch (jsonErr) {
                    // Fallback si ce n'est pas du JSON valide (peu probable)
                    dockerConfigBase64 = Buffer.from(content).toString('base64');
                }
                console.log(`Fichier d'authentification Docker trouvé : ${p}`);
                break;
            } catch (e) {}
        }
    }

    // Utiliser l'image du conteneur actuel
    const os = require('os');
    const myContainerId = os.hostname();
    const myContainer = containersList.find(c => c.Id.startsWith(myContainerId));
    let containerImage = myContainer ? myContainer.Image : 'alpine:latest';

    if (containerImage === 'alpine:latest') {
        await new Promise((resolve) => {
            docker.pull('alpine:latest', (err, stream) => {
                if (err) return resolve();
                docker.modem.followProgress(stream, () => resolve());
            });
        });
    }

    const setupAuthCmd = dockerConfigBase64 ? 'mkdir -p ~/.docker && printf "%s" "$DOCKER_AUTH_B64" | base64 -d > ~/.docker/config.json && ' : '';

    let containerEnv = ['DOCKER_HOST=unix:///var/run/docker.sock', 'DOCKER_CONTEXT=default'];
    if (dockerConfigBase64) {
        containerEnv.push(`DOCKER_AUTH_B64=${dockerConfigBase64}`);
    }

    const container = await docker.createContainer({
        Image: containerImage, 
        Cmd: ['sh', '-c', `${setupAuthCmd}apk add --no-cache docker-cli docker-cli-compose > /dev/null 2>&1 && exec "$@"`, 'sh', ...cmdArgs],
        Env: containerEnv,
        HostConfig: {
            Binds: [
                '/var/run/docker.sock:/var/run/docker.sock',
                `${rawWorkingDir}:${translatedWorkingDir}`
            ]
        }
    });

    await container.start();
    
    // Attendre la fin du process
    const status = await container.wait();
    
    // Récupérer les logs avant de supprimer le conteneur pour le diagnostic
    let logString = "";
    try {
        const logBuffer = await container.logs({ stdout: true, stderr: true });
        if (logBuffer) {
            // Nettoyage basique des headers Docker multiplexés (caractères non imprimables)
            logString = logBuffer.toString('utf8').replace(/[\x00-\x09\x0B-\x0C\x0E-\x1F\x7F]/g, '').trim();
        }
    } catch (e) {
        console.error("Impossible de lire les logs du conteneur compose:", e);
    }

    await container.remove();

    if (status.StatusCode !== 0) {
        if (action === 'kill') {
            console.warn(`[Attention] La commande docker compose a échoué (Code ${status.StatusCode}) pour ${projectName}, mais l'action est 'kill', donc on force la suppression.`);
            if (logString) console.warn("Logs de l'erreur :", logString);
        } else {
            let errorMsg = `La commande docker compose a échoué (Code ${status.StatusCode}).\n\nDétails :\n${logString}`;
            throw new Error(errorMsg);
        }
    }

    // Si c'est un kill, on doit ensuite supprimer le dossier de l'hôte
    if (action === 'kill') {
        console.log(`Destruction totale du projet ${projectName}. Suppression du dossier ${rawWorkingDir}`);
        
        // Sécurité : Vérifier que le chemin est bien un sous-dossier d'un répertoire autorisé
        // pour éviter qu'un chemin malformé ne détruise des fichiers système critiques
        const normalizedPath = path.posix.normalize(translatedWorkingDir);
        const isSafeProjectPath = normalizedPath.startsWith('/home/') ||
                                   normalizedPath.startsWith('/opt/') ||
                                   normalizedPath.startsWith('/srv/') ||
                                   normalizedPath.startsWith('/data/') ||
                                   normalizedPath.startsWith('/mnt/') ||
                                   normalizedPath.startsWith('/run/desktop/mnt/host/');
        
        if (!isSafeProjectPath) {
            throw new Error(`Refus de suppression : le chemin "${rawWorkingDir}" n'est pas dans un répertoire de projet autorisé.`);
        }
        
        // Délai de 2 secondes pour s'assurer que Docker Desktop a bien relâché les verrous Windows
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // S'assurer que l'image alpine est bien téléchargée pour éviter "404 no such image"
        await new Promise((resolve) => {
            docker.pull('alpine:latest', (err, stream) => {
                if (err) return resolve();
                docker.modem.followProgress(stream, () => resolve());
            });
        });
        
        // On lance un micro-conteneur éphémère alpine avec les droits root pour supprimer le dossier sur l'hôte
        const rmContainer = await docker.createContainer({
            Image: 'alpine:latest',
            Cmd: ['sh', '-c', 'rm -rf "/host$TARGET_PATH"'],
            Env: [`TARGET_PATH=${normalizedPath}`],
            HostConfig: {
                Binds: [ '/:/host' ]
            }
        });
        
        await rmContainer.start();
        await rmContainer.wait();
        await rmContainer.remove();
        
        // Et on purge de la base de données
        await runQuery(`DELETE FROM compose_projects WHERE name = ?`, [projectName]);

        // Retrait automatique de l'application de tous les jobs de sauvegarde
        try {
            const jobs = await getQuery(`SELECT id, containers FROM backup_jobs`);
            for (const job of jobs) {
                let containersList = [];
                try { containersList = JSON.parse(job.containers); } catch(e) {}
                if (Array.isArray(containersList) && containersList.includes(projectName)) {
                    const updated = containersList.filter(name => name !== projectName);
                    await runQuery(`UPDATE backup_jobs SET containers = ? WHERE id = ?`, [JSON.stringify(updated), job.id]);
                    console.log(`[Backup] Application ${projectName} retirée automatiquement du job #${job.id}`);
                }
            }
        } catch (err) {
            console.error(`[Backup] Erreur lors du retrait de ${projectName} des jobs de sauvegarde:`, err.message);
        }
    }
}

async function pruneSystem() {
    try {
        const imagePrune = await docker.pruneImages({ filters: { dangling: ["true"] } });
        const containerPrune = await docker.pruneContainers();
        const networkPrune = await docker.pruneNetworks();
        const volumePrune = await docker.pruneVolumes();
        
        // Dockerode doesn't have a direct helper for pruneBuilds, so we use modem.dial
        const buildPrune = await new Promise((resolve) => {
            docker.modem.dial({ 
                path: '/build/prune?all=true', 
                method: 'POST', 
                statusCodes: { 200: true, 500: 'server error' } 
            }, (err, res) => {
                if (err) return resolve({ SpaceReclaimed: 0 });
                resolve(res || { SpaceReclaimed: 0 });
            });
        });

        let reclaimed = 0;
        if (imagePrune.SpaceReclaimed) reclaimed += imagePrune.SpaceReclaimed;
        if (containerPrune.SpaceReclaimed) reclaimed += containerPrune.SpaceReclaimed;
        if (volumePrune.SpaceReclaimed) reclaimed += volumePrune.SpaceReclaimed;
        if (buildPrune.SpaceReclaimed) reclaimed += buildPrune.SpaceReclaimed;

        return { success: true, reclaimedSpace: reclaimed };
    } catch (error) {
        console.error("Erreur lors du prune Docker:", error);
        throw new Error("Impossible d'exécuter le nettoyage.");
    }
}

async function getSystemDf() {
    const res = await docker.df();
    
    let totalSize = 0;
    let reclaimable = 0;
    
    // Nouveaux moteurs Docker (statistiques d'utilisation natives et précises)
    if (res.ImageUsage || res.ContainerUsage || res.VolumeUsage) {
        if (res.ImageUsage) {
            totalSize += res.ImageUsage.TotalSize || 0;
            reclaimable += res.ImageUsage.Reclaimable || 0;
        }
        if (res.ContainerUsage) {
            totalSize += res.ContainerUsage.TotalSize || 0;
            reclaimable += res.ContainerUsage.Reclaimable || 0;
        }
        if (res.VolumeUsage) {
            totalSize += res.VolumeUsage.TotalSize || 0;
            reclaimable += res.VolumeUsage.Reclaimable || 0;
        }
        if (res.BuildCacheUsage) {
            totalSize += res.BuildCacheUsage.TotalSize || 0;
            reclaimable += res.BuildCacheUsage.Reclaimable || 0;
        }
    } else {
        // Fallback pour anciens moteurs Docker (approximation)
        if (res.LayersSize) {
            totalSize += res.LayersSize;
        } else {
            const images = res.Images || [];
            images.forEach(img => { totalSize += img.Size || img.VirtualSize || 0; });
        }
        
        const images = res.Images || [];
        images.forEach(img => {
            if (img.Containers === 0) {
                const isDangling = !img.RepoTags || img.RepoTags.length === 0 || img.RepoTags.includes('<none>:<none>');
                if (isDangling) {
                    const size = img.Size || img.VirtualSize || 0;
                    const shared = (img.SharedSize && img.SharedSize > 0) ? img.SharedSize : 0;
                    reclaimable += Math.max(0, size - shared);
                }
            }
        });
        
        const containers = res.Containers || [];
        containers.forEach(c => {
            const size = c.SizeRw || 0;
            totalSize += size;
            if (c.State !== 'running') reclaimable += size;
        });
        
        const volumes = res.Volumes || [];
        volumes.forEach(v => {
            if (v.UsageData) {
                const size = v.UsageData.Size || 0;
                totalSize += size;
                if (v.UsageData.RefCount === 0) reclaimable += size;
            }
        });
        
        const caches = res.BuildCache || [];
        caches.forEach(c => {
            const size = c.Size || 0;
            totalSize += size;
            if (c.InUse === false) reclaimable += size;
        });
    }
    
    return { TotalSize: totalSize, Reclaimable: Math.max(0, reclaimable), raw: res };
}

async function getProjectFiles(projectName) {
    const apps = await getApplications();
    const app = apps.find(a => a.name === projectName);
    if (!app) throw new Error("Projet non trouvé.");
    
    const vmPath = '/hostOS' + translateToVMPath(app.working_dir);
    if (!fs.existsSync(vmPath)) throw new Error("Dossier projet introuvable.");

    const files = fs.readdirSync(vmPath);
    return files.filter(f => f.endsWith('.yml') || f.endsWith('.yaml') || f.endsWith('.env'));
}

async function readProjectFile(projectName, fileName) {
    if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
        throw new Error("Nom de fichier invalide.");
    }

    const apps = await getApplications();
    const app = apps.find(a => a.name === projectName);
    if (!app) throw new Error("Projet non trouvé.");
    
    const vmPath = path.join('/hostOS' + translateToVMPath(app.working_dir), fileName);
    if (!fs.existsSync(vmPath)) throw new Error("Fichier introuvable.");

    return fs.readFileSync(vmPath, 'utf8');
}

async function updateProjectFile(projectName, fileName, content) {
    if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
        throw new Error("Nom de fichier invalide.");
    }
    
    const apps = await getApplications();
    const app = apps.find(a => a.name === projectName);
    if (!app) throw new Error("Projet non trouvé.");
    
    const translatedWorkingDir = translateToVMPath(app.working_dir);
    const hostFilePath = path.posix.join(translatedWorkingDir, fileName);
    
    const base64Content = Buffer.from(content).toString('base64');
    
    // S'assurer que l'image alpine est bien téléchargée pour éviter l'erreur 404
    await new Promise((resolve) => {
        docker.pull('alpine:latest', (err, stream) => {
            if (err) return resolve();
            docker.modem.followProgress(stream, () => resolve());
        });
    });

    // Sécurité : Le contenu est passé via une variable d'environnement au lieu d'être
    // interpôlé dans la commande shell, ce qui évite toute injection de commande (RCE).
    const writerContainer = await docker.createContainer({
        Image: 'alpine:latest',
        Cmd: ['sh', '-c', 'printf "%s" "$FILE_CONTENT" | base64 -d > "/host$FILE_PATH"'],
        Env: [
            `FILE_CONTENT=${base64Content}`,
            `FILE_PATH=${hostFilePath}`
        ],
        HostConfig: { Binds: [ '/:/host' ] }
    });
    
    await writerContainer.start();
    const status = await writerContainer.wait();
    await writerContainer.remove();
    
    if (status.StatusCode !== 0) throw new Error(`Erreur lors de la sauvegarde (Code ${status.StatusCode})`);
    return { success: true };
}

// --- Nettoyage Détaillé (Unused Resources) ---
async function getUnusedResources() {
    // Images inutilisées (dangling ou sans containers)
    const images = await docker.listImages();
    const unusedImages = images
        .filter(img => img.Containers === 0 || (img.RepoTags && img.RepoTags.includes('<none>:<none>')))
        .map(img => ({
            id: img.Id,
            tags: img.RepoTags || [],
            size: img.Size || img.VirtualSize || 0
        }));

    // Conteneurs arrêtés
    const containers = await docker.listContainers({ all: true });
    const stoppedContainers = containers
        .filter(c => c.State === 'exited' || c.State === 'dead')
        .map(c => ({
            id: c.Id,
            name: c.Names[0],
            image: c.Image,
            status: c.Status
        }));

    // Volumes orphelins (dangling)
    const volumeData = await docker.listVolumes({ filters: { dangling: ["true"] } });
    const orphanedVolumes = (volumeData.Volumes || []).map(v => ({
        name: v.Name,
        size: v.UsageData ? v.UsageData.Size : 0
    }));

    // Réseaux personnalisés non utilisés
    const networks = await docker.listNetworks({ filters: { type: ["custom"] } });
    const unusedNetworks = networks
        .filter(n => !n.Containers || Object.keys(n.Containers).length === 0)
        .map(n => ({
            id: n.Id,
            name: n.Name,
            driver: n.Driver
        }));

    return {
        images: unusedImages,
        containers: stoppedContainers,
        volumes: orphanedVolumes,
        networks: unusedNetworks
    };
}

async function deleteResources(type, ids) {
    const results = { success: 0, failed: 0, errors: [] };
    
    for (const id of ids) {
        try {
            if (type === 'image') {
                const img = docker.getImage(id);
                await img.remove({ force: true });
            } else if (type === 'container') {
                const container = docker.getContainer(id);
                await container.remove({ force: true });
            } else if (type === 'volume') {
                const vol = docker.getVolume(id);
                await vol.remove();
            } else if (type === 'network') {
                const net = docker.getNetwork(id);
                await net.remove();
            }
            results.success++;
        } catch (err) {
            results.failed++;
            results.errors.push(`Erreur sur ${id}: ${err.message}`);
        }
    }
    return results;
}

module.exports = {
    docker,
    getContainers,
    startContainer,
    stopContainer,
    restartContainer,
    pruneSystem,
    getApplications,
    handleProjectAction,
    runComposeAction,
    getSystemDf,
    getProjectFiles,
    readProjectFile,
    updateProjectFile,
    getNetworks,
    getUnusedResources,
    deleteResources
};
