const cron = require('node-cron');
const path = require('path');
const { docker, startContainer, stopContainer } = require('./dockerService');
const { db } = require('./db');

const activeCronJobs = {};

// -------------------------
// REQUETES BASE DE DONNEES
// -------------------------

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

// -------------------------
// MOTEUR D'EXECUTION DOCKER
// -------------------------

const formatDate = (date) => {
    return date.toISOString().replace(/[-:T]/g, '').slice(0, 14); // YYYYMMDDHHmmss
};

async function executeBackup(jobId) {
    let job;
    try {
        const jobs = await getQuery(`SELECT * FROM backup_jobs WHERE id = ?`, [jobId]);
        if (!jobs || jobs.length === 0) throw new Error("Job introuvable");
        job = jobs[0];

        await runQuery(`INSERT INTO backup_logs (job_id, status, message) VALUES (?, ?, ?)`, [job.id, 'RUNNING', 'Démarrage de la sauvegarde...']);
        
        let appsList = [];
        try {
            appsList = JSON.parse(job.containers); // on garde le nom de colonne 'containers' dans la DB pour ne pas casser le schéma
        } catch(e) {}

        const allApps = await require('./dockerService').getApplications();

        // Récupération du webhook
        const webhookRow = await getQuery(`SELECT value FROM settings WHERE key = 'mattermost_webhook_url'`);
        const webhookUrl = webhookRow.length > 0 ? webhookRow[0].value : null;

        const sendWebhook = async (text, color) => {
            if (!webhookUrl) return;
            
            const notifyPref = await getQuery(`SELECT value FROM settings WHERE key = 'notify_backups'`);
            if (notifyPref.length > 0 && notifyPref[0].value === 'false') return;

            try {
                await fetch(webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        attachments: [{
                            color: color,
                            title: `Sauvegarde : ${job.name}`,
                            text: text
                        }]
                    })
                });
            } catch (e) {
                console.error("[Backup] Erreur envoi webhook:", e);
            }
        };

        try {
            // On boucle sur chaque application sélectionnée
            for (const appName of appsList) {
                const appInfo = allApps.find(a => a.name === appName);
                if (!appInfo) {
                    console.warn(`[Backup] Application ${appName} introuvable, ignorée.`);
                    continue;
                }

                console.log(`[Backup] Traitement de l'application ${appName}...`);

                // 1. Arrêter les conteneurs cibles
                for (const cInfo of appInfo.containers) {
                    if (cInfo.state === 'running') {
                        console.log(`[Backup] Arrêt du conteneur ${cInfo.name}`);
                        await stopContainer(cInfo.id);
                    }
                }

                // 2. Lancer le conteneur éphémère rsync
                const dateStr = formatDate(new Date());
                const retention = job.retention_count || 15;
                
                // Le sous-dossier cible pour cette app
                const subDest = `/dest/${appName}`;
                const hostDest = `${job.dest_path}/${appName}`;
                
                const bashScript = `
                    apk add --no-cache rsync && \\
                    mkdir -p ${subDest}/backup_${dateStr} && \\
                    rsync -avz --delete --link-dest=${subDest}/latest /source/ ${subDest}/backup_${dateStr}/ && \\
                    rm -f ${subDest}/latest && \\
                    ln -s ${subDest}/backup_${dateStr} ${subDest}/latest && \\
                    cd ${subDest} && ls -dt backup_* | tail -n +${retention + 1} | xargs -r rm -rf
                `;

                console.log(`[Backup] Lancement de rsync pour ${appName} (vers ${hostDest})`);
                
                // On tente de pull l'image, mais on ne bloque pas si on est hors ligne
                await new Promise((resolve) => {
                    docker.pull('alpine:latest', (err, stream) => {
                        if (err) {
                            console.warn("[Backup] Impossible de pull alpine:latest (mode hors ligne ?), utilisation du cache local.");
                            return resolve();
                        }
                        docker.modem.followProgress(stream, (err, res) => {
                            if (err) console.warn("[Backup] Erreur pendant le pull de alpine:latest, utilisation du cache local.");
                            resolve(res);
                        });
                    });
                });

                await docker.run('alpine:latest', ['sh', '-c', bashScript], null, {
                    HostConfig: {
                        AutoRemove: true,
                        Binds: [
                            `${appInfo.working_dir}:/source:ro`,
                            `${job.dest_path}:/dest`
                        ]
                    }
                });

                // 3. Redémarrer les conteneurs
                for (const cInfo of appInfo.containers) {
                    console.log(`[Backup] Redémarrage du conteneur ${cInfo.name}`);
                    await startContainer(cInfo.id).catch(e => console.error("Erreur relance:", e));
                }
            }

            // Log Succès
            const successMsg = `Sauvegarde terminée avec succès pour ${appsList.length} application(s).`;
            await runQuery(`UPDATE backup_logs SET status = ?, message = ? WHERE job_id = ? AND status = 'RUNNING'`, 
                ['SUCCESS', successMsg, job.id]);
            await sendWebhook(successMsg, "#00FF00");

        } catch (jobError) {
            console.error(`[Backup] Erreur critique pendant le job ${job.id}:`, jobError);
            // Log Échec
            await runQuery(`UPDATE backup_logs SET status = ?, message = ? WHERE job_id = ? AND status = 'RUNNING'`, 
                ['FAILED', `Erreur: ${jobError.message}`, job.id]);
            await sendWebhook(`Erreur critique: ${jobError.message}`, "#FF0000");
        }
        

    } catch (err) {
        console.error(`[Backup] Erreur lors de la sauvegarde ${jobId}:`, err);
        
        if (job) {
            await runQuery(`UPDATE backup_logs SET status = ?, message = ? WHERE job_id = ? AND status = 'RUNNING'`, 
                ['FAILED', err.message, job.id]);

            // Redémarrer en cas d'erreur
            let containerNames = [];
            try { containerNames = JSON.parse(job.containers); } catch(e) {}
            for (const name of containerNames) {
                const allContainers = await docker.listContainers({ all: true });
                const c = allContainers.find(c => c.Names.some(n => n.includes(name)));
                if (c && c.State !== 'running') {
                    await startContainer(c.Id).catch(e => console.error("Erreur relance:", e));
                }
            }
        }
    }
}

// -------------------------
// PLANIFICATEUR (CRON)
// -------------------------

async function initializeScheduler() {
    const jobs = await getQuery(`SELECT * FROM backup_jobs WHERE enabled = 1`);
    for (const job of jobs) {
        scheduleJob(job);
    }
    console.log(`[Backup Orchestrator] ${jobs.length} tâches de sauvegarde planifiées.`);
}

function scheduleJob(job) {
    if (activeCronJobs[job.id]) {
        activeCronJobs[job.id].stop();
    }
    
    if (job.enabled && cron.validate(job.cron_schedule)) {
        activeCronJobs[job.id] = cron.schedule(job.cron_schedule, () => {
            executeBackup(job.id);
        });
    }
}

function unscheduleJob(jobId) {
    if (activeCronJobs[jobId]) {
        activeCronJobs[jobId].stop();
        delete activeCronJobs[jobId];
    }
}

// -------------------------
// CRUD API METHODS
// -------------------------

async function getJobs() {
    return await getQuery(`SELECT * FROM backup_jobs`);
}

async function getJob(id) {
    const res = await getQuery(`SELECT * FROM backup_jobs WHERE id = ?`, [id]);
    return res[0];
}

async function createJob(data) {
    const { name, containers, source_path, dest_path, cron_schedule, retention_count } = data;
    const res = await runQuery(`
        INSERT INTO backup_jobs (name, containers, source_path, dest_path, cron_schedule, retention_count) 
        VALUES (?, ?, ?, ?, ?, ?)
    `, [name, JSON.stringify(containers), source_path, dest_path, cron_schedule, retention_count]);
    
    const newJob = await getJob(res.lastID);
    scheduleJob(newJob);
    return newJob;
}

async function updateJob(id, data) {
    const { name, containers, source_path, dest_path, cron_schedule, retention_count, enabled } = data;
    await runQuery(`
        UPDATE backup_jobs 
        SET name = ?, containers = ?, source_path = ?, dest_path = ?, cron_schedule = ?, retention_count = ?, enabled = ?
        WHERE id = ?
    `, [name, JSON.stringify(containers), source_path, dest_path, cron_schedule, retention_count, enabled ? 1 : 0, id]);
    
    const updatedJob = await getJob(id);
    if (updatedJob.enabled) {
        scheduleJob(updatedJob);
    } else {
        unscheduleJob(id);
    }
    return updatedJob;
}

async function deleteJob(id) {
    await runQuery(`DELETE FROM backup_jobs WHERE id = ?`, [id]);
    unscheduleJob(id);
    return { success: true };
}

async function triggerManualBackup(id) {
    // Exécution asynchrone pour ne pas bloquer la réponse HTTP
    executeBackup(id).catch(console.error);
    return { success: true, message: "Sauvegarde lancée en arrière-plan" };
}

async function getLogs(jobId = null) {
    let query = `SELECT l.*, j.name as job_name FROM backup_logs l LEFT JOIN backup_jobs j ON l.job_id = j.id`;
    let params = [];
    if (jobId) {
        query += ` WHERE l.job_id = ?`;
        params.push(jobId);
    }
    query += ` ORDER BY l.created_at DESC LIMIT 100`;
    return await getQuery(query, params);
}

const fs = require('fs');

async function exploreBackup(jobId, appName, subPath = '') {
    const jobs = await getQuery(`SELECT dest_path FROM backup_jobs WHERE id = ?`, [jobId]);
    if (!jobs || jobs.length === 0) throw new Error("Job introuvable");
    const job = jobs[0];

    // Sécurité: empêcher la navigation relative vers le haut
    const safeSubPath = path.normalize('/' + subPath).replace(/^(\.\.(\/|\\|$))+/, '');
    const absolutePath = path.posix.join('/hostOS', job.dest_path, appName, safeSubPath);

    // Essayer de lire via le volume /hostOS
    try {
        if (fs.existsSync(absolutePath)) {
            const files = fs.readdirSync(absolutePath, { withFileTypes: true });
            return files.map(f => {
                const stat = fs.statSync(path.join(absolutePath, f.name));
                return {
                    name: f.name,
                    isDirectory: f.isDirectory(),
                    size: stat.size,
                    mtime: stat.mtime
                };
            });
        }
    } catch (e) {
        console.warn("[Backup] Lecture locale impossible, fallback sur conteneur éphémère", e.message);
    }

    // Fallback: utiliser un conteneur docker éphémère (si on est sur Windows sans montage /hostOS fonctionnel par ex)
    const dest = `${job.dest_path}/${appName}`;
    // Commande sh: lister avec stat (ou ls) et renvoyer en JSON (Alpine/Busybox)
    // Busybox stat ne supporte pas toujours toutes les options, on va utiliser ls -l --time-style=iso
    // ou plutôt un petit script shell pour parser
    const bashScript = `
        cd /dest${safeSubPath} 2>/dev/null || exit 1
        ls -lA --time-style=+%Y-%m-%dT%H:%M:%S | awk 'NR>1 {
            isDir = substr($1,1,1) == "d" ? "true" : "false"
            size = $5
            date = $6
            name = $7
            for(i=8; i<=NF; ++i) name = name " " $i
            printf "{\\"name\\":\\"%s\\", \\"isDirectory\\":%s, \\"size\\":%s, \\"mtime\\":\\"%s\\"}\\n", name, isDir, size, date
        }'
    `;

    return new Promise((resolve, reject) => {
        let output = '';
        docker.run('alpine:latest', ['sh', '-c', bashScript], null, {
            HostConfig: {
                AutoRemove: true,
                Binds: [ `${dest}:/dest:ro` ]
            }
        }, (err, data, container) => {
            if (err) return reject(err);
        }).on('stream', stream => {
            stream.on('data', chunk => output += chunk.toString('utf8'));
            stream.on('end', () => {
                try {
                    // Nettoyer les logs docker (le stdout a un prefix 8 bytes)
                    // Mais en mode run, il se peut qu'il n'y ait pas de muxer si on ne passe pas un write stream.
                    // Pour éviter ça, on va nettoyer les caractères de contrôle au début de chaque ligne
                    const lines = output.split('\n')
                        .map(l => l.replace(/^[\\u0000-\\u0008\\u000B-\\u001F\\u007F]+/, '').trim())
                        .filter(l => l.startsWith('{') && l.endsWith('}'));
                    
                    const files = lines.map(l => JSON.parse(l));
                    resolve(files);
                } catch(e) {
                    reject(new Error("Erreur de lecture du dossier"));
                }
            });
        });
    });
}

module.exports = {
    initializeScheduler,
    getJobs,
    createJob,
    updateJob,
    deleteJob,
    triggerManualBackup,
    getLogs,
    exploreBackup
};
