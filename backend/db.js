const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Erreur lors de l\'ouverture de la base de données SQLite:', err.message);
    } else {
        console.log('Connecté à la base de données SQLite.');
        initDb();
    }
});

function initDb() {
    db.serialize(() => {
        // Table pour l'historique des métriques
        db.run(`CREATE TABLE IF NOT EXISTS metrics_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            cpu_load REAL,
            mem_used REAL,
            mem_total REAL,
            disk_used REAL,
            disk_total REAL
        )`);

        // Table pour la configuration
        db.run(`CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )`);
    });
}

module.exports = db;
