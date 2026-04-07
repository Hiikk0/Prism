<script setup lang="ts">
import { 
  ArrowUp, 
  ArrowDown, 
  ArrowLeft, 
  ArrowRight, 
  CornerDownLeft, 
  Mouse,
} from 'lucide-vue-next';

defineProps<{
  mode?: 'navigation' | 'auth' | 'modal';
}>();
</script>

<template>
  <div class="flex gap-8 text-[11px] tracking-[0.2em] font-bold text-white/40 uppercase pointer-events-none select-none drop-shadow-md transition-opacity duration-300">
    
    <!-- Move / Navigate (Always show) -->
    <div class="flex items-center gap-3">
      <div class="flex items-center -gap-1 opacity-60">
        <ArrowUp :size="14" stroke-width="3" />
        <ArrowDown :size="14" stroke-width="3" />
        <ArrowLeft :size="14" stroke-width="3" />
        <ArrowRight :size="14" stroke-width="3" />
      </div>
      <span class="mt-px">Navigate</span>
    </div>

    <!-- Select / Enter (Always show) -->
    <div class="flex items-center gap-2">
      <CornerDownLeft :size="14" stroke-width="3" class="opacity-60" />
      <span class="mt-px font-mono">ENTER</span>
      <span class="mt-px ml-1 opacity-70">Select</span>
    </div>

    <!-- Mouse Scroll (Always show) -->
    <div class="flex items-center gap-2">
      <Mouse :size="14" stroke-width="2.5" class="opacity-60" />
      <span class="mt-px">Scroll</span>
    </div>

    <!-- Back / Escape (Modal mode only - Hidden in selection menu) -->
    <div v-if="mode === 'modal'" class="flex items-center gap-2 text-white/70">
      <div class="border-2 border-white/40 px-1 py-0.5 rounded leading-none text-[9px] font-mono tracking-tighter">
        ESC
      </div>
      <span class="mt-px">Back</span>
    </div>
  </div>
</template>

<style scoped>
/* Sony XMB subtle text glow */
span {
  text-shadow: 0 0 10px rgba(255,255,255,0.1);
}
</style>
