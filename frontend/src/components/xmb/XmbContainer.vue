<script setup lang="ts">
import { toRef, ref, watch, onMounted, onUnmounted } from 'vue';
import { useXmbNavigation, type XmbCategory } from '@/composables/useXmbNavigation';
import XmbHints from './XmbHints.vue';
import XmbMarquee from './XmbMarquee.vue';

const props = defineProps<{
  categories: XmbCategory[];
  crossX?: string;
  crossY?: string;
  hSpacing?: number;
  vSpacing?: number;
  subItemOpen?: boolean;
  hintMode?: 'navigation' | 'auth' | 'modal';
}>();

const emit = defineEmits(['select', 'update:activeCategory', 'update:activeItem']);

const {
  activeCatIndex,
  activeItemIndex,
  activeSubItemIndex,
  subItemOpen,
  activeCategory,
  activeItem,
  activeSubItem,
  isEditing,
  horizontalTransform,
  handleKeydown,
  handleWheel,
  setCategory,
  setItem,
  setSubItem,
  selectFocused,
  closeSubMenu,
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

const editValue = ref('');
const inputRef = ref<HTMLInputElement | null>(null);

const setInputRef = (el: any) => {
  if (el) inputRef.value = el as HTMLInputElement;
};

watch(isEditing, (newVal) => {
  if (newVal && activeSubItem.value) {
    const val = activeSubItem.value.value?.();
    editValue.value = val !== undefined ? String(val) : '';
    // Use setTimeout to ensure DOM is ready and transitions don't fight focus
    setTimeout(() => {
      if (inputRef.value) {
        inputRef.value.focus();
        if (activeSubItem.value?.type !== 'password') {
          inputRef.value.select();
        }
      }
    }, 50);
  }
});

const handleEditSubmit = () => {
  if (activeSubItem.value?.onUpdate) {
    activeSubItem.value.onUpdate(editValue.value);
  }
  isEditing.value = false;
};

const handleEditCancel = () => {
  isEditing.value = false;
};

const handleCategoryClick = (idx: number) => {
  if (idx === activeCatIndex.value) {
    if (subItemOpen.value) {
      subItemOpen.value = false;
      isEditing.value = false;
    }
  } else {
    setCategory(idx);
  }
};

const handleItemClick = (idx: number) => {
  if (idx === activeItemIndex.value) {
    if (subItemOpen.value) {
      subItemOpen.value = false;
      isEditing.value = false;
    } else {
      selectFocused();
    }
  } else {
    setItem(idx);
    selectFocused();
  }
};

// Global keyboard listeners for better UX
const globalKeyHandler = (e: KeyboardEvent) => {
  handleKeydown(e);
};

onMounted(() => {
  window.addEventListener('keydown', globalKeyHandler);
});

onUnmounted(() => {
  window.removeEventListener('keydown', globalKeyHandler);
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
  <div 
    class="h-full w-full relative overflow-hidden focus:outline-none" 
    tabindex="0"
    @wheel="handleWheel($event, 'item')"
    @click="closeSubMenu"
  >

    <!-- Origin point -->
    <div
      class="absolute transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)]"
      :style="{ left: cX, top: cY }"
    >
      <!-- 
        CATEGORY SCROLL STRIP
        ════════════════════════════════════════════════════════
        Spans the full width at the category icon height. 
        Catches wheel events to scroll categories even when 
        not directly over an icon. Z-index 45 is below icons (50).
        ════════════════════════════════════════════════════════
      -->
      <div
        class="absolute -translate-x-1/2 w-[5000px] h-[130px] -top-[130px] z-10 pointer-events-auto cursor-default"
        @wheel.stop="handleWheel($event, 'category')"
      ></div>

      <!-- HORIZONTAL AXIS -->
      <div
        class="absolute flex items-center transition-transform duration-300 ease-out z-20"
        :style="{ transform: horizontalTransform }"
      >
        <div
          v-for="(cat, idx) in categories"
          :key="cat.id"
          class="flex flex-col items-center justify-center transition-all duration-300 relative cursor-pointer"
          :style="{ width: `${hSpace}px` }"
          :class="[
            idx === activeCatIndex ? 'z-50' : 'z-20',
            subItemOpen && idx !== activeCatIndex ? 'opacity-0 scale-90 blur-sm' : ''
          ]"
          @click.stop="handleCategoryClick(idx)"
        >
          <!-- Category Icon (Dimmed if subItemOpen) -->
          <div
            class="transition-all duration-300 absolute -top-16 flex flex-col items-center hover:scale-110 active:scale-95 group"
            :class="{
              'scale-110 opacity-100 text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.6)]': idx === activeCatIndex && !subItemOpen,
              'scale-100 opacity-40 text-white': idx === activeCatIndex && subItemOpen,
              'scale-90 opacity-40 text-gray-400': idx !== activeCatIndex
            }"
            @wheel.stop="handleWheel($event, 'category')"
          >
            <component :is="cat.icon" :size="48" stroke-width="1.5" />
            <span
              class="absolute -top-12 text-[11px] tracking-[0.3em] uppercase font-bold transition-opacity duration-300 whitespace-nowrap"
              :class="idx === activeCatIndex ? 'opacity-60 text-white' : 'opacity-0'"
            >
              {{ cat.title }}
            </span>
          </div>

          <template v-if="idx === activeCatIndex">
            <div
              class="absolute z-60 transition-all duration-300 pointer-events-auto"
              :style="{
                left: '50%',
                transform: 'translateX(-50%)',
                width: '600px',
                top: '0px'
              }"
              :class="subItemOpen ? 'opacity-40 blur-[2px]' : 'opacity-100'"
              @wheel.stop="handleWheel($event, 'item')"
            >
              <div
                v-for="(item, itemIdx) in cat.items"
                :key="item.id"
                class="xmb-item absolute w-full flex items-center pointer-events-auto cursor-pointer group"
                :class="{
                  'is-passed': itemIdx < activeItemIndex,
                  'is-active': itemIdx === activeItemIndex,
                  'is-future': itemIdx > activeItemIndex
                }"
                :style="{
                  top: `${(itemIdx - activeItemIndex) * vSpace - (itemIdx < activeItemIndex ? 90 : 0)}px`,
                  height: `${vSpace}px`
                }"
                @click.stop="handleItemClick(itemIdx)"
                @wheel.stop="handleWheel($event, 'item')"
              >
                <!-- Focus Box -->
                <div
                  class="absolute left-[-20px] w-full h-[60px] bg-white/10 rounded-lg pointer-events-none transition-all duration-300"
                  :class="itemIdx === activeItemIndex && !subItemOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95'"
                  style="backdrop-filter: blur(4px);"
                ></div>

                <!-- Item Content -->
                <div class="flex items-center w-full transition-all duration-300">
                  <div class="w-16 flex justify-center z-10 transition-all duration-300 item-icon-container">
                    <component :is="item.icon" stroke-width="1.5" />
                  </div>
                  <span class="ml-6 z-10 transition-all duration-300 tracking-wide font-light whitespace-nowrap item-text">
                    {{ item.label() }}
                  </span>
                </div>
              </div>
            </div>

            <!-- SUB-ITEM LIST (Appears to the right of active item) -->
            <transition name="sub-menu">
              <div 
                v-if="subItemOpen && activeItem?.subItems"
                class="absolute left-[350px] top-0 z-70 w-[450px] pointer-events-none"
              >
                <div
                  v-for="(sub, sIdx) in activeItem.subItems"
                  :key="sub.id"
                  class="absolute w-full flex items-center justify-between pointer-events-auto cursor-pointer group px-6 py-4 rounded-xl transition-all duration-300"
                  :class="{
                    'bg-white/10 text-white scale-105 shadow-[0_0_20px_rgba(255,255,255,0.1)]': sIdx === activeSubItemIndex,
                    'text-white/40': sIdx !== activeSubItemIndex
                  }"
                  :style="{
                    top: `${(sIdx - activeSubItemIndex) * 80}px`,
                    backdropFilter: sIdx === activeSubItemIndex ? 'blur(8px)' : 'none'
                  }"
                  @click.stop="setSubItem(sIdx); selectFocused()"
                >
                  <XmbMarquee 
                    :active="sIdx === activeSubItemIndex"
                    class="text-xl font-light tracking-wide transition-all duration-300 mr-4 flex-1 text-left" 
                  >
                    {{ sub.label() }}
                  </XmbMarquee>
                  
                  <span v-if="sub.value" class="text-sm font-bold uppercase tracking-widest opacity-60 shrink-0 max-w-[240px] flex-1 flex justify-end text-right">
                    <template v-if="isEditing && sIdx === activeSubItemIndex && (sub.type === 'text' || sub.type === 'password')">
                      <input 
                        :ref="setInputRef"
                        v-model="editValue"
                        :type="sub.type"
                        class="bg-white/10 border-b border-white/30 outline-none px-2 py-0.5 text-white w-full text-right font-medium pointer-events-auto"
                        @keydown.enter.stop="handleEditSubmit"
                        @keydown.esc.stop="handleEditCancel"
                        @blur="handleEditSubmit"
                        @click.stop
                      />
                    </template>
                    <template v-else>
                        <XmbMarquee
                          :active="sIdx === activeSubItemIndex"
                          class="pointer-events-none w-full"
                          align="right"
                        >
                          <span class="w-full text-right">
                            {{ sub.type === 'password' && sub.value() ? '********' : sub.value() }}
                          </span>
                        </XmbMarquee>
                    </template>
                  </span>
                </div>
              </div>
            </transition>
          </template>
        </div>
      </div>

    </div>

    <!-- Navigation Hints (Centralized) -->
    <slot name="footer">
      <div class="absolute bottom-8 right-12">
        <XmbHints :mode="hintMode || (subItemOpen ? 'modal' : 'navigation')" />
      </div>
    </slot>
  </div>
</template>

<style scoped>
@reference "../../style.css";

.xmb-item {
  transition: top 0.3s cubic-bezier(0.25, 1, 0.5, 1);
}

/* Icons & Labels transition */
.item-icon-container,
.item-text {
  transition: all 0.3s ease-out;
}

/* STATE: ACTIVE */
.is-active .item-icon-container {
  @apply opacity-100 text-white scale-110;
}
.is-active .item-icon-container :deep(svg) {
  @apply w-8 h-8;
}
.is-active .item-text {
  @apply text-2xl text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.8)];
}

/* STATE: PASSED (Above categories) */
.is-passed .item-icon-container {
  @apply opacity-25 text-gray-400;
}
.is-passed .item-icon-container :deep(svg) {
  @apply w-7 h-7;
}
.is-passed .item-text {
  @apply text-xl text-white/20;
}

/* STATE: FUTURE (Below categories) */
.is-future .item-icon-container {
  @apply opacity-30 text-gray-400;
}
.is-future .item-icon-container :deep(svg) {
  @apply w-8 h-8;
}
.is-future .item-text {
  @apply text-2xl text-white/20 origin-left scale-90;
}

.sub-menu-enter-active,
.sub-menu-leave-active {
  transition: all 0.4s cubic-bezier(0.25, 1, 0.5, 1);
}

.sub-menu-enter-from {
  opacity: 0;
  transform: translateX(50px) scale(0.9);
  filter: blur(10px);
}

.sub-menu-leave-to {
  opacity: 0;
  transform: translateX(-20px) scale(0.95);
  filter: blur(4px);
}

:focus {
  outline: none;
}
</style>
