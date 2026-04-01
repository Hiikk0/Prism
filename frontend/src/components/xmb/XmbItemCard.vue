<script setup lang="ts">
import type { XmbItem } from '@/composables/useXmbNavigation';

const props = defineProps<{
  item: XmbItem;
  isActive: boolean;
}>();
</script>

<template>
  <div
    class="flex items-center gap-5 cursor-pointer transition-all duration-300 ease-out"
    :class="props.isActive ? 'opacity-100 scale-100' : 'opacity-35 scale-95 origin-left'"
    style="width: max-content;"
  >
    <!-- Icon -->
    <div
      class="flex items-center justify-center shrink-0 transition-all duration-300"
      :class="props.isActive ? 'w-9 h-9 text-white' : 'w-7 h-7 text-white/60'"
    >
      <component
        v-if="props.item.icon"
        :is="props.item.icon"
        :size="props.isActive ? 28 : 22"
        stroke-width="1.5"
      />
    </div>

    <!-- Label -->
    <span
      class="whitespace-nowrap font-light tracking-wide transition-all duration-300"
      :class="props.isActive ? 'text-white text-2xl drop-shadow-[0_0_8px_rgba(255,255,255,0.6)]' : 'text-white/60 text-xl'"
    >
      {{ typeof props.item.label === 'function' ? props.item.label() : props.item.label }}
    </span>
  </div>
</template>

