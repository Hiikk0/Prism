<script setup lang="ts">
import { onMounted } from 'vue';
import { useAuthStore } from './stores/auth';

const authStore = useAuthStore();

onMounted(async () => {
  if (!authStore.initialized) {
    await authStore.fetchUser();
  }
});
</script>

<template>
  <div class="min-h-screen w-screen overflow-hidden font-sans text-white bg-black">
    <router-view v-slot="{ Component }">
      <transition name="page" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>

    <!-- Global Background Elements for Aero feel -->
    <div class="fixed inset-0 pointer-events-none -z-10 bg-radial-gradient from-blue-900/10 to-transparent opacity-50 blur-3xl"></div>
    <div class="fixed top-0 left-0 right-0 h-px pointer-events-none -z-10 bg-gradient-to-r from-transparent via-blue-500/30 to-transparent"></div>
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
