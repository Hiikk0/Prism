import { ref, computed, type Ref, onMounted, onUnmounted } from 'vue';

export interface XmbItem {
  id: string;
  icon?: any;
  label: () => string;
  action?: string;
  [key: string]: any;
}

export interface XmbCategory {
  id: string;
  icon: any;
  title: string;
  items: XmbItem[];
}

export function useXmbNavigation(
  categories: Ref<XmbCategory[]>,
  options: {
    hSpacing?: number;
    vSpacing?: number;
    crossX?: string; // e.g. '25%'
    crossY?: string; // e.g. '35%'
    onSelect?: (item: XmbItem) => void;
  } = {}
) {
  const { 
    hSpacing = 160, 
    vSpacing = 80, 
    crossX = '25%', 
    crossY = '35%',
    onSelect
  } = options;

  const activeCatIndex = ref(0);
  const activeItemIndex = ref(0);

  const activeCategory = computed(() => categories.value[activeCatIndex.value]);
  const activeItem = computed(() => activeCategory.value?.items[activeItemIndex.value]);

  // Translation amounts
  const horizontalTransform = computed(() => {
    return `translateX(calc(${crossX} - ${activeCatIndex.value * hSpacing}px))`;
  });

  const verticalTransform = computed(() => {
    return `translateY(calc(${crossY} - ${activeItemIndex.value * vSpacing}px))`;
  });

  // Navigation logic
  const moveRight = () => {
    if (activeCatIndex.value < categories.value.length - 1) {
      activeCatIndex.value++;
      activeItemIndex.value = 0; // reset vertical position
    }
  };

  const moveLeft = () => {
    if (activeCatIndex.value > 0) {
      activeCatIndex.value--;
      activeItemIndex.value = 0;
    }
  };

  const moveDown = () => {
    const items = activeCategory.value?.items || [];
    if (activeItemIndex.value < items.length - 1) {
      activeItemIndex.value++;
    }
  };

  const moveUp = () => {
    if (activeItemIndex.value > 0) {
      activeItemIndex.value--;
    }
  };

  const selectFocused = () => {
    if (onSelect && activeItem.value) {
      onSelect(activeItem.value);
    }
  };

  const setCategory = (index: number) => {
    if (index >= 0 && index < categories.value.length) {
      activeCatIndex.value = index;
      activeItemIndex.value = 0;
    }
  };

  const setItem = (index: number) => {
    const items = activeCategory.value?.items || [];
    if (index >= 0 && index < items.length) {
      activeItemIndex.value = index;
    }
  };

  // Keyboard and Wheel handling
  const handleKeydown = (e: KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowRight': moveRight(); break;
      case 'ArrowLeft':  moveLeft(); break;
      case 'ArrowDown':  moveDown(); break;
      case 'ArrowUp':    moveUp(); break;
      case 'Enter':      selectFocused(); break;
    }
  };

  const handleWheel = (e: WheelEvent, type: 'category' | 'item' = 'item') => {
    if (type === 'category') {
      if (e.deltaY > 0) moveRight();
      else if (e.deltaY < 0) moveLeft();
    } else {
      if (e.deltaY > 0) moveDown();
      else if (e.deltaY < 0) moveUp();
    }
  };

  return {
    activeCatIndex,
    activeItemIndex,
    activeCategory,
    activeItem,
    horizontalTransform,
    verticalTransform,
    moveRight,
    moveLeft,
    moveDown,
    moveUp,
    setCategory,
    setItem,
    handleKeydown,
    handleWheel,
    crossX,
    crossY,
    hSpacing,
    vSpacing
  };
}
