<script setup>
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
import { io } from 'socket.io-client';

const API_BASE = '/api';

const getFetchOptions = () => ({
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
  }
});

const jobs = ref([]);
const logs = ref([]);
const applications = ref([]);
const activeTab = ref('jobs');

// Formulaire
const showForm = ref(false);
const editingId = ref(null);
const form = ref({
  name: '',
  source_path: 'auto', // Plus utilisé mais gardé pour compatibilité DB
  dest_path: '',
  cron_schedule: '0 3 * * 0',
  retention_count: 15,
  containers: [] // Stockera les noms d'applications
});

const cronMode = ref('simple');
const cronTime = ref('03:00');
const cronDays = ref([]); 

const parseCronToUI = (cronStr) => {
  try {
    const parts = (cronStr || '0 3 * * 0').split(' ').filter(Boolean);
    if (parts.length === 5 && parts[2] === '*' && parts[3] === '*') {
      const min = parts[0] === '*' ? '00' : parts[0].padStart(2, '0');
      const hr = parts[1] === '*' ? '00' : parts[1].padStart(2, '0');
      if (!isNaN(min) && !isNaN(hr)) {
        cronTime.value = `${hr}:${min}`;
        if (parts[4] === '*') {
          cronDays.value = [];
        } else {
          cronDays.value = parts[4].split(',').map(Number);
        }
        cronMode.value = 'simple';
        return;
      }
    }
  } catch(e) {}
  cronMode.value = 'advanced';
};

watch([cronTime, cronDays], () => {
  if (cronMode.value === 'simple') {
    const [hr, min] = (cronTime.value || '03:00').split(':');
    const d = (cronDays.value.length === 0 || cronDays.value.length === 7) ? '*' : [...cronDays.value].sort().join(',');
    form.value.cron_schedule = `${parseInt(min||0)} ${parseInt(hr||0)} * * ${d}`;
  }
}, { deep: true });

const toggleDay = (v) => {
  if (cronDays.value.length === 0) {
    cronDays.value = [v];
  } else {
    const idx = cronDays.value.indexOf(v);
    if (idx >= 0) cronDays.value.splice(idx, 1);
    else cronDays.value.push(v);
  }
};

const fetchApplications = async () => {
  try {
    const res = await fetch(`${API_BASE}/docker/applications`, { headers: getFetchOptions().headers });
    if (res.ok) {
      const data = await res.json();
      
      // Auto-détecter le dossier parent pour les imports
      const selfApp = data.find(a => a.name.toLowerCase() === 'gestionserveur' || a.name.toLowerCase() === 'gestion_serveur');
      if (selfApp && selfApp.working_dir && !importTargetPath.value) {
        const dir = selfApp.working_dir;
        // Gérer les slash et antislash
        const separator = dir.includes('\\') ? '\\' : '/';
        const parts = dir.split(separator).filter(Boolean);
        parts.pop(); // Retire le dossier courant (gestionServeur)
        
        if (dir.startsWith('/')) {
            importTargetPath.value = '/' + parts.join(separator);
        } else {
            importTargetPath.value = parts.join(separator);
        }
      }

      // On exclut l'application elle-même pour éviter de s'auto-stopper
      applications.value = data.filter(app => 
        app.name.toLowerCase() !== 'gestionserveur' && 
        app.name.toLowerCase() !== 'gestion_serveur'
      );
    }
  } catch (e) {
    console.error("Erreur chargement applications:", e);
  }
};

const fetchJobs = async () => {
  try {
    const res = await fetch(`${API_BASE}/backups`, { headers: getFetchOptions().headers });
    if (res.ok) jobs.value = await res.json();
  } catch (e) {
    console.error(e);
  }
};

const fetchLogs = async () => {
  try {
    const res = await fetch(`${API_BASE}/backups/logs`, { headers: getFetchOptions().headers });
    if (res.ok) logs.value = await res.json();
  } catch (e) {
    console.error(e);
  }
};

let globalSocket = null;

onMounted(() => {
  fetchApplications();
  fetchJobs();
  fetchLogs();

  const token = localStorage.getItem('auth_token') || '';
  globalSocket = io({ auth: { token } });
  globalSocket.on('backup-progress', (data) => {
      const logEntry = logs.value.find(l => l.job_id === data.jobId && l.status === 'RUNNING');
      if (logEntry) {
          logEntry.message = data.message;
      } else {
          fetchLogs();
      }
  });
  globalSocket.on('backup-finished', () => {
      fetchLogs();
  });
});

onUnmounted(() => {
  if (globalSocket) {
    globalSocket.disconnect();
    globalSocket = null;
  }
});

const parseContainers = (containersStr) => {
  if (!containersStr) return [];
  try {
    let parsed = JSON.parse(containersStr);
    if (typeof parsed === 'string') {
      parsed = JSON.parse(parsed);
    }
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
};

const openForm = (job = null) => {
  if (job) {
    editingId.value = job.id;
    form.value = {
      ...job,
      containers: parseContainers(job.containers)
    };
  } else {
    editingId.value = null;
    form.value = {
      name: '',
      source_path: 'auto',
      dest_path: '',
      cron_schedule: '0 3 * * 0',
      retention_count: 15,
      containers: []
    };
  }
  parseCronToUI(form.value.cron_schedule);
  showForm.value = true;
};

const toggleAppSelection = (appName) => {
  const idx = form.value.containers.indexOf(appName);
  if (idx > -1) {
    form.value.containers.splice(idx, 1);
  } else {
    form.value.containers.push(appName);
  }
};

const orphanApps = computed(() => {
  const activeNames = applications.value.map(a => a.name);
  return (form.value.containers || []).filter(name => !activeNames.includes(name));
});

const removeOrphanApps = () => {
  const activeNames = applications.value.map(a => a.name);
  form.value.containers = (form.value.containers || []).filter(name => activeNames.includes(name));
};

const isAppActive = (appName) => {
  return applications.value.some(a => a.name === appName);
};

import { useModal } from '../composables/useModal';
const { showAlert, showConfirm } = useModal();

const saveJob = async () => {
  try {
    const method = editingId.value ? 'PUT' : 'POST';
    const url = editingId.value ? `${API_BASE}/backups/${editingId.value}` : `${API_BASE}/backups`;
    
    const res = await fetch(url, {
      method,
      ...getFetchOptions(),
      body: JSON.stringify(form.value)
    });
    
    if (!res.ok) throw new Error("Erreur lors de la sauvegarde");
    
    showForm.value = false;
    await fetchJobs();
  } catch (e) {
    showAlert("Erreur", e.message);
  }
};

// --- EXPLORATEUR ---
const explorerModal = ref(false); // Utilisé pour l'affichage de l'explorateur
const explorerJob = ref(null);
const explorerApp = ref('');
const explorerPath = ref('');
const explorerFiles = ref([]);
const explorerLoading = ref(false);
const explorerError = ref(null);
const explorerAvailableApps = ref([]);

const fetchExplorerApps = async (jobId) => {
    if (!jobId) {
        explorerAvailableApps.value = [];
        return;
    }
    try {
        const res = await fetch(`${API_BASE}/backups/${jobId}/available-apps`, getFetchOptions());
        if (res.ok) {
            explorerAvailableApps.value = await res.json();
        }
    } catch(e) {
        console.error("Erreur chargement applications disponibles:", e);
    }
};

const isCurrentAppArchived = computed(() => {
    const found = explorerAvailableApps.value.find(a => a.name === explorerApp.value);
    return !!found?.isArchived;
});

const showRestoreModal = ref(false);
const restoreFolderName = ref('');
const restoreMode = ref('staging'); // 'staging' or 'in-place'
const restoreCustomName = ref('');
const restoreConfirmAppName = ref('');

const explorerPathParts = computed(() => {
    return explorerPath.value.split('/').filter(Boolean);
});

const sortedExplorerFiles = computed(() => {
    return [...explorerFiles.value].sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
    });
});

const openExplorer = async (job = null, app = null) => {
    if (job) explorerJob.value = job;
    else if (jobs.value.length > 0 && !explorerJob.value) explorerJob.value = jobs.value[0];
    
    if (explorerJob.value) {
        await fetchExplorerApps(explorerJob.value.id);
        const appNames = explorerAvailableApps.value.map(a => a.name);
        if (app && appNames.includes(app)) {
            explorerApp.value = app;
        } else if (!appNames.includes(explorerApp.value)) {
            explorerApp.value = appNames.length > 0 ? appNames[0] : '';
        }
    }

    explorerPath.value = '';
    
    // Au lieu d'ouvrir une modale, on bascule sur l'onglet
    activeTab.value = 'explore';
    
    if (explorerJob.value && explorerApp.value) {
        loadExplorerFiles();
    }
};

const closeExplorer = () => {
    activeTab.value = 'jobs';
};

const loadExplorerFiles = async () => {
    if (!explorerJob.value || !explorerApp.value) return;
    explorerLoading.value = true;
    explorerError.value = null;
    explorerFiles.value = [];
    try {
        const res = await fetch(`${API_BASE}/backups/${explorerJob.value.id}/explore/${explorerApp.value}?path=${encodeURIComponent(explorerPath.value)}`, getFetchOptions());
        if (!res.ok) throw new Error(await res.text());
        explorerFiles.value = await res.json();
    } catch (e) {
        explorerError.value = e.message;
    } finally {
        explorerLoading.value = false;
    }
};

const navigateExplorer = (newPath) => {
    explorerPath.value = newPath;
    loadExplorerFiles();
};

const navigateUp = () => {
    const parts = explorerPathParts.value;
    parts.pop();
    navigateExplorer(parts.join('/'));
};

const downloadBackupFolder = (folderName) => {
    if (!explorerJob.value || !explorerApp.value) return;
    const token = localStorage.getItem('auth_token') || '';
    const url = `${API_BASE}/backups/${explorerJob.value.id}/download/${explorerApp.value}/${folderName}?token=${token}`;
    
    // Le navigateur va directement gérer le flux de téléchargement (barre de progression native)
    window.location.href = url;
};

const openRestoreModal = (folderName) => {
    restoreFolderName.value = folderName;
    restoreMode.value = 'staging';
    restoreCustomName.value = `${explorerApp.value}_restored`;
    restoreConfirmAppName.value = '';
    showRestoreModal.value = true;
};

const executeRestore = async () => {
    if (restoreMode.value === 'in-place') {
        if (restoreConfirmAppName.value !== explorerApp.value) {
            showAlert("Erreur", "Le nom de l'application tapé ne correspond pas.");
            return;
        }
    } else if (restoreMode.value === 'staging') {
        if (!restoreCustomName.value) {
            showAlert("Erreur", "Veuillez entrer un nom pour le dossier de restauration.");
            return;
        }
    }

    showRestoreModal.value = false;
    explorerLoading.value = true;
    explorerError.value = null;
    
    try {
        const url = `${API_BASE}/backups/${explorerJob.value.id}/restore/${explorerApp.value}/${restoreFolderName.value}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getFetchOptions().headers },
            body: JSON.stringify({ 
                mode: restoreMode.value, 
                customName: restoreMode.value === 'staging' ? restoreCustomName.value.replace(/[^a-zA-Z0-9_-]/g, '') : null 
            })
        });
        
        if (res.status === 401) return;
        
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Erreur inconnue');
        }
        
        const data = await res.json();
        showAlert(
            "Restauration terminée", 
            restoreMode.value === 'in-place' 
                ? "L'application a été restaurée en place et redémarrée.\n\nNote: Un dossier .bak de sécurité a été créé sur le disque à côté du dossier de l'application." 
                : `Les données ont été restaurées dans le dossier :\n\n${data.resultPath}`
        );
    } catch (err) {
        explorerError.value = err.message;
        showAlert("Erreur de restauration", err.message);
    } finally {
        explorerLoading.value = false;
    }
};

watch(activeTab, async (newTab) => {
    if (newTab === 'explore') {
        if (!explorerJob.value && jobs.value.length > 0) {
            explorerJob.value = jobs.value[0];
        }
        if (explorerJob.value) {
            await fetchExplorerApps(explorerJob.value.id);
            const appNames = explorerAvailableApps.value.map(a => a.name);
            if (!appNames.includes(explorerApp.value)) {
                explorerApp.value = appNames.length > 0 ? appNames[0] : '';
            }
            if (explorerApp.value) {
                loadExplorerFiles();
            }
        }
    }
});

// Écouter les changements de job pour recharger les apps disponibles
watch(explorerJob, async (newJob, oldJob) => {
    if (newJob && newJob?.id !== oldJob?.id) {
        await fetchExplorerApps(newJob.id);
        const appNames = explorerAvailableApps.value.map(a => a.name);
        if (!appNames.includes(explorerApp.value)) {
            explorerApp.value = appNames.length > 0 ? appNames[0] : '';
        }
        explorerPath.value = '';
        if (activeTab.value === 'explore' && explorerApp.value) {
            loadExplorerFiles();
        }
    }
});

// Écouter les changements d'application sélectionnée
watch(explorerApp, (newApp, oldApp) => {
    if (activeTab.value === 'explore' && explorerJob.value && newApp && newApp !== oldApp) {
        explorerPath.value = '';
        loadExplorerFiles();
    }
});

const toggleJob = async (job) => {
  try {
    let parsedContainers = [];
    try {
      parsedContainers = typeof job.containers === 'string' ? JSON.parse(job.containers) : job.containers;
      // Si les données ont été corrompues (double stringify) et qu'on a encore une string
      if (typeof parsedContainers === 'string') {
        parsedContainers = JSON.parse(parsedContainers);
      }
    } catch (e) {
      parsedContainers = [];
    }
    
    await fetch(`${API_BASE}/backups/${job.id}`, {
      method: 'PUT',
      ...getFetchOptions(),
      body: JSON.stringify({ 
        ...job, 
        containers: parsedContainers,
        enabled: job.enabled ? 0 : 1 
      })
    });
    await fetchJobs();
  } catch (e) {
    showAlert("Erreur", e.message);
  }
};

const deleteJob = async (id) => {
  const isConfirmed = await showConfirm(
    "Confirmation de suppression", 
    "Voulez-vous vraiment supprimer cette tâche de sauvegarde ?"
  );
  if (!isConfirmed) return;
  
  try {
    await fetch(`${API_BASE}/backups/${id}`, {
      method: 'DELETE',
      headers: getFetchOptions().headers
    });
    await fetchJobs();
  } catch (e) {
    showAlert("Erreur", e.message);
  }
};

const triggerJob = async (id) => {
  const isConfirmed = await showConfirm(
    "Lancement manuel",
    "Lancer cette sauvegarde immédiatement ? Les applications associées seront arrêtées puis redémarrées."
  );
    if (!isConfirmed) return;
    
    try {
        await fetch(`${API_BASE}/backups/${id}/trigger`, {
            method: 'POST',
            headers: getFetchOptions().headers
        });
        showAlert("Succès", "Sauvegarde lancée en arrière-plan ! Vérifiez les logs d'ici quelques minutes.");
        activeTab.value = 'logs';
        fetchLogs();
    } catch (e) {
        showAlert("Erreur", e.message);
    }
};

// --- IMPORT ARCHIVE EXTERNE ---
const showImportModal = ref(false);
const importFile = ref(null);
const importTargetPath = ref('');
const importCustomName = ref('');
const importLoading = ref(false);
const uploadProgress = ref(0);
const importStatus = ref('');

const handleImportFileChange = (e) => {
    importFile.value = e.target.files[0];
};

const submitImportArchive = async () => {
    if (!importFile.value || !importTargetPath.value) return;
    
    importLoading.value = true;
    uploadProgress.value = 0;
    importStatus.value = 'Envoi du fichier...';
    
    const formData = new FormData();
    formData.append('archive', importFile.value);
    formData.append('targetPath', importTargetPath.value);
    if (importCustomName.value) {
        formData.append('customName', importCustomName.value.replace(/[^a-zA-Z0-9_-]/g, ''));
    }
    
    let socket = null;
    
    try {
        const token = localStorage.getItem('auth_token') || '';
        
        // Initialiser socket.io pour écouter la progression de l'extraction
        socket = io({ auth: { token } });
        
        let extractionStarted = false;
        
        socket.on('extraction-progress', (data) => {
            if (!extractionStarted) {
                extractionStarted = true;
                importStatus.value = 'Extraction par Docker...';
            }
            uploadProgress.value = data.percentage;
        });
        
        await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', `${API_BASE}/backups/import`, true);
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            
            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable && !extractionStarted) {
                    const pct = Math.round((event.loaded / event.total) * 100);
                    // On bloque à 99% tant que le backend n'a pas pris le relais via socket
                    uploadProgress.value = pct === 100 ? 99 : pct;
                    if (pct === 100) {
                        importStatus.value = 'Préparation de l\'extraction...';
                    }
                }
            };
            
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(JSON.parse(xhr.responseText));
                } else {
                    try {
                        const err = JSON.parse(xhr.responseText);
                        reject(new Error(err.error || 'Erreur lors de la restauration'));
                    } catch(e) {
                        reject(new Error('Erreur HTTP ' + xhr.status));
                    }
                }
            };
            
            xhr.onerror = () => reject(new Error('Erreur réseau lors de la restauration'));
            xhr.send(formData);
        });
        
        uploadProgress.value = 100;
        importStatus.value = 'Terminé !';
        
        showAlert("Succès", "L'archive a été restaurée avec succès ! Vous la retrouverez dans vos Applications.");
        showImportModal.value = false;
        importFile.value = null;
        importTargetPath.value = '';
        importCustomName.value = '';
    } catch (e) {
        showAlert("Erreur", "Erreur lors de la restauration : " + e.message);
    } finally {
        if (socket) socket.disconnect();
        importLoading.value = false;
        uploadProgress.value = 0;
        importStatus.value = '';
    }
};



const getJobName = (jobId) => {
  const job = jobs.value.find(j => j.id === jobId);
  return job ? job.name : `Job #${jobId}`;
};

const formatDate = (dateStr) => {
  if (!dateStr) return 'Jamais';
  const isoStr = typeof dateStr === 'string' && dateStr.includes(' ') && !dateStr.includes('T')
    ? dateStr.replace(' ', 'T') + 'Z'
    : dateStr;
  const d = new Date(isoStr);
  return isNaN(d.getTime()) ? dateStr : d.toLocaleString('fr-FR');
};

const formatBackupNameDate = (name) => {
  const match = name.match(/^backup_(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]} ${match[4]}:${match[5]}:${match[6]}`;
  }
  return null;
};

const formatBytes = (bytes) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};



</script>

<template>
  <div class="w-full h-full relative">
  <div class="p-4 space-y-6">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
      <h2 class="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center">
        <span class="mr-2">💾</span> Orchestrateur de Sauvegardes
      </h2>
      <div class="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200/60 dark:border-slate-700 w-full sm:w-auto">
        <button 
          @click="activeTab = 'jobs'; fetchJobs()" 
          :class="activeTab === 'jobs' ? 'bg-white text-slate-900 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-transparent'"
          class="flex-1 sm:flex-none px-4 py-1.5 rounded-md text-sm font-medium transition-all"
        >
          Jobs de Sauvegarde
        </button>
        <button 
          @click="activeTab = 'explore'" 
          :class="activeTab === 'explore' ? 'bg-white text-slate-900 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-transparent'"
          class="flex-1 sm:flex-none px-4 py-1.5 rounded-md text-sm font-medium transition-all"
        >
          Explorateur
        </button>
        <button 
          @click="activeTab = 'logs'; fetchLogs()" 
          :class="activeTab === 'logs' ? 'bg-white text-slate-900 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-transparent'"
          class="flex-1 sm:flex-none px-4 py-1.5 rounded-md text-sm font-medium transition-all"
        >
          Historique (Logs)
        </button>
      </div>
    </div>

    <!-- VUE DES JOBS -->
    <div v-if="activeTab === 'jobs'">
      <div class="flex justify-end mb-4 space-x-3">
        <button @click="showImportModal = true" class="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 shadow-md rounded-lg text-sm font-bold transition-all active:scale-95">
          Restaurer une archive externe
        </button>
        <button @click="openForm()" class="px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-blue-500 hover:from-indigo-600 hover:to-blue-600 text-white shadow-md shadow-blue-500/20 hover:shadow-lg hover:shadow-blue-500/30 rounded-lg text-sm font-bold shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-lg shadow-blue-900/50 transition-all active:scale-95">
          + Nouvelle Sauvegarde
        </button>
      </div>

      <!-- Formulaire Ajout/Modif -->
      <transition name="fade">
        <div v-if="showForm" class="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200/60 dark:border-slate-700 mb-8 shadow-[0_8px_30px_rgb(0,0,0,0.06)] dark:shadow-xl">
          <h3 class="text-xl font-bold text-slate-900 dark:text-slate-100 mb-6 flex items-center">
            <span class="mr-2">⚙️</span> {{ editingId ? 'Modifier la sauvegarde' : 'Configurer une Sauvegarde' }}
          </h3>
          <form @submit.prevent="saveJob" class="space-y-6">
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label class="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Nom de la sauvegarde</label>
                <input v-model="form.name" required placeholder="Ex: Apps Principales" type="text" class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700 rounded-xl p-3 text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all" />
              </div>
              <div class="md:col-span-2">
                <label class="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Fréquence d'exécution</label>
                <div class="flex flex-col space-y-4">
                  <div class="flex items-center space-x-2 bg-slate-100 dark:bg-slate-900 p-1 rounded-lg w-max">
                    <button type="button" @click="cronMode = 'simple'" :class="cronMode === 'simple' ? 'bg-white text-slate-800 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'" class="px-4 py-1.5 text-sm font-medium rounded-md transition-all">Interface Simple</button>
                    <button type="button" @click="cronMode = 'advanced'" :class="cronMode === 'advanced' ? 'bg-white text-slate-800 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'" class="px-4 py-1.5 text-sm font-medium rounded-md transition-all">Mode Avancé (CRON)</button>
                  </div>

                  <div v-if="cronMode === 'simple'" class="space-y-5 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200/60 dark:border-slate-700">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Heure d'exécution</label>
                        <input type="time" v-model="cronTime" class="bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-600 rounded-lg p-2.5 text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:ring-1 focus:outline-none" />
                      </div>
                      <div>
                        <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Jours d'exécution</label>
                        <div class="flex flex-wrap gap-2">
                          <button type="button" @click="cronDays = []" class="px-3 py-1.5 rounded-lg border text-sm transition-colors font-medium" :class="cronDays.length === 0 ? 'bg-blue-600 text-white border-blue-600 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-sm' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200/60 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'">
                            Tous les jours
                          </button>
                          <button type="button" v-for="day in [{v:1,l:'Lun'},{v:2,l:'Mar'},{v:3,l:'Mer'},{v:4,l:'Jeu'},{v:5,l:'Ven'},{v:6,l:'Sam'},{v:0,l:'Dim'}]" :key="day.v" 
                                @click="toggleDay(day.v)"
                                class="cursor-pointer select-none px-3 py-1.5 rounded-lg border text-sm transition-colors font-medium"
                                :class="cronDays.length > 0 && cronDays.includes(day.v) ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-400 dark:border-emerald-700 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-sm' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200/60 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'">
                            {{ day.l }}
                          </button>
                        </div>
                        <p class="text-xs text-slate-500 mt-2 font-mono">Expression finale : <code>{{ form.cron_schedule }}</code></p>
                      </div>
                    </div>
                  </div>

                  <div v-else class="space-y-4">
                    <label class="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Expression CRON personnalisée</label>
                    <div class="relative">
                      <input v-model="form.cron_schedule" required type="text" placeholder="0 3 * * 0" class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700 rounded-xl p-3 text-slate-900 dark:text-slate-100 font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all" />
                      <span class="absolute right-3 top-3 text-slate-500 text-xs">Ex: 0 3 * * 0</span>
                    </div>
                    <p class="text-xs text-slate-500 dark:text-slate-400 mt-2">Permet d'utiliser des formats complexes (ex: tous les 1er du mois).</p>
                  </div>
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Dossier Racine (Cible)</label>
                <input v-model="form.dest_path" required placeholder="/mnt/Backup_serveur/sauvegardes" type="text" class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700 rounded-xl p-3 text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all" />
                <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-2">Un sous-dossier sera créé automatiquement pour chaque application.</p>
              </div>
              
              <div>
                <label class="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Rétention (Nombre de backups à conserver)</label>
                <input v-model="form.retention_count" required type="number" min="1" class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700 rounded-xl p-3 text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all" />
              </div>
            </div>

            <!-- Applications orphelines / introuvables -->
            <div v-if="orphanApps.length > 0" class="pt-4 border-t border-slate-200/60 dark:border-slate-700">
              <div class="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-xl space-y-2">
                <div class="flex items-center justify-between">
                  <span class="text-xs font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                    <span>⚠️</span> Applications introuvables ou supprimées ({{ orphanApps.length }})
                  </span>
                  <button type="button" @click="removeOrphanApps" class="text-xs text-red-600 dark:text-red-400 hover:underline font-bold">
                    Tout retirer
                  </button>
                </div>
                <p class="text-xs text-amber-700 dark:text-amber-400">
                  Ces applications ont été supprimées ou ne sont plus actives sur Docker. Cliquez sur la croix ou sur "Tout retirer" pour garder un plan propre :
                </p>
                <div class="flex flex-wrap gap-2 pt-1">
                  <div v-for="appName in orphanApps" :key="appName" class="inline-flex items-center gap-2 px-3 py-1.5 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-xs font-medium text-red-800 dark:text-red-200">
                    <span>🗑️ {{ appName }}</span>
                    <button type="button" @click="toggleAppSelection(appName)" title="Retirer cette application" class="text-red-500 hover:text-red-800 dark:hover:text-red-100 font-bold ml-1 text-sm">
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Sélection des applications -->
            <div class="pt-4 border-t border-slate-200/60 dark:border-slate-700">
              <label class="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Applications à sauvegarder</label>
              <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div 
                  v-for="app in applications" 
                  :key="app.name"
                  @click="toggleAppSelection(app.name)"
                  class="cursor-pointer border rounded-xl p-3 flex flex-col items-center justify-center text-center transition-all duration-200"
                  :class="form.containers.includes(app.name) ? 'bg-blue-600/20 border-blue-500 text-white' : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200/60 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'"
                >
                  <div class="text-2xl mb-1">{{ form.containers.includes(app.name) ? '✅' : '📦' }}</div>
                  <div class="font-bold text-sm truncate w-full">{{ app.name }}</div>
                  <div class="text-[10px] opacity-70 truncate w-full mt-1">{{ app.containers.length }} conteneur(s)</div>
                </div>
              </div>
              <p v-if="applications.length === 0" class="text-sm text-slate-500 italic">Aucune application Docker Compose détectée.</p>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-3 flex items-center">
                <span class="mr-1">💡</span> Le dossier source sera automatiquement détecté depuis le projet Compose.
              </p>
            </div>

            <div class="flex justify-end space-x-3 pt-6 border-t border-slate-200/60 dark:border-slate-700">
              <button type="button" @click="showForm = false" class="px-6 py-2.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 rounded-xl text-sm font-medium transition-colors">Annuler</button>
              <button type="submit" class="px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-blue-500 hover:from-indigo-600 hover:to-blue-600 text-white shadow-md shadow-blue-500/20 hover:shadow-lg hover:shadow-blue-500/30 rounded-xl text-sm font-bold shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-lg shadow-blue-900/50 transition-all">Sauvegarder ce Job</button>
            </div>
          </form>
        </div>
      </transition>



      <!-- Liste des Jobs -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div v-for="job in jobs" :key="job.id" class="bg-white dark:bg-slate-800/80 rounded-2xl p-6 border border-slate-200/60 dark:border-slate-700 shadow-[0_8px_30px_rgb(0,0,0,0.06)] dark:shadow-xl relative overflow-hidden transition-all hover:border-slate-600">
          <!-- Indicateur on/off -->
          <div class="absolute top-0 right-0 w-1.5 h-full transition-colors" :class="job.enabled ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-slate-300 dark:bg-slate-600'"></div>
          
          <div class="flex justify-between items-start mb-4">
            <div>
              <h3 class="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center">
                {{ job.name }}
              </h3>
            </div>
            <span class="text-xs font-mono bg-slate-50 dark:bg-slate-900 px-3 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700 flex items-center shadow-[0_2px_10px_rgb(0,0,0,0.02)] dark:shadow-inner">
              <span class="mr-1">⏱️</span> {{ job.cron_schedule }}
            </span>
          </div>
          
          <div class="text-sm text-slate-500 dark:text-slate-400 space-y-3 mb-6 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200/60 dark:border-slate-700/50">
            <div class="flex items-center">
              <span class="w-24 text-slate-500 text-xs uppercase tracking-wider">Cible</span>
              <span class="text-slate-800 dark:text-slate-200 font-mono text-xs">{{ job.dest_path }}</span>
            </div>
            <div class="flex items-start">
              <span class="w-24 text-slate-500 text-xs uppercase tracking-wider mt-0.5">Applications</span>
              <div class="flex flex-wrap gap-1 flex-1">
                <span v-for="app in parseContainers(job.containers)" :key="app" 
                      @click="openExplorer(job, app)" 
                      :title="isAppActive(app) ? 'Explorer les sauvegardes de cette application' : 'Application supprimée de Docker - Explorer les archives'"
                      class="px-2 py-0.5 border rounded text-xs font-medium cursor-pointer transition-colors flex items-center gap-1"
                      :class="isAppActive(app) ? 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800/50 hover:bg-blue-200 dark:hover:bg-blue-800' : 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800/50 hover:bg-amber-200 dark:hover:bg-amber-800'">
                  <span>{{ app }}</span>
                  <span v-if="!isAppActive(app)" class="text-[9px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 bg-amber-200/60 dark:bg-amber-800/50 px-1 rounded">archivée</span>
                  <span class="opacity-70 text-[10px]">🔍</span>
                </span>
                <span v-if="!job.containers || parseContainers(job.containers).length === 0" class="text-slate-500 italic">Aucune</span>
              </div>
            </div>
            <div class="flex items-center">
              <span class="w-24 text-slate-500 text-xs uppercase tracking-wider">Rétention</span>
              <span class="text-slate-600 dark:text-slate-300">{{ job.retention_count }} backups</span>
            </div>
          </div>
          
          <div class="flex justify-between items-center">
            <div class="flex space-x-2">
              <button @click="triggerJob(job.id)" class="text-xs text-blue-100 hover:text-white font-medium bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg transition-colors shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-lg shadow-blue-900/30">
                ▶️ Lancer
              </button>
              <button @click="openForm(job)" class="text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 px-4 py-2 rounded-lg transition-colors">
                ✏️ Éditer
              </button>
              <button @click="deleteJob(job.id)" class="text-xs text-red-600 bg-red-100 hover:bg-red-200 hover:text-red-700 dark:text-red-400 dark:bg-red-900/20 dark:hover:bg-red-900/40 px-3 py-2 rounded-lg transition-colors border border-transparent dark:hover:border-red-900/50">
                🗑️
              </button>
            </div>
            <button @click="toggleJob(job)" class="text-sm font-bold flex items-center px-3 py-1.5 rounded-lg transition-colors border border-transparent" :class="job.enabled ? 'text-emerald-700 bg-emerald-100 hover:bg-emerald-200 dark:text-emerald-400 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/40 dark:hover:border-emerald-900/50' : 'text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700'">
              <span class="mr-1.5 text-lg">{{ job.enabled ? '🟢' : '⚪' }}</span>
              {{ job.enabled ? 'Actif' : 'Inactif' }}
            </button>
          </div>
        </div>
        
        <div v-if="jobs.length === 0" class="col-span-1 lg:col-span-2 text-center py-16 text-slate-500 bg-white dark:bg-slate-800/30 rounded-2xl border-2 border-slate-200/60 dark:border-slate-700 border-dashed">
          <div class="text-4xl mb-4">📭</div>
          <p class="text-lg font-medium text-slate-500 dark:text-slate-400">Aucun Job de sauvegarde configuré.</p>
          <p class="text-sm mt-2">Cliquez sur "+ Nouvelle Sauvegarde" pour commencer.</p>
        </div>
      </div>
    </div>

    <!-- VUE DE L'EXPLORATEUR (ONGLET) -->
    <div v-if="activeTab === 'explore'" class="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700 shadow-[0_8px_30px_rgb(0,0,0,0.06)] dark:shadow-xl flex flex-col h-[70vh]">
      <!-- Barre de sélection et navigation -->
      <div class="p-4 border-b dark:border-slate-700 bg-slate-50 dark:bg-slate-900 rounded-t-2xl flex flex-col sm:flex-row gap-4 justify-between items-center">
        <div class="flex gap-2 w-full sm:w-auto">
          <select v-model="explorerJob" class="bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 rounded-lg p-2 text-sm text-slate-900 dark:text-slate-100 flex-1">
            <option :value="null" disabled>Sélectionner un Job...</option>
            <option v-for="job in jobs" :key="job.id" :value="job">{{ job.name }}</option>
          </select>
          <select v-model="explorerApp" class="bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 rounded-lg p-2 text-sm text-slate-900 dark:text-slate-100 flex-1" :disabled="!explorerJob">
            <option value="" disabled>Sélectionner une application...</option>
            <option v-for="app in explorerAvailableApps" :key="app.name" :value="app.name">
              {{ app.isArchived ? `📦 ${app.name} (archivée)` : app.name }}
            </option>
          </select>
        </div>
        
        <div v-if="explorerJob && explorerApp" class="flex-1 overflow-x-auto whitespace-nowrap bg-slate-100 dark:bg-slate-800 p-2 rounded-lg text-sm flex items-center gap-2 max-w-full">
           <button @click="navigateExplorer('')" class="hover:bg-slate-200 dark:hover:bg-slate-700 px-2 py-1 rounded dark:text-slate-300">🏠 Racine</button>
           <span v-for="(part, i) in explorerPathParts" :key="i" class="flex items-center gap-2 text-slate-500">
              <span>/</span>
              <button @click="navigateExplorer(explorerPathParts.slice(0, i+1).join('/'))" class="hover:bg-slate-200 dark:hover:bg-slate-700 px-2 py-1 rounded dark:text-slate-300">{{ part }}</button>
           </span>
        </div>
      </div>
      
      <!-- Contenu des fichiers -->
      <div class="flex-1 overflow-y-auto p-4 bg-slate-50 dark:bg-slate-900/50 rounded-b-2xl">
        <div v-if="!explorerJob || !explorerApp" class="flex h-full items-center justify-center text-slate-500 italic text-center p-8">
          Veuillez sélectionner un job de sauvegarde et une application pour commencer l'exploration.
        </div>
        <div v-else-if="explorerLoading" class="flex h-full items-center justify-center p-8"><span class="animate-spin text-3xl">⏳</span></div>
        <div v-else-if="explorerError" class="text-red-500 bg-red-100 dark:bg-red-900/30 p-4 rounded-xl border border-red-200 dark:border-red-800">{{ explorerError }}</div>
        <div v-else>
          <div v-if="explorerFiles.length === 0" class="text-center text-slate-500 p-12 bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">Dossier vide ou introuvable.</div>
          <div v-else class="grid gap-1 bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-200/60 dark:border-slate-700 shadow-sm">
             <div v-if="explorerPath" @click="navigateUp" class="flex items-center gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg cursor-pointer select-none transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-600">
                <span class="text-2xl">📁</span> <span class="dark:text-slate-300 font-bold">..</span>
             </div>
             <div v-for="f in sortedExplorerFiles" :key="f.name" @click="f.isDirectory ? navigateExplorer(explorerPath ? explorerPath + '/' + f.name : f.name) : null" 
                  class="flex items-center justify-between p-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg transition-colors border border-transparent group"
                  :class="{'cursor-pointer select-none hover:border-slate-200 dark:hover:border-slate-600': f.isDirectory}">
                <div class="flex items-center gap-3 truncate">
                   <span class="text-2xl">{{ f.isDirectory ? '📁' : '📄' }}</span>
                   <span class="truncate dark:text-slate-200" :class="{'font-bold text-blue-600 dark:text-blue-400': f.isDirectory}">{{ f.name }}</span>
                </div>
                <div class="flex items-center gap-4 text-sm text-slate-500 shrink-0">
                   <!-- Boutons d'action (visibles uniquement à la racine pour les dossiers backup_...) -->
                   <div v-if="!explorerPath && f.isDirectory && f.name.startsWith('backup_')" class="flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button @click.stop="downloadBackupFolder(f.name)" class="p-1.5 bg-blue-100 hover:bg-blue-200 text-blue-600 rounded-md transition-colors title='Télécharger (tar.gz)'">📥</button>
                      <button @click.stop="openRestoreModal(f.name)" class="p-1.5 bg-red-100 hover:bg-red-200 text-red-600 rounded-md transition-colors title='Restaurer cette version (Écrase les données actuelles)'">🔄</button>
                   </div>
                   
                   <span v-if="!f.isDirectory" class="font-mono bg-slate-100 dark:bg-slate-900 px-2 py-1 rounded">{{ formatBytes(f.size) }}</span>
                   <span class="hidden sm:inline">{{ (f.isDirectory && formatBackupNameDate(f.name)) || formatDate(f.mtime) }}</span>
                </div>
             </div>
          </div>
        </div>
      </div>
    </div>

    <!-- VUE DES LOGS -->
    <div v-if="activeTab === 'logs'" class="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700 overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.06)] dark:shadow-xl">
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm text-slate-600 dark:text-slate-300">
          <thead class="bg-slate-50 dark:bg-slate-900/80 text-xs uppercase text-slate-500 dark:text-slate-400 border-b border-slate-200/60 dark:border-slate-700">
            <tr>
              <th class="px-6 py-4 font-semibold tracking-wider">Date</th>
              <th class="px-6 py-4 font-semibold tracking-wider">Job</th>
              <th class="px-6 py-4 font-semibold tracking-wider">Statut</th>
              <th class="px-6 py-4 font-semibold tracking-wider">Détails</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-700/50">
            <tr v-for="log in logs" :key="log.id" class="hover:bg-slate-50/80 dark:hover:bg-slate-800/80 transition-colors">
              <td class="px-6 py-4 whitespace-nowrap">{{ formatDate(log.created_at) }}</td>
              <td class="px-6 py-4 font-medium">{{ log.job_name || getJobName(log.job_id) }}</td>
              <td class="px-6 py-4">
                <span v-if="log.status === 'SUCCESS'" class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">Succès</span>
                <span v-else-if="log.status === 'ERROR' || log.status === 'FAILED'" class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">Échec</span>
                <span v-else-if="log.status === 'RUNNING'" class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                  <span class="w-1.5 h-1.5 bg-blue-500 dark:bg-blue-400 rounded-full mr-1.5 animate-pulse"></span> En cours
                </span>
              </td>
              <td class="px-6 py-4 text-xs max-w-md truncate text-slate-500 dark:text-slate-400" :title="log.message">{{ log.message }}</td>
            </tr>
            <tr v-if="logs.length === 0">
              <td colspan="4" class="px-6 py-12 text-center text-slate-500 italic bg-slate-50 dark:bg-slate-900/20">Aucun historique de sauvegarde pour le moment.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
    
  <!-- Restore Modal -->
    <div v-if="showRestoreModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm overflow-y-auto">
      <div class="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-2xl overflow-hidden border border-slate-200 dark:border-slate-700 my-auto">
        <div class="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center">
          <h3 class="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <svg class="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
            Restaurer la Sauvegarde
          </h3>
          <button @click="showRestoreModal = false" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>
        
        <div class="p-6 space-y-6">
          <p class="text-sm text-slate-600 dark:text-slate-300">
            Vous êtes sur le point de restaurer la sauvegarde <strong>{{ restoreFolderName }}</strong> pour l'application <span class="font-bold text-blue-600 dark:text-blue-400">{{ explorerApp }}</span>.
            Veuillez choisir le mode de restauration :
          </p>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <!-- Mode Staging -->
            <label class="relative flex cursor-pointer rounded-lg border bg-white p-4 shadow-sm focus:outline-none" :class="restoreMode === 'staging' ? 'border-blue-500 ring-1 ring-blue-500 dark:bg-slate-700/50' : 'border-slate-300 dark:border-slate-600 dark:bg-slate-800'">
              <input type="radio" v-model="restoreMode" value="staging" class="sr-only">
              <span class="flex flex-1">
                <span class="flex flex-col">
                  <span class="block text-sm font-medium text-slate-900 dark:text-white mb-1">Restauration Parallèle</span>
                  <span class="mt-1 flex items-center text-xs text-slate-500 dark:text-slate-400">Crée un dossier "clone" à côté de l'application sans toucher à la production actuelle. Idéal pour tester sans risque.</span>
                </span>
              </span>
              <svg class="h-5 w-5 text-blue-600" :class="restoreMode === 'staging' ? 'block' : 'hidden'" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
              </svg>
            </label>

            <!-- Mode In-Place -->
            <label 
              class="relative flex rounded-lg border bg-white p-4 shadow-sm focus:outline-none" 
              :class="[
                isCurrentAppArchived ? 'opacity-50 cursor-not-allowed border-slate-200 dark:border-slate-700 dark:bg-slate-800/40' : 'cursor-pointer',
                restoreMode === 'in-place' ? 'border-red-500 ring-1 ring-red-500 dark:bg-red-900/10' : 'border-slate-300 dark:border-slate-600 dark:bg-slate-800'
              ]"
            >
              <input type="radio" v-model="restoreMode" value="in-place" :disabled="isCurrentAppArchived" class="sr-only">
              <span class="flex flex-1">
                <span class="flex flex-col">
                  <span class="block text-sm font-medium text-red-600 dark:text-red-400 mb-1 flex items-center gap-1">
                    Restauration en Place 
                    <span v-if="!isCurrentAppArchived" class="px-1.5 py-0.5 rounded text-[10px] bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300">DANGER</span>
                    <span v-else class="px-1.5 py-0.5 rounded text-[10px] bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300">INDISPONIBLE</span>
                  </span>
                  <span v-if="!isCurrentAppArchived" class="mt-1 flex items-center text-xs text-slate-500 dark:text-slate-400">Arrête l'application et remplace directement les données de production. L'ancien dossier sera renommé en .bak.</span>
                  <span v-else class="mt-1 flex items-center text-xs text-amber-600 dark:text-amber-400">L'application a été supprimée du serveur Docker. Utilisez la restauration parallèle pour récupérer ses fichiers.</span>
                </span>
              </span>
              <svg v-if="!isCurrentAppArchived" class="h-5 w-5 text-red-600" :class="restoreMode === 'in-place' ? 'block' : 'hidden'" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
              </svg>
            </label>
          </div>

          <!-- Options Staging -->
          <div v-if="restoreMode === 'staging'" class="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nom du dossier parallèle à créer</label>
            <input v-model="restoreCustomName" type="text" class="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white text-sm" />
          </div>

          <!-- Options In-Place -->
          <div v-if="restoreMode === 'in-place'" class="bg-red-50 dark:bg-red-900/10 p-4 rounded-lg border border-red-200 dark:border-red-800 space-y-3">
            <div class="flex items-start gap-3">
              <svg class="w-5 h-5 text-red-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
              <div class="text-sm text-red-800 dark:text-red-200">
                <p class="font-bold mb-1">Attention, action destructrice !</p>
                <p>Vos conteneurs de production vont être arrêtés, vos données seront déplacées dans un dossier de sauvegarde <code>.bak</code>, puis remplacées par cette sauvegarde.</p>
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Veuillez taper le nom <strong class="text-slate-900 dark:text-white">{{ explorerApp }}</strong> pour confirmer :</label>
              <input v-model="restoreConfirmAppName" type="text" :placeholder="explorerApp" class="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 dark:text-white text-sm" />
            </div>
          </div>
        </div>

        <div class="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700 flex justify-end space-x-3">
          <button @click="showRestoreModal = false" class="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600 dark:hover:bg-slate-600 transition-colors">
            Annuler
          </button>
          <button @click="executeRestore" :disabled="(restoreMode === 'in-place' && restoreConfirmAppName !== explorerApp) || (restoreMode === 'staging' && !restoreCustomName)" :class="[restoreMode === 'in-place' ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500' : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500', 'px-4 py-2 text-sm font-medium text-white border border-transparent rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed']">
            Lancer la Restauration
          </button>
        </div>
      </div>
    </div>
  </div>
  
  <!-- Modal Import -->
  <div v-if="showImportModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
    <div class="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md overflow-hidden">
      <div class="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
        <h3 class="text-lg font-bold text-slate-900 dark:text-white flex items-center">
          <span class="mr-2">📦</span> Restaurer une archive
        </h3>
      </div>
      <div class="p-4 space-y-4">
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Fichier archive (.tar.gz)</label>
          <input type="file" accept=".tar.gz" @change="handleImportFileChange" class="w-full text-sm text-slate-500 dark:text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 dark:file:bg-slate-700 dark:file:text-slate-200 hover:file:bg-blue-100 transition-all" />
        </div>
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Chemin de destination complet sur le serveur</label>
          <input type="text" v-model="importTargetPath" placeholder="Ex: /home/user/Applications/mon_app" class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md p-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <p class="text-xs text-slate-500 mt-1">Le dossier cible sera créé s'il n'existe pas. L'archive y sera extraite.</p>
        </div>
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nom du projet / dossier final (Optionnel)</label>
          <input type="text" v-model="importCustomName" placeholder="Ex: mon-application-restauree" class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md p-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" :disabled="importLoading" />
          <p class="text-xs text-slate-500 mt-1">Laissez vide pour conserver le nom original de l'archive.</p>
        </div>

        <div v-if="importLoading" class="mt-4 p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-100 dark:border-blue-800">
          <div class="flex justify-between items-center mb-2">
            <span class="text-xs font-semibold text-blue-700 dark:text-blue-300">{{ importStatus }}</span>
            <span class="text-xs font-bold text-blue-700 dark:text-blue-300">{{ uploadProgress }}%</span>
          </div>
          <div class="w-full bg-blue-200 dark:bg-blue-900 rounded-full h-2">
            <div class="bg-blue-600 h-2 rounded-full transition-all duration-300" :style="{ width: uploadProgress + '%' }"></div>
          </div>
        </div>
      </div>
      <div class="p-4 bg-slate-50 dark:bg-slate-800/50 flex justify-end space-x-2 border-t border-slate-200 dark:border-slate-700">
        <button @click="showImportModal = false" :disabled="importLoading" class="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors disabled:opacity-50">
          Annuler
        </button>
        <button @click="submitImportArchive" :disabled="importLoading || !importFile || !importTargetPath" class="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors disabled:opacity-50 flex items-center">
          <svg v-if="importLoading" class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
          Restaurer
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
