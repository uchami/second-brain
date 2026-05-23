# Second brain

Mi app personal de tareas + priorización por buckets. Hecha en Next.js, Drizzle y Postgres. Pensada para correr gratis en Vercel + Neon.

## Stack

- Next.js 16 (App Router) + TypeScript
- Tailwind v4
- Drizzle ORM + Postgres
- Radix primitives + lucide-react
- @dnd-kit para drag & drop
- PWA mínima (instalable en mobile)

## Desarrollo local

### 1. Postgres local con Docker

```sh
docker run -d --name secondbrain-pg \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=secondbrain \
  -p 5433:5432 postgres:16-alpine
```

### 2. Variables de entorno

Copia `.env.local.example` a `.env.local` y completa con tus credenciales de WorkOS AuthKit. Creá una app en https://dashboard.workos.com y configurá el redirect URI a `http://localhost:3000/callback`.

### 3. Migrar la base y sembrar responsables

```sh
npm install
npm run db:migrate
USER_ID=<tu-workos-user-id> npm run db:seed   # opcional
```

### 4. Levantar

```sh
npm run dev
```

Abrí http://localhost:3000 — te redirige al login hosted de WorkOS.

## Deploy a Vercel + Neon (gratis)

1. **Crear DB en Neon**: https://neon.tech → New project → copia el connection string (con `?sslmode=require`).
2. **Subir a GitHub**: `gh repo create second-brain --private --source=. --push`.
3. **Importar a Vercel**: https://vercel.com/new → seleccioná el repo.
4. **Env vars en Vercel**:
   - `DATABASE_URL` = connection string de Neon
   - `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, `WORKOS_COOKIE_PASSWORD`, `NEXT_PUBLIC_WORKOS_REDIRECT_URI` (apuntando a `https://<vercel-domain>/callback`)
5. **Aplicar migraciones a Neon** desde local:
   ```sh
   DATABASE_URL="<neon-url>" npm run db:migrate
   ```
6. **PWA en mobile**: abrí la URL de Vercel en Safari/Chrome → "Compartir" → "Añadir a pantalla de inicio".

## Migración single-tenant → multi-tenant

La migración `0003_multi_tenant.sql` agrega `user_id` a las tres tablas y rellena las filas existentes con el placeholder `legacy-owner`. Después de desplegar y loguearte con WorkOS por primera vez:

1. Visitá `/api/whoami` para ver tu user id (`user_01H...`).
2. Reasignar la data legacy a tu user:
   ```sql
   UPDATE tasks          SET user_id = 'user_01H...' WHERE user_id = 'legacy-owner';
   UPDATE responsables   SET user_id = 'user_01H...' WHERE user_id = 'legacy-owner';
   UPDATE cierres_semana SET user_id = 'user_01H...' WHERE user_id = 'legacy-owner';
   ```
3. Eliminar la ruta temporal `src/app/api/whoami/route.ts`.

## Scripts

- `npm run dev` — dev server
- `npm run build` — build producción
- `npm run db:generate` — genera migración SQL desde el schema
- `npm run db:migrate` — aplica migraciones a la DB
- `npm run db:push` — sincroniza schema directo (sin migraciones)
- `npm run db:seed` — siembra responsables iniciales

## Modelo de datos

Todas las tablas tienen `user_id` (el id de WorkOS del dueño) y las queries siempre filtran por él. Ver `src/lib/auth.ts#requireUserId`.

- **responsables**: `id, user_id, nombre, color, orden`
- **tasks**:
  - `user_id, titulo, responsable_id, estado` (pendiente | en_proceso | delegado | done)
  - `bucket` (null = "Sin definir") + `bucket_order`
  - `in_flight` (bool) + `in_flight_order`
  - `eta` (date) — el día de la semana se resuelve al más próximo en el cliente
  - `done_at`, `closed_week_at` — para distinguir Done de esta semana vs Logradas
- **cierres_semana**: `user_id, cerrado_at, pendientes_antes, done_archivadas`
