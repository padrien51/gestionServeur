const { getQuery, runQuery } = require('./db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-default-key-change-it-in-production';
const JWT_EXPIRES_IN = '24h';

// Initialisation de Nodemailer
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

// Vérifie si la table users est vide
async function isSetupNeeded() {
    const rows = await getQuery(`SELECT COUNT(*) as count FROM users`);
    return rows[0].count === 0;
}

// Création du premier compte administrateur
async function setupAccount(email, password) {
    if (!(await isSetupNeeded())) {
        throw new Error('Un compte administrateur existe déjà.');
    }
    const hash = await bcrypt.hash(password, 10);
    await runQuery(`INSERT INTO users (email, password_hash) VALUES (?, ?)`, [email, hash]);
    return { success: true, message: 'Compte administrateur créé avec succès.' };
}

// Connexion
async function login(email, password) {
    const rows = await getQuery(`SELECT * FROM users WHERE email = ?`, [email]);
    if (rows.length === 0) {
        throw new Error('Email ou mot de passe incorrect.');
    }
    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
        throw new Error('Email ou mot de passe incorrect.');
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    return { success: true, token, email: user.email };
}

// Demande de réinitialisation de mot de passe (oublié)
async function requestPasswordReset(email, host) {
    const rows = await getQuery(`SELECT * FROM users WHERE email = ?`, [email]);
    if (rows.length === 0) {
        // Pour des raisons de sécurité, on ne dit pas si l'email existe ou non
        return { success: true, message: 'Si cet email correspond à un compte, un lien de réinitialisation a été envoyé.' };
    }
    const user = rows[0];

    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        throw new Error("Le serveur email (SMTP) n'est pas configuré dans le fichier .env.");
    }

    // Générer un token unique de 32 octets
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 3600000); // Expire dans 1 heure (3600s * 1000ms)

    // Stocker dans la base
    await runQuery(`INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)`, 
        [user.id, resetToken, expiresAt.toISOString()]);

    // Envoyer l'email en utilisant le hostname depuis la requête
    const resetUrl = `http://${host}/?reset=${resetToken}`;
    
    const mailOptions = {
        from: `"Gestion Serveur" <${process.env.SMTP_USER}>`,
        to: user.email,
        subject: 'Réinitialisation de votre mot de passe',
        html: `
            <h1>Gestion Serveur</h1>
            <p>Vous avez demandé la réinitialisation de votre mot de passe.</p>
            <p>Veuillez cliquer sur le lien ci-dessous pour définir un nouveau mot de passe :</p>
            <a href="${resetUrl}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:5px;">Réinitialiser mon mot de passe</a>
            <p>Ce lien expirera dans 1 heure.</p>
            <p><small>Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email.</small></p>
        `
    };

    await transporter.sendMail(mailOptions);
    return { success: true, message: 'Un lien de réinitialisation a été envoyé à votre adresse email.' };
}

// Effectuer la réinitialisation avec le token
async function resetPassword(token, newPassword) {
    const rows = await getQuery(`SELECT * FROM password_resets WHERE token = ?`, [token]);
    if (rows.length === 0) {
        throw new Error('Lien de réinitialisation invalide ou expiré.');
    }
    const resetRecord = rows[0];
    
    if (new Date(resetRecord.expires_at) < new Date()) {
        await runQuery(`DELETE FROM password_resets WHERE id = ?`, [resetRecord.id]);
        throw new Error('Lien de réinitialisation expiré.');
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await runQuery(`UPDATE users SET password_hash = ? WHERE id = ?`, [hash, resetRecord.user_id]);
    await runQuery(`DELETE FROM password_resets WHERE user_id = ?`, [resetRecord.user_id]);

    return { success: true, message: 'Mot de passe réinitialisé avec succès.' };
}

// Changement de mot de passe (pour utilisateur connecté)
async function changePassword(userId, currentPassword, newPassword) {
    const rows = await getQuery(`SELECT * FROM users WHERE id = ?`, [userId]);
    if (rows.length === 0) throw new Error('Utilisateur introuvable.');
    
    const user = rows[0];
    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) throw new Error('Le mot de passe actuel est incorrect.');

    const hash = await bcrypt.hash(newPassword, 10);
    await runQuery(`UPDATE users SET password_hash = ? WHERE id = ?`, [hash, userId]);

    return { success: true, message: 'Mot de passe mis à jour avec succès.' };
}

function verifyToken(token) {
    return jwt.verify(token, JWT_SECRET);
}

// --- Gestion des utilisateurs par l'admin ---
async function getUsers() {
    return await getQuery(`SELECT id, email, created_at FROM users ORDER BY created_at DESC`);
}

async function addUser(email, password) {
    // Vérifier si l'email existe déjà
    const rows = await getQuery(`SELECT id FROM users WHERE email = ?`, [email]);
    if (rows.length > 0) {
        throw new Error('Cet email est déjà utilisé.');
    }
    const hash = await bcrypt.hash(password, 10);
    await runQuery(`INSERT INTO users (email, password_hash) VALUES (?, ?)`, [email, hash]);
    return { success: true, message: 'Utilisateur ajouté avec succès.' };
}

async function deleteUser(id) {
    // Éviter de supprimer tous les utilisateurs (garder au moins 1)
    const countRows = await getQuery(`SELECT COUNT(*) as count FROM users`);
    if (countRows[0].count <= 1) {
        throw new Error("Impossible de supprimer le dernier utilisateur.");
    }
    await runQuery(`DELETE FROM users WHERE id = ?`, [id]);
    return { success: true, message: 'Utilisateur supprimé.' };
}

// Changement d'email (pour utilisateur connecté)
async function changeEmail(userId, newEmail) {
    const rows = await getQuery(`SELECT id FROM users WHERE email = ?`, [newEmail]);
    if (rows.length > 0 && rows[0].id !== userId) {
        throw new Error('Cet email est déjà utilisé par un autre compte.');
    }
    await runQuery(`UPDATE users SET email = ? WHERE id = ?`, [newEmail, userId]);
    return { success: true, message: 'Email mis à jour avec succès.', email: newEmail };
}

module.exports = {
    isSetupNeeded,
    setupAccount,
    login,
    requestPasswordReset,
    resetPassword,
    changePassword,
    changeEmail,
    verifyToken,
    getUsers,
    addUser,
    deleteUser
};
