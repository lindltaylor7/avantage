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

Detalle completo de migraciones y seeds en [`db/README.md`](db/README.md).

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
   - **Archivo de inicio (startup file)**: `server.js`.

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
   apenas inicies sesión — ver [`db/README.md`](db/README.md).

### Notas de producción

- El servidor sirve la API (`/api/*`) y el frontend compilado (`dist/`) en el mismo puerto —
  no necesitas configurar un dominio ni proxy aparte para el frontend.
- Los archivos adjuntos de la línea de tiempo de proyectos se guardan en `uploads/` en disco;
  asegúrate de que esa carpeta persista entre despliegues (no la borres al re-subir código).
- Cada despliegue nuevo de código requiere repetir `npm install` y `npm run build` (y
  `npm run migrate` si hay migraciones nuevas) antes de reiniciar la app.
