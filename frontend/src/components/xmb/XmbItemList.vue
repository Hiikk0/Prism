<script setup lang="ts">
import { computed } from 'vue';
import { type XmbItem } from '@/composables/useXmbNavigation';
import { useAuthStore } from '@/stores/auth';

const props = defineProps<{
  items: XmbItem[];
  activeIndex: number;
  vSpacing: number;
  verticalTransform: string;
}>();

const emit = defineEmits(['select', 'update:active']);

const authStore = useAuthStore();
const isLowPerf = computed(() => authStore.user?.preferences?.performanceMode === 'low');
</script>

<template>
  <div 
    class="flex flex-col transition-transform duration-300 ease-out"
    :style="{ transform: verticalTransform }"
  >
    <div 
      v-for="(item, idx) in items" 
      :key="item.id"
      class="flex items-center transition-all duration-300 w-[600px] cursor-pointer group relative"
      :style="{ height: `${vSpacing}px` }"
      @click="emit('update:active', idx); emit('select', item)"
    >
      <!-- Highlight Box -->
      <div 
        class="absolute left-[-20px] w-full h-[54px] bg-white/10 rounded-lg pointer-events-none transition-opacity duration-300 z-0"
        :class="{ 'opacity-100': idx === activeIndex, 'opacity-0': idx !== activeIndex }"
        :style="isLowPerf ? {} : { backdropFilter: 'blur(4px)' }"
      ></div>

      <!-- Item Icon -->
      <div 
        class="w-16 flex justify-center z-10"
        :class="{
          'opacity-100 text-white scale-110 drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]': idx === activeIndex,
          'opacity-30 text-gray-400': idx !== activeIndex
        }"
      >
        <component :is="item.icon" :size="32" stroke-width="1.5" />
      </div>

      <!-- Item Text -->
      <span 
        class="ml-6 z-10 transition-all text-2xl tracking-wide font-light whitespace-nowrap"
        :class="{
          'text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.8)]': idx === activeIndex,
          'text-white/20 origin-left scale-90': idx !== activeIndex
        }"
      >
        {{ item.label() }}
      </span>
    </div>
  </div>
</template>
