const authService = require('../authService');

const authenticate = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = (authHeader && authHeader.split(' ')[1]) || req.query.token;

    if (!token) {
        return res.status(401).json({ error: 'Non autorisé: Token manquant' });
    }
    try {
        const user = authService.verifyToken(token);
        req.user = user;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Non autorisé: Token invalide ou expiré' });
    }
};

module.exports = authenticate;
