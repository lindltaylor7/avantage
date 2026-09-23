import { createApp } from 'vue';
import App from './App.vue';
import router from './router/index.js';
import { initTheme } from './theme.js';
import { loadCareerCatalog } from './data/careers.js';
import './style.css';

initTheme();
// El catálogo de carreras lo administra el equipo desde /admin/carreras, así que
// se trae del backend al arrancar. No se espera la respuesta: los desplegables
// muestran el respaldo local y se actualizan solos cuando llega.
loadCareerCatalog();
createApp(App).use(router).mount('#app');
