<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed, nextTick } from 'vue';

const props = defineProps<{
  active: boolean;
  speed?: number; // Pixels per second
  delay?: number; // Milliseconds before starting
  align?: 'left' | 'right';
}>();

const containerRef = ref<HTMLElement | null>(null);
const contentRef = ref<HTMLElement | null>(null);
const isOverflowing = ref(false);
const duration = ref(0);

const checkOverflow = () => {
  if (!containerRef.value || !contentRef.value) return;
  
  const containerWidth = containerRef.value.offsetWidth;
  const firstContent = contentRef.value.querySelector('.marquee-content');
  if (!firstContent) return;
  
  // CRITICAL: use scrollWidth to get the full intrinsic width 
  // even if the element is currently truncated with ellipsis.
  const contentWidth = (firstContent as HTMLElement).scrollWidth;
  const spacerWidth = 80; 
  
  isOverflowing.value = contentWidth > containerWidth;
  
  // The animation moves one full cycle: content + spacer
  const loopDistance = contentWidth + spacerWidth;
  
  // Calculate duration based on speed (default: 50px/s)
  const speed = props.speed || 50;
  duration.value = loopDistance / speed;
};

let observer: ResizeObserver | null = null;

onMounted(() => {
  checkOverflow();
  observer = new ResizeObserver(() => checkOverflow());
  if (containerRef.value) observer.observe(containerRef.value);
  if (contentRef.value) observer.observe(contentRef.value);
});

onUnmounted(() => {
  observer?.disconnect();
});

watch(() => props.active, async (newVal) => {
  if (newVal) {
    await nextTick();
    checkOverflow();
  }
});

const animationStyle = computed(() => {
  if (!props.active || !isOverflowing.value) return {};

  const totalDuration = duration.value + 2;

  return {
    '--duration': `${totalDuration}s`,
    '--delay': `${props.delay || 1000}ms`
  };
});
</script>

<template>
  <div 
    ref="containerRef" 
    class="marquee-container" 
    :class="[
      align === 'right' ? 'is-right' : 'is-left',
      { 'is-overflowing': isOverflowing },
      { 'is-active': active }
    ]"
  >
    <div 
      ref="contentRef" 
      class="marquee-wrapper" 
      :style="animationStyle"
    >
      <div class="marquee-content">
        <slot></slot>
      </div>
      <!-- Seamless loop duplicate -->
      <template v-if="active && isOverflowing">
        <div class="marquee-spacer"></div>
        <div class="marquee-content">
          <slot></slot>
        </div>
        <div class="marquee-spacer"></div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.marquee-container {
  overflow: hidden;
  width: 100%;
  position: relative;
  white-space: nowrap;
}

.marquee-wrapper {
  display: flex;
  width: 100%;
  justify-content: flex-start;
}

.marquee-content {
  display: block;
  white-space: nowrap;
}

.marquee-spacer {
  width: 80px; 
  flex-shrink: 0;
}

/* ==============================================
   STATE 1 & 2: Fits container (Not Overflowing) 
   ============================================== */
.marquee-container:not(.is-overflowing).is-right .marquee-wrapper {
  justify-content: flex-end;
}

/* ==============================================
   STATE 3: Overflows & Not Selected
   ============================================== */
.marquee-container.is-overflowing:not(.is-active) .marquee-wrapper {
  justify-content: flex-start; 
}
.marquee-container.is-overflowing:not(.is-active) .marquee-content {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ==============================================
   STATE 4: Overflows & Selected
   ============================================== */
.marquee-container.is-overflowing.is-active .marquee-wrapper {
  width: max-content;
  justify-content: flex-start;
  animation: xmb-marquee-loop var(--duration) linear var(--delay) infinite;
}
.marquee-container.is-overflowing.is-active .marquee-content {
  display: inline-block; /* Prevent container constraints */
}

/* Smooth edges during animation */
.marquee-container.is-overflowing.is-active {
  mask-image: linear-gradient(
    to right,
    transparent 0%,
    black 20px,
    black calc(100% - 20px),
    transparent 100%
  );
  -webkit-mask-image: linear-gradient(
    to right,
    transparent 0%,
    black 20px,
    black calc(100% - 20px),
    transparent 100%
  );
}

@keyframes xmb-marquee-loop {
  0%, 20% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(-50%); 
  }
}
</style>
