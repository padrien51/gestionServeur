const express = require('express');
const router = express.Router();
const dockerService = require('../dockerService');
const { getContainers, startContainer, stopContainer, restartContainer, getNetworks } = require('../dockerService');

// --- CONTENEURS ---
router.get('/containers', async (req, res) => {
    try {
        const containers = await getContainers();
        res.json(containers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/containers/:id/:action', async (req, res) => {
    const { id, action } = req.params;
    try {
        if (action === 'start') await dockerService.startContainer(id);
        else if (action === 'stop') await dockerService.stopContainer(id);
        else if (action === 'restart') await dockerService.restartContainer(id);
        else return res.status(400).json({ error: "Action inconnue" });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Aliases directs (legacy)
router.post('/containers/:id/start', async (req, res) => {
    try {
        await startContainer(req.params.id);
        res.json({ message: 'Conteneur démarré' });
    } catch (error) {
        res.status(500).json({ error: 'Erreur au démarrage: ' + error.message });
    }
});

router.post('/containers/:id/stop', async (req, res) => {
    try {
        await stopContainer(req.params.id);
        res.json({ message: 'Conteneur arrêté' });
    } catch (error) {
        res.status(500).json({ error: "Erreur à l'arrêt: " + error.message });
    }
});

router.post('/containers/:id/restart', async (req, res) => {
    try {
        await restartContainer(req.params.id);
        res.json({ message: 'Conteneur redémarré' });
    } catch (error) {
        res.status(500).json({ error: 'Erreur au redémarrage: ' + error.message });
    }
});

// --- RÉSEAUX ---
router.get('/networks', async (req, res) => {
    try {
        const networks = await getNetworks();
        res.json(networks);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- PROJETS / APPLICATIONS ---
router.get('/applications', async (req, res) => {
    try {
        const apps = await dockerService.getApplications();
        res.json(apps);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/projects/:name/:action', async (req, res) => {
    const { name, action } = req.params;
    try {
        if (!['start', 'stop', 'restart'].includes(action)) {
            return res.status(400).json({ error: "Action inconnue" });
        }
        await dockerService.handleProjectAction(name, action);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/projects/:name/compose/:action', async (req, res) => {
    const { name, action } = req.params;
    try {
        if (!['pull', 'down', 'kill', 'up'].includes(action)) {
            return res.status(400).json({ error: "Action compose inconnue" });
        }
        await dockerService.runComposeAction(name, action);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- ÉDITEUR DE FICHIERS (Web IDE) ---
router.get('/projects/:name/files', async (req, res) => {
    try {
        const files = await dockerService.getProjectFiles(req.params.name);
        res.json({ files });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/projects/:name/file', async (req, res) => {
    try {
        const content = await dockerService.readProjectFile(req.params.name, req.query.file);
        res.json({ content });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/projects/:name/file', async (req, res) => {
    try {
        const { file, content } = req.body;
        if (!file || typeof content !== 'string') {
            return res.status(400).json({ error: "Paramètres manquants" });
        }
        await dockerService.updateProjectFile(req.params.name, file, content);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- OPTIMISATION (PRUNE) ---
router.get('/system-df', async (req, res) => {
    try {
        const info = await dockerService.getSystemDf();
        res.json(info);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/prune', async (req, res) => {
    try {
        const result = await dockerService.pruneSystem();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
