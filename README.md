# Gestionnaire de Serveur Docker

Application web légère et conteneurisée permettant l'administration centralisée d'un serveur Ubuntu Desktop et de ses applications Docker Compose.

## Installation

Le projet utilise Docker Compose pour un déploiement simplifié.

```bash
docker compose up -d
```

## Architecture

* **Frontend** : Vue.js + TailwindCSS (Mobile-first)
* **Backend** : Node.js (Express)
* **Base de données** : SQLite
