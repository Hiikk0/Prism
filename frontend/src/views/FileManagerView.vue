<script setup lang="ts">
import { ref, onMounted, computed, watch, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import api from '@/api/api';
import { 
  ArrowLeft, 
  Grid, 
  List, 
  Upload, 
  FileText, 
  Video, 
  Music, 
  Image as ImageIcon,
  Trash2,
  Search,
  FolderPlus,
  Folder,
  X,
  CheckSquare,
  Square,
  Info,
  Tag,
  ChevronRight,
  Move,
  Type,
  RefreshCw,
  ListMusic
} from 'lucide-vue-next';
import { useAuthStore } from '@/stores/auth';
import FolderPickerModal from '@/components/common/FolderPickerModal.vue';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const isAdmin = computed(() => authStore.user?.role === 'admin');

// State
const items = ref<any[]>([]);
const totalItems = ref(0);
const loading = ref(true);
const viewMode = ref<'grid' | 'list'>('grid');
const searchQuery = ref('');
const currentFolderId = ref<string | null>(null);
const breadcrumbs = ref<{ id: string | null, name: string }[]>([]);
const selectedIds = ref<Set<string>>(new Set());
const isMultiSelectMode = ref(false);
const showInfoPanel = ref(false);
const focusedItemId = ref<string | null>(null);
const showFolderPicker = ref(false);
const folderPickerTitle = ref('');
const fileInput = ref<HTMLInputElement | null>(null);
const isScanning = ref(false);
let eventSource: EventSource | null = null;

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

// MIME type filter from route
const filterType = computed(() => route.query.type as string || 'all');

// Watch for focus changes
watch(focusedItemId, (newId) => {
  if (newId) startPreview(newId);
  else stopPreview();
});

// Virtual Scrolling State
const scrollContainer = ref<HTMLElement | null>(null);
const scrollTop = ref(0);
const containerHeight = ref(0);
const itemWidth = ref(200); // Base estimate for grid
const itemHeight = ref(220); // Base estimate for grid
const columns = ref(4);
const chunkSize = ref(50); // Fetch 50 items at once

const updateDimensions = () => {
  if (!scrollContainer.value) return;
  const width = scrollContainer.value.clientWidth;
  containerHeight.value = scrollContainer.value.clientHeight;
  
  if (viewMode.value === 'grid') {
    // Sync with Tailwind grid cols
    if (width >= 1280) columns.value = 8;
    else if (width >= 1024) columns.value = 6;
    else if (width >= 768) columns.value = 4;
    else if (width >= 640) columns.value = 3;
    else columns.value = 2;
    
    itemWidth.value = (width - ((columns.value + 1) * 32)) / columns.value; // px
    itemHeight.value = 280; // Fixed row height for grid (including gap)
  } else {
    columns.value = 1;
    itemHeight.value = 88; // Fixed row height for list (including gap)
  }
  
  // After resizing dimensions, we might have new visible area to fetch
  checkAndFetchMissing();
};

const totalRows = computed(() => Math.ceil(totalItems.value / columns.value));
const virtualHeight = computed(() => totalRows.value * itemHeight.value);

const visibleIndices = computed(() => {
  const startRow = Math.floor(scrollTop.value / itemHeight.value);
  const visibleRows = Math.ceil(containerHeight.value / itemHeight.value) + 10; // Buffer
  const startIdx = startRow * columns.value;
  const endIdx = Math.min(totalItems.value, (startRow + visibleRows) * columns.value);
  return { start: startIdx, end: endIdx, startRow };
});

const visibleItems = computed(() => {
  const { start, end } = visibleIndices.value;
  return Array.from({ length: end - start }, (_, i) => {
    const itemIndex = start + i;
    return {
      index: itemIndex,
      data: items.value[itemIndex] || null,
      top: Math.floor(itemIndex / columns.value) * itemHeight.value,
      left: 32 + (itemIndex % columns.value) * (itemWidth.value + 32)
    };
  });
});

const onScroll = (e: Event) => {
  const target = e.target as HTMLElement;
  scrollTop.value = target.scrollTop;
  checkAndFetchMissing();
};

const checkAndFetchMissing = async () => {
  const { start, end } = visibleIndices.value;
  
  // Find chunks to fetch
  for (let i = start; i < end; i += chunkSize.value) {
    const chunkStart = Math.floor(i / chunkSize.value) * chunkSize.value;
    if (!items.value[chunkStart] && !loading.value) {
      await fetchChunk(chunkStart);
    }
  }
};

const fetchChunk = async (skip: number) => {
  try {
    const params: any = {
      parentId: currentFolderId.value || 'root',
      skip,
      limit: chunkSize.value
    };
    if (filterType.value !== 'all') params.type = filterType.value;
    if (searchQuery.value) params.search = searchQuery.value;
    
    const { data } = await api.get('/files', { params });
    
    // Fill the items array at the correct position
    data.items.forEach((item: any, idx: number) => {
      items.value[skip + idx] = item;
    });
    
    if (data.total !== undefined) {
      totalItems.value = data.total;
    }
  } catch (err) {
    console.error('Failed to fetch chunk:', err);
  }
};

const fetchItems = async () => {
  loading.value = true;
  items.value = []; // Clear for new folder/query
  totalItems.value = 0;
  scrollTop.value = 0;
  if (scrollContainer.value) scrollContainer.value.scrollTop = 0;
  
  try {
    await fetchChunk(0);
    if (items.value.length > 0 && !focusedItemId.value) {
      focusedItemId.value = items.value[0]._id;
    }
  } finally {
    loading.value = false;
    updateDimensions();
  }
};

const refreshItems = async () => {
  try {
    // Determine how many items are currently loaded/visible, at least a chunk
    const limit = Math.max(chunkSize.value, items.value.length);
    const params: any = {
      parentId: currentFolderId.value || 'root',
      skip: 0,
      limit: limit
    };
    if (filterType.value !== 'all') params.type = filterType.value;
    if (searchQuery.value) params.search = searchQuery.value;
    
    const { data } = await api.get('/files', { params });
    items.value = data.items;
    
    if (data.total !== undefined) {
      totalItems.value = data.total;
    }
  } catch (err) {
    console.error('Failed to refresh items:', err);
  }
};

const navigateToFolder = (folder: any) => {
  if (!folder.isFolder) return;
  currentFolderId.value = folder._id;
  breadcrumbs.value.push({ id: folder._id, name: folder.originalName });
  selectedIds.value.clear();
  focusedItemId.value = null;
  fetchItems();
};

const goBack = () => {
  if (breadcrumbs.value.length === 0) {
    router.push({ name: 'home' });
    return;
  }
  breadcrumbs.value.pop();
  currentFolderId.value = breadcrumbs.value.length > 0 
    ? breadcrumbs.value[breadcrumbs.value.length - 1].id 
    : null;
  selectedIds.value.clear();
  focusedItemId.value = null;
  fetchItems();
};

const toggleSelect = (id: string) => {
  if (selectedIds.value.has(id)) {
    selectedIds.value.delete(id);
  } else {
    selectedIds.value.add(id);
  }
};

const selectAll = () => {
  if (selectedIds.value.size === items.value.length) {
    selectedIds.value.clear();
  } else {
    items.value.forEach(item => selectedIds.value.add(item._id));
  }
};

// Expose for toolbar
defineExpose({ selectAll });

// Operations
const createFolder = async () => {
  const name = prompt(t('files.enter_folder_name'));
  if (!name) return;
  try {
    await api.post('/files/folders', { 
      name, 
      parentId: currentFolderId.value || 'root' 
    });
    await fetchItems();
  } catch (err) {
    console.error('Failed to create folder:', err);
  }
};

const triggerFileUpload = () => {
  fileInput.value?.click();
};

const handleFileUpload = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  if (!target.files?.length) return;

  const file = target.files[0];
  const formData = new FormData();
  formData.append('file', file);
  
  const parentId = currentFolderId.value || 'root';

  try {
    loading.value = true;
    await api.post(`/files?parentId=${parentId}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    await fetchItems();
  } catch (err) {
    console.error('Upload failed:', err);
  } finally {
    // Reset input
    target.value = '';
  }
};

const moveSelected = async () => {
  const ids = isMultiSelectMode.value ? Array.from(selectedIds.value) : (focusedItemId.value ? [focusedItemId.value] : []);
  if (ids.length === 0) return;
  
  folderPickerTitle.value = `Move ${ids.length} item(s)`;
  showFolderPicker.value = true;
};

const handleFolderSelected = async (targetId: string) => {
  const ids = isMultiSelectMode.value ? Array.from(selectedIds.value) : (focusedItemId.value ? [focusedItemId.value] : []);
  if (ids.length === 0) return;

  try {
    await api.patch('/files/move', { 
      ids, 
      targetParentId: targetId === 'root' ? null : targetId 
    });
    showFolderPicker.value = false;
    selectedIds.value.clear();
    isMultiSelectMode.value = false;
    await fetchItems();
  } catch (err) {
    console.error('Move failed:', err);
  }
};

const deleteSelected = async () => {
  const ids = isMultiSelectMode.value ? Array.from(selectedIds.value) : (focusedItemId.value ? [focusedItemId.value] : []);
  if (ids.length === 0) return;
  
  if (!confirm(t('files.confirm_delete', { count: ids.length }))) return;
  
  try {
    await api.delete('/files', { data: { ids } });
    selectedIds.value.clear();
    isMultiSelectMode.value = false;
    await fetchItems();
  } catch (err) {
    console.error('Delete failed:', err);
  }
};

const renameItem = async (item: any) => {
  const newName = prompt(t('files.rename_item'), item.originalName);
  if (!newName || newName === item.originalName) return;
  try {
    await api.put(`/files/${item._id}`, { originalName: newName });
    await fetchItems();
  } catch (err) {
    console.error('Rename failed:', err);
  }
};

const scanDirectory = async () => {
  if (isScanning.value) return;
  isScanning.value = true;
  try {
    await api.post('/files/scan');
    // We don't wait for the scan to finish as it's async in backend
    // but the backend says "Scan started"
    alert(t('files.scanning'));
    await fetchItems();
  } catch (err) {
    console.error('Scan failed:', err);
  } finally {
    isScanning.value = false;
  }
};

const addToPlaylist = async (mediaIds: string[]) => {
  try {
    const { data: playlists } = await api.get('/player/playlists');
    if (playlists.length === 0) {
      const name = prompt(t('player.no_playlists_found') || 'No playlists found. Enter name for new playlist:');
      if (!name) return;
      const { data: newPlaylist } = await api.post('/player/playlists', { name });
      await api.post(`/player/playlists/${newPlaylist._id}/items`, { mediaIds });
      alert(t('player.playlist_created_added') || 'Playlist created and item added');
      return;
    }
    
    const list = playlists.map((p: any, i: number) => `${i + 1}. ${p.name}`).join('\n');
    const choice = prompt(t('player.select_playlist_prompt', { max: playlists.length, list }) || `Select Playlist (1-${playlists.length}):\n${list}`);
    if (!choice) return;
    
    const idx = parseInt(choice) - 1;
    if (idx >= 0 && idx < playlists.length) {
      await api.post(`/player/playlists/${playlists[idx]._id}/items`, { mediaIds });
      alert(t('player.added_to_playlist') || 'Added to playlist');
    }
  } catch (err) {
    alert(t('player.failed_add_to_playlist') || 'Failed to add to playlist');
  }
};

const updateTags = async (ids: string[], currentTags: string[]) => {
  const newTags = prompt(t('files.tag_edit') + ' (comma separated):', currentTags.join(', '));
  if (newTags === null) return;
  
  const tags = newTags.split(',').map(t => t.trim()).filter(t => t.length > 0);
  try {
    await api.patch('/files/tags', { ids, tags });
    await fetchItems();
  } catch (err) {
    console.error('Tag update failed:', err);
  }
};

// Info Panel Helper
const activeItem = computed(() => {
  return items.value.find(i => i._id === focusedItemId.value) || null;
});

// PS3 Gamepad Mapping
let gamepadState = { lastButtons: new Array(16).fill(false) };
let rafId: number | null = null;

const pollGamepad = () => {
  const gamepads = navigator.getGamepads();
  const gp = gamepads[0];
  if (gp) {
    const { buttons } = gp;
    const isPressed = (idx: number) => buttons[idx]?.pressed && !gamepadState.lastButtons[idx];
    
    // Cross (0) -> Confirm / Open
    if (isPressed(0)) {
      if (activeItem.value) {
        if (isMultiSelectMode.value) toggleSelect(activeItem.value._id);
        else if (activeItem.value.isFolder) navigateToFolder(activeItem.value);
        else router.push({ name: 'player', params: { id: activeItem.value._id } });
      }
    }
    
    // Circle (1) -> Back
    if (isPressed(1)) goBack();
    
    // Square (2) -> Toggle Select Mode
    if (isPressed(2)) isMultiSelectMode.value = !isMultiSelectMode.value;
    
    // Triangle (3) -> Rename (as context action)
    if (isPressed(3) && activeItem.value) renameItem(activeItem.value);
    
    // L1 (4) / R1 (5) -> Quick Scroll
    if (isPressed(4)) { /* Scroll Up fast */ }
    if (isPressed(5)) { /* Scroll Down fast */ }

    // D-Pad
    const currentIndex = items.value.findIndex(i => i._id === focusedItemId.value);
    if (isPressed(12)) { // Up
      const nextIndex = Math.max(0, currentIndex - 1);
      focusedItemId.value = items.value[nextIndex]?._id;
    }
    if (isPressed(13)) { // Down
      const nextIndex = Math.min(items.value.length - 1, currentIndex + 1);
      focusedItemId.value = items.value[nextIndex]?._id;
    }

    gamepadState.lastButtons = buttons.map(b => b.pressed);
  }
  rafId = requestAnimationFrame(pollGamepad);
};

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') goBack();
  if (e.key === 's' || e.key === 'S') isMultiSelectMode.value = !isMultiSelectMode.value;
  if (e.key === 'i' || e.key === 'I') showInfoPanel.value = !showInfoPanel.value;
  if (e.key === 'Enter') {
    if (activeItem.value) {
      if (isMultiSelectMode.value) toggleSelect(activeItem.value._id);
      else if (activeItem.value.isFolder) navigateToFolder(activeItem.value);
      else router.push({ name: 'player', params: { id: activeItem.value._id } });
    }
  }
  
  const currentIndex = items.value.findIndex(i => i._id === focusedItemId.value);
  if (e.key === 'ArrowDown') {
    const nextIndex = Math.min(items.value.length - 1, currentIndex + 1);
    focusedItemId.value = items.value[nextIndex]?._id;
  }
  if (e.key === 'ArrowUp') {
    const nextIndex = Math.max(0, currentIndex - 1);
    focusedItemId.value = items.value[nextIndex]?._id;
  }
};

let resizeObserver: ResizeObserver | null = null;

const setupSSE = () => {
  const baseUrl = import.meta.env.VITE_API_BASE_URL || '/api';
  eventSource = new EventSource(`${baseUrl}/files/events`, { withCredentials: true });

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'fs_change') {
        refreshItems();
      }
    } catch (err) {
      console.error('SSE Error:', err);
    }
  };
  
  eventSource.onerror = () => {
    // Retry transparently is handled by EventSource. 
    // We can just log or silent fail if auth is lost, etc.
  };
};

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('gamepadconnected', () => rafId = requestAnimationFrame(pollGamepad));
  window.addEventListener('gamepaddisconnected', () => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  });
  
  if (scrollContainer.value) {
    resizeObserver = new ResizeObserver(() => {
      updateDimensions();
    });
    resizeObserver.observe(scrollContainer.value);
  }
  
  if (navigator.getGamepads()[0]) rafId = requestAnimationFrame(pollGamepad);
  fetchItems();
  setupSSE();
});

onUnmounted(() => {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  window.removeEventListener('keydown', handleKeydown);
  if (resizeObserver) resizeObserver.disconnect();
  if (rafId) cancelAnimationFrame(rafId);
});

// Watchers
watch([currentFolderId, filterType], fetchItems);

const getFileIcon = (item: any) => {
  if (item.isFolder) return Folder;
  const mime = item.mimeType || '';
  if (mime.startsWith('video')) return Video;
  if (mime.startsWith('audio')) return Music;
  if (mime.startsWith('image')) return ImageIcon;
  return FileText;
};

const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};
</script>

<template>
  <div class="h-screen w-screen overflow-hidden flex bg-transparent text-white font-outfit">
    <!-- Main Content Area -->
    <div class="flex-1 flex flex-col min-w-0 transition-all duration-500 relative">
      
      <!-- Top Toolbar (Aero Style) -->
      <header class="h-20 flex items-center justify-between px-8 bg-white/5 backdrop-blur-xl border-b border-white/10 z-20">
        <div class="flex items-center gap-6">
          <button @click="goBack" class="p-2.5 hover:bg-white/10 rounded-full transition-all group active:scale-90">
            <ArrowLeft :size="24" class="group-hover:-translate-x-1 transition-transform" />
          </button>
          
          <!-- Breadcrumbs -->
          <nav class="flex items-center gap-2 text-sm font-light tracking-wide overflow-hidden">
            <span @click="currentFolderId = null; breadcrumbs = []" class="cursor-pointer hover:text-blue-400 transition-colors opacity-60 uppercase">{{ t('files.root') || 'Storage' }}</span>
            <template v-for="(crumb, idx) in breadcrumbs" :key="crumb.id">
              <ChevronRight :size="14" class="opacity-30" />
              <span @click="currentFolderId = crumb.id; breadcrumbs = breadcrumbs.slice(0, idx + 1)" class="cursor-pointer hover:text-blue-400 transition-colors whitespace-nowrap opacity-60 last:opacity-100 last:font-medium uppercase">
                {{ crumb.name }}
              </span>
            </template>
          </nav>
        </div>

        <div class="flex items-center gap-4">
          <!-- Search -->
          <div class="relative group">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-blue-400 transition-colors" :size="18" />
            <input 
              v-model="searchQuery"
              @input="fetchItems"
              type="text" 
              class="bg-white/5 border border-white/10 rounded-full pl-10 pr-4 py-2 text-sm focus:w-80 w-48 transition-all outline-none focus:ring-2 focus:ring-blue-500/50 backdrop-blur-md"
              :placeholder="t('common.search') || 'Search everything...'"
            />
          </div>

          <div class="h-8 w-px bg-white/10 mx-2"></div>

          <!-- Actions -->
          <div class="flex items-center gap-2">
            <button @click="viewMode = viewMode === 'grid' ? 'list' : 'grid'" class="p-2 hover:bg-white/10 rounded-lg transition-all" :title="t('files.toggle_layout')">
              <component :is="viewMode === 'grid' ? List : Grid" :size="20" />
            </button>
            <button @click="isMultiSelectMode = !isMultiSelectMode" class="p-2 hover:bg-white/10 rounded-lg transition-all" :class="{'bg-blue-500/20 text-blue-400': isMultiSelectMode}" :title="t('files.multi_select')">
              <CheckSquare :size="20" />
            </button>
            <button @click="createFolder" class="p-2 hover:bg-white/10 rounded-lg transition-all" :title="t('files.new_folder')">
              <FolderPlus :size="20" />
            </button>
            <button v-if="isAdmin" @click="scanDirectory" class="p-2 hover:bg-white/10 rounded-lg transition-all" :class="{'animate-spin text-blue-400': isScanning}" :title="t('files.scan_directory')">
              <RefreshCw :size="20" />
            </button>
            <button @click="triggerFileUpload" class="p-2 hover:bg-white/10 rounded-lg transition-all bg-blue-600/20 text-blue-400 border border-blue-500/30" :title="t('files.upload')">
              <Upload :size="20" />
              <input ref="fileInput" type="file" class="hidden" @change="handleFileUpload" />
            </button>
            <button @click="showInfoPanel = !showInfoPanel" class="p-2 hover:bg-white/10 rounded-lg transition-all" :class="{'text-blue-400': showInfoPanel}" :title="t('files.file_info')">
              <Info :size="20" />
            </button>
          </div>
        </div>
      </header>

      <!-- Multi-select Bar (Conditional) -->
      <transition name="toolbar">
        <div v-if="isMultiSelectMode && selectedIds.size > 0" class="absolute top-24 left-1/2 -translate-x-1/2 bg-blue-600/90 backdrop-blur-2xl px-6 py-3 rounded-2xl flex items-center gap-8 shadow-2xl z-30 border border-white/20">
          <span class="text-sm font-bold tracking-widest uppercase">{{ selectedIds.size }} {{ t('files.selected') }}</span>
          <div class="flex items-center gap-4">
            <button @click="moveSelected" class="flex items-center gap-2 hover:bg-white/10 px-3 py-1.5 rounded-lg transition-all text-sm font-medium">
              <Move :size="16" /> {{ t('files.move') }}
            </button>
            <button @click="updateTags(Array.from(selectedIds), [])" class="flex items-center gap-2 hover:bg-white/10 px-3 py-1.5 rounded-lg transition-all text-sm font-medium">
              <Tag :size="16" /> {{ t('files.manage_tags') }}
            </button>
            <button @click="deleteSelected" class="flex items-center gap-2 hover:bg-red-500 px-3 py-1.5 rounded-lg transition-all text-sm font-medium">
              <Trash2 :size="16" /> {{ t('files.delete') }}
            </button>
          </div>
          <button @click="selectedIds.clear(); isMultiSelectMode = false" class="p-1 hover:bg-white/10 rounded-full">
            <X :size="18" />
          </button>
        </div>
      </transition>

      <!-- File Grid/List -->
      <main 
        ref="scrollContainer"
        @scroll="onScroll"
        class="flex-1 overflow-y-auto custom-scrollbar relative px-0"
      >
        <!-- Virtual Container -->
        <div 
          v-if="!loading && totalItems > 0" 
          class="relative w-full"
          :style="{ height: virtualHeight + 'px' }"
        >
          <div 
            v-for="item in visibleItems" 
            :key="item.index"
            class="absolute transition-all duration-300 p-3"
            :style="{ 
              top: item.top + 'px', 
              left: (viewMode === 'grid' ? item.left : 32) + 'px',
              width: viewMode === 'grid' ? itemWidth + 'px' : 'calc(100% - 64px)',
              height: itemHeight + 'px'
            }"
          >
            <!-- Render Real Item or Placeholder -->
            <div 
              v-if="item.data"
              @click="isMultiSelectMode ? toggleSelect(item.data._id) : focusedItemId = item.data._id"
              @dblclick="item.data.isFolder ? navigateToFolder(item.data) : router.push({ name: 'player', params: { id: item.data._id } })"
              @mouseenter="startPreview(item.data._id)"
              @mouseleave="stopPreview"
              class="group relative cursor-pointer h-full"
              :class="{
                'aero-card flex flex-col p-4 transition-all duration-300 hover:scale-105 active:scale-95 overflow-hidden': viewMode === 'grid',
                'aero-card px-6 py-4 flex items-center gap-6 group hover:bg-white/5': viewMode === 'list',
                'ring-2 ring-blue-500 bg-blue-500/10 shadow-[0_0_30px_rgba(59,130,246,0.3)]': focusedItemId === item.data._id && !isMultiSelectMode,
                'opacity-60 grayscale-[0.5]': isMultiSelectMode && !selectedIds.has(item.data._id),
                'ring-2 ring-blue-400 bg-blue-400/20': isMultiSelectMode && selectedIds.has(item.data._id)
              }"
            >
              <!-- Selection Indicator -->
              <div v-if="isMultiSelectMode" class="absolute top-2 right-2 z-10">
                <div v-if="selectedIds.has(item.data._id)" class="bg-blue-500 rounded-full p-1 shadow-glow animate-pulse-subtle">
                  <CheckSquare :size="16" />
                </div>
                <div v-else class="text-white/20">
                  <Square :size="16" />
                </div>
              </div>

              <div :class="{
                'h-32 bg-white/5 rounded-2xl flex items-center justify-center mb-3 transition-all group-hover:bg-white/10 shadow-inner overflow-hidden relative': viewMode === 'grid',
                'w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center shrink-0 overflow-hidden relative': viewMode === 'list'
              }">
                <template v-if="item.data.metadata?.thumbnailPath">
                  <img 
                    :src="`/api/files/${item.data._id}/thumbnail`" 
                    class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" 
                  />
                  <transition name="fade">
                    <div v-if="activePreviewId === item.data._id" class="absolute inset-0 w-full h-full z-10">
                      <video 
                        v-if="item.data.mimeType.startsWith('video')"
                        :src="`/api/files/${item.data._id}/preview`" 
                        autoplay loop muted playsinline
                        class="w-full h-full object-cover" 
                      />
                      <img 
                        v-else-if="item.data.mimeType === 'image/gif'"
                        :src="`/api/files/${item.data._id}/preview`" 
                        class="w-full h-full object-cover" 
                      />
                    </div>
                  </transition>
                </template>
                <component v-else :is="getFileIcon(item.data)" :size="viewMode === 'grid' ? 42 : 24" class="transition-transform duration-500 group-hover:scale-110" :class="item.data.isFolder ? 'text-blue-400' : 'text-white/60'" />
              </div>

              <!-- Meta -->
              <div :class="{ 'flex-1 min-w-0': viewMode === 'list' }">
                <h3 class="text-sm font-medium truncate group-hover:text-blue-300 transition-colors">{{ item.data.originalName }}</h3>
                <div class="flex items-center gap-3 mt-1 opacity-40 text-[10px] tracking-widest uppercase font-bold">
                  <span>{{ item.data.isFolder ? 'Folder' : formatSize(item.data.size) }}</span>
                  <span v-if="viewMode === 'list'">{{ item.data.mimeType }}</span>
                  <div v-if="item.data.tags?.length" class="flex gap-1">
                    <Tag :size="8" /> {{ item.data.tags.length }}
                  </div>
                </div>
              </div>

              <!-- Quick Actions Overlay (Grid only) -->
              <div v-if="viewMode === 'grid' && !isMultiSelectMode" class="absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all rounded-3xl flex items-end justify-center pb-4 gap-2">
                <button @click.stop="renameItem(item.data)" class="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-all" :title="t('files.rename')"><Type :size="16" /></button>
                <button @click.stop="navigateToFolder(item.data)" v-if="item.data.isFolder" class="p-2 bg-blue-500/20 text-blue-400 hover:bg-blue-500 hover:text-white rounded-xl transition-all"><ChevronRight :size="16" /></button>
                <button v-if="!item.data.isFolder" @click.stop="addToPlaylist([item.data._id])" class="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-all" :title="t('player.add_to_playlist') || 'Add to Playlist'"><ListMusic :size="16" /></button>
                <button @click.stop="selectedIds.add(item.data._id); isMultiSelectMode = true" class="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-all"><CheckSquare :size="16" /></button>
              </div>
            </div>

            <!-- Placeholder Wrapper -->
            <div v-else class="aero-card h-[calc(100%-1.5rem)] mb-6 animate-pulse bg-white/5 border-none"></div>
          </div>
        </div>

        <!-- Empty State -->
        <div v-else-if="!loading && totalItems === 0" class="h-full flex flex-col items-center justify-center text-white/20">
          <Folder :size="120" stroke-width="0.5" class="opacity-10 animate-float" />
          <p class="text-2xl font-light tracking-[0.2em] uppercase mt-8">{{ t('files.empty') || 'Zero items found' }}</p>
        </div>

        <!-- Loading -->
        <div v-else class="h-full flex items-center justify-center">
          <div class="relative w-24 h-24">
             <div class="absolute inset-0 border-4 border-blue-500/20 rounded-full"></div>
             <div class="absolute inset-0 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
             <div class="absolute inset-0 flex items-center justify-center text-[10px] uppercase tracking-widest font-bold opacity-40">{{ t('common.loading') }}</div>
          </div>
        </div>
      </main>
    </div>

    <!-- Right Info Panel (Aero glass) -->
    <transition name="info-panel">
      <aside v-if="showInfoPanel" class="w-96 bg-black/40 backdrop-blur-3xl border-l border-white/10 flex flex-col z-30 shadow-2xl relative overflow-hidden">
        
        <!-- Animated Background Ornament -->
        <div class="absolute -top-40 -right-40 w-80 h-80 bg-blue-600/10 blur-[100px] rounded-full pointer-events-none"></div>

        <div class="p-8 flex items-center justify-between z-10">
          <h2 class="text-xl font-light tracking-widest uppercase">{{ t('files.properties') }}</h2>
          <button @click="showInfoPanel = false" class="p-2 hover:bg-white/10 rounded-full transition-all">
            <X :size="20" />
          </button>
        </div>

        <div v-if="activeItem" class="flex-1 overflow-y-auto px-8 pb-12 z-10 custom-scrollbar">
          <div class="aspect-square bg-white/5 rounded-3xl flex items-center justify-center mb-8 shadow-inner group overflow-hidden relative">
            <img 
              v-if="activeItem.metadata?.thumbnailPath" 
              :src="activePreviewId === activeItem._id ? `/api/files/${activeItem._id}/preview` : `/api/files/${activeItem._id}/thumbnail`" 
              class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" 
            />
            <component v-else :is="getFileIcon(activeItem)" :size="80" class="text-blue-400 transition-transform duration-700 group-hover:scale-110" />
            <div class="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
          </div>

          <h3 class="text-2xl font-medium break-all mb-8 leading-tight">{{ activeItem.originalName }}</h3>

          <div class="space-y-6">
            <div class="flex flex-col gap-1.5 p-4 bg-white/5 rounded-2xl border border-white/5">
              <span class="text-[10px] uppercase tracking-widest font-bold text-blue-400/60">{{ t('files.type') }}</span>
              <span class="text-sm font-light">{{ activeItem.isFolder ? 'System Directory' : activeItem.mimeType }}</span>
            </div>
            
            <div class="flex flex-col gap-1.5 p-4 bg-white/5 rounded-2xl border border-white/5">
              <span class="text-[10px] uppercase tracking-widest font-bold text-blue-400/60">{{ t('files.size') }}</span>
              <span class="text-sm font-light">{{ formatSize(activeItem.size) }}</span>
            </div>

            <div class="flex flex-col gap-1.5 p-4 bg-white/5 rounded-2xl border border-white/5">
              <span class="text-[10px] uppercase tracking-widest font-bold text-blue-400/60">{{ t('files.uploaded') }}</span>
              <span class="text-sm font-light">{{ new Date(activeItem.createdAt).toLocaleString() }}</span>
            </div>

            <div>
              <div class="flex items-center justify-between mb-4">
                <span class="text-[10px] uppercase tracking-widest font-bold text-blue-400/60">{{ t('files.tags') }}</span>
                <button @click="updateTags([activeItem._id], activeItem.tags || [])" class="p-1 hover:text-blue-400 transition-colors"><Tag :size="14" /></button>
              </div>
              <div class="flex flex-wrap gap-2">
                <template v-if="activeItem.tags?.length">
                  <span v-for="tag in activeItem.tags" :key="tag" class="px-3 py-1.5 bg-blue-500/20 text-blue-300 border border-blue-500/20 rounded-full text-xs font-medium hover:bg-blue-500/30 transition-all cursor-default">
                    #{{ tag }}
                  </span>
                </template>
                <div v-else class="w-full py-8 border-2 border-dashed border-white/10 rounded-2xl flex items-center justify-center text-xs text-white/20 italic">
                  {{ t('files.no_tags') }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="flex-1 flex flex-col items-center justify-center p-8 z-10 text-center opacity-40">
           <Info :size="64" stroke-width="1" class="mb-4" />
           <p class="text-sm font-light uppercase tracking-widest">{{ t('files.select_file_info') }}</p>
        </div>

        <div v-if="activeItem" class="p-8 border-t border-white/10 z-10 mt-auto">
          <button @click="navigateToFolder(activeItem)" v-if="activeItem.isFolder" class="w-full py-4 bg-blue-600 hover:bg-blue-500 rounded-2xl flex items-center justify-center gap-3 font-bold uppercase tracking-widest transition-all shadow-lg shadow-blue-600/30 active:scale-95">
            {{ t('files.open_folder') }} <ChevronRight :size="18" />
          </button>
          <button v-else @click="router.push({ name: 'player', params: { id: activeItem._id } })" class="w-full py-4 bg-white/10 hover:bg-white/20 rounded-2xl flex items-center justify-center gap-3 font-bold uppercase tracking-widest transition-all active:scale-95 border border-white/10">
            {{ t('files.preview_file') }}
          </button>
        </div>
      </aside>
    </transition>

    <!-- Modals -->
    <FolderPickerModal 
      :show="showFolderPicker" 
      :title="folderPickerTitle"
      :exclude-ids="isMultiSelectMode ? Array.from(selectedIds) : (focusedItemId ? [focusedItemId] : [])"
      @close="showFolderPicker = false"
      @select="handleFolderSelected"
    />
  </div>
</template>

<style scoped>
.aero-card {
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 1.5rem;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}

.shadow-glow {
  box-shadow: 0 0 15px rgba(59, 130, 246, 0.6);
}

/* Animations */
@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}
.animate-float {
  animation: float 6s ease-in-out infinite;
}

@keyframes pulse-subtle {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
.animate-pulse-subtle {
  animation: pulse-subtle 3s ease-in-out infinite;
}

/* Transitions */
.info-panel-enter-active, .info-panel-leave-active {
  transition: transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.4s ease;
}
.info-panel-enter-from, .info-panel-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

.toolbar-enter-active, .toolbar-leave-active {
  transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
.toolbar-enter-from, .toolbar-leave-to {
  transform: translate(-50%, -100%) scale(0.8);
  opacity: 0;
}

.list-enter-active, .list-leave-active {
  transition: all 0.5s ease;
}
.list-enter-from, .list-leave-to {
  opacity: 0;
  transform: translateY(20px);
}
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
