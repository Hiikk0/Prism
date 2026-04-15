<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { useAuthStore } from '@/stores/auth';

const authStore = useAuthStore();
const canvasRef = ref<HTMLCanvasElement | null>(null);
let ctx: CanvasRenderingContext2D | null = null;
let animationId: number;
let startTime: number;

const prefs = computed(() => authStore.user?.preferences || {
  backgroundType: 'waves' as const,
  performanceMode: 'high' as const,
  backgroundMediaId: ''
});

const isWaves = computed(() => prefs.value.backgroundType === 'waves');
const isLowPerf = computed(() => prefs.value.performanceMode === 'low');

// Animation state
const STAGE_DELAY = 5000;
const TRANSITION_DURATION = 5000;
const LINE_COUNT = computed(() => isLowPerf.value ? 12 : 40);
const SPLIT_X_PERCENT = 0.45;

interface Line {
  frequency: number;
  phase: number;
  phaseSpeed: number;
  amplitudeFactor: number;
  hue: number;
  hueSpeed: number;
  width: number;
}

const lines = ref<Line[]>([]);

const initLines = () => {
  lines.value = [];
  const count = LINE_COUNT.value;
  for (let i = 0; i < count; i++) {
    lines.value.push({
      frequency: 0.005 + Math.random() * 0.015,
      phase: Math.random() * Math.PI * 2,
      phaseSpeed: 0.02 + Math.random() * 0.05,
      amplitudeFactor: 20 + Math.random() * 80,
      hue: Math.random() * 360,
      hueSpeed: 0.1 + Math.random() * 0.5,
      width: 0.8 + Math.random() * 1.2
    });
  }
};

const resize = () => {
  if (canvasRef.value) {
    const dpr = window.devicePixelRatio || 1;
    canvasRef.value.width = window.innerWidth * dpr;
    canvasRef.value.height = window.innerHeight * dpr;
    if (ctx) ctx.scale(dpr, dpr);
  }
};

const animate = (time: number) => {
  // Optimization: Don't animate if waves are disabled OR tab is hidden
  if (!isWaves.value || document.hidden || !ctx || !canvasRef.value) {
    animationId = requestAnimationFrame(animate);
    return;
  }

  if (!startTime) startTime = time;
  const elapsed = time - startTime;
  
  const progress = Math.min(1, Math.max(0, (elapsed - STAGE_DELAY) / TRANSITION_DURATION));
  const isStarted = elapsed > STAGE_DELAY;

  const width = window.innerWidth;
  const height = window.innerHeight;
  const centerY = height / 2;
  const splitX = width * SPLIT_X_PERCENT;

  ctx.clearRect(0, 0, width, height);

  // 1. Draw Base Line
  const pulse = (Math.sin(time * 0.002) + 1) / 2;
  const baseWidth = 8 + pulse * 4;
  const baseAlpha = 0.6 + pulse * 0.4;
  
  ctx.beginPath();
  ctx.moveTo(0, centerY);
  ctx.lineTo(splitX, centerY);
  ctx.strokeStyle = `rgba(255, 255, 255, ${baseAlpha})`;
  ctx.lineWidth = baseWidth;
  
  // Optimization: Shadow is expensive, only apply it in high performance mode 
  // or use a simpler version
  if (!isLowPerf.value) {
    ctx.shadowBlur = isStarted ? 20 * progress : 15;
    ctx.shadowColor = 'rgba(255, 255, 255, 0.4)';
  }
  
  ctx.stroke();
  if (!isLowPerf.value) {
    ctx.shadowBlur = 0; // Reset for subsequent drawing
  }

  if (progress < 1) {
    ctx.beginPath();
    ctx.moveTo(splitX, centerY);
    ctx.lineTo(width, centerY);
    ctx.strokeStyle = `rgba(255, 255, 255, ${baseAlpha * (1 - progress)})`;
    ctx.lineWidth = baseWidth * (1 - progress);
    ctx.stroke();
  }

  // 2. Draw Bundle
  if (isStarted) {
    lines.value.forEach((line) => {
      if (!ctx) return;
      line.phase -= line.phaseSpeed;
      line.hue = (line.hue + line.hueSpeed) % 360;

      ctx.beginPath();
      ctx.lineWidth = line.width;
      const waveAlpha = progress * 0.65;
      ctx.strokeStyle = `hsla(${line.hue}, 80%, 75%, ${waveAlpha})`;
      
      ctx.moveTo(splitX, centerY);
      
      const step = isLowPerf.value ? 10 : 5; // Optimization: Fewer segments in low perf
      for (let x = splitX; x < width; x += step) {
        const dist = (x - splitX) / (width - splitX);
        const amplitude = dist * line.amplitudeFactor * progress;
        const y = centerY + Math.sin(x * line.frequency + line.phase) * amplitude;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    });

    // 3. Glowing Core
    const glowRadius = 30 * progress;
    if (glowRadius > 0) {
      const gradient = ctx.createRadialGradient(splitX, centerY, 0, splitX, centerY, glowRadius);
      gradient.addColorStop(0, 'white');
      gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.8)');
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(splitX, centerY, glowRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  animationId = requestAnimationFrame(animate);
};

watch(LINE_COUNT, () => initLines());

onMounted(() => {
  ctx = canvasRef.value?.getContext('2d') || null;
  initLines();
  resize();
  window.addEventListener('resize', resize);
  animationId = requestAnimationFrame(animate);
});

onUnmounted(() => {
  window.removeEventListener('resize', resize);
  cancelAnimationFrame(animationId);
});
</script>

<template>
  <div class="fixed inset-0 -z-40 pointer-events-none bg-black overflow-hidden">
    <!-- Image Background -->
    <div 
      v-if="prefs.backgroundType === 'image'" 
      class="absolute inset-0 bg-cover bg-center transition-opacity duration-1000"
      :style="{ backgroundImage: `url(${prefs.backgroundMediaId})` }"
    ></div>

    <!-- Video Background -->
    <video
      v-if="prefs.backgroundType === 'video'"
      class="absolute inset-0 w-full h-full object-cover transition-opacity duration-1000"
      autoplay
      loop
      muted
      playsinline
      :src="prefs.backgroundMediaId"
    ></video>

    <!-- Waves Canvas -->
    <canvas 
      v-show="isWaves"
      ref="canvasRef" 
      class="w-full h-full opacity-60"
    ></canvas>

    <!-- Base Overlay for Depth -->
    <div class="absolute inset-0 bg-linear-to-b from-black/20 via-transparent to-black/40"></div>
  </div>
</template>

<style scoped>
/* Removed expensive blur filter */
</style>
