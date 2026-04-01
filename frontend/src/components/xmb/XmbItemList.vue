<script setup lang="ts">
import type { XmbItem } from '@/composables/useXmbNavigation';
import XmbItemCard from './XmbItemCard.vue';

const props = defineProps<{
  items: XmbItem[];
  activeItemIdx: number;
  vSpacing: number;
  translateY: number;
}>();

const emit = defineEmits<{
  (e: 'select', idx: number): void;
  (e: 'enter'): void;
}>();
</script>

<template>
  <!--
    XmbItemList — Vertical axis.
    The whole list slides UP so the active item is always "at" the Cross origin Y.
    Overflow is hidden on the parent container (XmbContainer), 
    so items above origin are clipped without scrollbars.
  -->
  <div
    class="transition-transform duration-300 ease-out"
    :style="{
      transform: `translate3d(0, ${props.translateY}px, 0)`,
      willChange: 'transform',
    }"
  >
    <XmbItemCard
      v-for="(item, idx) in props.items"
      :key="item.id"
      :item="item"
      :is-active="idx === props.activeItemIdx"
      :style="{ height: `${props.vSpacing}px` }"
      @click="emit('select', idx)"
      @dblclick="emit('enter')"
    />
  </div>
</template>
