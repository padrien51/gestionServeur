<script setup>
import { ref, onMounted, onUnmounted, computed, onErrorCaptured } from 'vue';
import ContainerCard from './ContainerCard.vue';
import WebTerminal from './WebTerminal.vue';
import LiveLogs from './LiveLogs.vue';
import ComposeEditor from './ComposeEditor.vue';
import MetricsChart from './MetricsChart.vue';
import AIDrawer from './AIDrawer.vue';
import { useModal } from '../composables/useModal';

const { showConfirm, showAlert } = useModal();


const containers = ref([]);
const loading = ref(true);
const error = ref(null);

onErrorCaptured((err, instance, info) => {
  error.value = `CRITICAL ERROR: ${err.message}\nInfo: ${info}\nStack: ${err.stack}`;
  loading.value = false;
  return false; // Prevent error from propagating and unmounting the whole app
});
const aiInsights = ref([]);
const isAIDrawerOpen = ref(false);

const activeTerminalContainerId = ref(null);
const activeLiveLogContainer = ref(null);
const activeEditorProject = ref(null);

const onEditorSaved = (projectName) => {
  activeEditorProject.value = null;
  // Déclenche un `docker compose up -d` pour appliquer les modifications du docker-compose.yml
  handleComposeAction(projectName, 'up');
};

const fetchInsights = async () => {
  try {
    const res = await fetch(`/api/ai/insights`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}` }
    });
    if (res.ok) {
      aiInsights.value = await res.json();
    }
  } catch (e) {
    console.error(e);
  }
};

const appHasAIAlert = (projectName) => {
    return aiInsights.value.filter(i => i.project_name === projectName).length;
};

const viewMode = ref(localStorage.getItem('dashboard_view_mode') || 'apps');

const toggleViewMode = (mode) => {
  viewMode.value = mode;
  localStorage.setItem('dashboard_view_mode', mode);
};


const knownProjects = ref([]);
const searchQuery = ref('');

const activeContainersCount = computed(() => {
  return containers.value.filter(c => c.state === 'running').length;
});

const stoppedContainersCount = computed(() => {
  return containers.value.length - activeContainersCount.value;
});

const groupedApps = computed(() => {
  const map = {};
  const query = searchQuery.value.toLowerCase().trim();
  
  // 1. Initialiser avec tous les projets connus (même ceux arrêtés)
  for (const app of knownProjects.value) {
    if (app && app.name) {
      if (!query || app.name.toLowerCase().includes(query)) {
        map[app.name] = { name: app.name, containers: [] };
      }
    }
  }

  // 2. Ajouter les conteneurs actifs
  for (const c of containers.value) {
    if (c && c.project && c.name) {
      const projectMatch = c.project.toLowerCase().includes(query);
      const containerMatch = c.name.toLowerCase().includes(query);
      
      if (!query || projectMatch || containerMatch) {
        if (!map[c.project]) {
          map[c.project] = { name: c.project, containers: [] };
        }
        map[c.project].containers.push(c);
      }
    }
  }
  return Object.values(map).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
});

const filteredContainers = computed(() => {
    if (!searchQuery.value) return containers.value;
    const q = searchQuery.value.toLowerCase();
    return containers.value.filter(c => 
      (c.name && c.name.toLowerCase().includes(q)) || 
      (c.project && c.project.toLowerCase().includes(q))
    );
});

const API_BASE = '/api'; // Chemin relatif pour fonctionner avec le backend Express

const getFetchOptions = () => ({
  headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}` }
});

const handleUnauthorized = () => {
  window.location.reload();
};

const fetchMetrics = async () => {
  try {
    const res = await fetch(`${API_BASE}/system/metrics`, getFetchOptions());
    if (res.status === 401) return handleUnauthorized();
    if (!res.ok) throw new Error('Erreur métriques');
    metrics.value = await res.json();
  } catch (err) {
    console.error(err);
  }
};

const fetchContainers = async () => {
  try {
    const res = await fetch(`${API_BASE}/docker/containers`, getFetchOptions());
    if (res.status === 401) return handleUnauthorized();
    if (!res.ok) throw new Error('Erreur conteneurs');
    
    const newContainers = await res.json();
    
    // On conserve les informations de mise à jour pour éviter qu'elles ne disparaissent
    for (const nc of newContainers) {
       const oc = containers.value.find(c => c.id === nc.id);
       if (oc && oc.hasUpdate !== undefined) {
          nc.hasUpdate = oc.hasUpdate;
          nc.currentVersion = oc.currentVersion;
          nc.newVersion = oc.newVersion;
          nc.hasBreakingChanges = oc.hasBreakingChanges;
          nc.isUpdatableViaUI = oc.isUpdatableViaUI;
       }
    }
    
    containers.value = newContainers;
  } catch (err) {
    error.value = "Impossible de charger les conteneurs.";
    console.error(err);
  }
};

const fetchApplications = async () => {
  try {
    const res = await fetch(`${API_BASE}/docker/applications`, getFetchOptions());
    if (res.status === 401) return handleUnauthorized();
    if (res.ok) {
      knownProjects.value = await res.json();
    }
  } catch (err) {
    console.error("Erreur lors de la récupération des applications", err);
  }
};

const refreshData = async () => {
  await Promise.all([fetchMetrics(), fetchContainers(), fetchApplications(), fetchInsights()]);
  loading.value = false;
};

const openTerminal = (container) => {
  activeTerminalContainerId.value = container.id;
};
const closeTerminal = () => {
  activeTerminalContainerId.value = null;
};

const openLiveLogs = (container) => {
  activeLiveLogContainer.value = { id: container.id, name: container.name };
};
const closeLiveLogs = () => {
  activeLiveLogContainer.value = null;
};

const containerLoading = ref({});

const handleContainerAction = async ({ id, action }) => {
  containerLoading.value = { ...containerLoading.value, [id]: action };
  try {
    const res = await fetch(`${API_BASE}/docker/containers/${id}/${action}`, { 
      method: 'POST',
      ...getFetchOptions()
    });
    if (res.status === 401) {
      containerLoading.value = { ...containerLoading.value, [id]: null };
      return handleUnauthorized();
    }
    if (!res.ok) throw new Error(`Erreur lors de l'action ${action}`);
    
    // Rafraîchir après une petite pause pour laisser le temps au démon Docker
    setTimeout(async () => {
      await refreshData();
      containerLoading.value = { ...containerLoading.value, [id]: null };
    }, 1000);
  } catch (err) {
    containerLoading.value = { ...containerLoading.value, [id]: null };
    showAlert("Erreur", err.message);
  }
};

const projectLoading = ref({});

const handleProjectAction = async (projectName, action) => {
  projectLoading.value = { ...projectLoading.value, [projectName]: action };
  try {
    const verb = action === 'start' ? 'Démarrage' : action === 'stop' ? 'Arrêt' : 'Redémarrage';
    console.log(`${verb} de l'application ${projectName}...`);
    
    const res = await fetch(`${API_BASE}/docker/projects/${projectName}/${action}`, { 
      method: 'POST',
      ...getFetchOptions()
    });
    if (res.status === 401) return handleUnauthorized();
    if (!res.ok) throw new Error(`Erreur lors de l'action ${action} sur le projet`);
    
    setTimeout(refreshData, 1500);
  } catch (err) {
    showAlert("Erreur", err.message);
  } finally {
    projectLoading.value = { ...projectLoading.value, [projectName]: null };
  }
};

const composeLoading = ref({});

const handleComposeAction = async (projectName, action) => {
  // Confirmations pour les actions destructives
  if (action === 'kill') {
    const confirmed = await showConfirm(
      "🧨 DESTRUCTION TOTALE (Kill)",
      `ATTENTION DANGER !\n\nVoulez-vous vraiment DÉTRUIRE l'application ${projectName} ?\n\nCela va :\n1. Supprimer tous les conteneurs et réseaux\n2. Supprimer tous les volumes de données gérés par Docker (perte de données)\n3. SUPPRIMER DÉFINITIVEMENT LE DOSSIER SOURCE du projet sur votre disque dur !\n\nCette action est IRRÉVERSIBLE.`
    );
    if (!confirmed) return;
  } else if (action === 'down') {
    const confirmed = await showConfirm(
      "Arrêt complet (Down)",
      `Voulez-vous vraiment arrêter et supprimer les conteneurs et réseaux de l'application ${projectName} ?\n(Les volumes de données seront conservés)`
    );
    if (!confirmed) return;
  } else if (action === 'up') {
    const confirmed = await showConfirm(
      "Lancement (Up)",
      `Voulez-vous lancer l'application ${projectName} en utilisant sa configuration actuelle (docker-compose up -d) ?`
    );
    if (!confirmed) return;
  } else if (action === 'pull') {
    // Pas de confirmation pour le pull, mais on prévient que ça peut être long
  }

  composeLoading.value = { ...composeLoading.value, [projectName]: action };
  try {
    const res = await fetch(`${API_BASE}/docker/projects/${projectName}/compose/${action}`, { 
      method: 'POST',
      ...getFetchOptions()
    });
    if (res.status === 401) return handleUnauthorized();
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Erreur lors de l'exécution de docker compose ${action}`);
    
    if (action === 'pull') {
      showAlert("Succès", `Le pull de l'application ${projectName} est terminé.`);
    }
    
    setTimeout(refreshData, 1500);
  } catch (err) {
    showAlert("Erreur Compose", err.message);
  } finally {
    composeLoading.value = { ...composeLoading.value, [projectName]: null };
  }
};

const isPruning = ref(false);

const pruneDocker = async () => {
  const isConfirmed = await showConfirm(
    "Nettoyage du système",
    "⚠️ ATTENTION : Cela va supprimer TOUS les conteneurs arrêtés, les réseaux non utilisés, les volumes orphelins, et les images non tagguées (dangling).\n\nVoulez-vous continuer ?"
  );
  
  if (!isConfirmed) return;
  
  isPruning.value = true;
  try {
    const res = await fetch(`${API_BASE}/docker/prune`, {
      method: 'POST',
      ...getFetchOptions()
    });
    if (res.status === 401) return handleUnauthorized();
    if (!res.ok) throw new Error("Erreur serveur lors du nettoyage");
    
    const data = await res.json();
    if (data.success) {
      await showAlert("Nettoyage terminé", `Le nettoyage s'est terminé avec succès ! 🎉\n\nEspace libéré : ${formatBytes(data.spaceReclaimed)}`);
      refreshData();
    }
  } catch (err) {
    showAlert("Erreur", err.message);
  } finally {
    isPruning.value = false;
  }
};

const checkingUpdates = ref(false);
const isUpdating = ref(null);

const fetchUpdates = async () => {
  checkingUpdates.value = true;
  try {
    const res = await fetch(`${API_BASE}/updates/docker/check`, getFetchOptions());
    if (res.ok) {
      const updateData = await res.json();
      for (const u of updateData) {
        const c = containers.value.find(c => c.id === u.id);
        if (c) {
          c.hasUpdate = u.hasUpdate;
          c.currentVersion = u.currentVersion;
          c.newVersion = u.newVersion;
          c.hasBreakingChanges = u.isBreaking;
          c.isUpdatableViaUI = u.isUpdatableViaUI;
        }
      }
    }
  } catch(e) {
    console.error(e);
  } finally {
    checkingUpdates.value = false;
  }
};

const appHasUpdates = (app) => app.containers.some(c => c.hasUpdate && c.isUpdatableViaUI);
const appHasBreakingChanges = (app) => app.containers.some(c => c.hasUpdate && c.isUpdatableViaUI && c.hasBreakingChanges);

const updateApplication = async (app) => {
  const containersToUpdate = app.containers.filter(c => c.hasUpdate && c.isUpdatableViaUI);
  const breakingCount = containersToUpdate.filter(c => c.hasBreakingChanges).length;
  
  let msg = `Voulez-vous mettre à jour ${containersToUpdate.length} conteneur(s) de l'application ${app.name} ?`;
  if (breakingCount > 0) {
    msg = `⚠️ ATTENTION : ${breakingCount} conteneur(s) ont des Breaking Changes potentiels.\nVeuillez vérifier les changelogs dans l'onglet Mises à jour avant de continuer.\n\n` + msg;
  }
  
  const confirmed = await showConfirm("Mise à jour de l'application", msg);
  if (!confirmed) return;
  
  isUpdating.value = app.name;
  let successCount = 0;
  
  for (const c of containersToUpdate) {
    try {
      console.log(`Mise à jour de ${c.name}...`);
      const res = await fetch(`${API_BASE}/updates/docker/apply/${c.name}`, { method: 'POST', ...getFetchOptions() });
      if (!res.ok) throw new Error(`Échec pour ${c.name}`);
      successCount++;
    } catch (e) {
      console.error(e);
      await showAlert("Erreur", e.message);
    }
  }
  
  await showAlert("Mise à jour terminée", `L'application ${app.name} a été mise à jour (${successCount}/${containersToUpdate.length} conteneurs).`);
  isUpdating.value = null;
  refreshData();
  fetchUpdates();
};

const ignoredUpdateContainers = ref([]);

const fetchIgnoredUpdates = async () => {
  try {
    const res = await fetch(`${API_BASE}/settings`, getFetchOptions());
    if (res.ok) {
      const data = await res.json();
      if (data.ignore_updates_containers) {
         try {
           ignoredUpdateContainers.value = JSON.parse(data.ignore_updates_containers);
         } catch(e) { ignoredUpdateContainers.value = []; }
      }
    }
  } catch (err) {
    console.error(err);
  }
};

const handleToggleIgnoreUpdate = async (container) => {
  const containerName = container.name || container.id; // Fallback
  let newList = [...ignoredUpdateContainers.value];
  if (newList.includes(containerName)) {
      newList = newList.filter(n => n !== containerName);
  } else {
      newList.push(containerName);
  }
  ignoredUpdateContainers.value = newList;

  try {
    await fetch(`${API_BASE}/settings`, {
      method: 'PUT',
      headers: { ...getFetchOptions().headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ignore_updates_containers: JSON.stringify(newList) })
    });
    showAlert("Succès", `Vérification des mises à jour ${newList.includes(containerName) ? 'désactivée' : 'réactivée'} pour ${containerName}`);
  } catch (err) {
    console.error(err);
    showAlert("Erreur", "Impossible de sauvegarder la préférence.");
  }
};

let intervalId;
onMounted(() => {
  refreshData();
  fetchUpdates();
  fetchIgnoredUpdates();
  intervalId = setInterval(refreshData, 5000); // Auto refresh toutes les 5s
});

onUnmounted(() => {
  clearInterval(intervalId);
});

const metrics = ref({
    cpuLoad: 0,
    memUsed: 0,
    memTotal: 1,
    diskUsed: 0,
    diskTotal: 1,
    backupDiskUsed: 0,
    backupDiskTotal: 0
  });

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const memPercent = ref(() => (metrics.value.memUsed / metrics.value.memTotal) * 100);
  const diskPercent = ref(() => (metrics.value.diskUsed / metrics.value.diskTotal) * 100);
  const backupPercent = ref(() => metrics.value.backupDiskTotal > 0 ? (metrics.value.backupDiskUsed / metrics.value.backupDiskTotal) * 100 : 0);
  
  const configureBackupDisk = async () => {
    const newPath = prompt(
      "Indiquez le point de montage de votre disque de sauvegarde.\nNote : si votre conteneur monte la racine de l'hôte dans /hostOS, précédez le chemin par /hostOS.\n\nExemple : /hostOS/mnt/Backup_serveur",
      "/hostOS/mnt/Backup_serveur"
    );
    if (newPath !== null) {
      try {
        await fetch(`${API_BASE}/settings`, {
          method: 'PUT',
          headers: getFetchOptions().headers,
          body: JSON.stringify({ backup_disk_path: newPath.trim() })
        });
        showAlert("Succès", "Chemin du disque sauvegardé. La jauge va se mettre à jour.");
        setTimeout(fetchMetrics, 1000);
      } catch (e) {
        console.error(e);
        showAlert("Erreur", "Impossible de sauvegarder le paramètre.");
      }
    }
  };

  </script>

<template>
  <div class="p-4 space-y-6">
    <!-- Section Métriques Hôte -->
    <section>
      <h2 class="text-xl font-bold mb-4 text-slate-900 dark:text-slate-100 flex items-center">
        <span class="mr-2">🖥️</span> Ressources Système
      </h2>
      
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <!-- CPU Gauge -->
        <div class="bg-white dark:bg-slate-800 rounded-xl p-3 flex flex-col items-center justify-center border border-slate-200/60 dark:border-slate-700 shadow-[0_2px_10px_rgb(0,0,0,0.02)] dark:shadow-inner">
          <div class="relative w-16 h-16 flex items-center justify-center">
            <svg class="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
              <path class="text-slate-200 dark:text-slate-700" stroke-dasharray="100, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" stroke-width="3"></path>
              <path class="text-blue-500 transition-all duration-500" :stroke-dasharray="`${metrics.cpuLoad}, 100`" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" stroke-width="3"></path>
            </svg>
            <span class="absolute text-xs font-bold">{{ Math.round(metrics.cpuLoad) }}%</span>
          </div>
          <span class="text-xs text-slate-500 dark:text-slate-400 mt-2 font-medium">CPU</span>
        </div>

        <!-- RAM Gauge -->
        <div class="bg-white dark:bg-slate-800 rounded-xl p-3 flex flex-col items-center justify-center border border-slate-200/60 dark:border-slate-700 shadow-[0_2px_10px_rgb(0,0,0,0.02)] dark:shadow-inner">
          <div class="relative w-16 h-16 flex items-center justify-center">
            <svg class="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
              <path class="text-slate-200 dark:text-slate-700" stroke-dasharray="100, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" stroke-width="3"></path>
              <path class="text-purple-500 transition-all duration-500" :stroke-dasharray="`${memPercent()}, 100`" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" stroke-width="3"></path>
            </svg>
            <span class="absolute text-xs font-bold">{{ Math.round(memPercent()) }}%</span>
          </div>
          <span class="text-xs text-slate-500 dark:text-slate-400 mt-2 font-medium">RAM</span>
        </div>

        <!-- Disk Gauge -->
        <div class="bg-white dark:bg-slate-800 rounded-xl p-3 flex flex-col items-center justify-center border border-slate-200/60 dark:border-slate-700 shadow-[0_2px_10px_rgb(0,0,0,0.02)] dark:shadow-inner">
          <div class="relative w-16 h-16 flex items-center justify-center">
            <svg class="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
              <path class="text-slate-200 dark:text-slate-700" stroke-dasharray="100, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" stroke-width="3"></path>
              <path class="text-teal-500 transition-all duration-500" :stroke-dasharray="`${diskPercent()}, 100`" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" stroke-width="3"></path>
            </svg>
            <span class="absolute text-xs font-bold">{{ Math.round(diskPercent()) }}%</span>
          </div>
          <span class="text-xs text-slate-500 dark:text-slate-400 mt-2 font-medium">SSD</span>
        </div>

        <!-- Backup Disk Gauge -->
        <div @click="configureBackupDisk" title="Cliquez pour configurer le chemin du disque" class="bg-white dark:bg-slate-800 rounded-xl p-3 flex flex-col items-center justify-center border border-slate-200/60 dark:border-slate-700 shadow-[0_2px_10px_rgb(0,0,0,0.02)] dark:shadow-inner cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/80 transition-colors">
          <div class="relative w-16 h-16 flex items-center justify-center">
            <svg class="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
              <path class="text-slate-200 dark:text-slate-700" stroke-dasharray="100, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" stroke-width="3"></path>
              <path class="text-amber-500 transition-all duration-500" :stroke-dasharray="`${backupPercent()}, 100`" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" stroke-width="3"></path>
            </svg>
            <span class="absolute text-xs font-bold">{{ Math.round(backupPercent()) }}%</span>
          </div>
          <span class="text-xs text-slate-500 dark:text-slate-400 mt-2 font-medium">HDD (Config...)</span>
        </div>
      </div>
      
      <!-- Détails en texte sous les jauges -->
      <div class="mt-3 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap gap-2 justify-between px-1 mb-6">
        <span>RAM: {{ formatBytes(metrics.memUsed) }} / {{ formatBytes(metrics.memTotal) }}</span>
        <span>SSD: {{ formatBytes(metrics.diskUsed) }} / {{ formatBytes(metrics.diskTotal) }}</span>
        <span v-if="metrics.backupDiskTotal > 0">HDD: {{ formatBytes(metrics.backupDiskUsed) }} / {{ formatBytes(metrics.backupDiskTotal) }}</span>
      </div>

      <!-- Graphique d'historique -->
      <MetricsChart />
    </section>

    <!-- Section Nettoyage Docker -->
    <section>
      <h2 class="text-xl font-bold mb-4 text-slate-900 dark:text-slate-100 flex items-center">
        <span class="mr-2">🧹</span> Nettoyage & Stockage
      </h2>
      <div class="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200/60 dark:border-slate-700 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-lg flex items-center justify-between">
        <div class="flex-1 pr-4">
          <h3 class="text-sm font-semibold text-slate-800 dark:text-slate-200">Purger le système Docker</h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">Supprime les images non utilisées (dangling) et les conteneurs/volumes orphelins pour libérer de l'espace disque.</p>
        </div>
        <button 
          @click="pruneDocker"
          :disabled="isPruning"
          class="flex-shrink-0 px-4 py-2 bg-red-600 hover:bg-red-700 text-white dark:bg-red-900/50 dark:hover:bg-red-800 dark:text-red-200 border border-red-600 dark:border-red-700 rounded-lg text-sm font-medium transition-all shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-sm disabled:opacity-50"
        >
          <span v-if="isPruning">Nettoyage...</span>
          <span v-else>Purger (Prune)</span>
        </button>
      </div>
    </section>

    <!-- Section Conteneurs / Applications -->
    <section>
      <div class="flex flex-col lg:flex-row lg:justify-between lg:items-end mb-4 gap-4">
        <div class="flex flex-col">
          <h2 class="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center shrink-0">
            <span class="mr-2">📦</span> Applications & Conteneurs
          </h2>
          <div class="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-3">
            <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]"></span> {{ activeContainersCount }} en cours</span>
            <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.3)]"></span> {{ stoppedContainersCount }} arrêté(s)</span>
            <span class="text-slate-400 dark:text-slate-500 hidden sm:inline">({{ containers.length }} au total)</span>
          </div>
        </div>
        
        <div class="flex flex-col sm:flex-row sm:items-center gap-3 w-full lg:w-auto">
          <!-- Recherche -->
          <div class="relative flex-1 sm:w-64 sm:flex-none">
              <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg class="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
              </div>
              <input 
                  v-model="searchQuery" 
                  type="text" 
                  placeholder="Filtrer..." 
                  class="block w-full pl-10 pr-3 py-1.5 border border-slate-200/60 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
          </div>

          <!-- Toggle Vue -->
          <div class="flex bg-white dark:bg-slate-800 p-1 rounded-lg border border-slate-200/60 dark:border-slate-700 w-full sm:w-auto shrink-0">
            <button 
              @click="toggleViewMode('apps')" 
              :class="viewMode === 'apps' ? 'bg-slate-800 text-white dark:bg-slate-700 dark:text-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'"
              class="flex-1 sm:flex-none px-4 py-1.5 rounded-md text-sm font-medium transition-all"
            >
              Vue Applications
            </button>
            <button 
              @click="toggleViewMode('containers')" 
              :class="viewMode === 'containers' ? 'bg-slate-800 text-white dark:bg-slate-700 dark:text-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'"
              class="flex-1 sm:flex-none px-4 py-1.5 rounded-md text-sm font-medium transition-all"
            >
              Vue Conteneurs
            </button>
          </div>
        </div>
      </div>

      <div v-if="loading" class="text-center py-8 text-slate-500 dark:text-slate-400 animate-pulse">
        Chargement des données...
      </div>
      
      <div v-else-if="error" class="bg-red-900/50 text-red-200 p-4 rounded-lg border border-red-700 whitespace-pre-wrap">
        {{ error }}
      </div>
      
      <div v-else class="space-y-4 pb-4">
        
        <!-- Vue par Applications -->
        <div v-if="viewMode === 'apps'" class="space-y-6">
          <div v-for="app in groupedApps" :key="app.name" class="bg-white dark:bg-slate-800/50 rounded-xl border border-indigo-100/80 dark:border-slate-700/50 overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.06)] dark:shadow-sm">
            <!-- En-tête de l'application -->
            <div class="bg-gradient-to-r from-blue-50/50 to-indigo-50/50 dark:from-slate-800 dark:to-slate-800 px-4 py-3 border-b border-indigo-100/60 dark:border-slate-700 flex justify-between items-center flex-wrap gap-2">
              <h3 class="font-bold text-slate-800 dark:text-slate-200 flex items-center text-lg">
                <svg class="w-5 h-5 mr-2 text-slate-400 dark:text-slate-500" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"></path></svg>
                {{ app.name }}
              </h3>
              
              <div class="flex items-center gap-2">
                <span v-if="app.containers.length > 0" class="text-xs bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 px-2.5 py-1 rounded-md border border-slate-200/60 dark:border-slate-700 hidden sm:inline-block">
                  {{ app.containers.length }} conteneur(s)
                </span>
                <span v-else class="text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-2.5 py-1 rounded-md border border-red-300 dark:border-red-800/50 hidden sm:inline-block font-medium">
                  Hors ligne (Down)
                </span>
                
                <!-- Boutons d'actions pour le projet entier -->
                <div class="flex items-center space-x-2">
                  <button v-if="appHasAIAlert(app.name) > 0" @click="isAIDrawerOpen = true" class="text-xs bg-rose-600 hover:bg-rose-500 text-white px-2.5 py-1.5 rounded-md border border-rose-500 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-lg shadow-rose-900/50 flex items-center transition-all animate-pulse" title="Voir les alertes IA">
                    <span class="mr-1">🤖</span> {{ appHasAIAlert(app.name) }} Alerte(s) IA
                  </button>
                  <button v-if="appHasUpdates(app)" @click="updateApplication(app)" 
                          :class="appHasBreakingChanges(app) ? 'bg-red-600 hover:bg-red-500 border-red-500 shadow-red-900/50' : 'bg-orange-600 hover:bg-orange-500 border-orange-500 shadow-orange-900/50'"
                          class="text-xs text-white px-2.5 py-1.5 rounded-md border shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-lg flex items-center transition-all animate-pulse" 
                          :title="appHasBreakingChanges(app) ? 'Breaking Changes potentiels ! Vérifiez les logs avant MAJ.' : 'Mettre à jour l\'application'">
                    <span class="mr-1">{{ appHasBreakingChanges(app) ? '⚠️' : '⬆️' }}</span> {{ appHasBreakingChanges(app) ? 'Breaking Changes !' : 'MAJ dispo' }}
                  </button>

                  <div class="flex items-center space-x-2">
                    <div class="flex bg-slate-100 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700 rounded-md overflow-hidden" v-if="app.name !== 'gestion_serveur'">
                      <button @click="activeEditorProject = app.name" class="p-1.5 bg-white hover:bg-slate-50 dark:bg-transparent dark:hover:bg-slate-700 text-slate-700 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" title="Éditer la configuration (Web IDE)">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                      </button>
                      <button @click="handleComposeAction(app.name, 'pull')" :disabled="composeLoading[app.name]" class="p-1.5 bg-white hover:bg-slate-50 dark:bg-transparent dark:hover:bg-slate-700 text-slate-700 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors disabled:opacity-50 border-l border-slate-200/60 dark:border-slate-700" title="Pull les images (docker compose pull)">
                        <svg v-if="composeLoading[app.name] === 'pull'" class="animate-spin w-4 h-4 text-purple-600 dark:text-purple-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg>
                        <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                      </button>
                      <button v-if="app.containers.length > 0" @click="handleComposeAction(app.name, 'down')" :disabled="composeLoading[app.name]" class="p-1.5 bg-white hover:bg-slate-50 dark:bg-transparent dark:hover:bg-slate-700 text-slate-700 dark:text-slate-400 hover:text-orange-600 dark:hover:text-orange-500 transition-colors border-l border-slate-200/60 dark:border-slate-700 disabled:opacity-50" title="Détruire les conteneurs (docker compose down)">
                        <svg v-if="composeLoading[app.name] === 'down'" class="animate-spin w-4 h-4 text-orange-600 dark:text-orange-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg>
                        <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                      </button>
                      <button @click="handleComposeAction(app.name, 'kill')" :disabled="composeLoading[app.name]" class="p-1.5 bg-red-50 hover:bg-red-100 dark:bg-red-900/30 dark:hover:bg-red-900/60 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors border-l border-slate-200/60 dark:border-slate-700 disabled:opacity-50" title="Destruction TOTALE et effacement des fichiers hôte (DANGER !)">
                        <svg v-if="composeLoading[app.name] === 'kill'" class="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg>
                        <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                      </button>
                      <button @click="handleComposeAction(app.name, 'up')" :disabled="composeLoading[app.name]" class="p-1.5 bg-white hover:bg-slate-50 dark:bg-transparent dark:hover:bg-slate-700 text-slate-700 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-500 transition-colors border-l border-slate-200/60 dark:border-slate-700 disabled:opacity-50" title="Créer/Mettre à jour le projet (docker compose up -d)">
                        <svg v-if="composeLoading[app.name] === 'up'" class="animate-spin w-4 h-4 text-emerald-600 dark:text-emerald-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg>
                        <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"></path></svg>
                      </button>
                    </div>

                    <!-- Boutons Classiques (Start, Restart, Stop) -->
                    <div class="flex bg-slate-100 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700 rounded-md overflow-hidden" v-if="app.name !== 'gestion_serveur' && app.containers.length > 0">
                      <button @click="handleProjectAction(app.name, 'start')" :disabled="projectLoading[app.name]" class="p-1.5 bg-white hover:bg-slate-50 dark:bg-transparent dark:hover:bg-slate-700 text-slate-700 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors disabled:opacity-50" title="Démarrer les conteneurs (start)">
                        <svg v-if="projectLoading[app.name] === 'start'" class="animate-spin w-4 h-4 text-emerald-600 dark:text-emerald-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg>
                        <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                      </button>
                      <button @click="handleProjectAction(app.name, 'restart')" :disabled="projectLoading[app.name]" class="p-1.5 bg-white hover:bg-slate-50 dark:bg-transparent dark:hover:bg-slate-700 text-slate-700 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors border-l border-slate-200/60 dark:border-slate-700 disabled:opacity-50" title="Redémarrer les conteneurs (restart)">
                        <svg v-if="projectLoading[app.name] === 'restart'" class="animate-spin w-4 h-4 text-blue-600 dark:text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg>
                        <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                      </button>
                      <button @click="handleProjectAction(app.name, 'stop')" :disabled="projectLoading[app.name]" class="p-1.5 bg-white hover:bg-slate-50 dark:bg-transparent dark:hover:bg-slate-700 text-slate-700 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors border-l border-slate-200/60 dark:border-slate-700 disabled:opacity-50" title="Arrêter les conteneurs (stop)">
                        <svg v-if="projectLoading[app.name] === 'stop'" class="animate-spin w-4 h-4 text-red-600 dark:text-red-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg>
                        <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"></path></svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <!-- Liste des conteneurs de l'app -->
            <div class="p-3 space-y-3">
              <ContainerCard 
                v-for="container in app.containers" 
                :key="container.id" 
                :container="container"
                :is-update-ignored="ignoredUpdateContainers.includes(container.name)"
                :action-loading="containerLoading[container.id]"
                @action="handleContainerAction"
                @view-logs="openLogs"
                @live-logs="openLiveLogs"
                @open-terminal="openTerminal"
                @toggle-ignore-update="handleToggleIgnoreUpdate"
              />
            </div>
          </div>
          
          <div v-if="groupedApps.length === 0" class="text-center py-8 text-slate-500 bg-white dark:bg-slate-800/50 rounded-xl border border-slate-200/60 dark:border-slate-700 border-dashed">
            Aucune application trouvée.
          </div>
        </div>

        <!-- Vue par Conteneurs (Plate) -->
        <div v-else class="space-y-3">
          <ContainerCard 
            v-for="container in filteredContainers" 
            :key="container.id" 
            :container="container" 
            :is-update-ignored="ignoredUpdateContainers.includes(container.name)"
            :action-loading="containerLoading[container.id]"
            @action="handleContainerAction"
            @view-logs="openLogs"
            @live-logs="openLiveLogs"
            @open-terminal="openTerminal"
            @toggle-ignore-update="handleToggleIgnoreUpdate"
          />
          <div v-if="containers.length === 0" class="text-center py-8 text-slate-500 bg-white dark:bg-slate-800/50 rounded-xl border border-slate-200/60 dark:border-slate-700 border-dashed">
            Aucun conteneur trouvé.
          </div>
        </div>

      </div>
    </section>

    <WebTerminal 
      v-if="activeTerminalContainerId" 
      :containerId="activeTerminalContainerId" 
      @close="closeTerminal" 
    />

    <LiveLogs 
      v-if="activeLiveLogContainer" 
      :containerId="activeLiveLogContainer.id" 
      :containerName="activeLiveLogContainer.name" 
      @close="closeLiveLogs" 
    />

    <AIDrawer 
      :is-open="isAIDrawerOpen" 
      :insights="aiInsights" 
      @close="isAIDrawerOpen = false" 
      @refresh="fetchInsights" 
    />
    
    <!-- Compose Web IDE -->
    <ComposeEditor 
      v-if="activeEditorProject" 
      :projectName="activeEditorProject" 
      @close="activeEditorProject = null" 
      @saved="onEditorSaved(activeEditorProject)" 
    />
  </div>
</template>
