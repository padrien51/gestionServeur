require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const dockerService = require('./dockerService');
const { getContainers, startContainer, stopContainer, restartContainer } = require('./dockerService');
const { getSystemMetrics } = require('./systemService');
const updateService = require('./updateService');
const { db, getQuery, runQuery } = require('./db');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const port = process.env.PORT || 3000;

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' }
});

// Initialisation du service WebSocket
require('./websocketService')(io);

// Optimisation : Compression GZIP des réponses
app.use(compression());

// Sécurité : Configuration des entêtes HTTP
// On désactive contentSecurityPolicy si le frontend a besoin de ressources externes,
// mais ici c'est une SPA interne, donc helmet() par défaut est très bien.
app.use(helmet({
    contentSecurityPolicy: false // Désactivé pour éviter de bloquer des scripts inline de Vite si présents
}));

app.use(cors());
app.use(express.json());

// Sécurité : Limitation de requêtes (Anti-brute force) sur l'auth
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limite chaque IP à 10 requêtes par fenêtre
    message: { error: "Trop de tentatives de connexion. Veuillez réessayer dans 15 minutes." }
});

const authService = require('./authService');

// --- ROUTES AUTH PUBLIQUES ---
app.get('/api/auth/status', async (req, res) => {
    try {
        const needed = await authService.isSetupNeeded();
        res.json({ setupNeeded: needed });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/setup', async (req, res) => {
    try {
        const { email, password } = req.body;
        const result = await authService.setupAccount(email, password);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;
        const result = await authService.login(email, password);
        res.json(result);
    } catch (err) {
        res.status(401).json({ error: err.message });
    }
});

app.post('/api/auth/login-2fa', authLimiter, async (req, res) => {
    try {
        const { tempToken, tokenCode } = req.body;
        const result = await authService.login2FA(tempToken, tokenCode);
        res.json(result);
    } catch (err) {
        res.status(401).json({ error: err.message });
    }
});

app.post('/api/auth/forgot-password', authLimiter, async (req, res) => {
    try {
        const host = req.get('host');
        const result = await authService.requestPasswordReset(req.body.email, host);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.post('/api/auth/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        const result = await authService.resetPassword(token, newPassword);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Middleware d'authentification JWT pour les autres routes
const authenticate = (req, res, next) => {
    // Lecture dans l'en-tête (Bearer token) ou querystring (pour SSE)
    const authHeader = req.headers['authorization'];
    let token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        token = req.query.token;
    }

    if (!token) {
        return res.status(401).json({ error: 'Non autorisé: Token manquant' });
    }

    try {
        const user = authService.verifyToken(token);
        req.user = user;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Non autorisé: Token invalide ou expiré' });
    }
};

// Appliquer l'authentification uniquement sur les routes de l'API (après les routes publiques)
app.use('/api', authenticate);

// --- ROUTES AUTH PROTÉGÉES ---
app.get('/api/auth/2fa/status', async (req, res) => {
    try {
        const result = await authService.get2FAStatus(req.user.id);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/2fa/generate', async (req, res) => {
    try {
        const result = await authService.generate2FA(req.user.id, req.user.email);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/2fa/verify', async (req, res) => {
    try {
        const { tokenCode } = req.body;
        const result = await authService.verifyAndEnable2FA(req.user.id, tokenCode);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.post('/api/auth/2fa/disable', async (req, res) => {
    try {
        const { password } = req.body;
        const result = await authService.disable2FA(req.user.id, password);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.post('/api/auth/change-password', async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const result = await authService.changePassword(req.user.id, currentPassword, newPassword);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.post('/api/auth/change-email', async (req, res) => {
    try {
        const { newEmail } = req.body;
        const result = await authService.changeEmail(req.user.id, newEmail);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// --- ROUTES GESTION UTILISATEURS ---
app.get('/api/users', async (req, res) => {
    try {
        const users = await authService.getUsers();
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users', async (req, res) => {
    try {
        const { email, password } = req.body;
        const result = await authService.addUser(email, password);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.delete('/api/users/:id', async (req, res) => {
    try {
        const result = await authService.deleteUser(req.params.id);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// --- ROUTES DOCKER ---
app.post('/api/docker/prune', async (req, res) => {
    try {
        const result = await dockerService.pruneSystem();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/docker/containers/:id/:action', async (req, res) => {
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

app.post('/api/docker/projects/:name/:action', async (req, res) => {
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

app.post('/api/docker/projects/:name/compose/:action', async (req, res) => {
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


app.get('/api/updates/os', async (req, res) => {
    const info = await updateService.getOSUpdates();
    res.json(info);
});

app.get('/api/updates/docker/check', async (req, res) => {
    try {
        const results = await updateService.checkDockerUpdates();
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/updates/docker/apply/:name', async (req, res) => {
    try {
        const result = await updateService.applyDockerUpdate(req.params.name);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- ROUTES PARAMÈTRES (SETTINGS) ---
app.get('/api/settings', async (req, res) => {
    try {
        const rows = await getQuery(`SELECT * FROM settings`);
        const settings = {};
        rows.forEach(r => settings[r.key] = r.value);
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/settings', async (req, res) => {
    try {
        const settings = req.body;
        for (const [key, value] of Object.entries(settings)) {
            await runQuery(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`, [key, value]);
        }
        updateService.startUpdateNotifier(); // Recharger le cron si modifié
        res.json({ message: "Paramètres enregistrés" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/settings/test-webhook', async (req, res) => {
    try {
        const { webhookUrl } = req.body;
        if (!webhookUrl) return res.status(400).json({ error: "L'URL du Webhook est manquante." });
        
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: "🚀 **Gestion Serveur** - Test de configuration du webhook Mattermost réussi !"
            })
        });

        const result = await authService.requestPasswordReset(req.body.email, host);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});


// --- ROUTES UPDATES ---
app.post('/api/docker/containers/:id/:action', async (req, res) => {
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

app.post('/api/docker/projects/:name/:action', async (req, res) => {
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

app.post('/api/docker/projects/:name/compose/:action', async (req, res) => {
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


app.get('/api/updates/os', async (req, res) => {
    const info = await updateService.getOSUpdates();
    res.json(info);
});

app.get('/api/updates/docker/check', async (req, res) => {
    try {
        const results = await updateService.checkDockerUpdates();
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/updates/docker/apply/:name', async (req, res) => {
    try {
        const result = await updateService.applyDockerUpdate(req.params.name);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- ROUTES PARAMÈTRES (SETTINGS) ---
app.get('/api/settings', async (req, res) => {
    try {
        const rows = await getQuery(`SELECT * FROM settings`);
        const settings = {};
        rows.forEach(r => settings[r.key] = r.value);
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/settings', async (req, res) => {
    try {
        const settings = req.body;
        for (const [key, value] of Object.entries(settings)) {
            await runQuery(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`, [key, value]);
        }
        updateService.startUpdateNotifier(); // Recharger le cron si modifié
        res.json({ message: "Paramètres enregistrés" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/settings/test-webhook', async (req, res) => {
    try {
        const { webhookUrl } = req.body;
        if (!webhookUrl) return res.status(400).json({ error: "L'URL du Webhook est manquante." });
        
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: "🚀 **Gestion Serveur** - Test de configuration du webhook Mattermost réussi !"
            })
        });

        if (!response.ok) {
            throw new Error(`Mattermost a répondu avec l'erreur HTTP ${response.status}`);
        }
        
        res.json({ success: true, message: "Le webhook de test a été envoyé avec succès !" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- ROUTES AIOPS ---
const { startLogMonitor } = require('./logMonitor');

app.get('/api/ai/insights', async (req, res) => {
    try {
        const rows = await getQuery(`SELECT * FROM ai_insights WHERE status = 'active' ORDER BY created_at DESC`);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/ai/insights/:id/resolve', async (req, res) => {
    try {
        await runQuery(`UPDATE ai_insights SET status = 'resolved' WHERE id = ?`, [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/ai/insights/:id/ignore', async (req, res) => {
    try {
        await runQuery(`UPDATE ai_insights SET status = 'ignored' WHERE id = ?`, [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- ROUTE NETTOYAGE DOCKER ---
app.post('/api/docker/prune', async (req, res) => {
    try {
        const result = await dockerService.pruneSystem();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- ROUTE APPLICATIONS ---
app.get('/api/docker/applications', async (req, res) => {
    try {
        const apps = await dockerService.getApplications();
        res.json(apps);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- ROUTES SAUVEGARDES ---
const backupOrchestrator = require('./backupOrchestrator');

// Initialiser le planificateur au démarrage, après un léger délai pour la BDD
setTimeout(() => {
    backupOrchestrator.initializeScheduler().catch(console.error);
}, 2000);

app.get('/api/backups', async (req, res) => {
    try {
        res.json(await backupOrchestrator.getJobs());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/backups', async (req, res) => {
    try {
        res.json(await backupOrchestrator.createJob(req.body));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/backups/:id', async (req, res) => {
    try {
        res.json(await backupOrchestrator.updateJob(req.params.id, req.body));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/backups/:id', async (req, res) => {
    try {
        res.json(await backupOrchestrator.deleteJob(req.params.id));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/backups/:id/trigger', async (req, res) => {
    try {
        res.json(await backupOrchestrator.triggerManualBackup(req.params.id));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/backups/logs', async (req, res) => {
    try {
        res.json(await backupOrchestrator.getLogs(req.query.jobId));
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

server.listen(port, () => {
    console.log(`Serveur démarré sur le port ${port}`);
    
    // Initialisation des planificateurs (CRON)
    const backupOrchestrator = require('./backupOrchestrator');
    // Le backupOrchestrator est déjà auto-initialisé via initializeScheduler() dans son fichier,
    // mais on lance le notifieur de mises à jour ici.
    updateService.startUpdateNotifier();

    // Démarrage du moniteur de logs IA avec un léger délai
    setTimeout(() => {
        startLogMonitor();
    }, 3000);
});
