<template>
  <section class="embedded-signup-panel">
    <div class="embedded-signup-header">
      <h4>🔗 Vincular número con Embedded Signup</h4>
      <p class="embedded-signup-hint">
        Conecta un número de WhatsApp Business en <strong>modo coexistencia</strong>:
        la app móvil del negocio sigue funcionando mientras este panel también
        envía y recibe mensajes por la Cloud API.
      </p>
    </div>

    <p v-if="!config?.appId || !config?.configId" class="info-box alert-box">
      ⚠️ Falta configurar <code>META_APP_ID</code> y/o
      <code>META_WHATSAPP_EMBEDDED_CONFIG_ID</code> en el servidor.
    </p>

    <button
      class="btn-action-primary"
      :disabled="!canLaunch || status === 'loading'"
      @click="launchSignup"
    >
      <span class="btn-icon">💬</span>
      {{ status === 'loading' ? 'Conectando…' : 'Vincular número de WhatsApp' }}
    </button>

    <p v-if="status === 'error'" class="info-box alert-box">⚠️ {{ errorMessage }}</p>
    <p v-if="status === 'success'" class="info-box success-box">
      ✅ Número vinculado (WABA <code>{{ lastResult?.wabaId }}</code>,
      teléfono <code>{{ lastResult?.phoneNumberId }}</code>).
      Webhooks: {{ lastResult?.subscribedWebhooks ? 'suscritos ✅' : 'NO suscritos ⚠️' }}.
    </p>

    <div v-if="accounts.length" class="embedded-signup-accounts">
      <h5>Cuentas vinculadas</h5>
      <ul>
        <li v-for="acc in accounts" :key="acc.id">
          <code>{{ acc.phone_number_id }}</code> — WABA <code>{{ acc.waba_id }}</code>
          · {{ acc.mode === 'full_migration' ? 'migración total' : 'coexistencia' }}
          · webhooks {{ acc.subscribed_webhooks ? '✅' : '⚠️' }}
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup>
import { onMounted, ref, computed } from 'vue';
import { apiFetch } from '../apiClient.js';

const FB_SDK_URL = 'https://connect.facebook.net/es_LA/sdk.js';

const config = ref(null);
const accounts = ref([]);
const status = ref('idle'); // idle | loading | success | error
const errorMessage = ref('');
const lastResult = ref(null);

const canLaunch = computed(() => !!(config.value?.appId && config.value?.configId));

// Datos que llegan por postMessage durante el pop-up (evento WA_EMBEDDED_SIGNUP),
// con el waba_id/phone_number_id/business_id reales del número que el usuario
// eligió dentro del flujo — más confiables que adivinar desde el token solo.
let signupSessionData = null;

function handleSignupMessage(event) {
  if (event.origin !== 'https://www.facebook.com') return;
  try {
    const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
    if (data?.type === 'WA_EMBEDDED_SIGNUP' && data?.event === 'FINISH') {
      signupSessionData = data.data || null;
    }
  } catch {
    // Mensajes que no son JSON (otros postMessage de Meta) se ignoran.
  }
}

function loadFacebookSdk() {
  return new Promise((resolve, reject) => {
    if (window.FB) {
      resolve(window.FB);
      return;
    }
    window.fbAsyncInit = function fbAsyncInit() {
      window.FB.init({
        appId: config.value.appId,
        autoLogAppEvents: true,
        xfbml: false,
        version: config.value.graphApiVersion || 'v21.0'
      });
      resolve(window.FB);
    };
    const existing = document.getElementById('facebook-jssdk');
    if (existing) return;
    const script = document.createElement('script');
    script.id = 'facebook-jssdk';
    script.src = FB_SDK_URL;
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error('No se pudo cargar el SDK de Facebook.'));
    document.body.appendChild(script);
  });
}

async function launchSignup() {
  status.value = 'loading';
  errorMessage.value = '';
  signupSessionData = null;

  try {
    const FB = await loadFacebookSdk();

    // ⚠️ Punto crítico de coexistencia vs. migración total: `featureType:
    // 'whatsapp_business_app_onboarding'` + `sessionInfoVersion: '3'` es lo
    // que le pide a Meta que ofrezca coexistencia (mantener la app móvil
    // activa) si el número califica. Sin este `featureType`, Meta corre el
    // flujo estándar, que termina migrando el número por completo a la
    // Cloud API y desconectándolo de la app de WhatsApp Business del celular.
    const loginResponse = await new Promise((resolve) => {
      FB.login(resolve, {
        config_id: config.value.configId,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: 'whatsapp_business_app_onboarding',
          sessionInfoVersion: '3'
        }
      });
    });

    const code = loginResponse?.authResponse?.code;
    if (!code) {
      // El usuario cerró el pop-up o lo rechazó — no es un error del sistema.
      status.value = 'idle';
      return;
    }

    const response = await apiFetch('/api/whatsapp/embedded-callback', {
      method: 'POST',
      body: JSON.stringify({
        code,
        wabaId: signupSessionData?.waba_id || null,
        phoneNumberId: signupSessionData?.phone_number_id || null,
        businessId: signupSessionData?.business_id || null,
        mode: 'coexistence'
      })
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result?.details || result?.error || 'Error desconocido al vincular el número.');
    }

    lastResult.value = result.account;
    status.value = 'success';
    await fetchAccounts();
  } catch (error) {
    console.error('❌ Error en el Embedded Signup de WhatsApp:', error);
    errorMessage.value = error.message || 'No se pudo completar el registro.';
    status.value = 'error';
  }
}

async function fetchConfig() {
  const response = await apiFetch('/api/whatsapp/embedded-signup/config');
  config.value = await response.json();
}

async function fetchAccounts() {
  const response = await apiFetch('/api/whatsapp/embedded-accounts');
  const data = await response.json();
  accounts.value = data.accounts || [];
}

onMounted(() => {
  window.addEventListener('message', handleSignupMessage);
  fetchConfig();
  fetchAccounts();
});
</script>

<style scoped>
.embedded-signup-panel {
  border: 1px solid var(--border-color, #2a2f2f);
  border-radius: 12px;
  padding: 1.25rem;
  margin-bottom: 1.5rem;
}
.embedded-signup-header h4 {
  margin: 0 0 0.25rem;
}
.embedded-signup-hint {
  margin: 0 0 1rem;
  opacity: 0.8;
  font-size: 0.9rem;
}
.embedded-signup-accounts {
  margin-top: 1rem;
}
.embedded-signup-accounts ul {
  list-style: none;
  padding: 0;
  margin: 0;
}
.embedded-signup-accounts li {
  padding: 0.4rem 0;
  border-top: 1px solid var(--border-color, #2a2f2f);
  font-size: 0.9rem;
}
</style>
