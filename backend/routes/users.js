const express = require('express');
const router = express.Router();
const authService = require('../authService');

// --- GESTION DES UTILISATEURS ---
router.get('/', async (req, res) => {
    try {
        const users = await authService.getUsers();
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/', async (req, res) => {
    try {
        const { email, password } = req.body;
        const result = await authService.addUser(email, password);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const result = await authService.deleteUser(req.params.id);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;
