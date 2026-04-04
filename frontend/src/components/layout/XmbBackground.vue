<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

const canvasRef = ref<HTMLCanvasElement | null>(null);
let ctx: CanvasRenderingContext2D | null = null;
let animationId: number;
let startTime: number;

// Animation state
const STAGE_DELAY = 5000; // 5 seconds
const TRANSITION_DURATION = 5000; // 5 seconds smooth transition
const LINE_COUNT = 40;
const SPLIT_X_PERCENT = 0.45; // Burst point at 45% of width

interface Line {
  frequency: number;
  phase: number;
  phaseSpeed: number;
  amplitudeFactor: number;
  hue: number;
  hueSpeed: number;
  width: number;
}

const lines: Line[] = [];

// Initialize bundle lines
const initLines = () => {
  for (let i = 0; i < LINE_COUNT; i++) {
    lines.push({
      frequency: 0.005 + Math.random() * 0.015,
      phase: Math.random() * Math.PI * 2,
      phaseSpeed: 0.02 + Math.random() * 0.05,
      amplitudeFactor: 20 + Math.random() * 80,
      hue: Math.random() * 360,
      hueSpeed: 0.1 + Math.random() * 0.5,
      width: 0.8 + Math.random() * 1.2 // Strictly 1-2px
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
  if (!ctx || !canvasRef.value) return;

  if (!startTime) startTime = time;
  const elapsed = time - startTime;
  
  // Transition Progress (0 to 1) over TRANSITION_DURATION after STAGE_DELAY
  const progress = Math.min(1, Math.max(0, (elapsed - STAGE_DELAY) / TRANSITION_DURATION));
  const isStarted = elapsed > STAGE_DELAY;

  const width = window.innerWidth;
  const height = window.innerHeight;
  const centerY = height / 2;
  const splitX = width * SPLIT_X_PERCENT;

  // Clear canvas
  ctx.clearRect(0, 0, width, height);

  // 1. Draw the Pulsating Base Line (Main Path)
  const pulse = (Math.sin(time * 0.002) + 1) / 2; // 0 to 1
  const baseWidth = 8 + pulse * 4; // ~10px total
  const baseAlpha = 0.6 + pulse * 0.4;
  
  // Left Segment (Constant)
  ctx.beginPath();
  ctx.moveTo(0, centerY);
  ctx.lineTo(splitX, centerY);
  ctx.strokeStyle = `rgba(255, 255, 255, ${baseAlpha})`;
  ctx.lineWidth = baseWidth;
  ctx.shadowBlur = isStarted ? 20 * progress : 15;
  ctx.shadowColor = 'rgba(255, 255, 255, 0.4)';
  ctx.stroke();

  // Right Segment (Fades out after 5s)
  if (progress < 1) {
    ctx.beginPath();
    ctx.moveTo(splitX, centerY);
    ctx.lineTo(width, centerY);
    ctx.strokeStyle = `rgba(255, 255, 255, ${baseAlpha * (1 - progress)})`;
    ctx.lineWidth = baseWidth * (1 - progress);
    ctx.stroke();
  }

  // 2. Draw the Sinusoidal Bundle (Fades in and curves out)
  if (isStarted) {
    lines.forEach((line) => {
      if (!ctx) return;
      line.phase -= line.phaseSpeed; // Inverted: flows away from center (right)
      line.hue = (line.hue + line.hueSpeed) % 360;

      ctx.beginPath();
      ctx.lineWidth = line.width;
      // Fade in alpha over transition
      const waveAlpha = progress * 0.65;
      ctx.strokeStyle = `hsla(${line.hue}, 80%, 75%, ${waveAlpha})`;
      
      ctx.moveTo(splitX, centerY);
      
      for (let x = splitX; x < width; x += 5) {
        // Amplitude is multiplied by progress to ensure lines start flat and curve away
        const dist = (x - splitX) / (width - splitX);
        const amplitude = dist * line.amplitudeFactor * progress;
        const y = centerY + Math.sin(x * line.frequency + line.phase) * amplitude;
        ctx.lineTo(x, y);
      }
      
      ctx.stroke();
    });

    // 3. Glowing Core at the split point (Fades in)
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
  <canvas 
    ref="canvasRef" 
    class="fixed inset-0 w-full h-full pointer-events-none -z-40"
  ></canvas>
</template>

<style scoped>
canvas {
  filter: blur(0.5px); /* Subtle smoothing */
}
</style>
