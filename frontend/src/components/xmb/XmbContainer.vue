<script setup lang="ts">
import { toRef } from 'vue';
import { useXmbNavigation, type XmbCategory } from '@/composables/useXmbNavigation';
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-vue-next';

const props = defineProps<{
  categories: XmbCategory[];
  crossX?: string;
  crossY?: string;
  hSpacing?: number;
  vSpacing?: number;
  subItemOpen?: boolean;
}>();

const emit = defineEmits(['select', 'update:activeCategory', 'update:activeItem']);

const {
  activeCatIndex,
  activeItemIndex,
  activeCategory,
  activeItem,
  horizontalTransform,
  verticalTransform,
  handleKeydown,
  handleWheel,
  setCategory,
  setItem,
  hSpacing: hSpace,
  vSpacing: vSpace,
  crossX: cX,
  crossY: cY
} = useXmbNavigation(toRef(props, 'categories'), {
  crossX: props.crossX,
  crossY: props.crossY,
  hSpacing: props.hSpacing,
  vSpacing: props.vSpacing
});

// Expose these for the parent (AuthView)
defineExpose({
  activeCategory,
  activeItem,
  activeCatIndex,
  activeItemIndex,
  handleKeydown
});

</script>

<template>
  <div class="h-full w-full relative overflow-hidden focus:outline-none" @keydown="handleKeydown" tabindex="0">
    
    <!-- Origin point (The Cross) -->
    <div 
      class="absolute transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)]"
      :style="{ left: cX, top: cY }"
    >
      
      <!-- HORIZONTAL AXIS: CATEGORIES (Top Layer Z=20) -->
      <div 
        class="absolute flex items-center transition-transform duration-300 ease-out z-20"
        :style="{ transform: horizontalTransform }"
        v-show="!subItemOpen"
        @wheel.stop="handleWheel($event, 'category')"
      >
        <div 
          v-for="(cat, idx) in categories" 
          :key="cat.id"
          class="flex flex-col items-center justify-center transition-all duration-300 relative cursor-pointer"
          :style="{ width: `${hSpace}px` }"
          @click="setCategory(idx)"
        >
          <div 
            class="transition-all duration-300 absolute -top-16"
            :class="{
              'scale-110 opacity-100 text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.6)]': idx === activeCatIndex,
              'scale-90 opacity-40 text-gray-400': idx !== activeCatIndex
            }"
          >
            <component :is="cat.icon" :size="48" stroke-width="1.5" />
          </div>
          
          <span 
            class="absolute -top-24 text-[11px] tracking-[0.3em] uppercase font-bold transition-opacity duration-300 whitespace-nowrap"
            :class="idx === activeCatIndex ? 'opacity-60 text-white' : 'opacity-0'"
          >
            {{ cat.title }}
          </span>
        </div>
      </div>

      <!-- VERTICAL AXIS: ITEMS (Lower Layer Z=10) -->
      <div 
        v-if="!subItemOpen && activeCategory"
        class="absolute flex flex-col transition-transform duration-300 ease-out z-10"
        :style="{ 
          transform: `translate(calc(-${hSpace/2}px), -50%)` 
        }"
        @wheel.stop="handleWheel($event, 'item')"
      >
        <div 
          class="flex flex-col transition-transform duration-300 ease-out"
          :style="{ transform: verticalTransform }"
        >
          <div 
            v-for="(item, idx) in activeCategory.items" 
            :key="item.id"
            class="flex items-center transition-all duration-300 w-[600px] cursor-pointer group"
            :style="{ height: `${vSpace}px` }"
            @click="setItem(idx); emit('select', item)"
          >
            <div 
              class="absolute left-[-20px] w-full h-[54px] bg-white/10 rounded-lg pointer-events-none transition-opacity duration-300"
              :class="{ 'opacity-100': idx === activeItemIndex, 'opacity-0': idx !== activeItemIndex }"
              style="backdrop-filter: blur(4px);"
            ></div>

            <div 
              class="w-16 flex justify-center z-10"
              :class="{
                'opacity-100 text-white scale-110': idx === activeItemIndex,
                'opacity-30 text-gray-400': idx !== activeItemIndex
              }"
            >
              <component :is="item.icon" :size="32" stroke-width="1.5" />
            </div>

            <span 
              class="ml-6 z-10 transition-all text-2xl tracking-wide font-light whitespace-nowrap"
              :class="{
                'text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.8)]': idx === activeItemIndex,
                'text-white/20 origin-left scale-90': idx !== activeItemIndex
              }"
            >
              {{ item.label() }}
            </span>
          </div>
        </div>
      </div>

    </div>

    <!-- Navigation Hints (Bottom Right) -->
    <slot name="footer">
      <div class="absolute bottom-8 right-12 flex gap-8 text-[11px] tracking-widest font-bold text-white/20 uppercase pointer-events-none">
         <span class="flex items-center gap-2 font-mono"><ArrowUp :size="14"/> <ArrowDown :size="14"/> SELECT</span>
         <span class="flex items-center gap-2 font-mono"><ArrowLeft :size="14"/> <ArrowRight :size="14"/> CATEGORY</span>
         <span class="border border-white/20 px-2 rounded">ENTER</span>
      </div>
    </slot>
  </div>
</template>

<style scoped>
/* Standard XMB navigation should feel snappy but smooth */
:focus {
  outline: none;
}
</style>
