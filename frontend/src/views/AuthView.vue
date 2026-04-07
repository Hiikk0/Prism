<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useI18n } from 'vue-i18n';
import { User, LogIn, UserPlus, Globe, Languages, HelpCircle, ArrowRight, Key } from 'lucide-vue-next';
import XmbContainer from '@/components/xmb/XmbContainer.vue';
import RecoveryKeyModal from '@/components/auth/RecoveryKeyModal.vue';
import { type XmbCategory } from '@/composables/useXmbNavigation';
import api from '@/api/api';

const router = useRouter();
const authStore = useAuthStore();
const { t, locale } = useI18n();

const username = ref('');
const password = ref('');
const confirmPassword = ref('');

const recoveryKeyInput = ref('');
const newPasswordInput = ref('');
const confirmNewPasswordInput = ref('');

const error = ref('');
const loading = ref(false);
const formType = ref<'login' | 'register' | 'recover'>('login');

const showRecoveryModal = ref(false);
const receivedRecoveryKey = ref('');
const registrationEnabled = ref(true);
const guestLoginEnabled = ref(false);

onMounted(async () => {
  try {
    const { data } = await api.get('/auth/settings');
    registrationEnabled.value = data.registrationEnabled;
    guestLoginEnabled.value = data.guestLoginEnabled;
  } catch (err) {
    console.warn('Failed to fetch settings, using defaults');
  }
});

// ----------------------------------------------------------------------------
// DATA MAPPING
// ----------------------------------------------------------------------------

const categories = computed<XmbCategory[]>(() => {
  const userItems: any[] = [
    { 
      id: 'login', 
      icon: LogIn, 
      label: () => t('auth.login'),
      subItems: [
        {
          id: 'login-username',
          label: () => t('auth.username'),
          value: () => username.value,
          type: 'text' as const,
          onUpdate: (val: string) => { username.value = val; }
        },
        {
          id: 'login-password',
          label: () => t('auth.password'),
          value: () => password.value,
          type: 'password' as const,
          onUpdate: (val: string) => { password.value = val; }
        },
        {
          id: 'login-submit',
          label: () => t('auth.login'),
          icon: ArrowRight,
          type: 'action' as const,
          value: () => error.value || (loading.value ? t('common.loading') : ''),
          onSelect: () => {
            formType.value = 'login';
            handleAuthSubmit();
          }
        }
      ]
    },
    {
      id: 'recover',
      icon: Key,
      label: () => 'Відновити акаунт',
      subItems: [
        {
          id: 'rec-username',
          label: () => t('auth.username'),
          value: () => username.value,
          type: 'text' as const,
          onUpdate: (val: string) => { username.value = val; }
        },
        {
          id: 'rec-key',
          label: () => 'Ключ відновлення',
          value: () => recoveryKeyInput.value,
          type: 'text' as const,
          onUpdate: (val: string) => { recoveryKeyInput.value = val; }
        },
        {
          id: 'rec-new-pass',
          label: () => 'Новий пароль',
          value: () => newPasswordInput.value,
          type: 'password' as const,
          onUpdate: (val: string) => { newPasswordInput.value = val; }
        },
        {
          id: 'rec-confirm-pass',
          label: () => 'Підтвердіть пароль',
          value: () => confirmNewPasswordInput.value,
          type: 'password' as const,
          onUpdate: (val: string) => { confirmNewPasswordInput.value = val; }
        },
        {
          id: 'rec-submit',
          label: () => 'Скинути пароль',
          icon: ArrowRight,
          type: 'action' as const,
          value: () => error.value || (loading.value ? t('common.loading') : ''),
          onSelect: () => {
            formType.value = 'recover';
            handleResetPassword();
          }
        }
      ]
    }
  ];

  if (guestLoginEnabled.value) {
    userItems.push({ 
      id: 'guest', 
      icon: HelpCircle, 
      label: () => 'Увійти як гість', 
      onSelect: handleGuestLogin
    });
  }

  if (registrationEnabled.value) {
    userItems.push({ 
      id: 'register', 
      icon: UserPlus, 
      label: () => t('auth.register'),
      subItems: [
        {
          id: 'reg-username',
          label: () => t('auth.username'),
          value: () => username.value,
          type: 'text' as const,
          onUpdate: (val: string) => { username.value = val; }
        },
        {
          id: 'reg-password',
          label: () => t('auth.password'),
          value: () => password.value,
          type: 'password' as const,
          onUpdate: (val: string) => { password.value = val; }
        },
        {
          id: 'reg-confirm',
          label: () => t('auth.confirm_password'),
          value: () => confirmPassword.value,
          type: 'password' as const,
          onUpdate: (val: string) => { confirmPassword.value = val; }
        },
        {
          id: 'reg-submit',
          label: () => t('auth.register'),
          icon: ArrowRight,
          type: 'action' as const,
          value: () => error.value || (loading.value ? t('common.loading') : ''),
          onSelect: () => {
            formType.value = 'register';
            handleAuthSubmit();
          }
        }
      ]
    });
  }

  return [
    { 
      id: 'auth', 
      icon: User, 
      title: t('categories.user'),
      items: userItems
    },
    { 
      id: 'lang', 
      icon: Globe, 
      title: 'System Settings',
      items: [
        { id: 'uk', icon: Languages, label: () => 'Українська', onSelect: () => { locale.value = 'uk'; } },
        { id: 'en', icon: Languages, label: () => 'English', onSelect: () => { locale.value = 'en'; } },
      ]
    },
  ];
});


const handleAuthSubmit = async () => {
  if (formType.value === 'register' && password.value !== confirmPassword.value) {
    error.value = t('auth.password_mismatch');
    return;
  }

  loading.value = true;
  error.value = '';
  try {
    if (formType.value === 'login') {
      await authStore.login({ username: username.value, password: password.value });
      router.push({ name: 'home' });
    } else {
      const response = await authStore.register({ username: username.value, password: password.value });
      receivedRecoveryKey.value = response.recoveryKey;
      showRecoveryModal.value = true;
    }
  } catch (err: any) {
    error.value = err.response?.data?.error || t('auth.error_generic');
  } finally {
    loading.value = false;
  }
};

const handleResetPassword = async () => {
  if (newPasswordInput.value !== confirmNewPasswordInput.value) {
    error.value = t('auth.password_mismatch');
    return;
  }

  loading.value = true;
  error.value = '';
  try {
    await api.post('/auth/reset-password', {
      username: username.value,
      recoveryKey: recoveryKeyInput.value,
      newPassword: newPasswordInput.value
    });
    
    // Auto-login after reset
    await authStore.login({ username: username.value, password: newPasswordInput.value });
    router.push({ name: 'home' });
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Помилка відновлення доступу';
  } finally {
    loading.value = false;
  }
};

const handleGuestLogin = async () => {
  loading.value = true;
  try {
    const { data } = await api.post('/auth/guest-login');
    authStore.user = data.user;
    router.push({ name: 'home' });
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Помилка гостьового входу';
  } finally {
    loading.value = false;
  }
};

const closeRecoveryModal = () => {
  showRecoveryModal.value = false;
  router.push({ name: 'home' });
};

</script>

<template>
  <div class="h-screen w-screen overflow-hidden relative font-sans text-white/90 bg-transparent">
    <!-- Sony XMB Dynamic Wave (Background layer) -->
    <div class="absolute inset-x-0 h-[300px] top-1/2 -translate-y-1/2 pointer-events-none z-[-2] mix-blend-screen overflow-hidden opacity-80">
      <div class="absolute inset-0 bg-blue-500/5 blur-[120px]"></div>
      <div class="absolute w-[200%] h-px bg-white/5 left-[-50%] top-[42%] blur-[0.5px] transform -rotate-1 shadow-[0_0_15px_5px_rgba(255,255,255,0.05)]"></div>
      <div class="absolute w-[200%] h-px bg-white/4 left-[-50%] top-[48%] blur-[1px] transform rotate-0.5 shadow-[0_0_20px_8px_rgba(255,255,255,0.04)]"></div>
    </div>

    <!-- XMB Container Component -->
    <XmbContainer 
      :categories="categories"
      cross-x="25%"
      cross-y="35%"
      :h-spacing="160"
      :v-spacing="80"
      hint-mode="auth"
    />

    <!-- Recovery Key Modal -->
    <RecoveryKeyModal
      :show="showRecoveryModal"
      :recovery-key="receivedRecoveryKey"
      :username="username"
      @close="closeRecoveryModal"
    />
  </div>
</template>


<style scoped>
/* Reset autocompletes to match the dark aesthetic strongly */
input:-webkit-autofill,
input:-webkit-autofill:hover, 
input:-webkit-autofill:focus, 
input:-webkit-autofill:active {
    -webkit-box-shadow: 0 0 0 30px #1a1a1a inset !important;
    -webkit-text-fill-color: white !important;
    transition: background-color 5000s ease-in-out 0s;
}
</style>

