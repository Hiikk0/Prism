<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { 
  Folder, 
  ChevronRight, 
  ArrowLeft, 
  X, 
  Check,
  FolderOpen
} from 'lucide-vue-next';
import api from '@/api/api';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  show: boolean;
  title?: string;
  excludeIds?: string[]; // IDs to exclude (e.g. current selected items to avoid moving into self)
}>();

const emit = defineEmits(['close', 'select']);
const { t } = useI18n();

// State
const currentFolderId = ref<string | null>(null);
const folders = ref<any[]>([]);
const breadcrumbs = ref<{ id: string | null, name: string }[]>([]);
const loading = ref(false);
const focusedIndex = ref(0);

const fetchFolders = async () => {
  loading.value = true;
  try {
    const params: any = {
      parentId: currentFolderId.value || 'root',
      isFolder: true // Backend repository.findAll(filters)
    };
    
    const { data } = await api.get('/files', { params });
    // Filter out excluded IDs
    folders.value = (data.items || []).filter((f: any) => !props.excludeIds?.includes(f._id));
    focusedIndex.value = 0;
  } catch (err) {
    console.error('Failed to fetch folders for picker:', err);
  } finally {
    loading.value = false;
  }
};

const navigateTo = (folder: any) => {
  currentFolderId.value = folder._id;
  breadcrumbs.value.push({ id: folder._id, name: folder.originalName });
  fetchFolders();
};

const goBack = () => {
  if (breadcrumbs.value.length === 0) return;
  breadcrumbs.value.pop();
  currentFolderId.value = breadcrumbs.value.length > 0 
    ? breadcrumbs.value[breadcrumbs.value.length - 1].id 
    : null;
  fetchFolders();
};

const selectCurrent = () => {
  emit('select', currentFolderId.value || 'root');
};

// Controls
const handleKeydown = (e: KeyboardEvent) => {
  if (!props.show) return;
  
  if (e.key === 'Escape') emit('close');
  
  if (e.key === 'ArrowDown') {
    focusedIndex.value = (focusedIndex.value + 1) % (folders.value.length + 1);
    e.preventDefault();
  }
  if (e.key === 'ArrowUp') {
    focusedIndex.value = (focusedIndex.value - 1 + (folders.value.length + 1)) % (folders.value.length + 1);
    e.preventDefault();
  }
  
  if (e.key === 'Enter') {
    if (focusedIndex.value === 0) {
      // "Select Current" is essentially the top action
      selectCurrent();
    } else {
      const folder = folders.value[focusedIndex.value - 1];
      if (folder) navigateTo(folder);
    }
  }
};

watch(() => props.show, (newVal) => {
  if (newVal) {
    currentFolderId.value = null;
    breadcrumbs.value = [];
    fetchFolders();
  }
});

onMounted(() => window.addEventListener('keydown', handleKeydown));
onUnmounted(() => window.removeEventListener('keydown', handleKeydown));
</script>

<template>
  <Transition name="fade">
    <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xl p-4">
      <Transition name="zoom">
        <div v-if="show" class="w-full max-w-2xl bg-linear-to-b from-blue-900/40 to-black/90 rounded-3xl border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
          
          <!-- Header -->
          <div class="px-8 py-6 border-b border-white/5 flex items-center justify-between shrink-0">
            <div class="flex items-center gap-4">
              <button 
                v-if="breadcrumbs.length > 0" 
                @click="goBack" 
                class="p-2 hover:bg-white/10 rounded-full transition-all"
              >
                <ArrowLeft :size="20" />
              </button>
              <h2 class="text-xl font-light tracking-widest uppercase">{{ title || 'Select Destination' }}</h2>
            </div>
            <button @click="$emit('close')" class="p-2 hover:bg-white/10 rounded-full transition-all">
              <X :size="20" />
            </button>
          </div>

          <!-- Breadcrumbs -->
          <div class="px-8 py-3 bg-white/5 border-b border-white/5 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
            <span 
              @click="currentFolderId = null; breadcrumbs = []; fetchFolders()" 
              class="text-[10px] tracking-widest uppercase cursor-pointer hover:text-blue-400 transition-colors opacity-60 font-bold"
            >
              {{ t('files.root') || 'Storage' }}
            </span>
            <template v-for="(crumb, idx) in breadcrumbs" :key="crumb.id">
              <ChevronRight :size="12" class="opacity-20" />
              <span 
                @click="currentFolderId = crumb.id; breadcrumbs = breadcrumbs.slice(0, idx+1); fetchFolders()"
                class="text-[10px] tracking-widest uppercase cursor-pointer hover:text-blue-400 transition-colors opacity-60 last:opacity-100 last:text-blue-400 font-bold whitespace-nowrap"
              >
                {{ crumb.name }}
              </span>
            </template>
          </div>

          <!-- Folder List -->
          <div class="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-1">
            <!-- Action Item: Select Current -->
            <div 
              @click="selectCurrent"
              class="flex items-center justify-between px-6 py-4 rounded-2xl cursor-pointer transition-all border border-transparent"
              :class="focusedIndex === 0 ? 'bg-blue-600/30 border-blue-500/50 shadow-lg' : 'hover:bg-white/5'"
            >
              <div class="flex items-center gap-4">
                <div class="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                  <FolderOpen :size="20" class="text-blue-400" />
                </div>
                <div>
                  <h3 class="text-sm font-medium">Select Current Directory</h3>
                  <p class="text-[10px] opacity-40 uppercase tracking-widest mt-0.5">
                    {{ breadcrumbs.length === 0 ? 'Root Storage' : breadcrumbs[breadcrumbs.length-1].name }}
                  </p>
                </div>
              </div>
              <Check v-if="focusedIndex === 0" :size="16" class="text-blue-400" />
            </div>

            <div class="h-px bg-white/5 my-2 mx-4"></div>

            <template v-if="!loading && folders.length > 0">
              <div 
                v-for="(folder, idx) in folders" 
                :key="folder._id"
                @click="navigateTo(folder)"
                class="flex items-center justify-between px-6 py-4 rounded-2xl cursor-pointer transition-all border border-transparent group"
                :class="focusedIndex === idx + 1 ? 'bg-white/10 border-white/20' : 'hover:bg-white/5'"
              >
                <div class="flex items-center gap-4">
                  <div class="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center transition-colors group-hover:bg-white/10">
                    <Folder :size="20" class="text-white/40 group-hover:text-blue-300" />
                  </div>
                  <h3 class="text-sm font-medium">{{ folder.originalName }}</h3>
                </div>
                <ChevronRight :size="16" class="opacity-20 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
              </div>
            </template>

            <div v-else-if="!loading" class="py-12 flex flex-col items-center justify-center text-white/20">
              <Folder :size="48" stroke-width="1" class="mb-4 opacity-5" />
              <p class="text-xs uppercase tracking-[0.2em]">{{ t('files.no_folders') || 'No subdirectories here' }}</p>
            </div>

            <div v-else class="py-20 flex items-center justify-center">
              <div class="w-8 h-8 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
            </div>
          </div>

          <!-- Footer Hints -->
          <div class="px-8 py-4 bg-black/40 border-t border-white/5 flex justify-end items-center gap-6 shrink-0">
            <div class="flex items-center gap-2 text-[10px] text-white/40 tracking-widest">
              <span class="w-4 h-4 rounded-full border border-white/20 flex items-center justify-center text-[8px]">×</span>
              SELECT
            </div>
            <div class="flex items-center gap-2 text-[10px] text-white/40 tracking-widest">
              <span class="w-4 h-4 rounded-full border border-white/20 flex items-center justify-center text-[8px]">○</span>
              BACK
            </div>
          </div>

        </div>
      </Transition>
    </div>
  </Transition>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.4s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

.zoom-enter-active, .zoom-leave-active {
  transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.4s ease;
}
.zoom-enter-from, .zoom-leave-to {
  transform: scale(0.9);
  opacity: 0;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 10px;
}

.no-scrollbar::-webkit-scrollbar {
  display: none;
}
</style>
