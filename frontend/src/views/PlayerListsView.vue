<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { 
  ArrowLeft, 
  Play, 
  Clock, 
  Folder, 
  Film, 
  Music, 
  Image as ImageIcon, 
  File, 
  ListMusic,
  Sparkles,
  Trash2,
  Search,
  CheckSquare,
  Square,
  X,
  RefreshCw
} from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import api from '@/api/api';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

const listType = ref(route.params.type as string);
const items = ref<any[]>([]);
const loading = ref(true);
const playlistData = ref<any>(null);
const searchQuery = ref('');

// Selection State
const selectedIds = ref<Set<string>>(new Set());
const isMultiSelectMode = ref(false);
const focusedItemId = ref<string | null>(null);

// Preview State
const activePreviewId = ref<string | null>(null);
let previewTimeout: any = null;

const startPreview = (id: string) => {
  if (previewTimeout) clearTimeout(previewTimeout);
  if (activePreviewId.value === id) return;
  previewTimeout = setTimeout(() => {
    activePreviewId.value = id;
  }, 500);
};

const stopPreview = () => {
  if (previewTimeout) clearTimeout(previewTimeout);
  activePreviewId.value = null;
};

const filteredItems = computed(() => {
  if (!searchQuery.value) return items.value;
  const q = searchQuery.value.toLowerCase();
  return items.value.filter(item => 
    (item.originalName || item.name || '').toLowerCase().includes(q)
  );
});

const fetchList = async () => {
  loading.value = true;
  items.value = [];
  playlistData.value = null;
  selectedIds.value.clear();
  try {
    if (listType.value === 'recent') {
      const response = await api.get('/files?sortBy=recent&limit=100');
      const allItems = response.data.items || (Array.isArray(response.data) ? response.data : []);
      items.value = allItems.filter((i: any) => 
        !i.isFolder && (
          i.mimeType?.startsWith('video') || 
          i.mimeType?.startsWith('audio') || 
          i.mimeType?.startsWith('image')
        )
      ).slice(0, 50);
    } else if (listType.value === 'continue') {
      const { data } = await api.get('/player/progress');
      items.value = data.map((p: any) => ({
        ...p.mediaId,
        _progress: p.currentTime
      })).filter((i: any) => i && i._id);
    } else if (listType.value === 'playlists') {
      const { data } = await api.get('/player/playlists');
      items.value = Array.isArray(data) ? data : [];
    } else if (listType.value.startsWith('playlist:')) {
      const playlistId = listType.value.split(':')[1];
      const [{ data: playlist }, { data: playlistItems }] = await Promise.all([
        api.get(`/player/playlists/${playlistId}`),
        api.get(`/player/playlists/${playlistId}/items`)
      ]);
      playlistData.value = playlist;
      items.value = Array.isArray(playlistItems) ? playlistItems : [];
    }
  } catch (err) {
    console.error('Failed to load list', err);
  } finally {
    loading.value = false;
  }
};

const createPlaylist = async () => {
  const name = prompt('Enter playlist name:');
  if (!name) return;
  try {
    await api.post('/player/playlists', { name });
    fetchList();
  } catch (err) {
    alert('Failed to create playlist');
  }
};

const deletePlaylist = async (id: string, event: Event) => {
  event.stopPropagation();
  if (!confirm('Are you sure you want to delete this playlist?')) return;
  try {
    await api.delete(`/player/playlists/${id}`);
    fetchList();
  } catch (err) {
    alert('Failed to delete playlist');
  }
};

const deleteProgress = async (mediaId: string, event: Event) => {
  event.stopPropagation();
  try {
    await api.delete(`/player/progress/${mediaId}`);
    items.value = items.value.filter(i => i._id !== mediaId);
  } catch (err) {
    console.error('Failed to delete progress', err);
  }
};

const deleteSelectedItems = async () => {
  if (selectedIds.value.size === 0) return;
  if (!confirm(`Delete ${selectedIds.value.size} items from disk?`)) return;
  
  try {
    loading.value = true;
    await api.delete('/files', { data: Array.from(selectedIds.value) });
    selectedIds.value.clear();
    isMultiSelectMode.value = false;
    await fetchList();
  } catch (err) {
    console.error('Failed to delete items', err);
  } finally {
    loading.value = false;
  }
};

const toggleSelect = (id: string) => {
  if (selectedIds.value.has(id)) {
    selectedIds.value.delete(id);
  } else {
    selectedIds.value.add(id);
  }
};

const handleItemClick = (item: any) => {
  if (isMultiSelectMode.value) {
    toggleSelect(item._id);
    return;
  }
  
  focusedItemId.value = item._id;

  if (listType.value === 'playlists') {
    router.push({ name: 'player-lists', params: { type: `playlist:${item._id}` } });
  } else {
    if (item.isFolder) {
      router.push({ name: 'files', query: { parentId: item._id } });
    } else {
      router.push({ name: 'player', params: { id: item._id } });
    }
  }
};

onMounted(fetchList);
watch(() => route.params.type, (newType) => {
  if (newType) {
    listType.value = newType as string;
    fetchList();
  }
});

const getIcon = (item: any) => {
  if (listType.value === 'playlists') {
    return item.isSmartPlaylist ? Sparkles : ListMusic;
  }
  if (item.isFolder) return Folder;
  if (item.mimeType?.startsWith('video')) return Film;
  if (item.mimeType?.startsWith('audio')) return Music;
  if (item.mimeType?.startsWith('image')) return ImageIcon;
  return File;
};

const formatSize = (bytes: number) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatTime = (seconds: number) => {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const getTitle = () => {
  if (listType.value === 'recent') return t('player.recent') || 'Recently Added';
  if (listType.value === 'continue') return t('player.continue') || 'Continue Watching';
  if (listType.value === 'playlists') return t('player.playlists') || 'Playlists';
  if (playlistData.value) return playlistData.value.name;
  return 'List';
};
</script>

<template>
  <div class="min-h-screen p-4 sm:p-8 flex flex-col gap-6">
    <!-- Header / Toolbar -->
    <header class="flex flex-col gap-4">
      <div class="flex flex-wrap items-center justify-between aero-card px-6 py-4 gap-4">
        <div class="flex items-center gap-4">
          <button @click="router.back()" class="p-2 hover:bg-white/10 rounded-full transition-all">
            <ArrowLeft :size="24" />
          </button>
          <h1 class="text-2xl font-light tracking-wide uppercase neon-text">
            {{ getTitle() }}
          </h1>
          <span v-if="filteredItems.length > 0" class="text-xs font-mono text-white/30 ml-2">
            {{ filteredItems.length }} ITEMS
          </span>
        </div>

        <!-- Search & Actions -->
        <div class="flex items-center gap-3 flex-1 justify-end min-w-[300px]">
          <div class="relative flex-1 max-w-md group">
            <Search class="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-blue-400 transition-colors" :size="18" />
            <input 
              v-model="searchQuery"
              type="text" 
              :placeholder="t('files.search_placeholder') || 'Search files...'"
              class="w-full bg-white/5 border border-white/5 rounded-2xl py-3 pl-12 pr-4 text-sm font-light focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:bg-white/10 transition-all"
            />
            <button v-if="searchQuery" @click="searchQuery = ''" class="absolute right-4 top-1/2 -translate-y-1/2 text-white/20 hover:text-white transition-colors">
              <X :size="16" />
            </button>
          </div>

          <div class="flex items-center gap-2">
             <button @click="fetchList" class="p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-all" :title="t('files.refresh')">
              <RefreshCw :size="20" :class="{ 'animate-spin': loading }" />
            </button>

            <button 
              v-if="listType !== 'playlists'"
              @click="isMultiSelectMode = !isMultiSelectMode; selectedIds.clear()" 
              class="p-3 rounded-2xl transition-all flex items-center gap-2"
              :class="isMultiSelectMode ? 'bg-blue-500 text-white shadow-glow' : 'bg-white/5 hover:bg-white/10'"
            >
              <CheckSquare :size="20" />
            </button>

            <button v-if="listType === 'playlists'" @click="createPlaylist" class="px-4 py-3 bg-blue-600 hover:bg-blue-500 rounded-2xl flex items-center gap-2 font-medium transition-all shadow-lg shadow-blue-500/20 active:scale-95">
              <ListMusic :size="18" />
              <span class="hidden sm:inline">{{ t('player.create_playlist') || 'Create' }}</span>
            </button>

            <button 
              v-if="isMultiSelectMode && selectedIds.size > 0"
              @click="deleteSelectedItems"
              class="p-3 bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white rounded-2xl transition-all flex items-center gap-2"
            >
              <Trash2 :size="20" />
              <span class="text-xs font-bold">{{ selectedIds.size }}</span>
            </button>
          </div>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="flex-1">
      <div v-if="loading" class="h-64 flex items-center justify-center">
        <div class="w-12 h-12 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
      </div>
      
      <div v-else-if="filteredItems.length === 0" class="h-64 flex flex-col items-center justify-center text-gray-500 gap-4">
        <Folder :size="64" stroke-width="1" class="opacity-20" />
        <p class="text-lg font-light tracking-widest uppercase">No items found</p>
      </div>

      <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-6">
        <div 
          v-for="item in filteredItems" 
          :key="item._id"
          @click="handleItemClick(item)"
          @mouseenter="startPreview(item._id)"
          @mouseleave="stopPreview"
          class="group relative cursor-pointer"
        >
          <div 
            class="aero-card p-3 flex flex-col h-full transition-all duration-300 hover:scale-105 active:scale-95 overflow-hidden"
            :class="{
              'ring-2 ring-blue-500 bg-blue-500/10 shadow-glow': focusedItemId === item._id && !isMultiSelectMode,
              'opacity-60 grayscale-[0.5]': isMultiSelectMode && !selectedIds.has(item._id),
              'ring-2 ring-blue-400 bg-blue-400/20': isMultiSelectMode && selectedIds.has(item._id)
            }"
          >
            <!-- Thumbnail Wrapper -->
            <div class="aspect-video bg-white/5 rounded-xl flex items-center justify-center mb-3 relative overflow-hidden shadow-inner shrink-0">
              <template v-if="item.metadata?.thumbnailPath">
                <img 
                  :src="`/api/files/${item._id}/thumbnail`" 
                  class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" 
                />
                <transition name="fade">
                  <img 
                    v-if="activePreviewId === item._id && (item.mimeType?.startsWith('video') || item.mimeType === 'image/gif')"
                    :src="`/api/files/${item._id}/preview`" 
                    class="absolute inset-0 w-full h-full object-cover z-10" 
                  />
                </transition>
              </template>
              <template v-else>
                <component :is="getIcon(item)" :size="42" class="text-blue-400/40 transition-transform duration-500 group-hover:scale-110" />
              </template>
              
              <!-- Multi-select Checkbox -->
              <div v-if="isMultiSelectMode" class="absolute top-2 right-2 z-10">
                <div v-if="selectedIds.has(item._id)" class="bg-blue-500 rounded-full p-1 shadow-glow animate-pulse-subtle">
                  <CheckSquare :size="14" />
                </div>
                <div v-else class="bg-black/40 backdrop-blur-md rounded-full p-1 text-white/40">
                  <Square :size="14" />
                </div>
              </div>

              <!-- Progress Overlay -->
              <div v-if="item._progress" class="absolute bottom-0 left-0 w-full h-1 bg-black/60">
                <div class="h-full bg-blue-500 shadow-glow" :style="{ width: item.metadata?.duration ? `${(item._progress / item.metadata.duration) * 100}%` : '50%' }"></div>
              </div>

              <!-- Quick Actions Overlay -->
              <div class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-3 transition-opacity">
                 <button 
                  v-if="listType === 'playlists' && !item.isSystem" 
                  @click.stop="deletePlaylist(item._id, $event)" 
                  class="p-2 bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white rounded-lg transition-all"
                >
                   <Trash2 :size="18" />
                 </button>
                 <button 
                  v-else-if="listType === 'continue'" 
                  @click.stop="deleteProgress(item._id, $event)" 
                  class="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-all"
                  :title="t('player.clear_progress') || 'Clear progress'"
                >
                   <X :size="18" />
                 </button>
                 <Play v-else :size="32" class="text-white fill-white ml-1 drop-shadow-lg" />
              </div>
            </div>

            <!-- Meta -->
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium truncate group-hover:text-blue-300 transition-colors" :title="item.originalName || item.name">
                {{ item.originalName || item.name }}
              </p>
              <div class="flex items-center justify-between mt-1 text-[10px] text-white/30 uppercase tracking-widest font-bold">
                <span v-if="listType === 'playlists'">{{ item.mediaItems?.length || 0 }} ITEMS</span>
                <span v-else>{{ formatSize(item.size) }}</span>
                
                <template v-if="item._progress">
                  <span class="flex items-center gap-1 font-mono text-blue-400/60"><Clock :size="10" /> {{ formatTime(item._progress) }}</span>
                </template>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.shadow-glow {
  box-shadow: 0 0 15px rgba(59, 130, 246, 0.5);
}

.aero-card {
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 1.5rem;
}

@keyframes pulse-subtle {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.8; transform: scale(1.05); }
}
.animate-pulse-subtle {
  animation: pulse-subtle 2s ease-in-out infinite;
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
