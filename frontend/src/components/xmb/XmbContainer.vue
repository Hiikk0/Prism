<script setup lang="ts">
import { computed, ref, watch, type Ref } from 'vue';
import { useXmbNavigation, type XmbCategory } from '@/composables/useXmbNavigation';
import XmbCategoryRow from './XmbCategoryRow.vue';
import XmbItemList from './XmbItemList.vue';

// ── Props & Emits ─────────────────────────────────────────────────────────────
interface Props {
  categories: XmbCategory[];
}
const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'action', payload: { catId: string; itemId: string }): void;
  (e: 'back'): void;
}>();

// ── Navigation ────────────────────────────────────────────────────────────────
const categoriesRef = ref(props.categories) as Ref<XmbCategory[]>;

const { activeCatIdx, activeItemIdx, activeCategory, activeItem, isInputActive } =
  useXmbNavigation(categoriesRef, {
    onEnter: () => triggerAction(),
    onBack:  () => closeSubItem(),
  });

const activeItems = computed(() => activeCategory.value?.items ?? []);

// ── Layout Constants ──────────────────────────────────────────────────────────
// Category row — fixed Y, upper third of screen (PS3 style)
const CAT_ROW_TOP  = 180;
const CAT_ROW_LEFT = 240;

// The "Cross" Y — where the active item always lives
// For items to visually rise ABOVE the categories on scroll,
// the Cross must sit ABOVE the category row in the viewport.
// PS3 reference: cross is roughly in the middle of the screen.
// Items above the cross rise higher and become faded.
const CROSS_Y = 320; // px — active item always rendered here

const H_SPACING = 120;
const V_SPACING = 72;

// Category row translates left when category changes
const categoryRowTranslateX = computed(() => -activeCatIdx.value * H_SPACING);

// Item list translateY so that activeItemIdx lands at CROSS_Y.
// The list's natural top is CROSS_Y; items above activeItemIdx rise above it.
const itemListTranslateY = computed(() => -activeItemIdx.value * V_SPACING);

// ── Sub-Item State ────────────────────────────────────────────────────────────
// When a sub-item is open: the nav panel slides LEFT off screen,
// the sub-panel slides IN from the right.
const subItemOpen = ref(false);

const triggerAction = () => {
  if (!activeItem.value) return;
  isInputActive.value = true;
  subItemOpen.value = true;
  emit('action', {
    catId:  activeCategory.value?.id ?? '',
    itemId: activeItem.value.id ?? '',
  });
};

const closeSubItem = () => {
  subItemOpen.value = false;
  isInputActive.value = false;
  emit('back');
};

// ── Hint State (3-second dwell) ────────────────────────────────────────────────
const hint = ref('');
let hintTimer: ReturnType<typeof setTimeout> | null = null;

const resetHint = () => {
  hint.value = '';
  if (hintTimer) clearTimeout(hintTimer);
  hintTimer = setTimeout(() => {
    hint.value = activeItem.value?.hint ?? '';
  }, 3000);
};

// Reset hint whenever navigation changes
watch([activeCatIdx, activeItemIdx], resetHint, { immediate: true });
</script>

<template>
  <div class="relative w-full h-full">

    <!--
      NAV PANEL (categories + items)
      Slides LEFT with opacity fade when sub-item opens.
    -->
    <div
      class="absolute inset-0 transition-all duration-500 ease-out"
      :style="{
        transform: subItemOpen ? 'translate3d(-35%, 0, 0)' : 'translate3d(0, 0, 0)',
        opacity: subItemOpen ? 0 : 1,
        pointerEvents: subItemOpen ? 'none' : 'auto',
      }"
    >
      <!-- HORIZONTAL AXIS: Category Row — fixed Y, slides on X -->
      <div
        class="absolute"
        :style="{ left: `${CAT_ROW_LEFT}px`, top: `${CAT_ROW_TOP}px` }"
      >
        <XmbCategoryRow
          :categories="props.categories"
          :active-cat-idx="activeCatIdx"
          :h-spacing="H_SPACING"
          :translate-x="categoryRowTranslateX"
        />
      </div>

      <!--
        VERTICAL AXIS: Item List
        NO overflow-hidden — items can rise above the category row.
        The list is anchored at CROSS_Y; active item is always there.
        Items above active index naturally float higher (above category zone),
        becoming faded via XmbItemCard's inactive opacity.
      -->
      <div
        class="absolute"
        :style="{
          left: `${CAT_ROW_LEFT}px`,
          top: `${CROSS_Y}px`,
        }"
      >
        <XmbItemList
          :key="activeCategory?.id"
          :items="activeItems"
          :active-item-idx="activeItemIdx"
          :v-spacing="V_SPACING"
          :translate-y="itemListTranslateY"
          @select="(idx) => {
            activeItemIdx = idx;
          }"
          @enter="triggerAction"
        />
      </div>

      <!-- DWELL HINT — appears 3s after focus rests on an item -->
      <transition
        enter-active-class="transition-opacity duration-700"
        enter-from-class="opacity-0"
        leave-active-class="transition-opacity duration-300"
        leave-to-class="opacity-0"
      >
        <div
          v-if="hint"
          class="absolute text-sm font-light text-white/50 tracking-wide"
          :style="{
            left: `${CAT_ROW_LEFT + 48}px`,
            top: `${CROSS_Y + V_SPACING + 12}px`,
            maxWidth: '500px',
          }"
        >
          {{ hint }}
        </div>
      </transition>
    </div>

    <!--
      SUB-ITEM SLOT
      Slides IN from the right when a nav item is confirmed.
      Exposed: activeItem, closeSubItem callback.
    -->
    <transition
      enter-active-class="transition-all duration-500 ease-out"
      enter-from-class="opacity-0 translate-x-24"
      leave-active-class="transition-all duration-300 ease-in"
      leave-to-class="opacity-0 translate-x-12"
    >
      <div v-if="subItemOpen" class="absolute inset-0">
        <slot
          name="subitem"
          :active-cat="activeCategory"
          :active-item="activeItem"
          :close="closeSubItem"
        />
      </div>
    </transition>

  </div>
</template>
