const Docker = require('dockerode');
const { runQuery, getQuery } = require('./db');
const fs = require('fs');

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

async function pruneSystem() {
    try {
        let totalReclaimed = 0;
        
        const containersPrune = await docker.pruneContainers();
        if (containersPrune && containersPrune.SpaceReclaimed) totalReclaimed += containersPrune.SpaceReclaimed;
        
        const networksPrune = await docker.pruneNetworks();
        // networks don't reclaim much space, but it cleans up

        const volumesPrune = await docker.pruneVolumes();
        if (volumesPrune && volumesPrune.SpaceReclaimed) totalReclaimed += volumesPrune.SpaceReclaimed;
        
        // Prune dangling first, then all unused images if possible.
        // We'll stick to a standard pruneImages without filters which removes dangling (safe).
        // Or if we want to remove ALL unused images (-a): { filters: '{"dangling":["false"]}' }
        const imagesPrune = await docker.pruneImages({ filters: '{"dangling":["false"]}' });
        if (imagesPrune && imagesPrune.SpaceReclaimed) totalReclaimed += imagesPrune.SpaceReclaimed;

        return { success: true, spaceReclaimed: totalReclaimed };
    } catch (error) {
        console.error("Erreur lors du nettoyage Docker:", error);
        throw new Error("Impossible d'exécuter la commande de nettoyage Docker.");
    }
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
    if (/^[a-zA-Z]:\\/.test(hostPath)) {
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

    // Utiliser l'image du conteneur actuel
    const os = require('os');
    const myContainerId = os.hostname();
    const myContainer = containersList.find(c => c.Id.startsWith(myContainerId));
    const containerImage = myContainer ? myContainer.Image : 'alpine';

    const container = await docker.createContainer({
        Image: containerImage, 
        Cmd: ['sh', '-c', `apk add --no-cache docker-cli docker-cli-compose > /dev/null 2>&1 && ${cmdArgs.join(' ')}`],
        HostConfig: {
            Binds: [
                '/var/run/docker.sock:/var/run/docker.sock',
                `${rawWorkingDir}:${translatedWorkingDir}`
            ]
        }
    });

    await container.start();
    
    // Attendre la fin du process (facultatif si on veut bloquer)
    const status = await container.wait();
    await container.remove();

    if (status.StatusCode !== 0) {
        throw new Error(`La commande docker compose a échoué (Code ${status.StatusCode})`);
    }

    // Si c'est un kill, on doit ensuite supprimer le dossier de l'hôte
    if (action === 'kill') {
        console.log(`Destruction totale du projet ${projectName}. Suppression du dossier ${rawWorkingDir}`);
        
        // Délai de 2 secondes pour s'assurer que Docker Desktop a bien relâché les verrous Windows
        // sur le dossier qu'il venait de monter dans le conteneur précédent.
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // On lance un micro-conteneur éphémère alpine avec les droits root pour supprimer le dossier sur l'hôte
        const rmContainer = await docker.createContainer({
            Image: 'alpine',
            Cmd: ['sh', '-c', `rm -rf "/host${translatedWorkingDir}"`],
            HostConfig: {
                Binds: [ '/:/host' ]
            }
        });
        
        await rmContainer.start();
        await rmContainer.wait();
        await rmContainer.remove();
        
        // Et on purge de la base de données
        await runQuery(`DELETE FROM compose_projects WHERE name = ?`, [projectName]);
    }
}

async function pruneSystem() {
    try {
        const imagePrune = await docker.pruneImages({ filters: { dangling: ["false"] } });
        const containerPrune = await docker.pruneContainers();
        const networkPrune = await docker.pruneNetworks();
        const volumePrune = await docker.pruneVolumes();

        let reclaimed = 0;
        if (imagePrune.SpaceReclaimed) reclaimed += imagePrune.SpaceReclaimed;
        if (containerPrune.SpaceReclaimed) reclaimed += containerPrune.SpaceReclaimed;
        if (volumePrune.SpaceReclaimed) reclaimed += volumePrune.SpaceReclaimed;

        return { success: true, reclaimedSpace: reclaimed };
    } catch (error) {
        console.error("Erreur lors du prune Docker:", error);
        throw new Error("Impossible d'exécuter le nettoyage.");
    }
}

async function getSystemDf() {
    return await docker.df();
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
    getSystemDf
};
