<script setup lang="ts">
import { onMounted } from 'vue';
import { useAuthStore } from './stores/auth';
import XmbBackground from './components/layout/XmbBackground.vue';

const authStore = useAuthStore();

onMounted(async () => {
  if (!authStore.initialized) {
    await authStore.fetchUser();
  }
});
</script>

<template>
  <div class="min-h-screen w-screen overflow-hidden font-sans text-white bg-transparent">
    <router-view v-slot="{ Component }">
      <transition name="page" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>

    <!-- Dynamic XMB-style background -->
    <XmbBackground />

    <!-- Base Layer (Bottom-most) -->
    <div class="fixed inset-0 pointer-events-none -z-60 bg-[#020202] bg-gradient-to-br from-[#02040a] via-[#050505] to-[#020202]"></div>
  </div>
</template>

<style>
.page-enter-active,
.page-leave-active {
  transition: opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1), transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

.page-enter-from {
  opacity: 0;
  transform: scale(0.95) translateY(10px);
}

.page-leave-to {
  opacity: 0;
  transform: scale(1.05) translateY(-10px);
}
</style>
