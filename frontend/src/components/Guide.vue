<script setup>
import { ref } from 'vue';

const sections = ref([
  { id: 'intro', title: 'Introduction' },
  { id: 'dashboard', title: 'Tableau de bord' },
  { id: 'networks', title: 'Réseaux' },
  { id: 'optimization', title: 'Optimisation' },
  { id: 'updates', title: 'Mises à jour' },
  { id: 'backups', title: 'Sauvegardes' },
  { id: 'settings', title: 'Paramètres' },
  { id: 'ai', title: 'Fonctionnalités IA' }
]);

const activeSection = ref('intro');

const scrollTo = (id) => {
  activeSection.value = id;
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};
</script>

<template>
  <div class="h-full flex flex-col md:flex-row gap-6 max-w-7xl mx-auto w-full">
    <!-- Sidebar Navigation -->
    <div class="md:w-64 shrink-0 hidden md:block">
      <div class="sticky top-24 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700 shadow-[0_8px_30px_rgb(0,0,0,0.06)] dark:shadow-xl overflow-hidden p-4">
        <h3 class="font-bold text-slate-800 dark:text-white mb-4 flex items-center">
          <svg class="w-5 h-5 mr-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path>
          </svg>
          Sommaire
        </h3>
        <nav class="space-y-1">
          <button
            v-for="section in sections"
            :key="section.id"
            @click="scrollTo(section.id)"
            :class="[
              'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors duration-200',
              activeSection === section.id 
                ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 font-medium' 
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50'
            ]"
          >
            {{ section.title }}
          </button>
        </nav>
      </div>
    </div>

    <!-- Main Content -->
    <div class="flex-1 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700 shadow-[0_8px_30px_rgb(0,0,0,0.06)] dark:shadow-xl p-6 md:p-10 overflow-y-auto">
      
      <!-- Introduction -->
      <section id="intro" class="mb-12 scroll-mt-24">
        <div class="inline-block p-3 rounded-2xl bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 mb-4">
          <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
        </div>
        <h2 class="text-3xl font-bold text-slate-800 dark:text-white mb-4">Bienvenue dans Gestion Serveur</h2>
        <p class="text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
          Cet outil a été conçu pour simplifier la gestion de vos applications Docker et de votre serveur d'hébergement. 
          Il offre une interface unifiée pour surveiller vos ressources, gérer vos conteneurs, automatiser vos sauvegardes, 
          et maintenir votre système à jour, le tout de manière sécurisée.
        </p>
        <p class="text-slate-600 dark:text-slate-300 leading-relaxed">
          Ce guide vous expliquera l'utilité de chaque onglet et les actions disponibles.
        </p>
      </section>

      <hr class="border-slate-200/60 dark:border-slate-700 my-8" />

      <!-- Tableau de bord -->
      <section id="dashboard" class="mb-12 scroll-mt-24">
        <h2 class="text-2xl font-bold text-slate-800 dark:text-white mb-6 flex items-center">
          <span class="text-2xl mr-3">🎛️</span> Tableau de bord
        </h2>
        <p class="text-slate-600 dark:text-slate-300 mb-6">
          Le tableau de bord est votre centre de contrôle principal. Il affiche l'état de votre serveur (CPU, RAM, Disque) et liste toutes vos applications.
        </p>
        
        <h3 class="text-lg font-semibold text-slate-800 dark:text-white mb-3">Carte d'un Conteneur / Application</h3>
        <ul class="space-y-4 text-sm text-slate-600 dark:text-slate-300 ml-2">
          <li class="flex items-start">
            <span class="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-1 rounded text-xs mr-3 mt-0.5 whitespace-nowrap">▶️ Démarrer</span>
            <span>Allume le conteneur. Nécessaire si l'application est arrêtée ou vient d'être créée.</span>
          </li>
          <li class="flex items-start">
            <span class="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-1 rounded text-xs mr-3 mt-0.5 whitespace-nowrap">🔄 Redémarrer</span>
            <span>Relance le processus du conteneur. Utile si l'application bug ou si vous avez modifié un fichier de configuration.</span>
          </li>
          <li class="flex items-start">
            <span class="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 px-2 py-1 rounded text-xs mr-3 mt-0.5 whitespace-nowrap">⏹️ Arrêter</span>
            <span>Stoppe proprement le conteneur. Les données persistantes (volumes) ne sont pas perdues.</span>
          </li>
          <li class="flex items-start">
            <span class="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 px-2 py-1 rounded text-xs mr-3 mt-0.5 whitespace-nowrap">📡 Logs Direct</span>
            <span>Affiche les journaux d'activité en temps réel. Indispensable pour déboguer une erreur au démarrage.</span>
          </li>
          <li class="flex items-start">
            <span class="bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300 px-2 py-1 rounded text-xs mr-3 mt-0.5 whitespace-nowrap">📟 Terminal</span>
            <span>Ouvre une console Shell interactive directement DANS le conteneur. Attention : vos commandes sont exécutées avec les droits du conteneur.</span>
          </li>
        </ul>
        
        <div class="mt-6 p-4 bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-900/30 rounded-xl">
          <h4 class="font-bold text-orange-800 dark:text-orange-400 mb-2 flex items-center">
            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
            Le Menu "Actions" (Éditeur & Compose)
          </h4>
          <p class="text-sm text-orange-700 dark:text-orange-300">
            Le bouton "..." en haut à droite des cartes permet d'accéder à <strong>l'Éditeur de fichiers</strong> pour modifier directement le `docker-compose.yml` ou le `.env` depuis votre navigateur. <br/>
            C'est également ici que vous trouverez l'option de <strong>Destruction</strong> (qui supprime définitivement le conteneur ET tous ses fichiers du disque de l'hôte). À utiliser avec grande prudence.
          </p>
        </div>
      </section>

      <hr class="border-slate-200/60 dark:border-slate-700 my-8" />

      <!-- Réseaux -->
      <section id="networks" class="mb-12 scroll-mt-24">
        <h2 class="text-2xl font-bold text-slate-800 dark:text-white mb-6 flex items-center">
          <span class="text-2xl mr-3">🌐</span> Réseaux
        </h2>
        <p class="text-slate-600 dark:text-slate-300 mb-4">
          Cet onglet liste les réseaux virtuels créés par Docker.
        </p>
        <p class="text-sm text-slate-500 dark:text-slate-400">
          Chaque réseau relie généralement plusieurs conteneurs (par exemple, un conteneur web et une base de données). Vous pouvez y inspecter les adresses IP internes allouées à chaque application. Si un réseau n'a plus aucun conteneur (Statut: Inutilisé), il peut être purgé via l'onglet "Optimisation".
        </p>
      </section>

      <hr class="border-slate-200/60 dark:border-slate-700 my-8" />

      <!-- Optimisation -->
      <section id="optimization" class="mb-12 scroll-mt-24">
        <h2 class="text-2xl font-bold text-slate-800 dark:text-white mb-6 flex items-center">
          <span class="text-2xl mr-3">🧹</span> Optimisation
        </h2>
        <p class="text-slate-600 dark:text-slate-300 mb-6">
          Docker a tendance à accumuler des données obsolètes (anciennes images téléchargées, volumes orphelins). Cette page vous permet de récupérer de l'espace disque.
        </p>
        <div class="grid md:grid-cols-2 gap-4">
          <div class="bg-slate-50 dark:bg-slate-700/30 p-4 rounded-xl border border-slate-200/60 dark:border-slate-700">
            <h4 class="font-bold text-slate-800 dark:text-white mb-2">Nettoyage Standard (Prune)</h4>
            <p class="text-sm text-slate-600 dark:text-slate-400">
              Supprime les conteneurs arrêtés, les réseaux inutilisés et les images "dangling" (sans nom). <strong>Sans danger</strong>.
            </p>
          </div>
          <div class="bg-slate-50 dark:bg-slate-700/30 p-4 rounded-xl border border-slate-200/60 dark:border-slate-700">
            <h4 class="font-bold text-slate-800 dark:text-white mb-2">Nettoyage Total</h4>
            <p class="text-sm text-slate-600 dark:text-slate-400">
              Même chose, mais supprime également <strong>toutes les images</strong> qui ne sont pas actuellement utilisées par un conteneur actif. Le prochain lancement d'un conteneur qui utilisait cette image nécessitera de la re-télécharger.
            </p>
          </div>
        </div>
      </section>

      <hr class="border-slate-200/60 dark:border-slate-700 my-8" />

      <!-- Mises à jour -->
      <section id="updates" class="mb-12 scroll-mt-24">
        <h2 class="text-2xl font-bold text-slate-800 dark:text-white mb-6 flex items-center">
          <span class="text-2xl mr-3">🚀</span> Mises à jour
        </h2>
        <p class="text-slate-600 dark:text-slate-300 mb-4">
          Une gestion proactive de la sécurité passe par l'application régulière des mises à jour.
        </p>
        <ul class="list-disc pl-5 space-y-3 text-slate-600 dark:text-slate-300">
          <li><strong>Mises à jour Système (OS)</strong> : Applique les correctifs de sécurité Linux (Ubuntu/Debian) via <code>apt-get upgrade</code>.</li>
          <li><strong>Mises à jour Docker</strong> : L'outil compare les empreintes (digest) de vos images locales avec celles du registre (Docker Hub). Si une nouvelle version est disponible, un badge s'affichera sur votre Dashboard.
            <br/><span class="text-sm text-slate-500 italic">Impact : Cliquer sur "Mettre à jour" recrée entièrement le conteneur avec la nouvelle image. S'il n'y a pas de volumes bien configurés, les données locales seront perdues.</span>
          </li>
        </ul>
      </section>

      <hr class="border-slate-200/60 dark:border-slate-700 my-8" />

      <!-- Sauvegardes -->
      <section id="backups" class="mb-12 scroll-mt-24">
        <h2 class="text-2xl font-bold text-slate-800 dark:text-white mb-6 flex items-center">
          <span class="text-2xl mr-3">💾</span> Sauvegardes
        </h2>
        <p class="text-slate-600 dark:text-slate-300 mb-4">
          Planifiez des sauvegardes automatiques pour vos bases de données et volumes vitaux.
        </p>
        <p class="text-slate-600 dark:text-slate-300 mb-4">
          Le système utilise l'outil <strong>Rsync</strong> dans un conteneur de service. Vous devez fournir le chemin d'un volume local (ex: <code>/path/to/project</code>) et un dossier de destination. Le bouton <strong>▶️ Forcer</strong> permet d'exécuter la sauvegarde immédiatement sans attendre le planificateur (CRON).
        </p>
        <div class="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-200 dark:border-blue-800/30">
          <p class="text-sm text-blue-800 dark:text-blue-300">
            <strong>Note sur les logs :</strong> L'historique des sauvegardes conserve le résultat (Succès/Échec) de chaque exécution. Surveillez ces logs pour vous assurer que l'espace disque de destination n'est pas plein.
          </p>
        </div>
      </section>

      <hr class="border-slate-200/60 dark:border-slate-700 my-8" />

      <!-- Paramètres & IA -->
      <section id="settings" class="mb-6 scroll-mt-24">
        <h2 class="text-2xl font-bold text-slate-800 dark:text-white mb-6 flex items-center">
          <span class="text-2xl mr-3">⚙️</span> Paramètres & IA
        </h2>
        <h3 class="text-lg font-semibold text-slate-800 dark:text-white mb-2">Alertes Webhook</h3>
        <p class="text-slate-600 dark:text-slate-300 mb-6">
          Permet d'envoyer des notifications automatiques (Mattermost, Slack, Discord) lorsqu'un événement important survient (mise à jour disponible, alerte de sécurité, CPU surchargé).
        </p>
        
        <h3 id="ai" class="text-lg font-semibold text-slate-800 dark:text-white mb-2">Tiroir AIOps (L'intelligence Artificielle)</h3>
        <p class="text-slate-600 dark:text-slate-300 mb-4">
          Un algorithme scanne en permanence l'état du serveur et les logs d'erreurs de vos conteneurs. Lorsqu'une anomalie est détectée :
        </p>
        <ul class="list-disc pl-5 space-y-2 text-slate-600 dark:text-slate-300">
          <li>La <strong>cloche</strong> en haut à droite s'animera.</li>
          <li>En ouvrant le tiroir IA, vous verrez le contexte de l'erreur et une suggestion de correction (ex: "Droits de dossiers manquants", "Port déjà utilisé").</li>
          <li>Vous pouvez ensuite "Résoudre" (acquitter) ou "Ignorer" l'alerte.</li>
        </ul>
      </section>

    </div>
  </div>
</template>

<style scoped>
/* Scrollbar subtile pour la sidebar si nécessaire */
::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background-color: rgba(156, 163, 175, 0.5);
  border-radius: 10px;
}
</style>
