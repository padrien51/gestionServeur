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

        // Table des utilisateurs
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            totp_secret TEXT,
            is_2fa_enabled BOOLEAN DEFAULT 0,
            backup_codes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) console.error("Erreur création users :", err);
            else {
                console.log("Table users vérifiée.");
                // Migrations (ignorées silencieusement si la colonne existe déjà)
                db.run(`ALTER TABLE users ADD COLUMN totp_secret TEXT`, () => {});
                db.run(`ALTER TABLE users ADD COLUMN is_2fa_enabled BOOLEAN DEFAULT 0`, () => {});
                db.run(`ALTER TABLE users ADD COLUMN backup_codes TEXT`, () => {});
            }
        });

        // Table de réinitialisation de mot de passe
        db.run(`CREATE TABLE IF NOT EXISTS password_resets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token TEXT NOT NULL,
            expires_at DATETIME NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )`, (err) => {
            if (err) console.error("Erreur création password_resets :", err);
            else console.log("Table password_resets vérifiée.");
        });
        
        // Table des projets Compose mémorisés
        db.run(`CREATE TABLE IF NOT EXISTS compose_projects (
            name TEXT PRIMARY KEY,
            working_dir TEXT NOT NULL,
            config_files TEXT,
            last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) console.error("Erreur création compose_projects :", err);
            else console.log("Table compose_projects vérifiée.");
        });

        // Table des alertes IA (AIOps)
        db.run(`CREATE TABLE IF NOT EXISTS ai_insights (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_name TEXT NOT NULL,
            container_name TEXT NOT NULL,
            log_context TEXT NOT NULL,
            diagnosis TEXT,
            solution TEXT,
            status TEXT DEFAULT 'active', -- 'active', 'resolved', 'ignored'
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) console.error("Erreur création ai_insights :", err);
            else {
                console.log("Table ai_insights vérifiée.");
                // Migration: ajout de trigger_line si inexistant
                db.run(`ALTER TABLE ai_insights ADD COLUMN trigger_line TEXT`, (altErr) => {});
            }
        });

        // Table des alertes de sécurité (IDS)
        db.run(`CREATE TABLE IF NOT EXISTS security_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            container_name TEXT NOT NULL,
            attacker_ip TEXT,
            event_type TEXT NOT NULL, -- e.g., 'scan', 'auth_failure', 'xss', 'sqli'
            severity TEXT DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
            log_line TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) console.error("Erreur création security_events :", err);
            else console.log("Table security_events vérifiée.");
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

const runQuery = (query, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(query, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
};

const getQuery = (query, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

module.exports = { db, runQuery, getQuery };
