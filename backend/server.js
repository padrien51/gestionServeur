require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { getContainers, startContainer, stopContainer, restartContainer } = require('./dockerService');
const { getSystemMetrics } = require('./systemService');
const updateService = require('./updateService');
require('./db'); // Initialise DB

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Middleware d'authentification basique
const authenticate = (req, res, next) => {
    // Lecture dans l'en-tête, ou en querystring (pour Server-Sent Events car EventSource ne gère pas les headers)
    const clientPwd = req.headers['x-api-password'] || req.query.pwd;
    console.log(`[AUTH] req to ${req.path} | received: "${clientPwd}" | expected: "${process.env.APP_PASSWORD}"`);
    if (process.env.APP_PASSWORD && clientPwd !== process.env.APP_PASSWORD) {
        // En développement local sans mdp, on peut laisser passer
        if (process.env.NODE_ENV === 'production') {
            return res.status(401).json({ error: 'Non autorisé' });
        }
    }
    next();
};

// Appliquer l'authentification uniquement sur les routes de l'API
app.use('/api', authenticate);

// --- ROUTES UPDATES ---
app.get('/api/updates/os', async (req, res) => {
    const info = await updateService.getOSUpdates();
    res.json(info);
});

app.post('/api/updates/docker/apply/:name', async (req, res) => {
    try {
        const result = await updateService.applyDockerUpdate(req.params.name);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

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

app.get('/api/docker/containers/:id/logs', async (req, res) => {
    // Configurer la connexion Server-Sent Events (SSE)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
        const Docker = require('dockerode');
        const docker = new Docker({ socketPath: '/var/run/docker.sock' });
        const container = docker.getContainer(req.params.id);
        
        // Obtenir le flux de logs (stdout/stderr), les 100 dernières lignes, puis follow
        const logStream = await container.logs({
            follow: true,
            stdout: true,
            stderr: true,
            tail: 100
        });

        logStream.on('data', (chunk) => {
            // Docker logs format : les 8 premiers octets contiennent le header (type de flux, taille)
            // Pour simplifier l'envoi, on extrait la payload en string (en ignorant les 8 premiers octets)
            // Mais la méthode propre est d'utiliser docker-modem ou un parser, on va tricher en envoyant le texte brut et le frontend le parsera.
            
            // On envoie le chunk brut encodé en base64 pour éviter les problèmes de caractères
            res.write(`data: ${chunk.toString('base64')}\n\n`);
        });

        req.on('close', () => {
            logStream.destroy();
        });
    } catch (error) {
        res.write(`event: error\ndata: ${error.message}\n\n`);
        res.end();
    }
});

// Fallback pour SPA Vue.js (remplace app.get('*') qui plante sous Express 5)
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
    console.log(`Serveur démarré sur le port ${port}`);
});
