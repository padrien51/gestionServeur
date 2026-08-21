const { getQuery } = require('./db');
const Docker = require('dockerode');
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

async function getAISettings() {
    const rows = await getQuery("SELECT key, value FROM settings WHERE key IN ('ai_engine', 'ai_url', 'ai_api_key', 'ai_model', 'ai_enabled')");
    const settings = {
        enabled: 'false',
        engine: 'ollama',
        url: 'http://gestion_serveur_ollama:11434',
        apiKey: '',
        model: 'mistral'
    };
    rows.forEach(r => {
        if (r.key === 'ai_enabled') settings.enabled = r.value;
        if (r.key === 'ai_engine') settings.engine = r.value;
        if (r.key === 'ai_url') settings.url = r.value;
        if (r.key === 'ai_api_key') settings.apiKey = r.value;
        if (r.key === 'ai_model') settings.model = r.value;
    });
    return settings;
}

const SYSTEM_PROMPT = `Tu es un expert DevOps IA chargé de lire les logs d'erreurs Docker.
Analyse le log suivant et identifie s'il y a un problème critique. 
Réponds UNIQUEMENT au format JSON avec deux clés:
- "diagnosis": "L'explication claire du problème en 1 courte phrase (en français)."
- "solution": "La solution technique recommandée ou la commande à exécuter."
Ne rajoute aucun markdown autour du JSON. Seulement le JSON valide.`;

async function analyzeLog(logContext, containerName) {
    const settings = await getAISettings();
    
    if (settings.enabled !== 'true') {
        return null;
    }

    // Protection anti-SSRF de base
    if (!settings.url.startsWith('http://') && !settings.url.startsWith('https://')) {
        console.error("[AIOps] Erreur Sécurité: L'URL de l'IA doit commencer par http:// ou https://");
        return null;
    }

    const prompt = `Conteneur: ${containerName}\nLogs:\n${logContext}`;

    if (settings.engine === 'ollama') {
        let ollamaContainer = null;
        let wasStopped = false;

        try {
            // Recherche d'un conteneur Ollama local
            const containers = await docker.listContainers({ all: true });
            const ollamaInfo = containers.find(c => c.Names.some(n => n.includes('ollama')));
            
            if (ollamaInfo) {
                ollamaContainer = docker.getContainer(ollamaInfo.Id);
                if (ollamaInfo.State !== 'running') {
                    console.log("[AIOps] Démarrage du conteneur Ollama pour l'analyse...");
                    await ollamaContainer.start();
                    wasStopped = true;
                    // Attente que le service Ollama soit prêt
                    await new Promise(resolve => setTimeout(resolve, 8000));
                }

                // Contournement du DNS Docker : on récupère l'IP réelle du conteneur
                const inspectData = await ollamaContainer.inspect();
                const networks = inspectData.NetworkSettings.Networks;
                let ipAddress = null;
                for (const net of Object.values(networks)) {
                    if (net.IPAddress) {
                        ipAddress = net.IPAddress;
                        break;
                    }
                }
                
                if (ipAddress) {
                    try {
                        const parsedUrl = new URL(settings.url);
                        parsedUrl.hostname = ipAddress;
                        settings.url = parsedUrl.toString();
                        if (settings.url.endsWith('/')) settings.url = settings.url.slice(0, -1);
                    } catch (e) {
                        // Ignore si settings.url est malformé
                    }
                }
            }
        } catch (e) {
            console.warn("[AIOps] Avertissement: Impossible d'interagir avec le conteneur Ollama via l'API Docker:", e.message);
        }

        try {
            // Vérification et téléchargement automatique du modèle
            try {
                const tagsRes = await fetch(`${settings.url}/api/tags`);
                if (tagsRes.ok) {
                    const tagsData = await tagsRes.json();
                    const hasModel = tagsData.models?.some(m => m.name === settings.model || m.name.startsWith(settings.model + ':'));
                    
                    if (!hasModel) {
                        console.log(`[AIOps] Le modèle '${settings.model}' est introuvable. Téléchargement automatique en cours (cela prendra quelques minutes)...`);
                        await fetch(`${settings.url}/api/pull`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: settings.model, stream: false })
                        });
                        console.log(`[AIOps] Modèle '${settings.model}' téléchargé avec succès !`);
                    }
                }
            } catch (checkErr) {
                console.warn("[AIOps] Impossible de vérifier les modèles Ollama avant l'analyse:", checkErr.message);
            }

            let response;
            let retries = 6;
            while (retries > 0) {
                try {
                    response = await fetch(`${settings.url}/api/generate`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            model: settings.model,
                            prompt: prompt,
                            system: SYSTEM_PROMPT,
                            stream: false,
                            format: 'json'
                        })
                    });
                    break;
                } catch (fetchErr) {
                    retries--;
                    if (retries === 0) throw fetchErr;
                    console.log(`[AIOps] L'IA ne répond pas immédiatement (chargement du modèle en RAM ?). Nouvelle tentative dans 10s...`);
                    await new Promise(r => setTimeout(r, 10000));
                }
            }

            if (!response.ok) {
                throw new Error(`Erreur Ollama HTTP ${response.status}`);
            }

            const data = await response.json();
            try {
                // Parfois Ollama ajoute du markdown même quand on demande du JSON
                const cleanJson = data.response.replace(/```json/g, '').replace(/```/g, '').trim();
                const result = JSON.parse(cleanJson);
                
                // Nettoyage de sécurité (Protection Phishing et XSS basique)
                const sanitizeStr = (str) => {
                    if (typeof str !== 'string') return '';
                    return str.replace(/https?:\/\/[^\s]+/gi, '[LIEN RETIRÉ]').replace(/[<>]/g, '');
                };

                return {
                    diagnosis: sanitizeStr(result.diagnosis || 'Analyse incomplète'),
                    solution: sanitizeStr(result.solution || 'Aucune solution identifiée')
                };
            } catch (e) {
                console.error("Impossible de parser la réponse JSON de l'IA:", data.response);
                return null;
            }
        } catch (error) {
            console.error("Erreur lors de l'appel à Ollama:", error.message);
            throw error;
        } finally {
            if (wasStopped && ollamaContainer) {
                console.log("[AIOps] Arrêt du conteneur Ollama pour économiser les ressources...");
                try {
                    await ollamaContainer.stop();
                } catch (e) {
                    console.error("[AIOps] Impossible d'arrêter Ollama:", e.message);
                }
            }
        }
    } else {
        throw new Error(`Engine IA ${settings.engine} non implémenté pour le moment.`);
    }
}

module.exports = { analyzeLog, getAISettings };
