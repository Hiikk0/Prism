<script setup lang="ts">
import { ref, shallowRef, computed, onMounted, onUnmounted } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ArrowLeft, Play, Pause, Maximize, Minimize, Volume2, VolumeX, Settings, Subtitles, Check } from 'lucide-vue-next';
import { useSettingsStore } from '@/stores/settings';
import shaka from 'shaka-player';
import api from '@/api/api';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const settingsStore = useSettingsStore();
const videoElement = ref<HTMLVideoElement | null>(null);
const videoContainer = ref<HTMLDivElement | null>(null);
const player = shallowRef<shaka.Player | null>(null);
const apiUrl = import.meta.env.VITE_API_BASE_URL || '/api';

const fileId = route.params.id as string;
const mediaData = ref<any>(null);
const loading = ref(true);
const error = ref<string | null>(null);

const effectiveMimeType = computed(() => {
  const dbMime = mediaData.value?.mimeType || '';
  if (dbMime !== 'application/octet-stream') return dbMime;
  
  // Fallback: detect by extension
  const name = mediaData.value?.originalName || '';
  const ext = name.split('.').pop()?.toLowerCase();
  const fallbackMap: Record<string, string> = {
    'mp4': 'video/mp4', 'mkv': 'video/x-matroska', 'm4v': 'video/mp4', 'mov': 'video/quicktime', 'avi': 'video/x-msvideo', 'wmv': 'video/x-ms-wmv', 'flv': 'video/x-flv', 'webm': 'video/webm',
    'mp3': 'audio/mpeg', 'm4a': 'audio/mp4', 'wav': 'audio/wav', 'flac': 'audio/flac', 'aac': 'audio/aac', 'ogg': 'audio/ogg',
    'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'webp': 'image/webp', 'gif': 'image/gif'
  };
  return fallbackMap[ext || ''] || dbMime;
});

// Controls State
const isPlaying = ref(false);
const currentTime = ref(0);
const duration = ref(0);
const volume = ref(1);
const isMuted = ref(false);
const isFullscreen = ref(false);
const showControls = ref(true);
let controlsTimeout: number | null = null;

// Progress Tracking
let progressInterval: number | null = null;
const lastSavedTime = ref(0);

// Subtitles & Settings
const showSubtitlesMenu = ref(false);
const showSettingsMenu = ref(false);
const textTracks = ref<any[]>([]);
const currentTrackId = ref<number | string | null>(null);

// Quality selector
type QualityValue = number | 'original';
interface QualityOption { value: QualityValue; label: string; }
const availableQualities = ref<QualityOption[]>([]);
const selectedQuality = ref<QualityValue>('original');
const originalHeight = ref<number | null>(null);

const toggleSubtitles = () => {
  if (!player.value) return;
  textTracks.value = player.value.getTextTracks();
  showSubtitlesMenu.value = !showSubtitlesMenu.value;
  showSettingsMenu.value = false;
};

const selectTrack = (track: any) => {
  if (!player.value) return;
  (player.value as any).selectTextTrack(track);
  (player.value as any).setTextTrackVisibility(true);
  currentTrackId.value = track.id;
  showSubtitlesMenu.value = false;
};

const disableSubtitles = () => {
  if (!player.value) return;
  (player.value as any).setTextTrackVisibility(false);
  currentTrackId.value = null;
  showSubtitlesMenu.value = false;
};

const streamUrl = computed(() => {
  if (
    selectedQuality.value !== 'original' &&
    settingsStore.transcodeMode !== 'OFF' &&
    effectiveMimeType.value.startsWith('video')
  ) {
    return `${apiUrl}/files/${fileId}/hls/${selectedQuality.value}/index.m3u8`;
  }
  return `${apiUrl}/files/${fileId}/stream`;
});

const waveformCanvas = ref<HTMLCanvasElement | null>(null);
const waveformData = ref<number[]>([]);

const fetchMediaData = async () => {
  try {
    const { data } = await api.get(`/files/${fileId}`);
    mediaData.value = data;
    
    // Fetch previous progress
    const { data: progressData } = await api.get('/player/progress');
    const recent = progressData.find((p: any) => p.mediaId?._id === fileId || p.mediaId === fileId);
    if (recent && recent.currentTime > 0) {
      currentTime.value = recent.currentTime;
      lastSavedTime.value = recent.currentTime;
    }

    if (effectiveMimeType.value.startsWith('image')) {
      loading.value = false;
    } else {
      fetchWaveform();
    }
  } catch (err: any) {
    error.value = err.response?.data?.error || t('player.error_playback_failed') || 'Failed to load media';
  }
};

const fetchQualities = async () => {
  if (!effectiveMimeType.value.startsWith('video')) return;
  try {
    const { data } = await api.get(`/files/${fileId}/qualities`);
    availableQualities.value = data.qualities ?? [];
    originalHeight.value = data.originalHeight ?? null;
    // Default: if transcoding is on, pick the highest available transcoded quality;
    // otherwise stay on 'original'.
    const transcoded = availableQualities.value.filter(q => q.value !== 'original');
    if (transcoded.length > 0 && settingsStore.transcodeMode !== 'OFF') {
      selectedQuality.value = transcoded[0].value; // already sorted descending
    } else {
      selectedQuality.value = 'original';
    }
  } catch {
    // Fallback: only original available
    availableQualities.value = [{ value: 'original', label: 'Original' }];
    selectedQuality.value = 'original';
  }
};

const fetchWaveform = async () => {
  if (mediaData.value?.metadata?.waveformPath) {
    try {
      const { data } = await api.get(`/files/${fileId}/waveform`);
      waveformData.value = data;
      // Wait for canvas to be available
      setTimeout(drawWaveform, 100);
    } catch (err) {
      console.error('Failed to fetch waveform:', err);
    }
  }
};

const drawWaveform = () => {
  const canvas = waveformCanvas.value;
  if (!canvas || !waveformData.value.length) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = rect.height;
  const data = waveformData.value;
  const barWidth = width / data.length;
  const gap = barWidth * 0.2;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';

  data.forEach((val, i) => {
    const x = i * barWidth;
    const barHeight = Math.max(2, val * height); // Min 2px height
    const y = (height - barHeight) / 2;
    
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x + gap, y, barWidth - gap * 2, barHeight, 2);
    } else {
      ctx.rect(x + gap, y, barWidth - gap * 2, barHeight);
    }
    ctx.fill();
  });
};

/**
 * Destroy current player instance so initPlayer() can be called fresh.
 * Called by switchQuality to reload the stream with a new URL.
 */
const destroyPlayer = async () => {
  if (player.value) {
    await player.value.destroy();
    player.value = null;
  }
  if (videoElement.value) {
    videoElement.value.src = '';
  }
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
};

/**
 * Switch playback quality: saves current position, reloads the player.
 */
const switchQuality = async (q: QualityValue) => {
  if (q === selectedQuality.value) {
    showSettingsMenu.value = false;
    return;
  }
  const savedTime = videoElement.value?.currentTime ?? currentTime.value;
  selectedQuality.value = q;
  showSettingsMenu.value = false;
  loading.value = true;

  await destroyPlayer();
  // Restore saved position for the next initPlayer() call
  currentTime.value = savedTime;
  await initPlayer();
};

const initPlayer = async () => {
  if (!videoElement.value) return;

  const isAdaptive = effectiveMimeType.value === 'application/dash+xml' || 
                    effectiveMimeType.value === 'application/x-mpegurl' ||
                    streamUrl.value.endsWith('.m3u8');

  // If it's an image, just stop loading
  if (effectiveMimeType.value.startsWith('image')) {
    loading.value = false;
    return;
  }

  const startAt = currentTime.value;

  if (isAdaptive) {
    shaka.polyfill.installAll();
    if (!shaka.Player.isBrowserSupported()) {
      error.value = t('player.error_browser_not_supported') || 'Browser not supported for streaming';
      return;
    }

    const shakaPlayer = new shaka.Player();
    await shakaPlayer.attach(videoElement.value);
    player.value = shakaPlayer;

    // Configure Shaka for JIT transcoding:
    // - Increase network timeout so backend has time to generate segments
    // - Reduce unnecessary buffer-behind to avoid requesting already-passed segments
    shakaPlayer.configure({
      streaming: {
        bufferBehind: 10,
        rebufferingGoal: 2,
        bufferingGoal: 12,
        startAtSegmentBoundary: true,
        retryParameters: {
          timeout: 30000,
          maxAttempts: 3,
          baseDelay: 500,
          backoffFactor: 1.5,
        },
      },
      manifest: {
        retryParameters: {
          timeout: 30000,
          maxAttempts: 3,
          baseDelay: 500,
          backoffFactor: 1.5,
        },
      },
    });

    shakaPlayer.addEventListener('error', (event: any) => {
      console.error('Error code', event.detail.code, 'object', event.detail);
      error.value = `Playback error: ${event.detail.code}`;
    });

    try {
      shakaPlayer.getNetworkingEngine()?.registerRequestFilter((_type: shaka.net.NetworkingEngine.RequestType, request: shaka.extern.Request) => {
        request.allowCrossSiteCredentials = true;
      });

      console.log('Loading adaptive stream starting at', startAt);
      await shakaPlayer.load(streamUrl.value, startAt);
      
      if (mediaData.value.metadata?.subtitles?.length) {
        for (let i = 0; i < mediaData.value.metadata.subtitles.length; i++) {
          const sub = mediaData.value.metadata.subtitles[i];
          const subUrl = `${import.meta.env.VITE_API_BASE_URL || '/api'}/files/${fileId}/subtitles/${i}`;
          await shakaPlayer.addTextTrackAsync(subUrl, sub.language || 'und', 'subtitles', 'text/vtt');
        }
      }
      
      loading.value = false;
      startProgressTracking();
    } catch (err) {
      console.error('Error loading adaptive stream', err);
      error.value = t('player.error_failed_load_stream') || 'Failed to load stream';
    }
  } else if (effectiveMimeType.value.startsWith('video') || effectiveMimeType.value.startsWith('audio')) {
    // Native playback for standard files
    videoElement.value.src = streamUrl.value;
    
    videoElement.value.onloadedmetadata = () => {
      if (videoElement.value && startAt > 0) {
        videoElement.value.currentTime = startAt;
      }
    };

    videoElement.value.oncanplay = () => {
      loading.value = false;
      startProgressTracking();
    };
    
    videoElement.value.onerror = () => {
      console.error('Native video error');
      error.value = t('player.error_playback_failed') || 'Playback failed';
    };
  }
};

const saveProgress = async (force = false) => {
  if (!videoElement.value || !mediaData.value || effectiveMimeType.value.startsWith('image')) return;
  const current = videoElement.value.currentTime;
  const durationValue = videoElement.value.duration;
  
  if (durationValue > 0 && current >= durationValue - 5) {
    try {
      await api.delete(`/player/progress/${fileId}`);
      lastSavedTime.value = current;
      return;
    } catch (e) {}
  }
  
  if (force || Math.abs(current - lastSavedTime.value) > 2) {
    try {
      await api.post('/player/progress', { mediaId: fileId, currentTime: current });
      lastSavedTime.value = current;
    } catch (e) {
      console.error('Failed to save progress', e);
    }
  }
};

const startProgressTracking = () => {
  progressInterval = window.setInterval(() => saveProgress(), 10000); // Save every 10s
};

const togglePlay = () => {
  if (!videoElement.value) return;
  if (videoElement.value.paused) videoElement.value.play();
  else videoElement.value.pause();
};

const toggleFullscreen = () => {
  if (!document.fullscreenElement && videoContainer.value) {
    videoContainer.value.requestFullscreen();
    isFullscreen.value = true;
  } else if (document.exitFullscreen) {
    document.exitFullscreen();
    isFullscreen.value = false;
  }
};

const handleMouseMove = () => {
  showControls.value = true;
  if (controlsTimeout) clearTimeout(controlsTimeout);
  controlsTimeout = window.setTimeout(() => {
    if (isPlaying.value) showControls.value = false;
  }, 3000);
};

// Video Events
const onTimeUpdate = () => {
  if (videoElement.value) currentTime.value = videoElement.value.currentTime;
};

const onDurationChange = () => {
  if (videoElement.value) duration.value = videoElement.value.duration;
};

const onPlay = () => isPlaying.value = true;
const onPause = () => isPlaying.value = false;

const formatTime = (seconds: number) => {
  if (isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const handleKeydown = (e: KeyboardEvent) => {
  if (!videoElement.value || effectiveMimeType.value.startsWith('image')) return;
  switch (e.key) {
    case ' ':
    case 'k':
      e.preventDefault();
      togglePlay();
      break;
    case 'm':
      isMuted.value = !isMuted.value;
      videoElement.value.muted = isMuted.value;
      break;
    case 'f':
      toggleFullscreen();
      break;
    case 'ArrowRight':
      videoElement.value.currentTime += 5;
      break;
    case 'ArrowLeft':
      videoElement.value.currentTime -= 5;
      break;
    case 'ArrowUp':
      e.preventDefault();
      volume.value = Math.min(1, volume.value + 0.05);
      videoElement.value.volume = volume.value;
      break;
    case 'ArrowDown':
      e.preventDefault();
      volume.value = Math.max(0, volume.value - 0.05);
      videoElement.value.volume = volume.value;
      break;
  }
};

onMounted(async () => {
  await settingsStore.fetchPublicSettings();
  await fetchMediaData();
  if (mediaData.value && !effectiveMimeType.value.startsWith('image')) {
    // Fetch qualities first so selectedQuality is set before initPlayer reads streamUrl
    await fetchQualities();
    initPlayer();
  }
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('keydown', handleGlobalKeydown);
  window.addEventListener('resize', drawWaveform);
  window.addEventListener('beforeunload', handleBeforeUnload);
  handleMouseMove();
});

const handleGlobalKeydown = (e: KeyboardEvent) => {
  handleKeydown(e);
  handleMouseMove();
};

// Perform all async cleanup before navigating away
onBeforeRouteLeave(async () => {
  // Final progress save
  await saveProgress(true);

  // JIT cache cleanup
  if (settingsStore.transcodeMode === 'JIT') {
    try {
      await api.delete(`/files/${fileId}/hls`);
      console.log('JIT: Cache cleaned up on route leave');
    } catch (e) {
      console.error('Failed to cleanup JIT cache', e);
    }
  }
});

// Fallback for browser tab close / hard refresh (sendBeacon is fire-and-forget POST)
const handleBeforeUnload = () => {
  if (settingsStore.transcodeMode === 'JIT') {
    // fetch with keepalive survives page unload and sends credentials (cookies)
    fetch(`${apiUrl}/files/${fileId}/hls-cleanup`, {
      method: 'POST',
      keepalive: true,
      credentials: 'include'
    }).catch(() => {});
  }
};

onUnmounted(() => {
  window.removeEventListener('mousemove', handleMouseMove);
  window.removeEventListener('keydown', handleGlobalKeydown);
  window.removeEventListener('resize', drawWaveform);
  window.removeEventListener('beforeunload', handleBeforeUnload);
  if (controlsTimeout) clearTimeout(controlsTimeout);
  if (progressInterval) clearInterval(progressInterval);

  // Destroy player synchronously (non-async)
  if (player.value) {
    player.value.destroy();
  }
});
</script>

<template>
  <div class="h-screen w-screen bg-black flex flex-col font-outfit relative group" @mousemove="handleMouseMove">
    <!-- Top Bar -->
    <transition name="fade">
      <div v-if="showControls" class="absolute top-0 left-0 w-full p-6 bg-linear-to-b from-black/80 to-transparent z-50 flex items-center justify-between transition-opacity duration-300">
        <div class="flex items-center gap-4">
          <button @click="router.back()" class="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all backdrop-blur-md">
            <ArrowLeft :size="24" />
          </button>
          <h1 class="text-white text-xl font-light tracking-wide drop-shadow-md">{{ mediaData?.originalName || t('common.loading') }}</h1>
        </div>
        <div>
          <!-- Add to Playlist button could go here -->
        </div>
      </div>
    </transition>

    <!-- Content Area -->
    <div class="flex-1 relative flex items-center justify-center overflow-hidden" ref="videoContainer">
      
      <!-- Loading/Error State -->
      <div v-if="loading" class="absolute inset-0 flex items-center justify-center z-40 bg-black">
        <div class="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500"></div>
      </div>
      <div v-if="error" class="absolute inset-0 flex items-center justify-center z-40 bg-black flex-col gap-4 text-white">
        <p class="text-red-400 font-bold uppercase tracking-widest text-xl">{{ t('common.error') }}</p>
        <p class="text-white/60">{{ error }}</p>
        <button @click="router.back()" class="px-6 py-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors">{{ t('common.go_back') }}</button>
      </div>

      <!-- Image Viewer -->
      <img 
        v-if="mediaData && effectiveMimeType.startsWith('image')" 
        :src="streamUrl" 
        class="max-w-full max-h-full object-contain"
      />

      <!-- Video Player -->
      <video
        v-show="mediaData && (effectiveMimeType.startsWith('video') || effectiveMimeType.startsWith('audio'))"
        ref="videoElement"
        class="w-full h-full object-contain"
        :poster="mediaData?.metadata?.thumbnailPath ? `/api/files/${fileId}/thumbnail` : ''"
        @timeupdate="onTimeUpdate"
        @durationchange="onDurationChange"
        @play="onPlay"
        @pause="onPause"
        @click="togglePlay"
      >
        <track 
          v-for="(sub, i) in mediaData?.metadata?.subtitles || []"
          :key="i"
          :src="`${apiUrl}/files/${fileId}/subtitles/${i}`"
          kind="subtitles"
          :srclang="sub.language || 'und'"
          :label="sub.label || sub.language"
        />
      </video>

      <!-- Bottom Controls -->
      <transition name="fade">
        <div v-if="showControls && mediaData && !mediaData.mimeType.startsWith('image')" class="absolute bottom-0 left-0 w-full p-6 bg-linear-to-t from-black/90 via-black/40 to-transparent z-50 flex flex-col gap-4 transition-opacity duration-300">
          
          <!-- Progress Bar with Waveform -->
          <div class="flex flex-col gap-1 group/progress">
            <div class="flex items-center justify-between text-[10px] uppercase tracking-widest font-bold text-white/40 px-1">
              <span>{{ formatTime(currentTime) }}</span>
              <span>{{ formatTime(duration) }}</span>
            </div>
            <div class="relative w-full h-16 bg-white/5 rounded-xl overflow-hidden group/wave">
              <!-- Waveform Canvas -->
              <canvas ref="waveformCanvas" class="absolute inset-0 w-full h-full pointer-events-none opacity-60 group-hover/wave:opacity-100 transition-opacity"></canvas>
              
              <!-- Progress Overlay (for color) -->
              <div 
                class="absolute top-0 left-0 h-full bg-blue-500/30 border-r border-blue-400 mix-blend-overlay pointer-events-none transition-all duration-100" 
                :style="{ width: `${(currentTime / duration) * 100}%` }"
              ></div>

              <!-- Seek Input -->
              <input 
                type="range" 
                min="0" 
                :max="duration" 
                :value="currentTime"
                @input="e => { if(videoElement) { videoElement.currentTime = parseFloat((e.target as HTMLInputElement).value); } }"
                class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
            </div>
          </div>

          <!-- Control Buttons -->
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-6">
              <button @click="togglePlay" class="text-white hover:text-blue-400 hover:scale-110 transition-all">
                <component :is="isPlaying ? Pause : Play" :size="32" fill="currentColor" />
              </button>
              
              <div class="flex items-center gap-2 group/vol">
                <button @click="isMuted = !isMuted; if(videoElement) videoElement.muted = isMuted" class="text-white hover:text-blue-400 transition-colors">
                  <component :is="isMuted || volume === 0 ? VolumeX : Volume2" :size="24" />
                </button>
                <input 
                  type="range" 
                  min="0" max="1" step="0.05" 
                  v-model="volume"
                  @input="() => { if(videoElement) videoElement.volume = volume }"
                  class="w-0 group-hover/vol:w-24 transition-all duration-300 opacity-0 group-hover/vol:opacity-100 cursor-pointer accent-blue-500"
                />
              </div>
            </div>

            <div class="flex items-center gap-4 text-white relative">
              <!-- Subtitles Menu -->
              <transition name="fade">
                <div v-if="showSubtitlesMenu" class="absolute bottom-12 right-0 w-64 bg-black/90 backdrop-blur-xl border border-white/10 rounded-2xl p-4 flex flex-col gap-2 z-50">
                  <h4 class="text-xs font-bold uppercase tracking-widest text-white/40 mb-2">{{ t('player.subtitles') }}</h4>
                  <button 
                    @click="disableSubtitles" 
                    class="text-left px-4 py-2 rounded-xl transition-all"
                    :class="currentTrackId === null ? 'bg-blue-500 text-white' : 'hover:bg-white/10 text-white/60'"
                  >
                    {{ t('common.off') }}
                  </button>
                  <button 
                    v-for="track in textTracks" 
                    :key="track.id" 
                    @click="selectTrack(track)"
                    class="text-left px-4 py-2 rounded-xl transition-all flex items-center justify-between"
                    :class="currentTrackId === track.id ? 'bg-blue-500 text-white' : 'hover:bg-white/10 text-white/60'"
                  >
                    <span>{{ track.label || track.language }}</span>
                    <span class="text-[10px] opacity-40 uppercase">{{ track.roles[0] }}</span>
                  </button>
                </div>
              </transition>

              <!-- Settings Menu -->
              <transition name="fade">
                <div v-if="showSettingsMenu" class="absolute bottom-12 right-0 w-72 bg-black/90 backdrop-blur-xl border border-white/10 rounded-2xl p-4 flex flex-col gap-1 z-50">
                  <h4 class="text-xs font-bold uppercase tracking-widest text-white/40 mb-2">{{ t('player.settings') }}</h4>

                  <!-- Playback Speed (static placeholder) -->
                  <div class="flex items-center justify-between px-4 py-2 text-sm text-white/60 rounded-xl">
                    <span>{{ t('player.playback_speed') }}</span>
                    <span class="text-blue-400">1.0x</span>
                  </div>

                  <!-- Quality selector -->
                  <div class="flex flex-col gap-0.5">
                    <p class="text-xs font-bold uppercase tracking-widest text-white/40 px-4 pt-2 pb-1">{{ t('player.quality') }}</p>
                    <button
                      v-for="opt in availableQualities"
                      :key="String(opt.value)"
                      @click="switchQuality(opt.value)"
                      class="flex items-center justify-between px-4 py-2 rounded-xl text-sm transition-all"
                      :class="selectedQuality === opt.value
                        ? 'bg-blue-500 text-white'
                        : 'text-white/60 hover:bg-white/10 hover:text-white'"
                    >
                      <span>{{ opt.label }}</span>
                      <Check v-if="selectedQuality === opt.value" :size="14" />
                    </button>
                  </div>

                  <!-- Repeat (static placeholder) -->
                  <div class="flex items-center justify-between px-4 py-2 text-sm text-white/60 rounded-xl">
                    <span>{{ t('player.repeat') }}</span>
                    <span class="text-blue-400">{{ t('common.off') }}</span>
                  </div>
                </div>
              </transition>

              <button @click="toggleSubtitles" class="hover:text-blue-400 transition-colors" :class="{ 'text-blue-400': currentTrackId !== null }" :title="t('player.subtitles')">
                <Subtitles :size="24" />
              </button>
              <button @click="showSettingsMenu = !showSettingsMenu; showSubtitlesMenu = false" class="hover:text-blue-400 transition-colors" :title="t('player.settings')">
                <Settings :size="24" />
              </button>
              <button @click="toggleFullscreen" class="hover:text-blue-400 transition-colors">
                <component :is="isFullscreen ? Minimize : Maximize" :size="24" />
              </button>
            </div>
          </div>
        </div>
      </transition>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
