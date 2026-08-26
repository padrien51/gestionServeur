const Docker = require('dockerode');
const { runQuery } = require('./db');

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

// Dictionnaire des menaces classiques
const THREAT_PATTERNS = [
    {
        regex: /(?:\.env|\.git|\.php|wp-admin|wp-login|config\.json|passwd|shadow)/i,
        type: "Scan de vulnérabilités (Accès fichiers sensibles)",
        severity: "medium"
    },
    {
        regex: /HTTP\/[0-9\.]+"\s+(401|403)/,
        type: "Tentative d'accès non autorisé",
        severity: "low"
    },
    {
        regex: /(?:union\s+select|select\s+.*\s+from|insert\s+into|drop\s+table)/i,
        type: "Injection SQL potentielle",
        severity: "high"
    },
    {
        regex: /(?:<script>|javascript:|alert\()/i,
        type: "Tentative de Cross-Site Scripting (XSS)",
        severity: "medium"
    }
];

const containerMonitors = {};

// Extraction d'IP basique (IPv4)
function extractIP(logLine) {
    const ipRegex = /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g;
    const matches = logLine.match(ipRegex);
    if (!matches) return 'Inconnue';
    
    // Ignorer les IPs internes communes (docker bridge, localhost) si possible, 
    // ou prendre la dernière IP de la ligne qui est souvent le X-Forwarded-For
    const externalIps = matches.filter(ip => !ip.startsWith('127.') && !ip.startsWith('172.') && !ip.startsWith('10.') && !ip.startsWith('192.168.'));
    
    return externalIps.length > 0 ? externalIps[externalIps.length - 1] : matches[matches.length - 1];
}

async function analyzeLogForSecurity(containerName, line) {
    for (const pattern of THREAT_PATTERNS) {
        if (pattern.regex.test(line)) {
            const ip = extractIP(line);
            
            // Pour éviter de spammer la BDD, on regarde si on l'a déjà vu récemment
            // Dans une version plus poussée, on utiliserait un cache Redis. Ici on écrit directement.
            try {
                await runQuery(
                    "INSERT INTO security_events (container_name, attacker_ip, event_type, severity, log_line) VALUES (?, ?, ?, ?, ?)",
                    [containerName, ip, pattern.type, pattern.severity, line]
                );
                console.log(`[Sécurité] Menace détectée sur ${containerName}: ${pattern.type} (IP: ${ip})`);
            } catch (err) {
                console.error("[Sécurité] Erreur DB:", err.message);
            }
            break; // On a trouvé une menace pour cette ligne, on passe à la suivante
        }
    }
}

async function attachSecurityStream(containerInfo) {
    if (containerMonitors[containerInfo.Id]) return;

    const name = containerInfo.Names ? containerInfo.Names[0].replace(/^\//, '') : containerInfo.Id;
    if (name.includes('gestion_serveur')) return; // Évite la boucle infinie

    containerMonitors[containerInfo.Id] = true;

    try {
        const container = docker.getContainer(containerInfo.Id);
        const stream = await container.logs({ follow: true, stdout: true, stderr: true, tail: 0 });

        stream.on('data', (chunk) => {
            let text = chunk.toString('utf8').replace(/[\u0000-\u001F]/g, '');
            const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            
            for (const line of lines) {
                analyzeLogForSecurity(name, line);
            }
        });

        stream.on('end', () => delete containerMonitors[containerInfo.Id]);
        stream.on('error', () => delete containerMonitors[containerInfo.Id]);
    } catch (e) {
        delete containerMonitors[containerInfo.Id];
    }
}

async function startSecurityMonitor() {
    console.log("[Sécurité] Démarrage du moniteur anti-intrusion (IDS)...");
    try {
        const containers = await docker.listContainers({ filters: '{"status":["running"]}' });
        for (const c of containers) {
            await attachSecurityStream(c);
        }

        const eventStream = await docker.getEvents({ filters: '{"type":["container"], "event":["start"]}' });
        eventStream.on('data', async (chunk) => {
            try {
                const event = JSON.parse(chunk.toString('utf8'));
                if (event.status === 'start') {
                    const cInfo = await docker.getContainer(event.id).inspect();
                    const formattedInfo = { Id: cInfo.Id, Names: [cInfo.Name] };
                    await attachSecurityStream(formattedInfo);
                }
            } catch (err) {}
        });
    } catch (err) {
        console.error("[Sécurité] Erreur d'initialisation du moniteur:", err.message);
    }
}

module.exports = { startSecurityMonitor };
