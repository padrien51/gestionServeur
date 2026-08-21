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

const ensureAlpine = () => {
    return new Promise((resolve) => {
        docker.pull('alpine:latest', (err, stream) => {
            if (err) return resolve();
            docker.modem.followProgress(stream, () => resolve());
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
                    mkdir -p "$SUB_DEST/backup_$DATE_STR" && \\
                    rsync -avz --delete --link-dest="$SUB_DEST/latest" /source/ "$SUB_DEST/backup_$DATE_STR/" && \\
                    cd "$SUB_DEST" && rm -f latest && ln -s "backup_$DATE_STR" latest && \\
                    ls -d backup_* | sort -r | tail -n +"$RETENTION_PLUS_ONE" | xargs -r rm -rf
                `;

                console.log(`[Backup] Lancement de rsync pour ${appName} (vers ${hostDest})`);
                
                await ensureAlpine();

                const runResult = await docker.run('alpine:latest', ['sh', '-c', bashScript], null, {
                    Env: [
                        `SUB_DEST=/dest/${appName}`,
                        `DATE_STR=${dateStr}`,
                        `RETENTION_PLUS_ONE=${retention + 1}`
                    ],
                    HostConfig: {
                        AutoRemove: true,
                        Binds: [
                            `${appInfo.working_dir}:/source:ro`,
                            `${job.dest_path}:/dest`
                        ]
                    }
                });
                
                const statusCode = runResult && runResult[0] ? runResult[0].StatusCode : 0;
                if (statusCode !== 0) {
                    throw new Error(`Le processus rsync a échoué (code de sortie : ${statusCode})`);
                }

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
    // 1. Nettoyer les sauvegardes restées "En cours" suite à un crash/redémarrage du serveur
    await runQuery(`UPDATE backup_logs SET status = ?, message = ? WHERE status = 'RUNNING'`, 
        ['FAILED', 'Processus interrompu (le serveur a redémarré pendant la sauvegarde)']);

    // 2. Planifier les jobs
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
    // Commande sh: lister avec ls et renvoyer en JSON
    const bashScript = `
        cd "/dest${safeSubPath}" 2>/dev/null || exit 1
        ls -1A | while read f; do
            if [ -n "$f" ]; then
                isDir="false"
                if [ -d "$f" ]; then isDir="true"; fi
                size=$(stat -c %s "$f")
                mtime=$(stat -c %Y "$f")
                printf "{\\"name\\":\\"%s\\", \\"isDirectory\\":%s, \\"size\\":%s, \\"mtime\\":%s000}\\n" "$f" "$isDir" "$size" "$mtime"
            fi
        done
    `;

    await ensureAlpine();
    return new Promise((resolve, reject) => {
        const { PassThrough } = require('stream');
        const outStream = new PassThrough();
        let output = '';
        outStream.on('data', chunk => output += chunk.toString('utf8'));
        
        docker.run('alpine:latest', ['sh', '-c', bashScript], outStream, {
            HostConfig: {
                AutoRemove: true,
                Binds: [ `${dest}:/dest:ro` ]
            }
        }, (err, data) => {
            if (err) return reject(err);
            try {
                const lines = output.split('\n').filter(l => l.trim().startsWith('{'));
                const files = lines.map(l => JSON.parse(l.trim()));
                resolve(files);
            } catch(e) {
                reject(new Error("Erreur de lecture du dossier"));
            }
        });
    });
}

// -------------------------
// RESTAURATION & TELECHARGEMENT
// -------------------------

async function downloadBackup(jobId, appName, backupFolder, res) {
    const jobs = await getQuery(`SELECT dest_path FROM backup_jobs WHERE id = ?`, [jobId]);
    if (!jobs || jobs.length === 0) throw new Error("Job introuvable");
    const job = jobs[0];

    const safeFolder = path.normalize('/' + backupFolder).replace(/^(\.\.(\/|\\|$))+/, '').replace(/^\//, '');
    const dest = `${job.dest_path}/${appName}`;
    
    // Configuration de la réponse
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${appName}_${safeFolder.replace(/[^a-zA-Z0-9_-]/g, '')}.tar.gz"`);

    return new Promise(async (resolve, reject) => {
        try {
            await ensureAlpine();
            // On crée un conteneur éphémère qui ne fait rien (sleep) juste pour monter le volume
            const container = await docker.createContainer({
                Image: 'alpine:latest',
                Cmd: ['sleep', '3600'],
                HostConfig: { AutoRemove: true, Binds: [`${dest}:/dest:ro`] }
            });
            
            await container.start();

            // getArchive renvoie un flux brut (.tar) propre, sans multiplexage Docker
            const archiveStream = await container.getArchive({ path: `/dest/${safeFolder}` });
            
            const zlib = require('zlib');
            const gzip = zlib.createGzip();

            archiveStream.on('error', (err) => reject(err));
            gzip.on('error', (err) => reject(err));

            // On compresse le .tar en .tar.gz à la volée et on l'envoie au client
            archiveStream.pipe(gzip).pipe(res);

            res.on('finish', async () => {
                try { await container.stop(); } catch(e) {}
                resolve();
            });

            res.on('error', async (err) => {
                try { await container.stop(); } catch(e) {}
                reject(err);
            });

        } catch (err) {
            if (!res.headersSent) res.status(500).json({ error: err.message });
            else res.end();
            reject(err);
        }
    });
}

async function restoreBackup(jobId, appName, backupFolder) {
    const jobs = await getQuery(`SELECT dest_path, source_path FROM backup_jobs WHERE id = ?`, [jobId]);
    if (!jobs || jobs.length === 0) throw new Error("Job introuvable");
    const job = jobs[0];

    const safeFolder = path.normalize('/' + backupFolder).replace(/^(\.\.(\/|\\|$))+/, '').replace(/^\//, '');
    const dest = `${job.dest_path}/${appName}`;

    const allApps = await require('./dockerService').getApplications();
    const appInfo = allApps.find(a => a.name === appName);
    if (!appInfo) throw new Error("Application introuvable ou plus gérée.");

    // Option 3 : Restauration Parallèle (Staging)
    // On ne supprime pas et on n'arrête pas les conteneurs.
    // On crée un nouveau dossier à côté du dossier de l'application.
    const parentDir = path.dirname(appInfo.working_dir);
    const baseName = path.basename(appInfo.working_dir);
    const newFolderName = `${baseName}_restored_${safeFolder.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const newPath = path.join(parentDir, newFolderName);

    const info = await docker.info();
    const isDockerDesktop = info.OperatingSystem.includes("Docker Desktop");
    const rsyncFlags = isDockerDesktop ? "-rltD" : "-a"; // -a = -rlptgoD (g et o pour group et owner)

    const bashScript = `
        apk add --no-cache rsync && \\
        mkdir -p "/source_parent/$NEW_FOLDER_NAME" && \\
        rsync ${rsyncFlags} "/backup/$SAFE_FOLDER/" "/source_parent/$NEW_FOLDER_NAME/"
    `;
    
    console.log(`[Restauration Staging] Lancement de rsync pour ${appName} vers ${newFolderName}...`);

    await ensureAlpine();
    await new Promise((resolve, reject) => {
        docker.run('alpine:latest', ['sh', '-c', bashScript], process.stdout, {
            Env: [
                `NEW_FOLDER_NAME=${newFolderName}`,
                `SAFE_FOLDER=${safeFolder}`
            ],
            HostConfig: {
                AutoRemove: true,
                Binds: [
                    `${parentDir}:/source_parent`,
                    `${dest}:/backup:ro`
                ]
            }
        }, (err, data) => {
            if (err) return reject(err);
            if (data && data.StatusCode !== 0) return reject(new Error("Erreur rsync (code " + data.StatusCode + ")"));
            resolve();
        });
    });
    
    console.log(`[Restauration Staging] Succès vers ${newPath}`);
    return newPath;
}

async function importAndRestoreBackup(archivePath, targetPath) {
    console.log(`[Import Backup] Extraction de l'archive vers ${targetPath}`);
    await ensureAlpine();
    
    // Au lieu de "cat > tmp && tar", on utilise l'API native putArchive de Docker.
    // Docker se charge de l'extraction de manière fiable, en gérant automatiquement
    // les bizarreries de permissions (Windows/Linux) sans planter.
    
    const container = await docker.createContainer({
        Image: 'alpine:latest',
        Cmd: ['sleep', '3600'],
        HostConfig: {
            AutoRemove: true,
            Binds: [ `${targetPath}:/dest` ]
        }
    });

    await container.start();
    
    const fs = require('fs');
    const zlib = require('zlib');
    
    // putArchive attend un flux .tar brut. L'utilisateur upload un .tar.gz
    // On décompresse le gz à la volée avant de l'envoyer au démon Docker.
    const fileStream = fs.createReadStream(archivePath);
    const gunzip = zlib.createGunzip();
    
    const tarStream = fileStream.pipe(gunzip);

    try {
        await container.putArchive(tarStream, { path: '/dest' });
        console.log(`[Import Backup] Extraction réussie via putArchive !`);
        
        // ---------------------------------------------------------
        // NOUVEAUTÉ : Enregistrer l'app dans la DB pour le Dashboard
        // ---------------------------------------------------------
        try {
            const exec = await container.exec({
                Cmd: ['find', '/dest', '-maxdepth', '2', '-name', 'docker-compose.yml'],
                AttachStdout: true
            });
            const execStream = await exec.start();
            let execOutput = '';
            execStream.on('data', chunk => execOutput += chunk.toString());
            
            await new Promise(r => {
                execStream.on('end', r);
                setTimeout(r, 2000);
            });
            
            const match = execOutput.match(/\/dest\/([^\/]+)\/docker-compose\.yml/);
            let projectName = null;
            let workingDir = null;
            
            const path = require('path');
            if (match) {
                projectName = match[1].replace(/[^a-zA-Z0-9_-]/g, '');
                workingDir = path.posix.join(targetPath.replace(/\\/g, '/'), match[1]);
            } else if (execOutput.includes('/dest/docker-compose.yml')) {
                projectName = path.basename(targetPath.replace(/\\/g, '/')).replace(/[^a-zA-Z0-9_-]/g, '');
                workingDir = targetPath.replace(/\\/g, '/');
            }
            
            if (projectName && workingDir) {
                const { runQuery } = require('./db');
                await runQuery(
                    `INSERT INTO compose_projects (name, working_dir, last_seen)
                     VALUES (?, ?, CURRENT_TIMESTAMP)
                     ON CONFLICT(name) DO UPDATE SET 
                        working_dir=excluded.working_dir,
                        last_seen=CURRENT_TIMESTAMP`,
                    [projectName, workingDir]
                );
                console.log(`[Import Backup] App ajoutée au Dashboard : ${projectName} (${workingDir})`);
            }
        } catch (e) {
            console.error("[Import Backup] Erreur lors de l'ajout au dashboard :", e.message);
        }

    } catch (err) {
        console.error(`[Import Backup] Erreur lors du putArchive :`, err);
        try { await container.stop(); } catch(e) {}
        throw err;
    }
    
    try { await container.stop(); } catch(e) {}
    
    console.log(`[Import Backup] Nettoyage...`);
    fs.unlink(archivePath, () => {});
    return true;
}

module.exports = {
    initializeScheduler,
    getJobs,
    createJob,
    updateJob,
    deleteJob,
    triggerManualBackup,
    getLogs,
    exploreBackup,
    downloadBackup,
    restoreBackup,
    importAndRestoreBackup
};
