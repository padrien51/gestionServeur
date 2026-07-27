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
            status: c.Status
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
    await container.stop();
}

async function restartContainer(id) {
    const container = docker.getContainer(id);
    await container.restart();
}

module.exports = {
    getContainers,
    startContainer,
    stopContainer,
    restartContainer
};
