import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ref } from 'vue';
import { useXmbNavigation, type XmbCategory } from './useXmbNavigation';

describe('useXmbNavigation', () => {
  const mockCategories = ref<XmbCategory[]>([
    {
      id: 'cat1',
      items: [{ id: 'item1-1' }, { id: 'item1-2' }, { id: 'item1-3' }]
    },
    {
      id: 'cat2',
      items: [{ id: 'item2-1' }, { id: 'item2-2' }]
    }
  ]);

  let nav: ReturnType<typeof useXmbNavigation>;

  beforeEach(() => {
    // Reset state before each test if needed, though useXmbNavigation returns raw refs
    nav = useXmbNavigation(mockCategories);
  });

  const simulateKeydown = (key: string) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key }));
  };

  it('initializes with correctly active items at (0, 0)', () => {
    expect(nav.activeCatIdx.value).toBe(0);
    expect(nav.activeItemIdx.value).toBe(0);
    expect(nav.activeCategory.value?.id).toBe('cat1');
    expect(nav.activeItem.value?.id).toBe('item1-1');
  });

  it('moves right to the next category and resets item index', () => {
    // Move down first to test reset
    nav.activeItemIdx.value = 2;
    simulateKeydown('ArrowRight');
    
    expect(nav.activeCatIdx.value).toBe(1);
    expect(nav.activeItemIdx.value).toBe(0); // Should reset
    expect(nav.activeCategory.value?.id).toBe('cat2');
    expect(nav.activeItem.value?.id).toBe('item2-1');
  });

  it('does not move right past the last category', () => {
    simulateKeydown('ArrowRight'); // to cat2
    simulateKeydown('ArrowRight'); // should stay at cat2
    expect(nav.activeCatIdx.value).toBe(1);
  });

  it('moves left to previous category and resets item index', () => {
    simulateKeydown('ArrowRight'); // to cat2
    nav.activeItemIdx.value = 1;

    simulateKeydown('ArrowLeft'); // back to cat1
    expect(nav.activeCatIdx.value).toBe(0);
    expect(nav.activeItemIdx.value).toBe(0); // Should reset
  });

  it('does not move left from the first category', () => {
    simulateKeydown('ArrowLeft'); // already at 0
    expect(nav.activeCatIdx.value).toBe(0);
  });

  it('moves down within boundaries', () => {
    simulateKeydown('ArrowDown');
    expect(nav.activeItemIdx.value).toBe(1);
    
    simulateKeydown('ArrowDown');
    expect(nav.activeItemIdx.value).toBe(2);

    simulateKeydown('ArrowDown'); // max is 2 for cat1
    expect(nav.activeItemIdx.value).toBe(2);
  });

  it('moves up within boundaries', () => {
    nav.activeItemIdx.value = 2;
    simulateKeydown('ArrowUp');
    expect(nav.activeItemIdx.value).toBe(1);

    simulateKeydown('ArrowUp');
    expect(nav.activeItemIdx.value).toBe(0);

    simulateKeydown('ArrowUp'); // min is 0
    expect(nav.activeItemIdx.value).toBe(0);
  });

  it('blocks navigation when isInputActive is true', () => {
    nav.isInputActive.value = true;
    
    simulateKeydown('ArrowRight');
    expect(nav.activeCatIdx.value).toBe(0); // Did not move
    
    simulateKeydown('ArrowDown');
    expect(nav.activeItemIdx.value).toBe(0); // Did not move
  });

  it('unlocks navigation when Escape is pressed while isInputActive is true', () => {
    nav.isInputActive.value = true;
    
    simulateKeydown('Escape');
    expect(nav.isInputActive.value).toBe(false);

    simulateKeydown('ArrowRight');
    expect(nav.activeCatIdx.value).toBe(1); // Movement restored
  });
});
