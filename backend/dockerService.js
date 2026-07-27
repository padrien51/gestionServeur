const Docker = require('dockerode');
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

// Récupérer toutes les applications (regroupement par projet Docker Compose)
async function getApplications() {
    const containers = await docker.listContainers({ all: true });
    const appsMap = {};

    for (const c of containers) {
        const labels = c.Labels || {};
        const projectName = labels['com.docker.compose.project'];
        const workingDir = labels['com.docker.compose.project.working_dir'];

        // Si le conteneur n'appartient pas à un projet compose, on peut l'ignorer ou le classer en "standalone"
        if (projectName && workingDir) {
            if (!appsMap[projectName]) {
                appsMap[projectName] = {
                    name: projectName,
                    working_dir: workingDir,
                    containers: []
                };
            }
            appsMap[projectName].containers.push({
                id: c.Id,
                name: c.Names[0].replace(/^\//, ''),
                state: c.State
            });
        }
    }

    return Object.values(appsMap).sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = {
    docker,
    getContainers,
    startContainer,
    stopContainer,
    restartContainer,
    pruneSystem,
    getApplications
};
