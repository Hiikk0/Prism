import { defineStore } from 'pinia';
import api from '@/api/api';
import type { User, AuthResponse, LoginPayload, RegisterPayload } from '@/types/api';

interface AuthState {
  user: User | null;
  loading: boolean;
  initialized: boolean;
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    user: null,
    loading: false,
    initialized: false,
  }),
  actions: {
    async fetchUser() {
      this.loading = true;
      try {
        const { data } = await api.get('/auth/me');
        this.user = data.user;
      } catch (err) {
        this.user = null;
      } finally {
        this.loading = false;
        this.initialized = true;
      }
    },
    async login(credentials: LoginPayload) {
      this.loading = true;
      try {
        const { data } = await api.post('/auth/login', credentials);
        this.user = data.user;
      } catch (err) {
        this.user = null;
        throw err;
      } finally {
        this.loading = false;
      }
    },
    async register(data: RegisterPayload): Promise<AuthResponse> {
      this.loading = true;
      try {
        const { data: responseData } = await api.post('/auth/register', data);
        this.user = responseData.user;
        return responseData;
      } catch (err) {
        this.user = null;
        throw err;
      } finally {
        this.loading = false;
      }
    },
    async logout() {
      try {
        await api.post('/auth/logout');
      } finally {
        this.user = null;
        this.initialized = true;
      }
    },
    async updateProfile(updates: Partial<User>) {
      try {
        const { data } = await api.patch('/auth/profile', updates);
        if (this.user) {
          this.user = { ...this.user, ...data.user };
        }
      } catch (err) {
        console.error('Failed to update profile:', err);
        throw err;
      }
    }
  }
});
