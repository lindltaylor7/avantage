import { createRouter, createWebHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';
import LoginView from '../views/LoginView.vue';
import DashboardView from '../views/DashboardView.vue';
import LeadsView from '../views/LeadsView.vue';
import DatabaseView from '../views/DatabaseView.vue';
import ProjectsView from '../views/ProjectsView.vue';
import ProjectDetailView from '../views/ProjectDetailView.vue';
import RolesView from '../views/RolesView.vue';
import MetaWebhookTestView from '../views/MetaWebhookTestView.vue';
import SocialInteractionsView from '../views/SocialInteractionsView.vue';
import WhatsAppView from '../views/WhatsAppView.vue';
import AvailabilityView from '../views/AvailabilityView.vue';
import BotScriptView from '../views/BotScriptView.vue';
import SetterFunnelView from '../views/SetterFunnelView.vue';
import InstagramInteractionsView from '../views/InstagramInteractionsView.vue';
import CampaignsView from '../views/CampaignsView.vue';
import FinanceView from '../views/FinanceView.vue';
import { isAuthenticated, hasPermission } from '../auth.js';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    // Sistema interno: la puerta de entrada es el login, no el evaluador
    // público. El evaluador sigue existiendo, solo que ya no es la portada.
    { path: '/', redirect: () => (isAuthenticated() ? { name: 'dashboard' } : { name: 'login' }) },
    { path: '/evaluador-tesis', name: 'home', component: HomeView },
    { path: '/login', name: 'login', component: LoginView },
    { path: '/dashboard', name: 'dashboard', component: DashboardView, meta: { requiresAuth: true } },
    { path: '/admin/database', name: 'database', component: DatabaseView, meta: { requiresAuth: true, permission: 'leads.view' } },
    { path: '/admin/leads', name: 'leads', component: LeadsView, meta: { requiresAuth: true, permission: 'leads.view' } },
    { path: '/admin/setter-funnel', name: 'setter-funnel', component: SetterFunnelView, meta: { requiresAuth: true, permission: 'leads.view' } },
    { path: '/admin/projects', name: 'projects', component: ProjectsView, meta: { requiresAuth: true, permission: 'projects.view' } },
    { path: '/admin/projects/:id', name: 'project-detail', component: ProjectDetailView, props: true, meta: { requiresAuth: true, permission: 'projects.view' } },
    { path: '/admin/roles', name: 'roles', component: RolesView, meta: { requiresAuth: true, permission: 'roles.manage' } },
    { path: '/admin/webhooks', name: 'webhooks', component: MetaWebhookTestView, meta: { requiresAuth: true, permission: 'leads.view' } },
    { path: '/admin/social', name: 'social', component: SocialInteractionsView, meta: { requiresAuth: true, permission: 'leads.view' } },
    { path: '/admin/instagram', name: 'instagram', component: InstagramInteractionsView, meta: { requiresAuth: true, permission: 'leads.view' } },
    { path: '/admin/campaigns', name: 'campaigns', component: CampaignsView, meta: { requiresAuth: true, permission: 'leads.view' } },
    { path: '/admin/finance', name: 'finance', component: FinanceView, meta: { requiresAuth: true, permission: 'finance.view' } },
    { path: '/admin/whatsapp', name: 'whatsapp', component: WhatsAppView, meta: { requiresAuth: true, permission: 'leads.view' } },
    { path: '/admin/availability', name: 'availability', component: AvailabilityView, meta: { requiresAuth: true } },
    { path: '/admin/bot-script', name: 'bot-script', component: BotScriptView, meta: { requiresAuth: true, permission: 'leads.view' } }
  ]
});

router.beforeEach((to) => {
  if (!to.meta.requiresAuth) return true;

  if (!isAuthenticated()) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }

  if (to.meta.permission && !hasPermission(to.meta.permission)) {
    return { name: 'dashboard' };
  }

  return true;
});

export default router;
