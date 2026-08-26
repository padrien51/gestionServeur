const { docker } = require('./dockerService');
const { analyzeLog, getAISettings } = require('./aiService');
const { runQuery, getQuery } = require('./db');

const BUFFER_SIZE = 25; // Nombre de lignes de contexte
const ERROR_REGEX = /(exception|fatal|panic|error|timeout)/i;
const IGNORE_REGEX = /(No such file or directory.*(favicon\.ico|apple-touch-icon\.png|robots\.txt|\.env)|HTTP\/[0-9\.]+"\s+(404|401|403)|"[A-Z_]*TIMEOUT[A-Z_]*"\s*:|"error"\s*:\s*"icon is not svg|"error"\s*:\s*"failed to get public address)/i;
const DEBOUNCE_MS = 2000;

// Stockage de l'état par conteneur
const containerMonitors = {}; // { [containerId]: { buffer: [], timer: null, name: '', project: '' } }

async function sendMattermostAlert(projectName, containerName, diagnosis, solution) {
    try {
        const notifyPref = await getQuery(`SELECT value FROM settings WHERE key = 'notify_ai_alerts'`);
        if (notifyPref.length > 0 && notifyPref[0].value === 'false') return;

        const webhookRow = await getQuery(`SELECT value FROM settings WHERE key = 'mattermost_webhook_url'`);
        const webhookUrl = webhookRow.length > 0 ? webhookRow[0].value : null;
        if (!webhookUrl) return;

        const text = `**Diagnostic :**\n${diagnosis}\n\n**Solution proposée :**\n${solution}`;

        // Utilisation de fetch natif (Node >= 18)
        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                attachments: [{
                    color: "#e11d48",
                    title: `🤖 Alerte IA : Problème détecté sur [${projectName}] ${containerName}`,
                    text: text
                }]
            })
        });
    } catch (e) {
        console.error("[AIOps] Erreur envoi webhook:", e.message);
    }
}

async function saveInsight(projectName, containerName, context, diagnosis, solution) {
    try {
        await runQuery(
            `INSERT INTO ai_insights (project_name, container_name, log_context, diagnosis, solution)
             VALUES (?, ?, ?, ?, ?)`,
            [projectName, containerName, context, diagnosis, solution]
        );
        console.log(`[AIOps] Alerte sauvegardée pour ${containerName}`);
        
        // Envoi de la notification Mattermost si configuré
        await sendMattermostAlert(projectName, containerName, diagnosis, solution);
    } catch (e) {
        console.error("[AIOps] Erreur de sauvegarde DB:", e.message);
    }
}

function processBufferAndAnalyze(containerId) {
    const monitor = containerMonitors[containerId];
    if (!monitor || monitor.isAnalyzing) return;

    monitor.isAnalyzing = true;

    const contextLines = monitor.buffer.join('\n');
    const cName = monitor.name;
    const pName = monitor.project;
    
    // On vide le buffer pour éviter de réanalyser la même erreur en boucle
    monitor.buffer = [];

    getAISettings().then(async (settings) => {
        let diagnosis = "Analyse IA désactivée.";
        let solution = "Veuillez consulter les logs bruts ci-dessous.";

        if (settings.enabled === 'true') {
            console.log(`[AIOps] Analyse en cours pour une erreur dans ${cName}...`);
            try {
                const insight = await analyzeLog(contextLines, cName);
                if (insight) {
                    diagnosis = insight.diagnosis;
                    solution = insight.solution;
                }
            } catch (e) {
                console.error("[AIOps] Erreur durant l'analyse:", e.message);
                diagnosis = "Échec de l'analyse IA (" + e.message + ")";
                solution = "L'IA est actuellement injoignable. Veuillez consulter les logs bruts ci-dessous pour identifier le problème.";
            }
        }
        
        await saveInsight(pName, cName, contextLines, diagnosis, solution);
    }).catch(e => console.error("[AIOps] Erreur système inattendue:", e.message))
      .finally(() => {
          if (containerMonitors[containerId]) {
              containerMonitors[containerId].isAnalyzing = false;
          }
      });
}

async function attachLogStream(containerInfo) {
    if (containerMonitors[containerInfo.Id]) return;

    const name = containerInfo.Names ? containerInfo.Names[0].replace(/^\//, '') : (containerInfo.Name ? containerInfo.Name.replace(/^\//, '') : containerInfo.Id);
    
    let project = 'Indépendants';
    if (containerInfo.Labels && containerInfo.Labels['com.docker.compose.project']) {
        project = containerInfo.Labels['com.docker.compose.project'];
    }

    // On ignore le gestionnaire lui-même pour éviter une boucle infinie de logs
    if (name.includes('gestion_serveur')) return;

    containerMonitors[containerInfo.Id] = {
        name: name,
        project: project,
        buffer: [],
        timer: null,
        isAnalyzing: false
    };

    try {
        const container = docker.getContainer(containerInfo.Id);
        const stream = await container.logs({
            follow: true,
            stdout: true,
            stderr: true,
            tail: 0 // On ne prend que les nouveaux logs
        });

        console.log(`[AIOps] Surveillance activée pour ${name}`);

        stream.on('data', (chunk) => {
            // Nettoyage sommaire de l'en-tête Docker stream (8 bytes)
            let text = chunk.toString('utf8');
            text = text.replace(/[\u0000-\u001F]/g, ''); 
            
            const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            
            const monitor = containerMonitors[containerInfo.Id];
            if (!monitor) return;

            for (const line of lines) {
                // Truncature pour éviter un DoS mémoire avec des lignes géantes
                const safeLine = line.length > 1000 ? line.substring(0, 1000) + '...[TRONQUÉ]' : line;
                monitor.buffer.push(safeLine);
                if (monitor.buffer.length > BUFFER_SIZE) {
                    monitor.buffer.shift();
                }

                if (ERROR_REGEX.test(line) && !IGNORE_REGEX.test(line)) {
                    // Déclenche l'attente (debounce)
                    if (monitor.timer) clearTimeout(monitor.timer);
                    monitor.timer = setTimeout(() => {
                        processBufferAndAnalyze(containerInfo.Id);
                    }, DEBOUNCE_MS);
                }
            }
        });

        stream.on('end', () => {
            delete containerMonitors[containerInfo.Id];
        });

        stream.on('error', (err) => {
            delete containerMonitors[containerInfo.Id];
        });

    } catch (e) {
        console.error(`[AIOps] Impossible de s'attacher à ${name}:`, e.message);
        delete containerMonitors[containerInfo.Id];
    }
}

async function startLogMonitor() {
    console.log("[AIOps] Démarrage du moniteur de logs...");
    
    try {
        const containers = await docker.listContainers({ filters: '{"status":["running"]}' });
        for (const c of containers) {
            await attachLogStream(c);
        }

        const eventStream = await docker.getEvents({ filters: '{"type":["container"], "event":["start"]}' });
        eventStream.on('data', async (chunk) => {
            try {
                const event = JSON.parse(chunk.toString('utf8'));
                if (event.status === 'start' && event.id) {
                    const container = docker.getContainer(event.id);
                    const info = await container.inspect();
                    const cInfo = {
                        Id: info.Id,
                        Names: [info.Name],
                        Labels: info.Config.Labels
                    };
                    await attachLogStream(cInfo);
                }
            } catch (e) {
                // Ignore parse error
            }
        });
    } catch (err) {
        console.error("[AIOps] Erreur d'initialisation du moniteur:", err.message);
    }
}

module.exports = { startLogMonitor };
