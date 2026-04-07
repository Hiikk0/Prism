<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch, computed } from 'vue';
import { Download, X, ShieldCheck } from 'lucide-vue-next';

const props = defineProps<{
  recoveryKey: string;
  username: string;
  show: boolean;
}>();

const emit = defineEmits(['close']);

const downloadUrl = ref('');

const generateUrl = () => {
  if (downloadUrl.value) URL.revokeObjectURL(downloadUrl.value);
  const content = `Prism Media Server - Recovery Key\n\nUsername: ${props.username}\nRecovery Key: ${props.recoveryKey}\n\nIMPORTANT: Save this key in a secure place. You will need it to reset your password if you forget it.`;
  const blob = new Blob([content], { type: 'application/octet-stream' });
  downloadUrl.value = URL.createObjectURL(blob);
};

watch(() => props.recoveryKey, (newVal) => {
  if (newVal) generateUrl();
}, { immediate: true });

const downloadFileName = computed(() => {
  const safeUsername = props.username.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  return `prism-recovery-key-${safeUsername || 'user'}.txt`;
});

// Handle ESC key to close
const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && props.show) {
    emit('close');
  }
};

onMounted(() => window.addEventListener('keydown', handleKeydown));
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
  if (downloadUrl.value) URL.revokeObjectURL(downloadUrl.value);
});
</script>

<template>
  <Transition name="fade">
    <div v-if="show" class="fixed inset-0 z-1000 flex items-center justify-center bg-black/60 backdrop-blur-md">
      <Transition name="zoom">
        <div v-if="show" class="w-full max-w-lg mx-4">
          <!-- PS3 Style Message Box -->
          <div class="relative overflow-hidden rounded-xl bg-linear-to-b from-blue-900/60 to-black/80 border border-white/10 shadow-2xl backdrop-blur-xl">
            <!-- Glossy topping -->
            <div class="absolute inset-x-0 top-0 h-1/2 bg-linear-to-b from-white/10 to-transparent pointer-events-none"></div>
            
            <div class="p-8 relative z-10 flex flex-col items-center text-center">
              <div class="w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center mb-6 border border-blue-400/30">
                <ShieldCheck class="w-8 h-8 text-blue-400" />
              </div>
              
              <h2 class="text-2xl font-light tracking-wider mb-2 text-white/90">
                РЕЄСТРАЦІЯ УСПІШНА
              </h2>
              
              <p class="text-sm text-white/60 mb-8 leading-relaxed">
                Ваш ключ відновлення згенеровано. Будь ласка, збережіть його у надійному місці. Це єдиний спосіб відновити доступ до акаунту.
              </p>
              
              <div class="w-full bg-black/40 rounded-lg p-4 mb-8 border border-white/5 group relative">
                <div class="absolute -top-2 left-4 px-2 bg-blue-900 text-[10px] tracking-widest text-blue-300 rounded border border-blue-400/30">
                  RECOVERY KEY
                </div>
                <code class="text-lg font-mono text-blue-300 break-all select-all">
                  {{ recoveryKey }}
                </code>
              </div>
              
              <div class="flex gap-4 w-full">
                <a 
                  :href="downloadUrl"
                  :download="downloadFileName"
                  class="flex-1 flex items-center justify-center gap-2 py-3 px-6 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 transition-all active:scale-95 group text-white decoration-none no-underline"
                >
                  <Download class="w-4 h-4 text-blue-400 group-hover:bounce" />
                  <span class="text-sm font-medium tracking-wide">ЗАВАНТАЖИТИ</span>
                </a>
                
                <button 
                  @click="$emit('close')"
                  class="flex-1 flex items-center justify-center gap-2 py-3 px-6 rounded-lg bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-900/20 transition-all active:scale-95"
                >
                  <X class="w-4 h-4 text-white" />
                  <span class="text-sm font-medium tracking-wide">ЗАКРИТИ</span>
                </button>
              </div>
            </div>

            
            <!-- Bottom navigation hint -->
            <div class="bg-black/40 py-3 px-8 flex justify-end items-center border-t border-white/5">
              <div class="flex items-center gap-2 text-[10px] text-white/40 tracking-widest">
                <span class="w-4 h-4 rounded-full border border-white/20 flex items-center justify-center text-[8px]">○</span>
                BACK
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </div>
  </Transition>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.4s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

.zoom-enter-active, .zoom-leave-active {
  transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.4s ease;
}
.zoom-enter-from, .zoom-leave-to {
  transform: scale(0.9);
  opacity: 0;
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}
.group-hover\:bounce {
  animation: bounce 1s infinite;
}
</style>
