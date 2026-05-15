import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/auth',
      name: 'auth',
      component: () => import('@/views/AuthView.vue'),
      meta: { guestOnly: true },
    },
    { path: '/login', redirect: '/auth' },
    { path: '/register', redirect: '/auth' },
    {
      path: '/files',
      name: 'files',
      component: () => import('@/views/FileManagerView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/player/:id',
      name: 'player',
      component: () => import('@/views/MediaPlayerView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/player/lists/:type',
      name: 'player-lists',
      component: () => import('@/views/PlayerListsView.vue'),
      meta: { requiresAuth: true },
    },
  ],
});

router.beforeEach(async (to) => {
  const authStore = useAuthStore();
  
  if (!authStore.initialized) {
    await authStore.fetchUser();
  }

  const { user } = authStore;
  
  if (to.meta.requiresAuth && !user) {
    return { name: 'auth' };
  }

  if (to.meta.guestOnly && user) {
    return { name: 'home' };
  }

  return true;
});

export default router;
