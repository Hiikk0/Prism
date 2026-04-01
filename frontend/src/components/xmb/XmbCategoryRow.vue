<script setup lang="ts">
import type { XmbCategory } from '@/composables/useXmbNavigation';

const props = defineProps<{
  categories: XmbCategory[];
  activeCatIdx: number;
  hSpacing: number;
  translateX: number;
}>();
</script>

<template>
  <!-- 
    XmbCategoryRow — Horizontal axis.
    The whole row is a single element that slides left/right.
    Each icon occupies hSpacing px wide. The active icon is at offsetX = 0 relative to origin.
  -->
  <div
    class="flex items-center transition-transform duration-300 ease-out"
    :style="{
      transform: `translate3d(${props.translateX}px, 0, 0)`,
      willChange: 'transform',
    }"
  >
    <div
      v-for="(cat, idx) in props.categories"
      :key="cat.id"
      class="flex flex-col items-center justify-center"
      :style="{ width: `${props.hSpacing}px` }"
    >
      <!-- Icon Container -->
      <div
        :class="[
          'flex items-center justify-center w-14 h-14 transition-all duration-300 ease-out',
          idx === props.activeCatIdx ? 'opacity-100 scale-110' : 'opacity-35 scale-90',
        ]"
      >
        <!-- Icon slot — accepts any icon component passed via category metadata -->
        <component
          :is="cat.icon"
          :size="idx === props.activeCatIdx ? 40 : 32"
          stroke-width="1.5"
        />
      </div>

      <!-- Category label shown only for active -->
      <span
        v-if="idx === props.activeCatIdx"
        class="text-[10px] font-bold tracking-[0.2em] uppercase text-white/50 mt-2 whitespace-nowrap"
      >
        {{ cat.label ?? cat.id }}
      </span>
    </div>
  </div>
</template>
