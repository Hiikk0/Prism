---
trigger: manual
---

UI/UX Target: Sony XrossMediaBar (XMB) Interface

AI Assistant Role: You are an expert Vue 3 and UI/UX animation engineer. Your task is to help build a frontend interface inspired by the Sony PlayStation 3 / PSP XMB.

1. The XMB Mental Model (Crucial for AI)

The XMB is a 2D spatial navigation system.

Horizontal Axis (X): Represents Categories (e.g., Settings, Photos, Music, Videos, Users).

Vertical Axis (Y): Represents Items within the currently active Category.

Intersection (The Cross): The currently focused/active item is ALWAYS positioned at a fixed point on the screen (usually center-left).

Movement: Instead of moving a "cursor" around the screen, the content itself moves (translates) to bring the selected item to the fixed "Cross" position.

2. Technical Implementation Strategy (Vue 3 + Tailwind)

A. State Management (Logic first, UI second)

DO NOT mix DOM events and logic inside Vue components.

Build a robust useXmbNavigation.ts composable.

State required: activeCategoryIndex (X) and activeItemIndex (Y).

Listen to keyboard events (ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Enter, Escape) globally using @vueuse/core (useMagicKeys or useEventListener).

B. Layout & CSS Transforms

Use Tailwind CSS.

Crucial: Use transform: translate3d(x, y, 0) for all movement to ensure GPU hardware acceleration. Do NOT animate margin or top/left properties.

Opacity & Scale: Items far from the "Cross" should fade out (opacity-50, scale-90). The active item at the "Cross" must be scale-110, opacity-100, and perhaps have a glowing backdrop.

C. Component Structure

The UI must be decoupled into strict components:

XmbContainer.vue: The wrapper handling the global translation matrix.

XmbCategoryRow.vue: Renders the horizontal icons.

XmbItemList.vue: The vertical list that appears under the active category.

XmbItemCard.vue: The individual file/media representation.

3. Step-by-Step AI Workflow constraints

AI, when instructed to build the XMB, you MUST follow this exact sequence and wait for user approval between steps:

Step 1: Draft the useXmbNavigation.ts composable (Array bounds checking, 2D matrix state).

Step 2: Scaffold the HTML/Tailwind structure without animations to ensure correct absolute/relative positioning.

Step 3: Apply dynamic CSS transform styles bound to the composable's state.

Step 4: Add smooth transition-all duration-300 ease-out classes for the signature XMB glide effect.