<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { 
  Folder, 
  ChevronRight, 
  ArrowLeft, 
  X, 
  Check,
  FileImage,
  FileVideo,
  FileText
} from 'lucide-vue-next';
import api from '@/api/api';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  show: boolean;
  title?: string;
  type: 'image' | 'video'; // Filter files by image or video
}>();

const emit = defineEmits(['close', 'select']);
const { t } = useI18n();

// State
const currentFolderId = ref<string | null>(null);
const items = ref<any[]>([]);
const breadcrumbs = ref<{ id: string | null, name: string }[]>([]);
const loading = ref(false);
const focusedIndex = ref(0);

const fetchItems = async () => {
  loading.value = true;
  try {
    const params: any = {
      parentId: currentFolderId.value || 'root',
      type: props.type
    };
    
    const { data } = await api.get('/files', { params });
    items.value = data.items || [];
    focusedIndex.value = 0;
  } catch (err) {
    console.error('Failed to fetch items for picker:', err);
  } finally {
    loading.value = false;
  }
};

const navigateTo = (folder: any) => {
  currentFolderId.value = folder._id;
  breadcrumbs.value.push({ id: folder._id, name: folder.originalName });
  fetchItems();
};

const goBack = () => {
  if (breadcrumbs.value.length === 0) return;
  breadcrumbs.value.pop();
  currentFolderId.value = breadcrumbs.value.length > 0 
    ? breadcrumbs.value[breadcrumbs.value.length - 1].id 
    : null;
  fetchItems();
};

const selectFile = (file: any) => {
  if (file.isFolder) return;
  emit('select', file);
};

// Key controls
const handleKeydown = (e: KeyboardEvent) => {
  if (!props.show) return;
  
  if (e.key === 'Escape') emit('close');
  
  if (e.key === 'ArrowDown') {
    if (items.value.length > 0) {
      focusedIndex.value = (focusedIndex.value + 1) % items.value.length;
      e.preventDefault();
    }
  }
  if (e.key === 'ArrowUp') {
    if (items.value.length > 0) {
      focusedIndex.value = (focusedIndex.value - 1 + items.value.length) % items.value.length;
      e.preventDefault();
    }
  }
  
  if (e.key === 'Enter') {
    const item = items.value[focusedIndex.value];
    if (item) {
      if (item.isFolder) {
        navigateTo(item);
      } else {
        selectFile(item);
      }
    }
  }
};

watch(() => props.show, (newVal) => {
  if (newVal) {
    currentFolderId.value = null;
    breadcrumbs.value = [];
    fetchItems();
  }
});

onMounted(() => window.addEventListener('keydown', handleKeydown));
onUnmounted(() => window.removeEventListener('keydown', handleKeydown));

const getFileIcon = (item: any) => {
  if (item.isFolder) return Folder;
  const mime = item.mimeType || '';
  if (mime.startsWith('image')) return FileImage;
  if (mime.startsWith('video')) return FileVideo;
  return FileText;
};

const formatSize = (bytes: number) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};
</script>

<template>
  <Transition name="fade">
    <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-2xl p-4 select-none">
      <Transition name="zoom">
        <div v-if="show" class="w-full max-w-2xl bg-linear-to-b from-[#0f1b2f]/50 to-[#02050b]/90 rounded-3xl border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
          
          <!-- Header -->
          <div class="px-8 py-6 border-b border-white/5 flex items-center justify-between shrink-0">
            <div class="flex items-center gap-4">
              <button 
                v-if="breadcrumbs.length > 0" 
                @click="goBack" 
                class="p-2 hover:bg-white/10 rounded-full transition-all active:scale-95"
              >
                <ArrowLeft :size="20" />
              </button>
              <h2 class="text-lg font-light tracking-widest uppercase text-blue-100">{{ title || 'Select File' }}</h2>
            </div>
            <button @click="$emit('close')" class="p-2 hover:bg-white/10 rounded-full transition-all active:scale-95">
              <X :size="20" />
            </button>
          </div>

          <!-- Breadcrumbs -->
          <div class="px-8 py-3 bg-white/5 border-b border-white/5 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
            <span 
              @click="currentFolderId = null; breadcrumbs = []; fetchItems()" 
              class="text-[10px] tracking-widest uppercase cursor-pointer hover:text-blue-400 transition-colors opacity-60 font-bold"
            >
              {{ t('files.root') || 'Storage' }}
            </span>
            <template v-for="(crumb, idx) in breadcrumbs" :key="crumb.id">
              <ChevronRight :size="12" class="opacity-20" />
              <span 
                @click="currentFolderId = crumb.id; breadcrumbs = breadcrumbs.slice(0, idx+1); fetchItems()"
                class="text-[10px] tracking-widest uppercase cursor-pointer hover:text-blue-400 transition-colors opacity-60 last:opacity-100 last:text-blue-400 font-bold whitespace-nowrap"
              >
                {{ crumb.name }}
              </span>
            </template>
          </div>

          <!-- Folder & File List -->
          <div class="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-1">
            <template v-if="!loading && items.length > 0">
              <div 
                v-for="(item, idx) in items" 
                :key="item._id"
                @click="focusedIndex = idx"
                @dblclick="item.isFolder ? navigateTo(item) : selectFile(item)"
                class="flex items-center justify-between px-6 py-4 rounded-2xl cursor-pointer transition-all border border-transparent group"
                :class="focusedIndex === idx ? 'bg-blue-600/25 border-blue-500/30 shadow-lg shadow-blue-900/10' : 'hover:bg-white/5'"
              >
                <div class="flex items-center gap-4 min-w-0">
                  <!-- Thumbnail/Icon -->
                  <div class="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center shrink-0 overflow-hidden relative border border-white/5 group-hover:border-white/10 transition-colors">
                    <img 
                      v-if="item.metadata?.thumbnailPath"
                      :src="`/api/files/${item._id}/thumbnail`" 
                      class="w-full h-full object-cover" 
                    />
                    <component v-else :is="getFileIcon(item)" :size="20" class="text-white/60 group-hover:text-blue-300 transition-colors" :class="item.isFolder ? 'text-blue-400' : ''" />
                  </div>

                  <div class="min-w-0">
                    <h3 class="text-sm font-medium truncate text-white/90 group-hover:text-white transition-colors">{{ item.originalName }}</h3>
                    <p class="text-[10px] opacity-40 uppercase tracking-widest mt-0.5 font-semibold">
                      {{ item.isFolder ? 'Folder' : `${formatSize(item.size)} • ${item.mimeType}` }}
                    </p>
                  </div>
                </div>

                <div class="flex items-center gap-3 shrink-0">
                  <!-- Active Check or Navigation Arrow -->
                  <ChevronRight v-if="item.isFolder" :size="16" class="opacity-30 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                  <button 
                    v-else-if="focusedIndex === idx" 
                    @click.stop="selectFile(item)"
                    class="bg-blue-600 text-white rounded-full p-1.5 shadow-md shadow-blue-900/30 hover:bg-blue-500 transition-all active:scale-95"
                  >
                    <Check :size="14" />
                  </button>
                </div>
              </div>
            </template>

            <div v-else-if="!loading" class="py-16 flex flex-col items-center justify-center text-white/20">
              <Folder :size="48" stroke-width="1" class="mb-4 opacity-10" />
              <p class="text-xs uppercase tracking-[0.2em] font-medium">{{ t('files.empty') || 'No items found' }}</p>
            </div>

            <div v-else class="py-20 flex items-center justify-center">
              <div class="w-8 h-8 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
            </div>
          </div>

          <!-- Footer Hints -->
          <div class="px-8 py-4 bg-black/40 border-t border-white/5 flex justify-end items-center gap-6 shrink-0">
            <div class="flex items-center gap-2 text-[10px] text-white/40 tracking-widest font-bold">
              <span class="w-4 h-4 rounded-full border border-white/20 flex items-center justify-center text-[8px]">×</span>
              SELECT
            </div>
            <div class="flex items-center gap-2 text-[10px] text-white/40 tracking-widest font-bold">
              <span class="w-4 h-4 rounded-full border border-white/20 flex items-center justify-center text-[8px]">○</span>
              BACK / CLOSE
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
