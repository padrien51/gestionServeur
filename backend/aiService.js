const { getQuery } = require('./db');

async function getAISettings() {
    const rows = await getQuery("SELECT key, value FROM settings WHERE key IN ('ai_engine', 'ai_url', 'ai_api_key', 'ai_model', 'ai_enabled')");
    const settings = {
        enabled: 'false',
        engine: 'ollama',
        url: 'http://host.docker.internal:11434',
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

    const prompt = `Conteneur: ${containerName}\nLogs:\n${logContext}`;

    if (settings.engine === 'ollama') {
        try {
            const response = await fetch(`${settings.url}/api/generate`, {
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

            if (!response.ok) {
                throw new Error(`Erreur Ollama HTTP ${response.status}`);
            }

            const data = await response.json();
            try {
                // Parfois Ollama ajoute du markdown même quand on demande du JSON
                const cleanJson = data.response.replace(/```json/g, '').replace(/```/g, '').trim();
                const result = JSON.parse(cleanJson);
                return {
                    diagnosis: result.diagnosis || 'Analyse incomplète',
                    solution: result.solution || 'Aucune solution identifiée'
                };
            } catch (e) {
                console.error("Impossible de parser la réponse JSON de l'IA:", data.response);
                return null;
            }
        } catch (error) {
            console.error("Erreur lors de l'appel à Ollama:", error.message);
            throw error;
        }
    } else {
        throw new Error(`Engine IA ${settings.engine} non implémenté pour le moment.`);
    }
}

module.exports = { analyzeLog, getAISettings };
