const express = require('express');
const router = express.Router();
const updateService = require('../updateService');

// --- MISES À JOUR OS ---
router.get('/os', async (req, res) => {
    const info = await updateService.getOSUpdates();
    res.json(info);
});

// --- MISES À JOUR DOCKER ---
router.get('/docker/check', async (req, res) => {
    try {
        const results = await updateService.checkDockerUpdates();
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/docker/apply/:name', async (req, res) => {
    try {
        const result = await updateService.applyDockerUpdate(req.params.name);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
