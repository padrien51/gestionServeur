const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const authService = require('../authService');

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: "Trop de tentatives de connexion. Veuillez réessayer dans 15 minutes." }
});

// --- ROUTES PUBLIQUES (pas d'authentification) ---
router.get('/status', async (req, res) => {
    try {
        const needed = await authService.isSetupNeeded();
        res.json({ setupNeeded: needed });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/setup', async (req, res) => {
    try {
        const { email, password } = req.body;
        const result = await authService.setupAccount(email, password);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.post('/login', authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;
        const result = await authService.login(email, password);
        res.json(result);
    } catch (err) {
        res.status(401).json({ error: err.message });
    }
});

router.post('/login-2fa', authLimiter, async (req, res) => {
    try {
        const { tempToken, tokenCode } = req.body;
        const result = await authService.login2FA(tempToken, tokenCode);
        res.json(result);
    } catch (err) {
        res.status(401).json({ error: err.message });
    }
});

router.post('/forgot-password', authLimiter, async (req, res) => {
    try {
        const host = req.get('host');
        const result = await authService.requestPasswordReset(req.body.email, host);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.post('/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        const result = await authService.resetPassword(token, newPassword);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

const authenticate = require('../middleware/auth');

// --- ROUTES PROTÉGÉES (nécessitent authenticate middleware appliqué en amont) ---
router.use(authenticate);

router.get('/2fa/status', async (req, res) => {
    try {
        const result = await authService.get2FAStatus(req.user.id);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/2fa/generate', async (req, res) => {
    try {
        const result = await authService.generate2FA(req.user.id, req.user.email);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/2fa/verify', async (req, res) => {
    try {
        const { tokenCode } = req.body;
        const result = await authService.verifyAndEnable2FA(req.user.id, tokenCode);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.post('/2fa/disable', async (req, res) => {
    try {
        const { password } = req.body;
        const result = await authService.disable2FA(req.user.id, password);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.post('/change-password', async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const result = await authService.changePassword(req.user.id, currentPassword, newPassword);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.post('/change-email', async (req, res) => {
    try {
        const { newEmail } = req.body;
        const result = await authService.changeEmail(req.user.id, newEmail);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;
