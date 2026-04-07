import { defineStore } from 'pinia';
import api from '@/api/api';

export interface User {
  id: string;
  username: string;
  role: 'guest' | 'user' | 'admin';
}

interface AuthState {
  user: User | null;
  loading: boolean;
  initialized: boolean;
}

export interface RegisterResponse {
  user: User;
  recoveryKey: string;
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
    async login(credentials: { username: string; password: string }) {
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
    async register(data: { username: string; password: string }): Promise<RegisterResponse> {
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
    }
  }
});
