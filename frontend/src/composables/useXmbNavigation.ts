import { ref, computed, type Ref } from 'vue';
import { useEventListener } from '@vueuse/core';

export interface XmbItem {
  id: string;
  [key: string]: any;
}

export interface XmbCategory {
  id: string;
  items: XmbItem[];
  [key: string]: any;
}

/**
 * Custom Vue Composable to handle 2D spatial navigation for XMB
 */
export function useXmbNavigation(
  categories: Ref<XmbCategory[]>,
  callbacks?: {
    onEnter?: () => void;
    onBack?: () => void;
  }
) {
  const activeCatIdx = ref(0);
  const activeItemIdx = ref(0);
  const isInputActive = ref(false);

  const activeCategory = computed(() => categories.value[activeCatIdx.value]);
  const activeItem = computed(() => activeCategory.value?.items[activeItemIdx.value]);

  const moveLeft = () => {
    if (activeCatIdx.value > 0) {
      activeCatIdx.value--;
      activeItemIdx.value = 0;
    }
  };

  const moveRight = () => {
    if (activeCatIdx.value < categories.value.length - 1) {
      activeCatIdx.value++;
      activeItemIdx.value = 0;
    }
  };

  const moveUp = () => {
    if (activeItemIdx.value > 0) {
      activeItemIdx.value--;
    }
  };

  const moveDown = () => {
    const currentItemsCount = activeCategory.value?.items.length || 0;
    if (activeItemIdx.value < currentItemsCount - 1) {
      activeItemIdx.value++;
    }
  };

  useEventListener(window, 'keydown', (e: KeyboardEvent) => {
    if (isInputActive.value) {
      if (e.key === 'Escape') {
        isInputActive.value = false;
        callbacks?.onBack?.();
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        moveLeft();
        break;
      case 'ArrowRight':
        e.preventDefault();
        moveRight();
        break;
      case 'ArrowUp':
        e.preventDefault();
        moveUp();
        break;
      case 'ArrowDown':
        e.preventDefault();
        moveDown();
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        callbacks?.onEnter?.();
        break;
    }
  });

  return {
    activeCatIdx,
    activeItemIdx,
    activeCategory,
    activeItem,
    isInputActive
  };
}
