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

Copia `.env.local.example` a `.env.local` y completa:

```
DATABASE_URL=postgres://postgres:postgres@localhost:5433/secondbrain
APP_PIN=1234
SESSION_SECRET=$(openssl rand -hex 32)
```

### 3. Migrar la base y sembrar responsables

```sh
npm install
npm run db:migrate
npm run db:seed
```

### 4. Levantar

```sh
npm run dev
```

Abrí http://localhost:3000 e ingresá el PIN.

## Deploy a Vercel + Neon (gratis)

1. **Crear DB en Neon**: https://neon.tech → New project → copia el connection string (con `?sslmode=require`).
2. **Subir a GitHub**: `gh repo create second-brain --private --source=. --push`.
3. **Importar a Vercel**: https://vercel.com/new → seleccioná el repo.
4. **Env vars en Vercel**:
   - `DATABASE_URL` = connection string de Neon
   - `APP_PIN` = tu PIN
   - `SESSION_SECRET` = `openssl rand -hex 32`
5. **Aplicar migraciones a Neon** desde local:
   ```sh
   DATABASE_URL="<neon-url>" npm run db:migrate
   DATABASE_URL="<neon-url>" npm run db:seed
   ```
6. **PWA en mobile**: abrí la URL de Vercel en Safari/Chrome → "Compartir" → "Añadir a pantalla de inicio".

## Scripts

- `npm run dev` — dev server
- `npm run build` — build producción
- `npm run db:generate` — genera migración SQL desde el schema
- `npm run db:migrate` — aplica migraciones a la DB
- `npm run db:push` — sincroniza schema directo (sin migraciones)
- `npm run db:seed` — siembra responsables iniciales

## Modelo de datos

- **responsables**: `id, nombre, color, orden`
- **tasks**:
  - `titulo, responsable_id, estado` (pendiente | en_proceso | delegado | done)
  - `bucket` (null = "Sin definir") + `bucket_order`
  - `in_flight` (bool) + `in_flight_order`
  - `eta` (date) — el día de la semana se resuelve al más próximo en el cliente
  - `done_at`, `closed_week_at` — para distinguir Done de esta semana vs Logradas
