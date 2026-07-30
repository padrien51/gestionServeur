<h1 align="center">
  🐳 Gestion Serveur Docker
</h1>

<p align="center">
  <strong>Interface d'administration Web légère, sécurisée et responsive pour gérer vos conteneurs Docker et sauvegardes.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Vue.js-35495E?style=for-the-badge&logo=vue.js&logoColor=4FC08D" alt="Vue.js" />
  <img src="https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Express.js-404D59?style=for-the-badge" alt="Express" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="TailwindCSS" />
  <img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker" />
</p>

## 🚀 Fonctionnalités Principales

- 📊 **Monitoring Système & Docker** : Visualisation en temps réel de l'état du serveur (CPU, RAM, Disque, Températures) et des conteneurs.
- 📟 **Terminal Web & 📡 Live Logs** : Accédez à un véritable shell interactif directement depuis le navigateur et consultez les logs de vos conteneurs en temps réel (stream) avec auto-scroll et option de téléchargement.
- 🧹 **Page d'Optimisation (Prune)** : Espace dédié pour analyser précisément l'espace disque consommé par Docker (Images, Conteneurs, Volumes) et récupérer les gigaoctets gaspillés en un clic.
- 🤖 **AIOps & Analyse de Logs IA** : Surveillance automatique des logs d'erreurs de tous les conteneurs en tâche de fond. Les logs critiques sont analysés par une intelligence artificielle (compatible avec Ollama) pour générer un diagnostic instantané et des solutions correctives via un tiroir interactif d'alertes.
- 📦 **Gestion des Conteneurs et Projets Compose** : Démarrer, arrêter, redémarrer les conteneurs individuellement, ou gérer des projets entiers via Docker Compose (Pull, Up, Down).
- 🛠️ **Éditeur Web Compose (IDE)** : Modifiez vos fichiers de configuration `docker-compose.yml` en direct depuis l'interface de manière totalement sécurisée grâce à l'injection d'un micro-conteneur.
- 📉 **Graphiques d'Historique des Ressources** : Courbes de charge (CPU et RAM) interactives retraçant l'utilisation des ressources du serveur sur les dernières heures.
- 🌐 **Gestion des Réseaux (Networks)** : Vision claire des subnets, passerelles, et conteneurs attachés aux différents réseaux de l'hôte Docker.
- 💥 **Destruction Avancée (Kill)** : Possibilité de détruire intégralement un projet obsolète depuis l'interface (conteneurs, volumes de données, et suppression du dossier source sur l'hôte). Les projets sont mémorisés en base de données et auto-nettoyés s'ils sont supprimés manuellement.
- 💾 **Orchestrateur de Sauvegardes (CRON)** : Planification intuitive des sauvegardes via une interface simplifiée (jours/heures) avec gestion de la rétention (ex: garder les 5 dernières archives).
- 🔔 **Notifications Webhook** : Intégration **Mattermost / Slack** pour recevoir des alertes de statut de sauvegarde et des rapports de mise à jour quotidienne.
- 🔄 **Veille de Mises à Jour** : Vérification automatique des mises à jour (OS et images Docker) via planification.
- 🔐 **Sécurité Avancée & A2F** : Authentification par JWT, **Double Authentification (A2F / TOTP)** compatible avec Google Authenticator et Codes de Secours, protection Anti-Brute Force, Headers HTTP sécurisés (Helmet) et requêtes SQL préparées.
- 📱 **100% Mobile-First** : Interface Vue.js fluide, moderne et réactive (Dark Mode intégré par défaut).

## 🛠️ Architecture

Le projet est divisé en deux parties principales empaquetées dans un seul conteneur Docker optimisé :
- **Frontend** : Application SPA (Single Page Application) propulsée par Vite, Vue.js 3 et TailwindCSS.
- **Backend** : API REST Node.js (Express) interagissant avec le socket Docker (`/var/run/docker.sock`) et utilisant une base de données SQLite embarquée pour stocker les paramètres et les utilisateurs.

---

## ⚡ Installation Rapide (Recommandée)

Grâce à GitHub Actions, une image Docker prête à l'emploi est générée automatiquement. Vous n'avez pas besoin de recompiler le code.

1. Créez un fichier `docker-compose.yml` sur votre serveur :

```yaml
services:
  app:
    image: ghcr.io/padrien51/gestionserveur:latest
    container_name: gestion_serveur
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./data:/app/backend/data
      # (Optionnel) Montage pour monitorer l'espace disque de l'hôte
      - /:/host/rootfs:ro 
      # (Optionnel) Montage pour vérifier les mises à jour Ubuntu
      - /var/lib/update-notifier:/host/update-notifier:ro
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/system/metrics"]
      interval: 30s
      timeout: 10s
      retries: 3
```

2. Démarrez le service :

```bash
docker compose up -d
```

3. Accédez à l'application via `http://VOTRE_IP_SERVEUR:3000`. Lors du premier lancement, l'application vous invitera à créer le compte administrateur.

## 🛠️ Installation pour le Développement

Si vous souhaitez modifier le code ou compiler l'image vous-même localement, un fichier Docker Compose spécifique a été créé (`docker-compose.dev.yml`). Ce fichier indique à Docker de recompiler l'image à partir des sources locales plutôt que de la télécharger depuis GitHub.

```bash
# 1. Cloner le dépôt
git clone https://github.com/padrien51/gestionServeur.git
cd gestionServeur

# 2. Recompiler et lancer l'image locale
docker compose -f docker-compose.dev.yml up -d --build
```

---

## 🔒 Sécurité et Bonnes Pratiques

- **Socket Docker** : L'application requiert l'accès au socket Docker pour interagir avec les conteneurs. Assurez-vous que le serveur hôte est sécurisé.
- **Base de données persistante** : Le volume `./data:/app/backend/data` assure que votre configuration, vos tâches planifiées et vos utilisateurs ne soient pas perdus lors d'une mise à jour du conteneur.
- **Déploiement en Production** : Il est fortement recommandé d'exposer cette application derrière un reverse proxy (comme *Traefik* ou *Nginx Proxy Manager*) et de la sécuriser via **HTTPS**.

## 🤝 Contribution

Les contributions (Issues, Pull Requests) sont les bienvenues ! 
Veillez à respecter les conventions de nommage des commits (`feat:`, `fix:`, `chore:`, etc.).

## 📜 Licence

Ce projet est sous licence MIT. Libre à vous de l'utiliser, le modifier et le distribuer.
