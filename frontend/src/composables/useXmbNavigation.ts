import { ref, computed, watch, type Ref } from 'vue';

export interface XmbSubItem {
  id: string;
  label: () => string;
  value?: () => any;
  type?: 'text' | 'password' | 'toggle' | 'select' | 'action';
  onSelect?: () => void;
  onUpdate?: (val: any) => void;
  [key: string]: any;
}

export interface XmbItem {
  id: string;
  icon?: any;
  label: () => string;
  action?: string;
  subItems?: XmbSubItem[];
  onSelect?: () => void;
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
    vSpacing = 100, 
    crossX = '25%', 
    crossY = '35%',
    onSelect
  } = options;

  const activeCatIndex = ref(0);
  const activeItemIndex = ref(0);
  const subItemOpen = ref(false);
  const activeSubItemIndex = ref(0);
  const isEditing = ref(false);

  const activeCategory = computed(() => categories.value[activeCatIndex.value]);
  const activeItem = computed(() => activeCategory.value?.items[activeItemIndex.value]);
  const activeSubItem = computed(() => activeItem.value?.subItems?.[activeSubItemIndex.value]);

  // Reset indices if categories change significantly
  watch(categories, (newCats) => {
    if (activeCatIndex.value >= newCats.length) {
      activeCatIndex.value = Math.max(0, newCats.length - 1);
    }
  }, { deep: true });

  // Translation amounts (Purely relative to Origin)
  const horizontalShift = computed(() => {
    return subItemOpen.value ? -250 : 0; // Shift menu left when sub-menu is open
  });

  const horizontalTransform = computed(() => {
    return `translateX(${-(activeCatIndex.value * hSpacing) + horizontalShift.value}px)`;
  });

  const verticalTransform = computed(() => {
    return `translateY(-${activeItemIndex.value * vSpacing}px)`;
  });

  // Navigation logic
  const moveRight = () => {
    if (subItemOpen.value || isEditing.value) return;
    if (activeCatIndex.value < categories.value.length - 1) {
      activeCatIndex.value++;
      activeItemIndex.value = 0; // reset vertical position
    }
  };

  const moveLeft = () => {
    if (subItemOpen.value || isEditing.value) return;
    if (activeCatIndex.value > 0) {
      activeCatIndex.value--;
      activeItemIndex.value = 0;
    }
  };

  const moveDown = () => {
    if (isEditing.value) return;
    if (subItemOpen.value) {
      const subItems = activeItem.value?.subItems || [];
      if (activeSubItemIndex.value < subItems.length - 1) {
        activeSubItemIndex.value++;
      }
    } else {
      const items = activeCategory.value?.items || [];
      if (activeItemIndex.value < items.length - 1) {
        activeItemIndex.value++;
      }
    }
  };

  const moveUp = () => {
    if (isEditing.value) return;
    if (subItemOpen.value) {
      if (activeSubItemIndex.value > 0) {
        activeSubItemIndex.value--;
      }
    } else {
      if (activeItemIndex.value > 0) {
        activeItemIndex.value--;
      }
    }
  };

  const selectFocused = () => {
    if (isEditing.value) return;

    if (subItemOpen.value) {
      const sub = activeSubItem.value;
      if (!sub) return;

      if (sub.type === 'text' || sub.type === 'password') {
        isEditing.value = true;
      } else if (sub.onSelect) {
        sub.onSelect();
      }
    } else {
      if (activeItem.value?.subItems?.length) {
        subItemOpen.value = true;
        activeSubItemIndex.value = 0;
      } else if (activeItem.value?.onSelect) {
        activeItem.value.onSelect();
      } else if (onSelect && activeItem.value) {
        onSelect(activeItem.value);
      }
    }
  };

  const closeSubMenu = () => {
    if (isEditing.value) {
      isEditing.value = false;
      return;
    }
    if (subItemOpen.value) {
      subItemOpen.value = false;
    }
  };

  const setCategory = (index: number) => {
    if (subItemOpen.value) subItemOpen.value = false;
    if (isEditing.value) isEditing.value = false;
    if (index >= 0 && index < categories.value.length) {
      activeCatIndex.value = index;
      activeItemIndex.value = 0;
    }
  };

  const setItem = (index: number) => {
    if (subItemOpen.value) subItemOpen.value = false;
    if (isEditing.value) isEditing.value = false;
    const items = activeCategory.value?.items || [];
    if (index >= 0 && index < items.length) {
      activeItemIndex.value = index;
    }
  };

  const setSubItem = (index: number) => {
    if (!subItemOpen.value) return;
    if (isEditing.value) isEditing.value = false;
    const subItems = activeItem.value?.subItems || [];
    if (index >= 0 && index < subItems.length) {
      activeSubItemIndex.value = index;
    }
  };

  // Keyboard and Wheel handling
  const handleKeydown = (e: KeyboardEvent) => {
    if (isEditing.value) {
      if (e.key === 'Escape') {
        isEditing.value = false;
        e.preventDefault();
        e.stopPropagation();
      }
      return; 
    }

    // Only handle keys we care about
    const navKeys = ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Enter', 'Escape'];
    if (!navKeys.includes(e.key)) return;

    if ((e as any)._xmbHandled) return;
    (e as any)._xmbHandled = true;
    e.stopImmediatePropagation();
    
    switch (e.key) {
      case 'ArrowRight': 
        e.preventDefault();
        moveRight(); 
        break;
      case 'ArrowLeft':  
        e.preventDefault();
        moveLeft(); 
        break;
      case 'ArrowDown':  
        e.preventDefault();
        moveDown(); 
        break;
      case 'ArrowUp':    
        e.preventDefault();
        moveUp(); 
        break;
      case 'Enter':      
        e.preventDefault();
        selectFocused(); 
        break;
      case 'Escape':
        e.preventDefault();
        closeSubMenu();
        break;
    }
  };

  const handleWheel = (e: WheelEvent, type: 'category' | 'item' = 'item') => {
    if (isEditing.value) return;
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
    activeSubItemIndex,
    subItemOpen,
    isEditing,
    activeCategory,
    activeItem,
    activeSubItem,
    horizontalTransform,
    verticalTransform,
    horizontalShift,
    moveRight,
    moveLeft,
    moveDown,
    moveUp,
    setCategory,
    setItem,
    setSubItem,
    selectFocused,
    closeSubMenu,
    handleKeydown,
    handleWheel,
    crossX,
    crossY,
    hSpacing,
    vSpacing
  };
}

