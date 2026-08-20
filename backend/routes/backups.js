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

module.exports = router;
