const express = require('express');
const router = express.Router();
const backupOrchestrator = require('../backupOrchestrator');

// --- JOBS DE SAUVEGARDE ---
router.get('/', async (req, res) => {
    try {
        res.json(await backupOrchestrator.getJobs());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/', async (req, res) => {
    try {
        res.json(await backupOrchestrator.createJob(req.body));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/:id', async (req, res) => {
    try {
        res.json(await backupOrchestrator.updateJob(req.params.id, req.body));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        res.json(await backupOrchestrator.deleteJob(req.params.id));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/:id/trigger', async (req, res) => {
    try {
        res.json(await backupOrchestrator.triggerManualBackup(req.params.id));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- LOGS ---
router.get('/logs', async (req, res) => {
    try {
        res.json(await backupOrchestrator.getLogs(req.query.jobId));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- EXPLORATEUR DE FICHIERS ---
router.get('/:id/explore/:app', async (req, res) => {
    try {
        const files = await backupOrchestrator.exploreBackup(req.params.id, req.params.app, req.query.path || '');
        res.json(files);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- TELECHARGEMENT ET RESTAURATION ---
router.get('/:id/download/:app/:folder', async (req, res) => {
    try {
        await backupOrchestrator.downloadBackup(req.params.id, req.params.app, req.params.folder, res);
    } catch (err) {
        console.error("[Backup] Erreur téléchargement:", err);
        if (!res.headersSent) res.status(500).json({ error: err.message });
    }
});

router.post('/:id/restore/:app/:folder', async (req, res) => {
    try {
        const customName = req.body && req.body.customName ? req.body.customName : null;
        await backupOrchestrator.restoreBackup(req.params.id, req.params.app, req.params.folder, customName);
        res.json({ success: true });
    } catch (err) {
        console.error("[Backup] Erreur restauration:", err);
        res.status(500).json({ error: err.message });
    }
});

const multer = require('multer');
const upload = multer({ dest: '/tmp/backups' });

router.post('/import', upload.single('archive'), async (req, res) => {
    try {
        if (!req.file) throw new Error("Aucun fichier n'a été uploadé.");
        const targetPath = req.body.targetPath;
        if (!targetPath) throw new Error("Le chemin de destination est manquant.");
        const customName = req.body.customName ? req.body.customName : null;
        
        await backupOrchestrator.importAndRestoreBackup(req.file.path, targetPath, customName);
        res.json({ success: true });
    } catch (err) {
        console.error("[Backup] Erreur import manuel:", err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
