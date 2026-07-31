const express = require('express');
const router = express.Router();
const { getQuery, runQuery } = require('../db');

// --- INSIGHTS AIOps ---
router.get('/insights', async (req, res) => {
    try {
        const rows = await getQuery(`SELECT * FROM ai_insights WHERE status = 'active' ORDER BY created_at DESC`);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/insights/:id/resolve', async (req, res) => {
    try {
        await runQuery(`UPDATE ai_insights SET status = 'resolved' WHERE id = ?`, [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/insights/:id/ignore', async (req, res) => {
    try {
        await runQuery(`UPDATE ai_insights SET status = 'ignored' WHERE id = ?`, [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
