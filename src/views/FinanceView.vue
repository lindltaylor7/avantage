<template>
  <main class="container-fluid finance-page">
    <header class="page-header">
      <div class="page-header-titles">
        <span class="page-eyebrow">Finanzas</span>
        <h2 class="section-heading"><span class="heading-icon">💰</span> Libro contable</h2>
        <p class="section-subheading finance-subheading">
          Registro de ingresos por cuota, libro diario y gastos fijos del negocio.
        </p>
      </div>
    </header>

    <div class="tabs finance-tabs">
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

    <component :is="activeComponent" />
  </main>
</template>

<script setup>
import { computed, ref } from 'vue';
import IncomeTab from './finance/IncomeTab.vue';
import JournalTab from './finance/JournalTab.vue';
import FixedExpensesTab from './finance/FixedExpensesTab.vue';
import OverviewTab from './finance/OverviewTab.vue';

const TABS = [
  { key: 'income', label: 'INGRESOS', component: IncomeTab },
  { key: 'journal', label: 'LIBRO DIARIO', component: JournalTab },
  { key: 'fixed', label: 'GASTOS FIJOS', component: FixedExpensesTab },
  { key: 'overview', label: 'FINANZAS', component: OverviewTab }
];

const activeTab = ref('income');
const activeComponent = computed(() => TABS.find((t) => t.key === activeTab.value)?.component);
</script>

<style scoped>
.finance-page {
  padding: 1.75rem 2rem 3rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  width: 100%;
  box-sizing: border-box;
}

.finance-subheading {
  max-width: 620px;
  margin-bottom: 0;
}

.finance-tabs {
  margin-bottom: 0.5rem;
  overflow-x: auto;
}

@media (max-width: 768px) {
  .finance-page {
    padding: 1rem;
  }
}
</style>
