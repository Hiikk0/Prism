<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import XmbWorker from './xmb-background.worker?worker';

const authStore = useAuthStore();
const route = useRoute();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const videoRef = ref<HTMLVideoElement | null>(null);
let worker: Worker | null = null;

const prefs = computed(() => authStore.user?.preferences || {
  backgroundType: 'waves' as const,
  performanceMode: 'high' as const,
  backgroundMediaId: ''
});

const isWaves = computed(() => prefs.value.backgroundType === 'waves');

// Suspend background rendering when viewing full-screen player where background is covered
const isBackgroundActive = computed(() => {
  return route.name !== 'player';
});

const shouldShowWaves = computed(() => isWaves.value && isBackgroundActive.value);

const backgroundUrl = computed(() => {
  const mediaId = prefs.value.backgroundMediaId;
  if (!mediaId) return '';
  // Check if it's a 24-character hex ID (MongoDB ObjectId)
  if (/^[0-9a-fA-F]{24}$/.test(mediaId)) {
    return `/api/files/${mediaId}/stream`;
  }
  return mediaId;
});

const resize = () => {
  if (worker && canvasRef.value) {
    worker.postMessage({
      type: 'resize',
      data: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    });
  }
};

const handleVisibilityChange = () => {
  const isHidden = document.hidden;
  if (worker) {
    worker.postMessage({
      type: 'visibilityChange',
      data: { hidden: isHidden }
    });
  }

  if (videoRef.value) {
    if (isHidden || !isBackgroundActive.value) {
      videoRef.value.pause();
    } else {
      videoRef.value.play().catch(() => {});
    }
  }
};

// Handle lazy load for background video to reduce CPU spikes during startup
const isVideoLoaded = ref(false);
watch(() => prefs.value.backgroundType, (newType) => {
  if (newType === 'video') {
    isVideoLoaded.value = false;
    setTimeout(() => {
      isVideoLoaded.value = true;
    }, 300);
  }
});

const initWorker = () => {
  if (worker || !canvasRef.value) return;

  try {
    worker = new XmbWorker();
    console.log('[XmbBackground] Worker created successfully');

    if (typeof canvasRef.value.transferControlToOffscreen === 'function') {
      canvasRef.value.width = window.innerWidth;
      canvasRef.value.height = window.innerHeight;
      const offscreen = canvasRef.value.transferControlToOffscreen();
      console.log('[XmbBackground] Transferring control to offscreen canvas');
      worker.postMessage({
        type: 'init',
        canvas: offscreen,
        performanceMode: prefs.value.performanceMode,
        isWaves: true,
        width: window.innerWidth,
        height: window.innerHeight
      }, [offscreen]);
    } else {
      console.warn('OffscreenCanvas is not supported in this browser.');
    }
  } catch (err) {
    console.error('Failed to initialize background worker:', err);
  }
};

const terminateWorker = () => {
  if (worker) {
    console.log('[XmbBackground] Terminating worker and freeing resources');
    worker.terminate();
    worker = null;
  }
};

// Watch for waves state changes (enable/disable based on settings or route changes)
watch(shouldShowWaves, async (show) => {
  if (show) {
    await nextTick();
    initWorker();
  } else {
    terminateWorker();
  }
}, { immediate: true });

// Watch performance mode changes
watch(
  () => prefs.value.performanceMode,
  (newPerf) => {
    if (worker) {
      worker.postMessage({
        type: 'updatePrefs',
        data: {
          performanceMode: newPerf,
          isWaves: shouldShowWaves.value
        }
      });
    }
  }
);

// Watch route visibility to dynamically pause/play background video
watch(isBackgroundActive, (active) => {
  if (videoRef.value) {
    if (active && !document.hidden) {
      videoRef.value.play().catch(() => {});
    } else {
      videoRef.value.pause();
    }
  }
});

onMounted(() => {
  if (shouldShowWaves.value) {
    initWorker();
  }

  if (prefs.value.backgroundType === 'video') {
    setTimeout(() => {
      isVideoLoaded.value = true;
    }, 300);
  }

  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', handleVisibilityChange);
});

onUnmounted(() => {
  window.removeEventListener('resize', resize);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  terminateWorker();
});
</script>

<template>
  <div class="fixed inset-0 -z-40 pointer-events-none bg-black overflow-hidden select-none">
    <!-- Image Background -->
    <Transition name="fade">
      <div 
        v-if="prefs.backgroundType === 'image' && backgroundUrl" 
        class="absolute inset-0 bg-cover bg-center transition-all duration-1000 will-change-transform"
        :style="{ backgroundImage: `url(${backgroundUrl})` }"
      ></div>
    </Transition>

    <!-- Video Background (Lazy loaded + Visibility aware) -->
    <Transition name="fade">
      <video
        ref="videoRef"
        v-if="prefs.backgroundType === 'video' && backgroundUrl && isVideoLoaded"
        class="absolute inset-0 w-full h-full object-cover transition-all duration-1000 will-change-transform"
        autoplay
        loop
        muted
        playsinline
        :src="backgroundUrl"
      ></video>
    </Transition>

    <!-- Waves Canvas -->
    <canvas 
      v-if="shouldShowWaves"
      ref="canvasRef" 
      class="w-full h-full opacity-65"
    ></canvas>

    <!-- Base Overlay for Depth -->
    <div class="absolute inset-0 bg-linear-to-b from-black/25 via-transparent to-black/45"></div>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active {
  transition: opacity 1s cubic-bezier(0.25, 1, 0.5, 1);
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
