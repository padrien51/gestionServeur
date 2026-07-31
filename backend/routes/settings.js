const express = require('express');
const router = express.Router();
const { getQuery, runQuery } = require('../db');
const updateService = require('../updateService');

// Validation anti-SSRF : bloque les URLs vers des adresses privées/locales
function validateWebhookUrl(url) {
    let parsedUrl;
    try {
        parsedUrl = new URL(url);
    } catch {
        throw new Error("L'URL du Webhook est invalide.");
    }
    const privateIpRanges = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|localhost|::1)/i;
    if (privateIpRanges.test(parsedUrl.hostname)) {
        throw new Error("L'URL du Webhook ne peut pas pointer vers une adresse privée ou locale.");
    }
    if (!['https:', 'http:'].includes(parsedUrl.protocol)) {
        throw new Error("Seuls les protocoles HTTP et HTTPS sont autorisés.");
    }
    return parsedUrl;
}

// --- PARAMÈTRES GÉNÉRAUX ---
router.get('/', async (req, res) => {
    try {
        const rows = await getQuery(`SELECT * FROM settings`);
        const settings = {};
        rows.forEach(r => settings[r.key] = r.value);
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/', async (req, res) => {
    try {
        const settings = req.body;
        for (const [key, value] of Object.entries(settings)) {
            await runQuery(
                `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
                [key, value]
            );
        }
        updateService.startUpdateNotifier(); // Recharger le cron si modifié
        res.json({ message: "Paramètres enregistrés" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- TEST WEBHOOK (avec protection anti-SSRF) ---
router.post('/test-webhook', async (req, res) => {
    try {
        const { webhookUrl } = req.body;
        if (!webhookUrl) return res.status(400).json({ error: "L'URL du Webhook est manquante." });

        validateWebhookUrl(webhookUrl); // Lève une erreur si invalide

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

module.exports = router;
