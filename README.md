# Avantage Group — Evaluador de Tesis + CRM Interno

Plataforma full-stack (Node.js/Express + Vue 3 + MySQL) que evalúa la viabilidad de temas de
tesis en Perú (Ollama Cloud + embeddings), captura leads en un funnel de ventas Kanban, genera
proyectos con tareas/línea de tiempo, y gestiona acceso interno por roles y permisos.

## Stack

- **Backend**: Node.js (ESM) + Express, MySQL vía [Knex](https://knexjs.org/), JWT para auth.
- **Frontend**: Vue 3 + Vue Router, compilado con Vite y servido como estático por el mismo
  servidor Express en producción.
- **Correo**: Nodemailer (SMTP real o Ethereal como fallback de pruebas).
- **IA**: Ollama Cloud API (embeddings + LLM), con fallback local si la API no está disponible.

## 1. Configuración local

```bash
npm install
cp .env.example .env     # completa tus credenciales (ver abajo)
```

Variables requeridas en `.env` — referencia completa en `.env.example`:

| Variable | Uso |
|---|---|
| `PORT` | Puerto del servidor Express (por defecto 3000). |
| `OLLAMA_HOST`, `OLLAMA_API_KEY`, `OLLAMA_EMBED_MODEL`, `OLLAMA_CHAT_MODEL` | Ollama Cloud API. |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Conexión MySQL. |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Firma de sesión del login interno. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Envío de correos (opcional; sin esto usa Ethereal de prueba). |

Crea la base de datos y aplica el esquema:

```bash
mysql -u root -e "CREATE DATABASE IF NOT EXISTS minirag_leads CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
npm run migrate
npm run seed      # crea roles/permisos base + usuario admin (ver db/README.md)
```

Arranca en desarrollo (backend con recarga automática):

```bash
npm run dev        # http://localhost:3000 (API + sirve dist/ si existe)
npx vite           # servidor de desarrollo del frontend en http://localhost:5173 (proxy a :3000)
```

Detalle completo de migraciones y seeds en [`backend/db/README.md`](backend/db/README.md).

## 2. Subir el proyecto a Git

```bash
git init -b main
git add .
git commit -m "Initial commit"
git remote add origin <URL_DE_TU_REPOSITORIO>
git push -u origin main
```

`.env`, `node_modules/`, `dist/` y los archivos subidos en `uploads/` están excluidos vía
`.gitignore` — nunca subas tu `.env` real (contiene la API key de Ollama, credenciales de
MySQL, el secreto JWT y la contraseña SMTP).

## 3. Desplegar en Hostinger (hosting compartido)

Hostinger permite hospedar aplicaciones Node.js en sus planes compartidos (Premium/Business en
adelante) desde **hPanel → Avanzado → Node.js**. Pasos:

1. **Base de datos MySQL**: en hPanel → Bases de datos → MySQL, crea una base de datos y un
   usuario. Anota host (normalmente `localhost`), nombre, usuario y contraseña.

2. **Sube el código**: dos opciones:
   - **Git** (recomendado): en hPanel → Avanzado → Git, conecta tu repositorio y la rama `main`
     apuntando al directorio de la app (p. ej. `domains/tu-dominio.com/public_html` o una carpeta
     dedicada si usarás un subdominio).
   - **Manual**: sube el código vía el Administrador de Archivos o FTP (excluyendo
     `node_modules/`).

3. **Crea la app Node.js**: en hPanel → Avanzado → Node.js → *Crear aplicación*:
   - **Versión de Node**: 18 o superior.
   - **Raíz de la aplicación**: la carpeta donde subiste el código.
   - **URL de la aplicación**: tu dominio o subdominio.
   - **Archivo de inicio (startup file)**: `boot.cjs` (no `server.js` — ver nota abajo).

4. **Variables de entorno**: en el panel de la app Node.js, agrega cada variable de la tabla de
   la sección 1 (usa las credenciales de MySQL del paso 1; `DB_HOST` suele ser `localhost` en
   hosting compartido).

5. **Instala dependencias y compila el frontend**: usa la Terminal integrada de hPanel (o SSH si
   tu plan lo incluye) dentro de la raíz de la app:
   ```bash
   npm install
   npm run build     # genera dist/, que server.js sirve automáticamente
   npm run migrate
   npm run seed       # solo la primera vez
   ```
   El botón "Ejecutar NPM Install" del panel de Node.js equivale a `npm install`; el resto de
   comandos corren desde la Terminal.

6. **Reinicia la aplicación** desde hPanel para que tome las variables de entorno y el build
   nuevo.

7. **Cambia la contraseña del usuario admin sembrado** (`admin@tesisperu.local` / `admin123`)
   apenas inicies sesión — ver [`backend/db/README.md`](backend/db/README.md).

### Notas de producción

- El servidor sirve la API (`/api/*`) y el frontend compilado (`dist/`) en el mismo puerto —
  no necesitas configurar un dominio ni proxy aparte para el frontend.
- Los archivos adjuntos de la línea de tiempo de proyectos se guardan en `uploads/` en disco;
  asegúrate de que esa carpeta persista entre despliegues (no la borres al re-subir código).
  Si usas el despliegue automático por Git de Hostinger, ver la nota siguiente —
  probablemente ya te está pasando esto.
- Cada despliegue nuevo de código requiere repetir `npm install` y `npm run build` (y
  `npm run migrate` si hay migraciones nuevas) antes de reiniciar la app.
- **Por qué `boot.cjs` y no `server.js` como archivo de inicio**: el hosting de Node.js de
  Hostinger arranca la app con Phusion Passenger, que usa `require()` (CommonJS) para cargar el
  archivo de inicio. Nuestro backend usa módulos ES (`import`/`export`, ver
  `backend/package.json`), que Node no permite cargar con `require()`. `boot.cjs` es un archivo
  CommonJS mínimo que hace `import('./backend/server.js')` — la forma soportada de cargar ESM
  desde CommonJS — y así arranca la app real. Si además ves un error `ERR_REQUIRE_ESM` mencionando
  un archivo interno de Hostinger (p. ej. `preload-timestamp.js`), es porque su plataforma copia tu
  `package.json` a su propia configuración interna; por eso el `package.json` de la raíz ya **no**
  declara `"type": "module"` (solo `backend/package.json` lo hace).
- **Persistencia de uploads entre despliegues**: con Git de Hostinger apuntando directo a la
  raíz de la app, cada deploy deja esa carpeta tal cual está en el repo — y como `uploads/`
  nunca se versiona (`.gitignore`), su contenido (comprobantes de Finanzas, adjuntos de
  proyectos, medios de WhatsApp) se pierde en cada redeploy. La solución es guardar esos
  archivos en una carpeta **fuera** de la raíz que gestiona el despliegue por Git, apuntando
  ahí con la variable `UPLOADS_DIR` (ver `.env.example` y `backend/middleware/upload.js`).
  Pasos:
  1. Por SSH o la Terminal/Administrador de archivos de hPanel, crea una carpeta un nivel
     **arriba** de la raíz de tu app Git (p. ej. si Git apunta a
     `domains/tu-dominio.com/public_html`, crea
     `domains/tu-dominio.com/uploads-persistentes`, como hermana de `public_html`, no dentro).
  2. Si ya tenías archivos en `public_html/uploads/` que sobrevivieron, cópialos ahí antes de
     seguir (`cp -r public_html/uploads/* domains/tu-dominio.com/uploads-persistentes/`).
  3. En hPanel → Avanzado → Node.js → tu app → Variables de entorno, agrega `UPLOADS_DIR` con
     la ruta absoluta completa de esa carpeta (pídesela a hPanel o con `pwd` por SSH parado en
     ella).
  4. Reinicia la app Node.js.
  5. Verifica: sube un comprobante nuevo desde el panel y confirma por SSH/Administrador de
     archivos que aparece en la carpeta nueva; luego dispara un deploy (push a `main`) y
     confirma que ese archivo sigue estando y ya no aparece el ⚠️ de "comprobante perdido".
