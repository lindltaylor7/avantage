# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Flujo de trabajo obligatorio (git)

- **Antes de empezar a trabajar**, ejecuta `git pull` para traer los últimos cambios del remoto.
- **Después de completar un cambio** (o un conjunto de cambios relacionados), crea automáticamente
  un commit con un mensaje descriptivo en español que explique el *qué* y el *porqué* del cambio,
  siguiendo el estilo de los commits existentes (`feat(alcance): descripción`, `fix(alcance): ...`,
  `refactor(alcance): ...`). No pidas confirmación para el `git pull` ni para el commit salvo que el
  usuario indique lo contrario explícitamente en la conversación.
- No hagas `git push` automáticamente salvo que el usuario lo pida.

## Comandos

```bash
npm install              # instalar dependencias
cp .env.example .env     # completar credenciales (ver tabla en README.md)

npm run dev               # backend con recarga automática (node --watch), http://localhost:3000
npx vite                  # dev server del frontend, http://localhost:5173 (proxy /api -> :3000)

npm run build             # compila el frontend a dist/ (servido como estático por Express)
npm run preview           # sirve el build de Vite localmente

npm run migrate           # aplica migraciones pendientes (Knex)
npm run migrate:rollback  # revierte el último batch de migraciones
npm run migrate:status    # lista migraciones aplicadas/pendientes
npm run migrate:make -- nombre_migracion   # crea un nuevo archivo de migración en backend/db/migrations/
npm run seed               # ejecuta los seeds (roles/permisos base, usuario admin, columnas del funnel)
```

No hay suite de tests ni linter configurados en `package.json`.

## Arquitectura

Full-stack monolítico: **Express (backend/) sirve tanto la API REST como el build estático de
Vue (dist/)** en el mismo puerto. En producción, `boot.cjs` (CommonJS) hace `import()` dinámico
de `backend/server.js` (ESM) porque el hosting compartido (Hostinger/Passenger) arranca con
`require()`, que no puede cargar ESM directamente — ver la nota "Por qué boot.cjs" en README.md
antes de tocar el arranque de producción.

### Backend (`backend/`)

- **`server.js`** es un único archivo con todas las rutas Express (endpoints `/api/*` y webhooks).
  Instancia todos los servicios al arrancar y los inyecta por closure a las rutas; los servicios
  con dependencias cruzadas se inyectan por constructor (p. ej. `whatsappBotService` recibe
  `ollamaService`, `emailService`, `leadService`, `whatsappMessageService`, `googleCalendarService`,
  `scheduledMeetingService`, `notificationService`).
- **`services/`**: toda la lógica de negocio y acceso a datos vive aquí, un archivo por dominio
  (leads, projects, quotes, roles, users, campañas, WhatsApp, Instagram, Meta Ads, Google Calendar,
  finanzas, etc.). `server.js` debería quedar delgado — la lógica nueva va en un servicio, no
  inline en la ruta.
- **`middleware/auth.js`**: JWT stateless. `requireAuth` exige un Bearer token válido y adjunta el
  payload decodificado a `req.user` (incluye `permissions: string[]`, embebidas en el token desde
  el login — no se re-consultan en cada request). `requirePermission(key)` exige que
  `req.user.permissions` incluya esa clave (p. ej. `'leads.view'`, `'roles.manage'`,
  `'finance.view'`). También firma/verifica el `state` corto usado en el callback OAuth de Google.
- **`middleware/upload.js`**: configuración de Multer para adjuntos de línea de tiempo de proyectos
  y comprobantes de finanzas (se guardan en disco bajo `uploads/`, que debe persistir entre
  despliegues).
- **`db/connection.js`** exporta una única instancia de Knex (`db`) reutilizada por todos los
  servicios — no crear conexiones nuevas por request.
- **`db/migrations/`**: una migración por cambio de esquema, nombradas por timestamp
  (`YYYYMMDDHHMMSS_descripcion.js`), cada una con `up()`/`down()`. Ver `backend/db/README.md` para
  el propósito de cada tabla y las relaciones entre ellas (leads → projects → tasks/quotes,
  roles ↔ permissions ↔ users, funnel_columns, whatsapp_*, page_*, etc.).
- **`db/seeds/`**: `001_init_rbac.js` crea roles/permisos base + usuario admin
  (`admin@tesisperu.local` / `admin123` — cambiar tras el primer login);
  `002_seed_funnel_columns_and_leads.js` crea las columnas del Kanban y leads de prueba, y
  **borra los leads existentes** — no ejecutar contra datos reales.

### Frontend (`src/`)

- Vue 3 + Vue Router, compilado con Vite. `src/apiClient.js` centraliza las llamadas a la API
  (adjunta el JWT desde `src/auth.js`, que también expone `isAuthenticated()`/`hasPermission()`).
- **`router/index.js`**: cada ruta protegida declara `meta: { requiresAuth: true, permission: '<key>' }`;
  el guard global (`router.beforeEach`) redirige a `/login` si no hay sesión, o a `/dashboard` si
  falta el permiso. Cualquier vista nueva bajo `/admin/*` debe seguir este patrón y el permiso
  correspondiente debe existir en la tabla `permissions` (migración + seed).
- **`views/`**: una vista por pantalla del panel interno (Leads/Kanban, Proyectos, Roles, WhatsApp,
  Campañas, Finanzas, Instagram/redes, Disponibilidad, guion del bot, etc.). Varias son archivos
  grandes (>500 líneas) que combinan estado, llamadas a la API y UI de una sección completa.
- **`components/`**: piezas reutilizadas entre vistas (layout admin, navbar, sidebar, chatbot de
  evaluación de tesis, reporte de viabilidad).
- El evaluador público de viabilidad de tesis (`/evaluador-tesis`, `HomeView` + `ThesisForm` +
  `ThesisChatbot` + `ViabilityReport`) es una funcionalidad separada del CRM interno: genera un
  lead vía IA (Ollama Cloud, con fallback local) y no requiere autenticación.

### Dominio

- El **Kanban de Leads** (`SetterFunnelView.vue` / `LeadsView.vue`) tiene columnas configurables
  (`funnel_columns`, con `key`, `label`, `final`, `position`). Cuando un lead llega a la columna
  marcada `final` (`ganado`), se genera automáticamente un `project` asociado (1:1 vía `lead_id`).
- Los **proyectos** tienen tareas (`tasks`, N:1) cuyo `% avance = completadas / total`, colaboradores
  (N:N vía `project_collaborators`), un líder (`leader_id` → `users`) y una línea de tiempo de
  hitos con adjuntos opcionales (`project_updates`).
- **RBAC**: `roles` ↔ `permissions` (N:N vía `role_permissions`) ↔ `users` (N:1 vía `role_id`). Los
  permisos son "herramientas" habilitables (`leads.view`, `projects.view`, `roles.manage`,
  `finance.view`, ...); se resuelven una vez en el login y se embeben en el JWT.
- **Bot de WhatsApp** (`whatsappBotService.js`, el servicio más grande del backend): conversa con
  leads, agenda reuniones vía `googleCalendarService`/`scheduledMeetingService`, y hace seguimiento
  de conversaciones inactivas (recordatorio a la 1h, estado "Congelado" a las 2h — barrido cada
  `STALE_CONVERSATION_SWEEP_INTERVAL_MS`, definido en `server.js`).
- El **conteo de seguidores de la página de Meta** se sondea periódicamente
  (`FOLLOWER_POLL_INTERVAL_MS` en `server.js`) porque Meta no lo notifica vía webhook.
- Los **webhooks de Meta/WhatsApp** validan la firma `X-Hub-Signature-256` contra `req.rawBody`
  (el body crudo se conserva explícitamente en el middleware `express.json` de `server.js` para
  esto).
- Errores no capturados en flujos de fondo (p. ej. un envío de WhatsApp fallido) no deben tumbar
  el servidor: `server.js` registra `unhandledRejection`/`uncaughtException` a nivel de proceso en
  vez de dejar que el proceso muera.
