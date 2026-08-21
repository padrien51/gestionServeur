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

const { analyzeLog } = require('../aiService');

router.post('/insights/:id/ignore', async (req, res) => {
    try {
        await runQuery(`UPDATE ai_insights SET status = 'ignored' WHERE id = ?`, [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/insights/:id/retry', async (req, res) => {
    try {
        const rows = await getQuery(`SELECT * FROM ai_insights WHERE id = ?`, [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: "Insight introuvable" });
        
        const insight = rows[0];
        const aiResult = await analyzeLog(insight.log_context, insight.container_name);
        
        if (aiResult) {
            await runQuery(`UPDATE ai_insights SET diagnosis = ?, solution = ? WHERE id = ?`, 
                [aiResult.diagnosis, aiResult.solution, req.params.id]);
            res.json({ success: true, diagnosis: aiResult.diagnosis, solution: aiResult.solution });
        } else {
            res.status(500).json({ error: "L'IA n'a pas répondu ou est désactivée." });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
