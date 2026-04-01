<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
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
  Search
} from 'lucide-vue-next';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const files = ref<any[]>([]);
const loading = ref(true);
const viewMode = ref<'grid' | 'list'>('grid');
const uploadProgress = ref(0);
const uploading = ref(false);
const searchQuery = ref('');

const mediaType = computed(() => route.query.type as string || 'all');

const fetchFiles = async () => {
  loading.value = true;
  try {
    const params = mediaType.value !== 'all' ? { type: mediaType.value } : {};
    const { data } = await api.get('/files', { params });
    files.value = data;
  } catch (err) {
    console.error('Failed to fetch files:', err);
  } finally {
    loading.value = false;
  }
};

const handleUpload = async (event: any) => {
  const file = event.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('file', file);

  uploading.value = true;
  uploadProgress.value = 0;

  try {
    await api.post('/files', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total) {
          uploadProgress.value = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        }
      },
    });
    await fetchFiles();
  } catch (err) {
    console.error('Upload failed:', err);
  } finally {
    uploading.value = false;
    uploadProgress.value = 0;
  }
};

const deleteFile = async (id: string) => {
  if (!confirm('Are you sure you want to delete this file?')) return;
  try {
    await api.delete(`/files/${id}`);
    files.value = files.value.filter(f => f._id !== id);
  } catch (err) {
    console.error('Delete failed:', err);
  }
};

const filteredFiles = computed(() => {
  if (!searchQuery.value) return files.value;
  return files.value.filter(f => f.originalName.toLowerCase().includes(searchQuery.value.toLowerCase()));
});

onMounted(fetchFiles);

const getFileIcon = (mime: string) => {
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
  <div class="min-h-screen p-4 sm:p-8 flex flex-col gap-8">
    <!-- Header -->
    <header class="flex items-center justify-between aero-card px-6 py-4">
      <div class="flex items-center gap-4">
        <button @click="router.push({ name: 'home' })" class="p-2 hover:bg-white/10 rounded-full transition-all">
          <ArrowLeft :size="24" />
        </button>
        <h1 class="text-2xl font-light tracking-wide uppercase neon-text">
          {{ mediaType === 'all' ? t('files.title') : t(`categories.${mediaType}`) }}
        </h1>
      </div>

      <div class="flex items-center gap-4">
        <!-- Search -->
        <div class="relative hidden sm:block">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" :size="18" />
          <input 
            v-model="searchQuery"
            type="text" 
            class="bg-white/5 border border-white/10 rounded-full pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-blue-500/50 outline-none transition-all w-64"
            :placeholder="t('common.search') || 'Search files...'"
          />
        </div>

        <button @click="viewMode = viewMode === 'grid' ? 'list' : 'grid'" class="p-2 hover:bg-white/10 rounded-lg transition-all hidden sm:block">
          <component :is="viewMode === 'grid' ? List : Grid" :size="20" />
        </button>

        <label class="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg cursor-pointer flex items-center gap-2 font-medium transition-all shadow-lg shadow-blue-500/20 active:scale-95">
          <Upload :size="18" />
          <span>{{ t('files.upload') }}</span>
          <input type="file" class="hidden" @change="handleUpload" />
        </label>
      </div>
    </header>

    <!-- Upload Progress -->
    <div v-if="uploading" class="aero-card py-4 px-6 flex items-center gap-4">
      <div class="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
        <div class="h-full bg-blue-500 shadow-glow transition-all duration-300" :style="{ width: `${uploadProgress}%` }"></div>
      </div>
      <span class="text-xs font-mono">{{ uploadProgress }}%</span>
    </div>

    <!-- File Grid -->
    <main v-if="!loading" class="flex-1">
      <div v-if="filteredFiles.length > 0" 
        :class="{
          'grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6': viewMode === 'grid',
          'flex flex-col gap-2': viewMode === 'list'
        }"
      >
        <div 
          v-for="file in filteredFiles" 
          :key="file._id"
          :class="{
            'aero-card group p-2': viewMode === 'grid',
            'aero-card px-4 py-3 flex items-center gap-4 group hover:bg-white/5': viewMode === 'list'
          }"
        >
          <!-- Grid View Icon -->
          <div v-if="viewMode === 'grid'" class="aspect-square bg-white/5 rounded-xl flex items-center justify-center mb-4 transition-transform group-hover:scale-95 relative overflow-hidden">
            <component :is="getFileIcon(file.mimeType)" :size="48" class="text-blue-400/50" />
            
            <!-- Actions Overlay -->
            <div class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-4 transition-opacity">
               <button @click="deleteFile(file._id)" class="p-2 bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white rounded-lg transition-all">
                 <Trash2 :size="18" />
               </button>
            </div>
          </div>

          <!-- File Info -->
          <div :class="{ 'px-2 pb-2': viewMode === 'grid', 'flex-1': viewMode === 'list' }">
            <p class="text-sm font-medium truncate mb-1">{{ file.originalName }}</p>
            <div class="flex items-center justify-between text-[10px] text-gray-400 uppercase tracking-wider">
              <span>{{ formatSize(file.size) }}</span>
              <span v-if="viewMode === 'list'">{{ file.mimeType }}</span>
            </div>
          </div>

          <!-- List View Actions -->
          <div v-if="viewMode === 'list'" class="flex items-center gap-2">
            <button @click="deleteFile(file._id)" class="p-2 text-gray-400 hover:text-red-400 transition-all opacity-0 group-hover:opacity-100">
               <Trash2 :size="18" />
            </button>
          </div>
        </div>
      </div>

      <div v-else class="h-64 flex flex-col items-center justify-center text-gray-500 gap-4">
        <Folder :size="64" stroke-width="1" class="opacity-20" />
        <p class="text-lg font-light tracking-widest uppercase">{{ t('files.empty') || 'No files found' }}</p>
      </div>
    </main>

    <!-- Loading State -->
    <div v-else class="flex-1 flex items-center justify-center">
      <div class="w-12 h-12 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
    </div>
  </div>
</template>

<style scoped>
.shadow-glow {
  box-shadow: 0 0 15px rgba(59, 130, 246, 0.5);
}
</style>
