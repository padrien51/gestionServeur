const express = require('express');
const router = express.Router();
const { getQuery, runQuery } = require('../db');

router.get('/events', async (req, res) => {
    try {
        const rows = await getQuery("SELECT * FROM security_events ORDER BY created_at DESC LIMIT 200");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/events/clear', async (req, res) => {
    try {
        await runQuery("DELETE FROM security_events");
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
