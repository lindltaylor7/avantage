<template>
  <main class="contracts-page">
    <header class="page-header">
      <div>
        <span class="page-eyebrow">Contratos</span>
        <h2 class="section-heading">📄 Gestión de contratos</h2>
        <p class="section-subheading">Genera contratos para los clientes del funnel, ajusta sus cláusulas e imprímelos en A4.</p>
      </div>
    </header>

    <div class="tabs ct-tabs">
      <button
        v-for="tab in TABS"
        :key="tab.key"
        type="button"
        class="tab-item"
        :class="{ 'is-active': activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- KeepAlive: cambiar de pestaña no pierde lo que se estaba editando. -->
    <KeepAlive>
      <component :is="activeComponent" />
    </KeepAlive>
  </main>
</template>

<script setup>
import { computed, ref } from 'vue';
import ContractsTab from './contracts/ContractsTab.vue';
import TemplatesTab from './contracts/TemplatesTab.vue';
import './contracts/contracts.css';

const TABS = [
  { key: 'contracts', label: 'CONTRATOS', component: ContractsTab },
  { key: 'templates', label: 'TIPOS DE CONTRATO', component: TemplatesTab }
];

const activeTab = ref('contracts');
const activeComponent = computed(() => TABS.find((t) => t.key === activeTab.value).component);
</script>

<style scoped>
.contracts-page { padding: var(--page-py) var(--page-px) var(--page-pb); }
.ct-tabs { margin-bottom: 20px; }
</style>
