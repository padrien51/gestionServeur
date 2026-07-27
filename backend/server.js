require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { getContainers, startContainer, stopContainer, restartContainer } = require('./dockerService');
const { getSystemMetrics } = require('./systemService');
require('./db'); // Initialise DB

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Middleware d'authentification basique
const authenticate = (req, res, next) => {
    // A implémenter plus tard avec un token ou une session
    // Pour l'instant on laisse ouvert pour le dev, ou on vérifie un header x-api-key
    const clientPwd = req.headers['x-api-password'];
    if (process.env.APP_PASSWORD && clientPwd !== process.env.APP_PASSWORD) {
        // En développement local sans mdp, on peut laisser passer
        if (process.env.NODE_ENV === 'production') {
            return res.status(401).json({ error: 'Non autorisé' });
        }
    }
    next();
};

app.use(authenticate);

// Servir les fichiers statiques du frontend (dossier public)
const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));

// --- Routes Système ---
app.get('/api/system/metrics', async (req, res) => {
    try {
        const metrics = await getSystemMetrics();
        res.json(metrics);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Routes Docker ---
app.get('/api/docker/containers', async (req, res) => {
    try {
        const containers = await getContainers();
        res.json(containers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/docker/containers/:id/start', async (req, res) => {
    try {
        await startContainer(req.params.id);
        res.json({ message: 'Conteneur démarré' });
    } catch (error) {
        res.status(500).json({ error: 'Erreur au démarrage: ' + error.message });
    }
});

app.post('/api/docker/containers/:id/stop', async (req, res) => {
    try {
        await stopContainer(req.params.id);
        res.json({ message: 'Conteneur arrêté' });
    } catch (error) {
        res.status(500).json({ error: 'Erreur à l\'arrêt: ' + error.message });
    }
});

app.post('/api/docker/containers/:id/restart', async (req, res) => {
    try {
        await restartContainer(req.params.id);
        res.json({ message: 'Conteneur redémarré' });
    } catch (error) {
        res.status(500).json({ error: 'Erreur au redémarrage: ' + error.message });
    }
});

// Fallback pour SPA Vue.js (remplace app.get('*') qui plante sous Express 5)
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
    console.log(`Serveur démarré sur le port ${port}`);
});
