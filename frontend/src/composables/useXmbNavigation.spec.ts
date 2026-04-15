import { describe, it, expect, vi } from 'vitest';
import { useXmbNavigation, type XmbCategory } from './useXmbNavigation';
import { User, LogIn } from 'lucide-vue-next';
import { ref } from 'vue';

describe('useXmbNavigation', () => {
  const mockCategories: XmbCategory[] = [
    {
      id: 'cat1',
      title: 'Category 1',
      icon: User,
      items: [
        { id: 'item1-1', label: () => 'Item 1-1', icon: LogIn, action: 'action1' },
	{ id: 'item1-2', label: () => 'Item 1-2', icon: LogIn, action: 'action2' },
      ]
    },
    {
      id: 'cat2',
      title: 'Category 2',
      icon: User,
      items: [
        { id: 'item2-1', label: () => 'Item 2-1', icon: LogIn, action: 'action3' },
      ]
    }
  ];

  it('should initialize with first category and first item active', () => {
    const { activeCatIndex, activeItemIndex } = useXmbNavigation(ref(mockCategories));
    expect(activeCatIndex.value).toBe(0);
    expect(activeItemIndex.value).toBe(0);
  });

  it('should navigate right to next category', () => {
    const { activeCatIndex, activeItemIndex, handleKeydown } = useXmbNavigation(ref(mockCategories));
    handleKeydown(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(activeCatIndex.value).toBe(1);
    expect(activeItemIndex.value).toBe(0);
  });

  it('should navigate down to next item', () => {
    const { activeCatIndex, activeItemIndex, handleKeydown } = useXmbNavigation(ref(mockCategories));
    handleKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(activeCatIndex.value).toBe(0);
    expect(activeItemIndex.value).toBe(1);
  });

  it('should move focus on wheel scroll (vertical)', () => {
    const { activeItemIndex, handleWheel } = useXmbNavigation(ref(mockCategories));
    handleWheel(new WheelEvent('wheel', { deltaY: 100 })); // Scroll down
    expect(activeItemIndex.value).toBe(1);
    
    handleWheel(new WheelEvent('wheel', { deltaY: -100 })); // Scroll up
    expect(activeItemIndex.value).toBe(0);
  });

  it('should emit select on Enter if item is focused', () => {
    const onSelect = vi.fn();
    const { handleKeydown } = useXmbNavigation(ref(mockCategories), { onSelect });
    handleKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(onSelect).toHaveBeenCalledWith(mockCategories[0].items[0]);
  });
});
