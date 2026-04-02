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
  vSpacing: props.vSpacing,
  onSelect: (item) => emit('select', item)
});

defineExpose({
  activeCategory,
  activeItem,
  activeCatIndex,
  activeItemIndex,
  handleKeydown
});
</script>

<template>
  <div class="h-full w-full relative overflow-hidden focus:outline-none" tabindex="0">

    <!-- Origin point -->
    <div
      class="absolute transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)]"
      :style="{ left: cX, top: cY }"
    >

      <!-- HORIZONTAL AXIS -->
      <div
        class="absolute flex items-center transition-transform duration-300 ease-out"
        :style="{ transform: horizontalTransform }"
        v-show="!subItemOpen"
      >
        <div
          v-for="(cat, idx) in categories"
          :key="cat.id"
          class="flex flex-col items-center justify-center transition-all duration-300 relative cursor-pointer"
          :style="{ width: `${hSpace}px` }"
          :class="idx === activeCatIndex ? 'z-50' : 'z-20'"
          @click="setCategory(idx)"
          @wheel.stop="handleWheel($event, 'category')"
        >
          <!-- Category Icon -->
          <div
            class="transition-all duration-300 absolute -top-16 flex flex-col items-center"
            :class="{
              'scale-110 opacity-100 text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.6)]': idx === activeCatIndex,
              'scale-90 opacity-40 text-gray-400': idx !== activeCatIndex
            }"
          >
            <component :is="cat.icon" :size="48" stroke-width="1.5" />
            <span
              class="absolute -top-12 text-[11px] tracking-[0.3em] uppercase font-bold transition-opacity duration-300 whitespace-nowrap"
              :class="idx === activeCatIndex ? 'opacity-60 text-white' : 'opacity-0'"
            >
              {{ cat.title }}
            </span>
          </div>

          <!--
            TWO-ZONE CLIP SYSTEM
            ════════════════════════════════════════════════════════
            Category icons span roughly Y = -88px .. -40px from origin.
            We create a dead zone in that range using overflow:hidden:

             ① PAST zone  : bottom edge = -90px (just above icon tops)
                Items formula: top = PAST_H + (idx - activeIdx) * vSpace
                With vSpace=100 → item A-1 lands at PAST_H-100 (10px above
                zone bottom, i.e., at -100px global < -90px boundary ✅)

             ② FUTURE zone: top edge = 0 (at origin, 40px below icon bottom)
                Items formula: top = (idx - activeIdx) * vSpace
                Active → top=0, past items → negative → clipped ✅
            ════════════════════════════════════════════════════════
          -->
          <template v-if="idx === activeCatIndex">

            <!-- ① PAST ZONE: above category icons -->
            <!-- bottom = -90px from origin  →  top = -(PAST_H + 90) -->
            <div
              class="absolute overflow-hidden pointer-events-none"
              :style="{
                left: '50%',
                transform: 'translateX(-50%)',
                width: '600px',
                top: `${-(3 * vSpace + 90)}px`,
                height: `${3 * vSpace}px`
              }"
            >
              <div
                v-for="(item, itemIdx) in cat.items"
                :key="`p-${item.id}`"
                class="absolute w-full flex items-center pointer-events-auto cursor-pointer"
                :style="{
                  top: `${3 * vSpace + (itemIdx - activeItemIndex) * vSpace}px`,
                  height: `${vSpace}px`,
                  transition: 'top 0.3s cubic-bezier(0.25,1,0.5,1)'
                }"
                @click="setItem(itemIdx); emit('select', item)"
              >
                <div class="w-16 flex justify-center z-10 text-gray-400 opacity-25">
                  <component :is="item.icon" :size="28" stroke-width="1.5" />
                </div>
                <span class="ml-6 z-10 text-xl tracking-wide font-light whitespace-nowrap text-white/20">
                  {{ item.label() }}
                </span>
              </div>
            </div>

            <!-- ② FUTURE / ACTIVE ZONE: below category icons -->
            <!-- top = 0 (at origin) -->
            <div
              class="absolute overflow-hidden pointer-events-none"
              :style="{
                left: '50%',
                transform: 'translateX(-50%)',
                width: '600px',
                top: '0px',
                height: `${5 * vSpace}px`
              }"
              @wheel.stop="handleWheel($event, 'item')"
            >
              <div
                v-for="(item, itemIdx) in cat.items"
                :key="`f-${item.id}`"
                class="absolute w-full flex items-center pointer-events-auto cursor-pointer group"
                :style="{
                  top: `${(itemIdx - activeItemIndex) * vSpace}px`,
                  height: `${vSpace}px`,
                  transition: 'top 0.3s cubic-bezier(0.25,1,0.5,1)'
                }"
                @click="setItem(itemIdx); emit('select', item)"
              >
                <!-- Focus Box -->
                <div
                  class="absolute left-[-20px] w-full h-[60px] bg-white/10 rounded-lg pointer-events-none transition-opacity duration-300"
                  :class="{ 'opacity-100': itemIdx === activeItemIndex, 'opacity-0': itemIdx !== activeItemIndex }"
                  style="backdrop-filter: blur(4px);"
                ></div>

                <!-- Icon -->
                <div
                  class="w-16 flex justify-center z-10 transition-all duration-300"
                  :class="{
                    'opacity-100 text-white scale-110': itemIdx === activeItemIndex,
                    'opacity-30 text-gray-400': itemIdx !== activeItemIndex
                  }"
                >
                  <component :is="item.icon" :size="32" stroke-width="1.5" />
                </div>

                <!-- Text -->
                <span
                  class="ml-6 z-10 transition-all duration-300 text-2xl tracking-wide font-light whitespace-nowrap"
                  :class="{
                    'text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.8)]': itemIdx === activeItemIndex,
                    'text-white/20 origin-left scale-90': itemIdx !== activeItemIndex
                  }"
                >
                  {{ item.label() }}
                </span>
              </div>
            </div>

          </template>

        </div>
      </div>

    </div>

    <!-- Navigation Hints -->
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
:focus {
  outline: none;
}
</style>
