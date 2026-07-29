<script setup>
import { ref, onMounted, watch } from 'vue';

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
      applications.value = await res.json();
    }
  } catch (e) {
    console.error(e);
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

const openForm = (job = null) => {
  if (job) {
    editingId.value = job.id;
    form.value = {
      ...job,
      containers: JSON.parse(job.containers || '[]')
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

const toggleJob = async (job) => {
  try {
    await fetch(`${API_BASE}/backups/${job.id}`, {
      method: 'PUT',
      ...getFetchOptions(),
      body: JSON.stringify({ ...job, enabled: job.enabled ? 0 : 1 })
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

onMounted(() => {
  fetchApplications();
  fetchJobs();
  fetchLogs();
});

const formatDate = (dateStr) => {
  if (!dateStr) return 'Jamais';
  return new Date(dateStr).toLocaleString('fr-FR');
};
</script>

<template>
  <div class="p-4 space-y-6">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
      <h2 class="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center">
        <span class="mr-2">💾</span> Orchestrateur de Sauvegardes
      </h2>
      <div class="flex bg-white dark:bg-slate-800 p-1 rounded-lg border border-slate-300 dark:border-slate-700 w-full sm:w-auto">
        <button 
          @click="activeTab = 'jobs'; fetchJobs()" 
          :class="activeTab === 'jobs' ? 'bg-slate-800 text-white dark:bg-slate-700 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'"
          class="flex-1 sm:flex-none px-4 py-1.5 rounded-md text-sm font-medium transition-all"
        >
          Jobs de Sauvegarde
        </button>
        <button 
          @click="activeTab = 'logs'; fetchLogs()" 
          :class="activeTab === 'logs' ? 'bg-slate-800 text-white dark:bg-slate-700 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'"
          class="flex-1 sm:flex-none px-4 py-1.5 rounded-md text-sm font-medium transition-all"
        >
          Historique (Logs)
        </button>
      </div>
    </div>

    <!-- VUE DES JOBS -->
    <div v-if="activeTab === 'jobs'">
      <div class="flex justify-end mb-4">
        <button @click="openForm()" class="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold shadow-lg shadow-blue-900/50 transition-all active:scale-95">
          + Nouvelle Sauvegarde
        </button>
      </div>

      <!-- Formulaire Ajout/Modif -->
      <transition name="fade">
        <div v-if="showForm" class="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 mb-8 shadow-xl">
          <h3 class="text-xl font-bold text-slate-900 dark:text-slate-100 mb-6 flex items-center">
            <span class="mr-2">⚙️</span> {{ editingId ? 'Modifier la sauvegarde' : 'Configurer une Sauvegarde' }}
          </h3>
          <form @submit.prevent="saveJob" class="space-y-6">
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label class="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Nom de la sauvegarde</label>
                <input v-model="form.name" required placeholder="Ex: Apps Principales" type="text" class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all" />
              </div>
              <div class="md:col-span-2">
                <label class="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Fréquence d'exécution</label>
                <div class="flex flex-col space-y-4">
                  <div class="flex items-center space-x-2 bg-slate-100 dark:bg-slate-900 p-1 rounded-lg w-max">
                    <button type="button" @click="cronMode = 'simple'" :class="cronMode === 'simple' ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'" class="px-4 py-1.5 text-sm font-medium rounded-md transition-all">Interface Simple</button>
                    <button type="button" @click="cronMode = 'advanced'" :class="cronMode === 'advanced' ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'" class="px-4 py-1.5 text-sm font-medium rounded-md transition-all">Mode Avancé (CRON)</button>
                  </div>

                  <div v-if="cronMode === 'simple'" class="space-y-5 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Heure d'exécution</label>
                        <input type="time" v-model="cronTime" class="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg p-2.5 text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:ring-1 focus:outline-none" />
                      </div>
                      <div>
                        <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Jours d'exécution</label>
                        <div class="flex flex-wrap gap-2">
                          <button type="button" @click="cronDays = []" class="px-3 py-1.5 rounded-lg border text-sm transition-colors font-medium" :class="cronDays.length === 0 ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'">
                            Tous les jours
                          </button>
                          <button type="button" v-for="day in [{v:1,l:'Lun'},{v:2,l:'Mar'},{v:3,l:'Mer'},{v:4,l:'Jeu'},{v:5,l:'Ven'},{v:6,l:'Sam'},{v:0,l:'Dim'}]" :key="day.v" 
                                @click="toggleDay(day.v)"
                                class="cursor-pointer select-none px-3 py-1.5 rounded-lg border text-sm transition-colors font-medium"
                                :class="cronDays.length > 0 && cronDays.includes(day.v) ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-400 dark:border-emerald-700 shadow-sm' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'">
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
                      <input v-model="form.cron_schedule" required type="text" placeholder="0 3 * * 0" class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-slate-900 dark:text-slate-100 font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all" />
                      <span class="absolute right-3 top-3 text-slate-500 text-xs">Ex: 0 3 * * 0</span>
                    </div>
                    <p class="text-xs text-slate-500 dark:text-slate-400 mt-2">Permet d'utiliser des formats complexes (ex: tous les 1er du mois).</p>
                  </div>
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Dossier Racine (Cible)</label>
                <input v-model="form.dest_path" required placeholder="/mnt/Backup_serveur/sauvegardes" type="text" class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all" />
                <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-2">Un sous-dossier sera créé automatiquement pour chaque application.</p>
              </div>
              
              <div>
                <label class="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Rétention (Nombre de backups à conserver)</label>
                <input v-model="form.retention_count" required type="number" min="1" class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all" />
              </div>
            </div>

            <!-- Sélection des applications -->
            <div class="pt-4 border-t border-slate-200 dark:border-slate-700">
              <label class="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Applications à sauvegarder</label>
              <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div 
                  v-for="app in applications" 
                  :key="app.name"
                  @click="toggleAppSelection(app.name)"
                  class="cursor-pointer border rounded-xl p-3 flex flex-col items-center justify-center text-center transition-all duration-200"
                  :class="form.containers.includes(app.name) ? 'bg-blue-600/20 border-blue-500 text-white' : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'"
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

            <div class="flex justify-end space-x-3 pt-6 border-t border-slate-200 dark:border-slate-700">
              <button type="button" @click="showForm = false" class="px-6 py-2.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 rounded-xl text-sm font-medium transition-colors">Annuler</button>
              <button type="submit" class="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-900/50 transition-all">Sauvegarder ce Job</button>
            </div>
          </form>
        </div>
      </transition>

      <!-- Liste des Jobs -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div v-for="job in jobs" :key="job.id" class="bg-white dark:bg-slate-800/80 backdrop-blur rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-xl relative overflow-hidden transition-all hover:border-slate-600">
          <!-- Indicateur on/off -->
          <div class="absolute top-0 right-0 w-1.5 h-full transition-colors" :class="job.enabled ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-slate-300 dark:bg-slate-600'"></div>
          
          <div class="flex justify-between items-start mb-4">
            <div>
              <h3 class="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center">
                {{ job.name }}
              </h3>
            </div>
            <span class="text-xs font-mono bg-slate-50 dark:bg-slate-900 px-3 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 flex items-center shadow-inner">
              <span class="mr-1">⏱️</span> {{ job.cron_schedule }}
            </span>
          </div>
          
          <div class="text-sm text-slate-500 dark:text-slate-400 space-y-3 mb-6 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700/50">
            <div class="flex items-center">
              <span class="w-24 text-slate-500 text-xs uppercase tracking-wider">Cible</span>
              <span class="text-slate-800 dark:text-slate-200 font-mono text-xs">{{ job.dest_path }}</span>
            </div>
            <div class="flex items-start">
              <span class="w-24 text-slate-500 text-xs uppercase tracking-wider mt-0.5">Applications</span>
              <div class="flex flex-wrap gap-1 flex-1">
                <span v-for="app in JSON.parse(job.containers || '[]')" :key="app" class="px-2 py-0.5 bg-blue-900/30 text-blue-300 border border-blue-800/50 rounded text-xs">
                  {{ app }}
                </span>
                <span v-if="!job.containers || JSON.parse(job.containers).length === 0" class="text-slate-500 italic">Aucune</span>
              </div>
            </div>
            <div class="flex items-center">
              <span class="w-24 text-slate-500 text-xs uppercase tracking-wider">Rétention</span>
              <span class="text-slate-600 dark:text-slate-300">{{ job.retention_count }} backups</span>
            </div>
          </div>
          
          <div class="flex justify-between items-center">
            <div class="flex space-x-2">
              <button @click="triggerJob(job.id)" class="text-xs text-blue-100 hover:text-white font-medium bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg transition-colors shadow-lg shadow-blue-900/30">
                ▶️ Lancer
              </button>
              <button @click="openForm(job)" class="text-xs text-slate-600 dark:text-slate-300 hover:text-white bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 px-4 py-2 rounded-lg transition-colors">
                ✏️ Éditer
              </button>
              <button @click="deleteJob(job.id)" class="text-xs text-red-400 hover:text-red-300 bg-red-900/20 hover:bg-red-900/40 px-3 py-2 rounded-lg transition-colors border border-transparent hover:border-red-900/50">
                🗑️
              </button>
            </div>
            <button @click="toggleJob(job)" class="text-sm font-bold flex items-center px-3 py-1.5 rounded-lg transition-colors" :class="job.enabled ? 'text-emerald-400 bg-emerald-900/20 hover:bg-emerald-900/40' : 'text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700'">
              <span class="mr-1.5 text-lg">{{ job.enabled ? '🟢' : '⚪' }}</span>
              {{ job.enabled ? 'Actif' : 'Inactif' }}
            </button>
          </div>
        </div>
        
        <div v-if="jobs.length === 0" class="col-span-1 lg:col-span-2 text-center py-16 text-slate-500 bg-white dark:bg-slate-800/30 rounded-2xl border-2 border-slate-200 dark:border-slate-700 border-dashed">
          <div class="text-4xl mb-4">📭</div>
          <p class="text-lg font-medium text-slate-500 dark:text-slate-400">Aucun Job de sauvegarde configuré.</p>
          <p class="text-sm mt-2">Cliquez sur "+ Nouvelle Sauvegarde" pour commencer.</p>
        </div>
      </div>
    </div>

    <!-- VUE DES LOGS -->
    <div v-if="activeTab === 'logs'" class="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-xl">
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm text-slate-600 dark:text-slate-300">
          <thead class="bg-slate-50 dark:bg-slate-900/80 text-xs uppercase text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 backdrop-blur">
            <tr>
              <th class="px-6 py-4 font-semibold tracking-wider">Date</th>
              <th class="px-6 py-4 font-semibold tracking-wider">Job</th>
              <th class="px-6 py-4 font-semibold tracking-wider">Statut</th>
              <th class="px-6 py-4 font-semibold tracking-wider">Détails</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200 dark:divide-slate-700/50">
            <tr v-for="log in logs" :key="log.id" class="hover:bg-slate-200 dark:hover:bg-slate-700/20 transition-colors">
              <td class="px-6 py-4 whitespace-nowrap text-slate-500 dark:text-slate-400">{{ formatDate(log.created_at) }}</td>
              <td class="px-6 py-4 font-medium text-slate-800 dark:text-slate-200">{{ log.job_name || 'Job Supprimé' }}</td>
              <td class="px-6 py-4">
                <span v-if="log.status === 'SUCCESS'" class="inline-flex items-center px-2.5 py-1 bg-emerald-900/30 text-emerald-400 rounded-full text-xs font-medium border border-emerald-800/50">
                  <span class="w-1.5 h-1.5 bg-emerald-400 rounded-full mr-1.5"></span> Succès
                </span>
                <span v-else-if="log.status === 'FAILED'" class="inline-flex items-center px-2.5 py-1 bg-red-900/30 text-red-400 rounded-full text-xs font-medium border border-red-800/50">
                  <span class="w-1.5 h-1.5 bg-red-400 rounded-full mr-1.5"></span> Échec
                </span>
                <span v-else class="inline-flex items-center px-2.5 py-1 bg-blue-900/30 text-blue-400 rounded-full text-xs font-medium border border-blue-800/50">
                  <span class="w-1.5 h-1.5 bg-blue-400 rounded-full mr-1.5 animate-pulse"></span> En cours
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
