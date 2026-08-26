require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

// ===================================================================
// SECURITY GUARD : Refuse to start if critical env vars are missing
// ===================================================================
if (!process.env.JWT_SECRET) {
    console.error('\n[FATAL] JWT_SECRET is not defined in your .env file.');
    console.error('[FATAL] The server will NOT start without a strong secret.');
    console.error('[FATAL] Generate one with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
    process.exit(1);
}

const app = express();
const port = process.env.PORT || 3000;

// ===================================================================
// SOCKET.IO — Logs en direct et Terminal Web (authentification via JWT)
// ===================================================================
const allowedOrigin = process.env.APP_URL || `http://localhost:${process.env.HOST_PORT || 8183}`;
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: allowedOrigin, methods: ['GET', 'POST'] }
});
require('./websocketService')(io);

// ===================================================================
// MIDDLEWARES GLOBAUX
// ===================================================================
app.use(compression()); // GZIP

// Sécurité : En-têtes HTTP avec CSP adaptée à une SPA Vue.js
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"], // unsafe-inline nécessaire pour Vite en prod
            styleSrc: ["'self'", "'unsafe-inline'"],
            connectSrc: ["'self'", "ws:", "wss:"],
            imgSrc: ["'self'", "data:"],
            fontSrc: ["'self'", "data:"],
        }
    }
}));

app.use(cors());
app.use(express.json({ limit: '1mb' })); // Limite anti-DoS

// ===================================================================
// ROUTES PUBLIQUES (pas d'authentification)
// ===================================================================
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

// ===================================================================
// MIDDLEWARE D'AUTHENTIFICATION JWT
// (appliqué à toutes les routes /api définies APRÈS ce point)
// ===================================================================
const authenticate = require('./middleware/auth');

app.use('/api', authenticate);

// ===================================================================
// ROUTES PROTÉGÉES (authentification requise)
// ===================================================================
app.use('/api/users', require('./routes/users'));
app.use('/api/docker', require('./routes/docker'));
app.use('/api/updates', require('./routes/updates'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/system', require('./routes/system'));
app.use('/api/backups', require('./routes/backups'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/security', require('./routes/security'));

// ===================================================================
// FICHIERS STATIQUES (SPA Vue.js)
// ===================================================================
app.use(express.static(path.join(__dirname, 'public')));

// Fallback SPA : toutes les routes inconnues renvoient index.html
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===================================================================
// DÉMARRAGE DU SERVEUR
// ===================================================================
const updateService = require('./updateService');
const backupOrchestrator = require('./backupOrchestrator');
const { startLogMonitor } = require('./logMonitor');
const { startSecurityMonitor } = require('./securityMonitor');

server.listen(port, () => {
    console.log(`[Server] Démarré sur le port ${port}`);

    // Planificateur de sauvegardes
    setTimeout(() => {
        backupOrchestrator.initializeScheduler().catch(console.error);
    }, 2000);

    // Notificateur de mises à jour (CRON)
    updateService.startUpdateNotifier();

    // Moniteur de logs IA
    setTimeout(() => {
        startLogMonitor();
        startSecurityMonitor();
    }, 3000);
});
