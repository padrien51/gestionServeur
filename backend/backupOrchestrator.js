const cron = require('node-cron');
const path = require('path');
const { docker, startContainer, stopContainer, handleProjectAction } = require('./dockerService');
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
    let job = null;
    let webhookUrl = null;

    const sendWebhook = async (text, color, jobName) => {
        if (!webhookUrl) return;
        const notifyPref = await getQuery(`SELECT value FROM settings WHERE key = 'notify_backups'`);
        if (notifyPref.length > 0 && (notifyPref[0].value === 'false' || notifyPref[0].value === '0')) return;
        const envTag = process.env.NODE_ENV === 'development' ? ' [DEV]' : '';
        try {
            await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    attachments: [{ color: color, title: `Sauvegarde${envTag} : ${jobName || 'Inconnue'}`, text: text }]
                })
            });
        } catch (e) { console.error("[Backup] Erreur envoi webhook:", e); }
    };

    try {
        const jobs = await getQuery(`SELECT * FROM backup_jobs WHERE id = ?`, [jobId]);
        if (!jobs || jobs.length === 0) throw new Error("Job introuvable");
        job = jobs[0];

        const webhookRow = await getQuery(`SELECT value FROM settings WHERE key = 'mattermost_webhook_url'`);
        webhookUrl = webhookRow.length > 0 ? webhookRow[0].value : null;

        await runQuery(`INSERT INTO backup_logs (job_id, status, message) VALUES (?, ?, ?)`, [job.id, 'RUNNING', 'Démarrage de la sauvegarde...']);
        
        let appsList = [];
        try { appsList = JSON.parse(job.containers); } catch(e) {}

        const allApps = await require('./dockerService').getApplications();

        let successCount = 0;
        let failureCount = 0;
        let failureMessages = [];
        let orphanedApps = [];

        for (let i = 0; i < appsList.length; i++) {
            const appName = appsList[i];
            const appInfo = allApps.find(a => a.name === appName);
            if (!appInfo) {
                console.warn(`[Backup] Application '${appName}' introuvable sur le système (supprimée ?). Ignorée et nettoyée du plan.`);
                orphanedApps.push(appName);
                continue;
            }

            const doneApps = appsList.slice(0, i);
            const remainingApps = appsList.slice(i + 1);
            
            let progressMsg = `[${i + 1}/${appsList.length}] En cours : ${appName}`;
            if (doneApps.length > 0) progressMsg += ` | Fait : ${doneApps.join(', ')}`;
            if (remainingApps.length > 0) progressMsg += ` | Reste : ${remainingApps.join(', ')}`;

            console.log(`[Backup] ${progressMsg}`);
            
            await runQuery(`UPDATE backup_logs SET message = ? WHERE job_id = ? AND status = 'RUNNING'`, [progressMsg, job.id]);
            if (global.io) {
                global.io.emit('backup-progress', { jobId: job.id, message: progressMsg });
            }

            try {
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
                const hostDest = `${job.dest_path}/${appName}`;
                
                const bashScript = `
                    apk add --no-cache rsync && \\
                    mkdir -p "$SUB_DEST/backup_$DATE_STR" && \\
                    LATEST_BACKUP=$(ls -td "$SUB_DEST"/backup_* 2>/dev/null | grep -v "backup_$DATE_STR" | head -n 1) && \\
                    if [ -n "$LATEST_BACKUP" ]; then LINK_DEST_ARG="--link-dest=$LATEST_BACKUP"; else LINK_DEST_ARG=""; fi && \\
                    rsync -a --delete $LINK_DEST_ARG /source/ "$SUB_DEST/backup_$DATE_STR/" && \\
                    cd "$SUB_DEST" && ls -d backup_* | sort -r | tail -n +"$RETENTION_PLUS_ONE" | xargs -r rm -rf
                `;

                console.log(`[Backup] Lancement de rsync pour ${appName} (vers ${hostDest})`);
                await ensureAlpine();

                const backupPromise = docker.run('alpine:latest', ['sh', '-c', bashScript], null, {
                    Env: [ `SUB_DEST=/dest/${appName}`, `DATE_STR=${dateStr}`, `RETENTION_PLUS_ONE=${retention + 1}` ],
                    HostConfig: {
                        AutoRemove: true,
                        Binds: [ `${appInfo.working_dir}:/source:ro`, `${job.dest_path}:/dest` ]
                    }
                });

                // Timeout de 3 heures (10800000 ms) pour rsync, indispensable pour la 1ère sauvegarde complète
                const timeoutMs = 3 * 60 * 60 * 1000;
                let timeoutId;
                const timeoutPromise = new Promise((_, reject) => {
                    timeoutId = setTimeout(() => {
                        reject(new Error(`Timeout après ${timeoutMs/60000} minutes`));
                    }, timeoutMs);
                });

                const runResult = await Promise.race([ backupPromise, timeoutPromise ]).finally(() => clearTimeout(timeoutId));
                
                const statusCode = runResult && runResult[0] ? runResult[0].StatusCode : 0;
                if (statusCode !== 0) {
                    throw new Error(`Code de sortie : ${statusCode}`);
                }

                // 3. Redémarrer les conteneurs (en cas de succès)
                for (const cInfo of appInfo.containers) {
                    console.log(`[Backup] Redémarrage du conteneur ${cInfo.name}`);
                    await startContainer(cInfo.id).catch(e => console.error("Erreur relance:", e));
                }
                
                successCount++;
            } catch (appErr) {
                console.error(`[Backup] Échec pour ${appName}:`, appErr);
                failureCount++;
                failureMessages.push(`${appName} : ${appErr.message}`);
                
                // Redémarrer les conteneurs laissés à l'arrêt pour cette application
                for (const cInfo of appInfo.containers) {
                    console.log(`[Backup Error Recovery] Relance du conteneur ${cInfo.name}`);
                    await startContainer(cInfo.id).catch(e => console.error("Erreur relance recovery:", e));
                }
            }
        }

        // Si des applications orphelines (ex: supprimées) ont été rencontrées, on nettoie le job
        if (orphanedApps.length > 0) {
            const cleanedList = appsList.filter(name => !orphanedApps.includes(name));
            await runQuery(`UPDATE backup_jobs SET containers = ? WHERE id = ?`, [JSON.stringify(cleanedList), job.id]);
            console.log(`[Backup] Applications orphelines retirées automatiquement du job #${job.id} : ${orphanedApps.join(', ')}`);
        }

        // Bilan final
        const total = appsList.length - orphanedApps.length;
        if (failureCount > 0) {
            let errorMsg = `Sauvegarde terminée avec des erreurs.\nSuccès : ${successCount}/${total}\nÉchecs : ${failureCount}\n\nDétails :\n${failureMessages.join('\n')}`;
            if (orphanedApps.length > 0) {
                errorMsg += `\n⚠️ Applications supprimées nettoyées du plan : ${orphanedApps.join(', ')}`;
            }
            await runQuery(`UPDATE backup_logs SET status = ?, message = ? WHERE job_id = ? AND status = 'RUNNING'`, ['FAILED', errorMsg, job.id]);
            await sendWebhook(errorMsg, "#FF0000", job.name);
            if (global.io) {
                global.io.emit('backup-finished', { jobId: job.id, status: 'FAILED', message: errorMsg });
            }
        } else {
            let successMsg = `Sauvegarde terminée avec succès pour ${successCount} application(s).`;
            if (orphanedApps.length > 0) {
                successMsg += ` (Applications introuvables nettoyées : ${orphanedApps.join(', ')})`;
            }
            await runQuery(`UPDATE backup_logs SET status = ?, message = ? WHERE job_id = ? AND status = 'RUNNING'`, ['SUCCESS', successMsg, job.id]);
            await sendWebhook(successMsg, "#00FF00", job.name);
            if (global.io) {
                global.io.emit('backup-finished', { jobId: job.id, status: 'SUCCESS', message: successMsg });
            }
        }

    } catch (err) {
        console.error(`[Backup] Erreur fatale lors de la sauvegarde ${jobId}:`, err);
        
        if (job) {
            await runQuery(`UPDATE backup_logs SET status = ?, message = ? WHERE job_id = ? AND status = 'RUNNING'`, ['FAILED', `Erreur fatale de l'orchestrateur: ${err.message}`, job.id]);
            await sendWebhook(`Erreur fatale: ${err.message}`, "#FF0000", job.name);
            if (global.io) {
                global.io.emit('backup-finished', { jobId: job.id, status: 'FAILED', message: err.message });
            }
        } else {
            await sendWebhook(`Erreur fatale sur un job introuvable (ID: ${jobId}): ${err.message}`, "#FF0000", "Job Inconnu");
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

async function restoreBackup(jobId, appName, backupFolder, options = {}) {
    const mode = options.mode || 'staging';
    const customName = options.customName || null;

    const jobs = await getQuery(`SELECT dest_path, source_path FROM backup_jobs WHERE id = ?`, [jobId]);
    if (!jobs || jobs.length === 0) throw new Error("Job introuvable");
    const job = jobs[0];

    const safeFolder = path.normalize('/' + backupFolder).replace(/^(\.\.(\/|\\|$))+/, '').replace(/^\//, '');
    const dest = `${job.dest_path}/${appName}`;

    const allApps = await require('./dockerService').getApplications();
    const appInfo = allApps.find(a => a.name === appName);

    let parentDir = '';
    let baseName = appName;

    if (appInfo) {
        parentDir = path.dirname(appInfo.working_dir);
        baseName = path.basename(appInfo.working_dir);
    } else {
        if (mode === 'in-place') {
            throw new Error(`L'application ${appName} n'existe plus sur le système Docker. Impossible de faire une restauration 'En place'. Veuillez choisir le mode 'Dossier de staging'.`);
        }
        // Pour une application archivée, on prend le dossier parent d'une autre application existante
        if (allApps.length > 0 && allApps[0].working_dir) {
            parentDir = path.dirname(allApps[0].working_dir);
        } else {
            parentDir = '/home';
        }
    }

    const info = await docker.info();
    const isDockerDesktop = info.OperatingSystem.includes("Docker Desktop");
    const rsyncFlags = isDockerDesktop ? "-rltD" : "-a"; // -a = -rlptgoD (g et o pour group et owner)

    let newPath = '';
    let bashScript = '';

    if (mode === 'in-place') {
        newPath = appInfo.working_dir;
        const backupSuffix = `bak_${new Date().toISOString().replace(/[:.]/g, '')}`;
        
        // On arrête d'abord les conteneurs pour ne pas corrompre les données
        console.log(`[Restauration En Place] Arrêt des conteneurs de ${appName}...`);
        await handleProjectAction(appName, 'stop').catch(err => {
            console.warn(`Attention lors de l'arrêt des conteneurs : ${err.message}`);
        });

        // Script pour renommer le dossier actuel (filet de sécurité) et copier la sauvegarde
        bashScript = `
            apk add --no-cache rsync && \\
            if [ -d "/source_parent/${baseName}" ]; then mv "/source_parent/${baseName}" "/source_parent/${baseName}.${backupSuffix}"; fi && \\
            mkdir -p "/source_parent/${baseName}" && \\
            rsync ${rsyncFlags} "/backup/$SAFE_FOLDER/" "/source_parent/${baseName}/"
        `;
        console.log(`[Restauration En Place] Lancement de rsync pour écraser ${appName}...`);
    } else {
        // Mode Staging (Restauration Parallèle)
        const newFolderName = customName ? customName.replace(/[^a-zA-Z0-9_-]/g, '') : `${baseName}_restored_${safeFolder.replace(/[^a-zA-Z0-9_-]/g, '')}`;
        newPath = path.join(parentDir, newFolderName);
        bashScript = `
            apk add --no-cache rsync && \\
            mkdir -p "/source_parent/$NEW_FOLDER_NAME" && \\
            rsync ${rsyncFlags} "/backup/$SAFE_FOLDER/" "/source_parent/$NEW_FOLDER_NAME/"
        `;
        console.log(`[Restauration Staging] Lancement de rsync pour ${appName} vers ${newFolderName}...`);
    }

    await ensureAlpine();
    await new Promise((resolve, reject) => {
        docker.run('alpine:latest', ['sh', '-c', bashScript], process.stdout, {
            Env: [
                `NEW_FOLDER_NAME=${mode === 'staging' ? path.basename(newPath) : ''}`,
                `SAFE_FOLDER=${safeFolder}`
            ],
            HostConfig: {
                AutoRemove: true,
                Binds: [
                    `${parentDir}:/source_parent`,
                    `${dest}:/backup:ro`
                ]
            }
        }, (err, data, container) => {
            if (err) return reject(err);
            if (data.StatusCode !== 0) return reject(new Error(`Le script de restauration a échoué avec le code ${data.StatusCode}`));
            resolve(data);
        });
    });

    if (mode === 'in-place') {
        console.log(`[Restauration En Place] Redémarrage des conteneurs de ${appName}...`);
        await handleProjectAction(appName, 'start').catch(err => {
            console.warn(`Attention lors du redémarrage des conteneurs : ${err.message}`);
        });
    }

    return newPath;
}

async function importAndRestoreBackup(archivePath, targetPath, customName = null) {
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
    const { PassThrough } = require('stream');
    
    // putArchive attend un flux .tar brut. L'utilisateur upload un .tar.gz
    // On décompresse le gz à la volée avant de l'envoyer au démon Docker.
    const fileStream = fs.createReadStream(archivePath);
    const gunzip = zlib.createGunzip();
    
    // Ajout d'un stream intermédiaire pour traquer la progression
    const totalBytes = fs.statSync(archivePath).size;
    let processedBytes = 0;
    let lastReportedPercentage = -1;
    
    const progressStream = new PassThrough();
    progressStream.on('data', (chunk) => {
        processedBytes += chunk.length;
        const percentage = Math.round((processedBytes / totalBytes) * 100);
        if (percentage !== lastReportedPercentage) {
            lastReportedPercentage = percentage;
            if (global.io) {
                global.io.emit('extraction-progress', { percentage });
            }
        }
    });
    
    const tarStream = fileStream.pipe(progressStream).pipe(gunzip);

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
                let extractedFolder = match[1];
                
                if (customName && customName !== extractedFolder) {
                    const safeCustomName = customName.replace(/[^a-zA-Z0-9_-]/g, '');
                    console.log(`[Import Backup] Renommage de /dest/${extractedFolder} vers /dest/${safeCustomName}`);
                    const renameExec = await container.exec({
                        Cmd: ['mv', `/dest/${extractedFolder}`, `/dest/${safeCustomName}`]
                    });
                    await renameExec.start();
                    extractedFolder = safeCustomName;
                }
                
                projectName = extractedFolder.replace(/[^a-zA-Z0-9_-]/g, '');
                
                // On s'adapte à l'OS cible : si targetPath commence par une lettre de lecteur ou contient des antislashs, on utilise \
                const isWindows = /^[a-zA-Z]:/.test(targetPath) || targetPath.includes('\\');
                if (isWindows) {
                    workingDir = targetPath.replace(/\//g, '\\') + '\\' + extractedFolder;
                } else {
                    workingDir = targetPath.replace(/\\/g, '/') + '/' + extractedFolder;
                }
            } else if (execOutput.includes('/dest/docker-compose.yml')) {
                const isWindows = /^[a-zA-Z]:/.test(targetPath) || targetPath.includes('\\');
                projectName = customName ? customName.replace(/[^a-zA-Z0-9_-]/g, '') : path.basename(targetPath.replace(/\\/g, '/')).replace(/[^a-zA-Z0-9_-]/g, '');
                workingDir = isWindows ? targetPath.replace(/\//g, '\\') : targetPath.replace(/\\/g, '/');
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

async function getJobAvailableApps(jobId) {
    const jobs = await getQuery(`SELECT dest_path, containers FROM backup_jobs WHERE id = ?`, [jobId]);
    if (!jobs || jobs.length === 0) throw new Error("Job introuvable");
    const job = jobs[0];

    let configuredApps = [];
    try { configuredApps = JSON.parse(job.containers); } catch(e) {}

    let allApps = [];
    try {
        allApps = await require('./dockerService').getApplications();
    } catch(e) {}
    const activeAppNames = allApps.map(a => a.name);

    // Recherche des dossiers existants sur le disque de sauvegarde (dest_path)
    let diskFolders = [];
    const absolutePath = path.posix.join('/hostOS', job.dest_path);
    try {
        if (fs.existsSync(absolutePath)) {
            const entries = fs.readdirSync(absolutePath, { withFileTypes: true });
            diskFolders = entries.filter(e => e.isDirectory()).map(e => e.name);
        }
    } catch(e) {
        console.warn("[Backup] Lecture directe de dest_path impossible:", e.message);
    }

    // Fallback conteneur éphémère si /hostOS n'a rien renvoyé
    if (diskFolders.length === 0) {
        try {
            await ensureAlpine();
            const bashScript = `cd "/dest" 2>/dev/null && ls -1d */ 2>/dev/null | sed 's#/##'`;
            const { PassThrough } = require('stream');
            const outStream = new PassThrough();
            let output = '';
            outStream.on('data', chunk => output += chunk.toString('utf8'));
            
            await new Promise((resolve) => {
                docker.run('alpine:latest', ['sh', '-c', bashScript], outStream, {
                    HostConfig: {
                        AutoRemove: true,
                        Binds: [ `${job.dest_path}:/dest:ro` ]
                    }
                }, () => resolve());
            });
            diskFolders = output.split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('.'));
        } catch(e) {
            console.warn("[Backup] Fallback conteneur éphémère pour apps disponibles impossible:", e.message);
        }
    }

    // Fusion de toutes les apps trouvées
    const uniqueNames = Array.from(new Set([...configuredApps, ...diskFolders]));
    
    return uniqueNames.map(name => ({
        name,
        isConfigured: configuredApps.includes(name),
        isActive: activeAppNames.includes(name),
        hasBackupOnDisk: diskFolders.includes(name),
        isArchived: !activeAppNames.includes(name)
    })).sort((a, b) => a.name.localeCompare(b.name));
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
    importAndRestoreBackup,
    getJobAvailableApps
};
