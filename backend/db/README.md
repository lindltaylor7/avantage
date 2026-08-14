# Base de datos (MySQL + Knex)

Este proyecto usa [Knex](https://knexjs.org/) como query builder / migrador contra MySQL para
registrar los **leads** (usuarios que completaron el chatbot y recibieron el reporte por correo).

## 1. Configuración

Copia las variables de `.env.example` a tu `.env` y ajústalas a tu instancia MySQL local
(por defecto asume XAMPP: `root` sin contraseña en `127.0.0.1:3306`):

```
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=minirag_leads
```

Crea la base de datos (una sola vez) si no existe:

```bash
mysql -u root -e "CREATE DATABASE IF NOT EXISTS minirag_leads CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

## 2. Migraciones

Los scripts están definidos en `package.json`:

```bash
npm run migrate          # aplica todas las migraciones pendientes
npm run migrate:rollback # revierte el último batch de migraciones
npm run migrate:status   # lista qué migraciones se aplicaron / faltan
npm run migrate:make -- nombre_migracion  # crea un nuevo archivo de migración
```

Los archivos de migración viven en `backend/db/migrations/` y se ejecutan en orden por su prefijo de
timestamp. Cada uno exporta `up()` (aplicar cambio) y `down()` (revertirlo).

### Migraciones existentes

| Archivo | Descripción |
|---|---|
| `20260803000000_create_leads_table.js` | Crea la tabla `leads` (tema, nivel, carrera, email, teléfono, score de viabilidad, estado del lead, fecha). |
| `20260803010000_create_projects_table.js` | Crea la tabla `projects`. Un proyecto se genera automáticamente cuando un lead llega al estado final del funnel Kanban (`ganado`), con estado inicial `"Creado"`. Relación 1:1 con `leads` vía `lead_id`. |
| `20260803020000_create_tasks_table.js` | Crea la tabla `tasks` (N:1 con `projects` vía `project_id`). El % de avance del proyecto = tareas con `status = 'completado'` / total de tareas. |
| `20260803030000_create_quotes_table.js` | Crea la tabla `quotes` (N:1 con `leads` vía `lead_id`). Se genera al usar la opción "Generar Cotización" sobre un lead en estado `contactado` o `en_negociacion`. |
| `20260804000000_create_roles_table.js` | Crea la tabla `roles`. |
| `20260804010000_create_permissions_table.js` | Crea la tabla `permissions`: cada fila es una "herramienta" interna habilitable (existente o por desarrollar), p. ej. `leads.view`, `projects.view`, `roles.manage`. |
| `20260804020000_create_role_permissions_table.js` | Tabla pivote N:N `roles` ↔ `permissions`. |
| `20260804030000_create_users_table.js` | Crea la tabla `users` (usuarios internos), N:1 con `roles` vía `role_id`. |
| `20260805000000_alter_projects_add_deadline_and_leader.js` | Agrega `deadline` y `leader_id` (N:1 con `users`) a `projects`. |
| `20260805010000_create_project_collaborators_table.js` | Tabla pivote N:N `projects` ↔ `users`: colaboradores asignados a un proyecto. |
| `20260805020000_create_project_updates_table.js` | Crea `project_updates` (N:1 con `projects`): hitos de la línea de tiempo, texto + un adjunto opcional (archivo guardado en `uploads/project-updates/`). |
| `20260806000000_alter_projects_lead_id_nullable.js` | `projects.lead_id` pasa a ser opcional, para poder crear proyectos manualmente sin que provengan de un lead ganado. |

## 3. Seeds (datos iniciales de roles y permisos)

```bash
npm run seed   # ejecuta backend/db/seeds/001_init_rbac.js
```

Crea los permisos base, los roles **Administrador** (todos los permisos) y **Comercial**
(solo `leads.view`), y un usuario administrador por defecto:

```
Email:    admin@tesisperu.local
Password: admin123
```

**Cambia esta contraseña después del primer inicio de sesión** — el seed es solo para
arrancar el sistema en desarrollo/local.

## 4. Uso en el código

`backend/db/connection.js` exporta una instancia única de Knex (`db`) que reutilizan los
servicios (p. ej. `backend/services/leadService.js`). No se crea una conexión nueva por request.

Si la base de datos no está disponible, el guardado de leads falla de forma controlada
(se loguea una advertencia) sin interrumpir la respuesta al usuario — el reporte y el correo
ya se generaron independientemente del registro en MySQL.
