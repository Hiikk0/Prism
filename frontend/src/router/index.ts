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
      component: () => import('@/views/FilesView.vue'),
      meta: { requiresAuth: true },
    },
  ],
});

router.beforeEach(async (to, _from, next) => {
  const authStore = useAuthStore();
  
  if (!authStore.initialized) {
    await authStore.fetchUser();
  }

  const { user } = authStore;
  
  if (to.meta.requiresAuth && !user) {
    return next({ name: 'auth' });
  }

  if (to.meta.guestOnly && user) {
    return next({ name: 'home' });
  }

  next();
});

export default router;
