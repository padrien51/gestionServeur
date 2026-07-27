const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// L'initialisation est appelée immédiatement, sqlite3 va la mettre en file d'attente
// garantissant que la création des tables se fait avant toute requête SELECT
initDb();

function initializeDB() {
    db.serialize(() => {
        // Table des conteneurs masqués (existant)
        db.run(`CREATE TABLE IF NOT EXISTS hidden_containers (
            id TEXT PRIMARY KEY,
            name TEXT,
            hidden_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Table des Jobs de Sauvegarde
        db.run(`CREATE TABLE IF NOT EXISTS backup_jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            containers TEXT NOT NULL,
            source_path TEXT NOT NULL,
            dest_path TEXT NOT NULL,
            cron_schedule TEXT NOT NULL,
            retention_count INTEGER DEFAULT 15,
            enabled BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) console.error("Erreur création backup_jobs :", err);
            else console.log("Table backup_jobs vérifiée.");
        });

        // Table de l'historique des Sauvegardes
        db.run(`CREATE TABLE IF NOT EXISTS backup_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            status TEXT NOT NULL,
            message TEXT,
            reclaimed_space INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(job_id) REFERENCES backup_jobs(id) ON DELETE CASCADE
        )`, (err) => {
            if (err) console.error("Erreur création backup_logs :", err);
            else console.log("Table backup_logs vérifiée.");
        });

        // Table des Paramètres Globaux
        db.run(`CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )`, (err) => {
            if (err) console.error("Erreur création settings :", err);
            else console.log("Table settings vérifiée.");
        });
    });
};

function initDb() {
    initializeDB();
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
