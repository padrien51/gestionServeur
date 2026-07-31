const express = require('express');
const router = express.Router();
const { getQuery, runQuery } = require('../db');
const { getSystemMetrics, getMetricsHistory } = require('../systemService');

// --- MÉTRIQUES SYSTÈME ---
router.get('/metrics', async (req, res) => {
    try {
        const metrics = await getSystemMetrics();
        res.json(metrics);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/metrics/history', async (req, res) => {
    try {
        const history = await getMetricsHistory();
        res.json(history);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
