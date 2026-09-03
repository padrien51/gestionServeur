const si = require('systeminformation');
const { db } = require('./db');
const { statfs } = require('fs/promises');

// En prod (dans docker), le système hôte est monté en read-only
// systeminformation gère cela de manière relativement transparente,
// mais on peut devoir ajuster les appels pour pointer vers un chroot ou montage si besoin.
// Pour l'instant on utilise l'API standard.

async function getSystemMetrics() {
    try {
        const [cpu, mem, fsSize] = await Promise.all([
            si.currentLoad(),
            si.mem(),
            si.fsSize()
        ]);

        // En production (serveur Linux réel), le disque principal de l'hôte est / (ou /hostOS s'il est monté)
        // En développement (Docker Desktop Windows), cela retournera la taille du disque virtuel (souvent 1To)
        const mainDisk = fsSize.find(fs => fs.mount === '/' || fs.mount === '/hostOS') || fsSize[0];

        let backupDiskUsed = 0;
        let backupDiskTotal = 0;

        try {
            // Tente de lire les stats du disque externe (monté dans /hostOS)
            const stats = await statfs('/hostOS/mnt/Backup_serveur');
            backupDiskTotal = stats.blocks * stats.bsize;
            backupDiskUsed = backupDiskTotal - (stats.bfree * stats.bsize);
        } catch (e) {
            // Silencieux si le disque n'est pas trouvé ou non monté
        }

        const metrics = {
            cpuLoad: cpu.currentLoad,
            memUsed: mem.active,
            memTotal: mem.total,
            diskUsed: mainDisk ? mainDisk.used : 0,
            diskTotal: mainDisk ? mainDisk.size : 0,
            backupDiskUsed,
            backupDiskTotal
        };

        return metrics;
    } catch (error) {
        console.error("Erreur lors de la récupération des métriques système:", error);
        throw new Error("Impossible de récupérer les métriques.");
    }
}

// Fonction pour historiser régulièrement les métriques (toutes les minutes par ex)
function recordMetrics() {
    getSystemMetrics().then(metrics => {
        db.run(
            `INSERT INTO metrics_history (cpu_load, mem_used, mem_total, disk_used, disk_total) VALUES (?, ?, ?, ?, ?)`,
            [metrics.cpuLoad, metrics.memUsed, metrics.memTotal, metrics.diskUsed, metrics.diskTotal],
            (err) => {
                if (err) console.error("Erreur d'insertion métriques:", err);
            }
        );
    }).catch(err => console.error(err));
}

// Lancer l'enregistrement toutes les 2 minutes (120000 ms)
setInterval(recordMetrics, 120000);

async function getMetricsHistory() {
    // Récupérer les données des 24 dernières heures
    const { getQuery } = require('./db');
    return await getQuery(
        `SELECT timestamp, cpu_load as cpuLoad, mem_used as memUsed, mem_total as memTotal, disk_used as diskUsed, disk_total as diskTotal
         FROM metrics_history
         WHERE timestamp >= datetime('now', '-24 hours')
         ORDER BY timestamp ASC`
    );
}

module.exports = {
    getSystemMetrics,
    getMetricsHistory
};
