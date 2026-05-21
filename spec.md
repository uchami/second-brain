# Second brain — spec

Documento para futuros agentes (humanos o Claude). Explica para qué existe la app, qué decisiones se tomaron y dónde mirar primero.

## Objetivo

App personal de Uri para gestionar tareas y prioridades. Reemplaza una planilla Excel que tenía dos vistas: una lista corta de cosas "en vuelo" y una lista larga priorizada por buckets. La app respeta ese flujo y le agrega visibilidad histórica (Logradas), motivación (stats semanales) y disciplina (límite duro de tareas en vuelo, alertas cuando no estás en lo importante).

**Single user**: hay un solo PIN configurado por env var. No hay multitenancy, no hay roles, no hay sharing. Cualquier feature nueva debería respetar este alcance — si pensás que necesita "users" o "permissions", está fuera de scope.

## Stack

- **Next.js 16** App Router + TypeScript
- **Tailwind v4** (sin shadcn — usa Radix primitives directos con clases manuales)
- **Drizzle ORM** + Postgres (driver `postgres` / postgres.js)
- **Radix UI** para Dialog, Select, Tabs, Checkbox, Dropdown, etc.
- **@dnd-kit** para reorden y drag entre buckets en Second brain
- **jose** para firmar la cookie de sesión
- **sonner** para toasts
- **lucide-react** para íconos
- **date-fns** instalado pero la mayoría de la lógica de fechas vive en `src/lib/dates.ts` y `src/lib/eta.ts` para no acoplar
- **PWA mínima** (manifest + íconos), instalable en mobile pero sin service worker offline serio

**Hosting**: Vercel free + Neon Postgres free, integrados nativamente. Dev local usa Docker (`postgres:16-alpine`) en puerto 5433.

## Modelo de datos

Tres tablas, todas en `src/db/schema.ts`:

### `responsables`
- `id, nombre, color, orden, created_at`
- Lista editable desde `/settings`. Cada tarea puede tener `responsable_id` o null.

### `tasks`
- `id, titulo, detalle (text nullable), responsable_id`
- `bucket` (int nullable) — `null` = "Sin definir"
- `estado` enum: `pendiente | en_proceso | delegado | postergado | done`
- `eta` (date nullable)
- `in_flight` (bool) + `in_flight_order` (int nullable, **legacy**, ya no se usa para ordenar)
- `bucket_order` (int, sparse: 100, 200, 300...) — orden dentro del bucket
- `done_at` (timestamp) — cuándo se marcó done
- `closed_week_at` (timestamp nullable) — `NULL` = Done de **esta semana**, NOT NULL = ya está en Logradas
- `created_at, updated_at`

### `cierres_semana`
- `id, cerrado_at, pendientes_antes (int), done_archivadas (int)`
- Snapshot que toma `cerrarSemana()` antes de mutar nada. La preview del próximo cierre lo usa para calcular el delta de tareas pendientes vs. la semana pasada.

## Reglas de negocio clave

### Buckets

- Internamente son `int`. Los labels 0-3 están renombrados, todo lo demás se muestra como "Bucket N".
- Helper único: `bucketLabel(n)` en `src/lib/buckets.ts`. Cualquier UI que muestre un bucket debería pasar por ahí.
- Naming actual:
  - `0` → `Importante`
  - `1` → `Si hay tiempo…`
  - `2` → `Quizás más tarde`
  - `3` → `Meh, pero lo anoto`
  - `null` → `Sin definir`
  - `4+` → `Bucket 4`, `Bucket 5`, ...
- **Buckets permanentes**: 0-3 siempre se muestran en SB y en el modal de cambiar bucket, incluso si están vacíos. Es para que sea fácil mover cosas durante una repriorización. Constante `PERMANENT_BUCKETS` en `second-brain-tab.tsx`.
- **Orden visual en SB** (usado también por in-flight): `0 → null (Sin definir) → 1 → 2 → 3 → ... → Done → Logradas`. La función `bucketSortKey()` en `in-flight-tab.tsx` codifica esto: `0 → -Infinity`, `null → -1`, `n>0 → n`.

### In-flight tab

- Hard limit de **6** tareas. La 7ma intentada arroja error y toast.
- **NO se reordena manualmente**. Las tareas se renderizan ordenadas por `(bucketSortKey, bucket_order)`, igual que su lugar en SB. Así promover una tarea no la "mueve" — se queda donde corresponde por bucket.
- Cada card lleva un **badge de posición**: `Importante · 1/6`, `Sin definir · 1/9`, etc. El total es sobre todas las tareas activas del bucket (no solo las in-flight).
- **Banner rojo** abajo si existe una top-1 de Importante (bucket 0) que NO está en in-flight. Muestra el título. Desaparece automáticamente cuando promovés la tarea, la marcás done, o la sacás del bucket 0.
- Para **marcar done**: checkbox de la card. Eso setea `estado=done`, `in_flight=false`, `done_at=now()`. La tarea pasa al bucket "Done" del SB.
- **Mandar al SB**: ícono avioncito ✈ abre `MoveToSBDialog` para elegir bucket.

### Highlights del bucket 0

Solo aplican al bucket 0 (`Importante`). Sirven para ver de un vistazo qué es lo crítico.

- **Top-1**: borde `emerald-500`, fondo `emerald-200`, `shadow-lg` con tinte verde. Es la cosa más importante en este momento.
- **#2, #3, #4**: borde `sky-100`, fondo `sky-50/50` (medio transparente).
- **#5+**: blanco normal.

El mismo color se aplica en in-flight si la tarea en in-flight es la top-1 o 2-4 del bucket 0. La lógica se calcula en `InFlightTab.tierFor()` y se pasa al `TaskCard` vía la prop `highlightTier`.

### ETA

- Un campo `date` simple. El picker es por **día de la semana** (`L M X J V S D`), resuelve al día más próximo. Si hoy es martes y elegís martes, **guarda hoy**, no el próximo martes. Lógica en `src/lib/eta.ts#resolveDayToDate`.
- Colores del badge según diff con hoy (también en `eta.ts#etaColor`):
  - `hoy` → amarillo
  - `ayer (-1d)` → rojo
  - `anteayer (-2d)` → rojo oscuro (`red-600` fondo, texto blanco)
  - `3+ días pasado` → violeta con prefijo 💀 en el badge
  - `futuro` → neutro
  - `sin ETA` → no se muestra badge
- ETA solo está disponible en el SB. En in-flight, las tareas pueden tener ETA porque vienen del SB, pero no se setea desde in-flight (el modal de "Nueva" en in-flight no tiene picker de ETA).

### Estados de tarea

5 estados; `done` es terminal en el flujo normal (puede revivir con `unmarkDone()` pero la UI sólo expone esa acción dentro del checkbox del card en SB tab, no en Logradas).

Badges con colores:
- `pendiente` → gris neutro (default)
- `en_proceso` → ámbar
- `delegado` → violeta
- `postergado` → slate (gris azulado)
- `done` → emerald + tachado en SB tab; en Logradas no se muestra el badge porque ya hay Trophy

`postergado` se agregó al importar el CSV legacy que tenía esa columna; en el flujo nuevo se usa cuando vos decidís que algo no se hace ahora pero querés que quede registrado.

### Cerrar semana

Doble flujo: **preview** (no muta nada) y **commit** (transacción).

1. Click en "Cerrar semana" abre `CerrarSemanaDialog`.
2. El dialog llama `getCerrarSemanaPreview()` que devuelve:
   - `doneEstaSemana` — count de done sin `closed_week_at`
   - `tareasAgregadas` — created_at > último `cerrado_at` (o todas si nunca cerraste)
   - `pendientesActuales` — count actual de activas
   - `pendientesUltimoCierre` — `pendientes_antes` del último registro de `cierres_semana`
   - `diffPctVsUltimo` — porcentaje, null si no hay referencia previa
   - `mvp` — responsable con más done esta semana
   - `masVieja`, `masRapida` — done con max/min `done_at - created_at`
3. El modal muestra las stats con un mensaje motivacional aleatorio y un disclaimer.
4. Al confirmar, `cerrarSemana()` corre en transacción:
   - Snapshot `pendientesAntes` = count actuales
   - `closed_week_at = now()` para todas las done sin closed_week_at
   - `bucket = NULL` para **todas** las activas (incluye in-flight) — esto resetea la prioridad
   - Insert en `cierres_semana` con el snapshot y el count archivado

**Decisión importante**: el reset incluye in-flight. La idea es que "una nueva semana es una nueva priorización completa". Si querés que las in-flight no se reseteen, hay que cambiar el `where ne(tasks.estado, "done")` en `cerrarSemana()`.

### Logradas (histórico)

Las tareas done con `closed_week_at != null` son "Logradas". Se renderizan en `LogradasSection` (no en `SBBucket`) porque tienen una vista distinta:

- **Trophy verde** en lugar del checkbox.
- **No tachado**, texto negro normal — el punto es leerlas para motivación, no marcarlas como cumplidas (ya lo están).
- **Card con tinte emerald suave** y borde verde claro.
- **Sin botones de acción** (sin avioncito, sin reorder).
- **Click abre `LogradaInfoDialog`** read-only con título, detalle, responsable, bucket, fecha creada, fecha lograda y badge "X días en la lista".
- **Agrupadas por semana** (start-of-week lunes) del `closed_week_at`. Cada grupo tiene header "Semana del DD – DD mes YYYY · N tareas". Semanas más recientes arriba.
- Las importadas del CSV legacy quedan todas bajo una sola semana porque el CSV no traía fecha por fila — todas tienen `closed_week_at = NOW() - 7d` en el momento del import.

### D&D entre buckets (en SB)

- Cada `SBBucket` es un droppable, cada task un sortable.
- **Highlight visual**: cuando arrastrás sobre un bucket distinto al origen, ese bucket se pinta gris con ring (incluso si estás encima de una task dentro de él, no solo el área vacía). Esto se logra trackeando `overBucketKey` y `activeBucketKey` en `SecondBrainTab` y pasando `highlight` al `SBBucket`.
- **Drop cross-bucket = append al final**. No respeta la posición exacta del cursor. Es una decisión deliberada porque la posición inline era inconsistente con @dnd-kit, y el usuario puede afinar después con los botones ↑↓.
- **Drop same-bucket = reorder real** respetando la posición.
- **Buckets colapsados no son drop targets**. Hay que abrirlos primero.

### Quick bucket move

- Ícono `FolderInput` (📁) en cada task activa de SB abre `QuickBucketDialog`.
- Botones grandes en grid 2 col, uno por bucket existente + "Sin definir". El bucket actual aparece marcado en negro con ✓.
- **No permite crear buckets nuevos** — eso se hace desde el modal de edición. Decisión: el quick path tiene que ser rápido, no ofrece toda la flexibilidad.
- Un solo tap mueve y cierra (sin paso de confirmación).

### Buckets colapsables

Todos los buckets (incluyendo Done) tienen chevron `▸/▾`. State local a `SecondBrainTab` (`collapsedBuckets: Record<key, boolean>`). Se resetea al recargar la página. El header colapsado muestra el count para no perder contexto.

### Auth

- Un solo PIN en `APP_PIN` env var.
- `POST /api/login` valida y setea cookie `sb_session` firmada con HMAC SHA-256 (`SESSION_SECRET`). Expira a 30 días.
- `src/proxy.ts` (Next 16 renombró `middleware` → `proxy`) chequea la cookie en cada request. Redirige a `/login` si no está autenticado.
- `POST /api/logout` borra la cookie.

## UI y componentes

### Estructura

- `src/app/page.tsx` (server) — carga datos con `getAllData()`, pasa al `AppShell`.
- `src/components/app-shell.tsx` (client) — tabs, header con logout/settings, dynamic-imports los dos tabs para evitar warning de hydration de @dnd-kit (sus IDs internos divergen entre SSR y CSR).
- `src/components/in-flight-tab.tsx` — sin D&D, ordenado y badged.
- `src/components/second-brain-tab.tsx` — el grande. Maneja DndContext, sections, drag highlight, quick bucket, cerrar semana, etc.
- `src/components/sb-bucket.tsx` — un bucket. Renderiza SortableContext + tasks.
- `src/components/sortable-task.tsx` — wrapper @dnd-kit alrededor de TaskCard.
- `src/components/task-card.tsx` — el card visual. Tiene MUCHAS props porque se usa en in-flight, SB y Logradas (contexto cambia los íconos visibles y el estilo).
- `src/components/task-form-dialog.tsx` — modal create/edit. Maneja título, detalle, responsable, estado, bucket, ETA.
- `src/components/move-to-sb-dialog.tsx` — modal "mandar al SB" desde in-flight.
- `src/components/quick-bucket-dialog.tsx` — modal de cambio rápido de bucket.
- `src/components/cerrar-semana-dialog.tsx` — preview + confirm del cierre.
- `src/components/lograda-info-dialog.tsx` — read-only de Lograda.
- `src/components/eta-picker.tsx` — chips L-D + "quitar ETA".
- `src/components/logradas-section.tsx` — vista especial para Logradas, agrupada por semana.
- `src/components/responsables-editor.tsx` — `/settings` page.
- `src/components/ui/*` — primitives wrappers de Radix (button, dialog, select, input, label, checkbox, tabs).

### Mobile-first

- Viewport meta tag con `maximumScale=1, userScalable=false` (es una app, no una página).
- Inputs con `font-size: 16px` en mobile para evitar el zoom de iOS al enfocar.
- Dialog ancho `calc(100% - 1.5rem)` para no overflow en 375px.
- Drag handle visible solo en `sm:` (desktop); en mobile no hay reorder en SB (los botones ↑↓ tampoco están en in-flight desde el cambio reciente, solo en SB).

### Convenciones de copy

- Español **neutro**, sin voseo. Por feedback explícito del usuario, ver `~/.claude/projects/.../memory/feedback_spanish_neutro.md`.
- Ejemplos: `Toca`, no `Tocá`. `Confirma`, no `Confirmá`. `Usa`, no `Usá`.

## Convenciones de código

- Server actions en `src/app/actions.ts`. Todas hacen `revalidatePath("/")` al final vía `refresh()`.
- Drizzle types: `Task`, `Estado`, `Responsable`, `CierreSemana` exportados de `src/db/schema.ts`.
- `bucket = null` significa "Sin definir". El código debe manejar este caso explícitamente (no `?? 0` por accidente).
- `bucket_order` es entero sparse (multiplos de 100) para insertar sin reindex masivo.
- Estados de UI complejos (modales abiertos, etc.) viven en el componente padre que renderiza condicionalmente. No hay context global.
- Tailwind v4 (sin tailwind.config.js). Las clases custom van directo en `globals.css`. Si necesitás un nuevo "theme", agregalo ahí.

## Scripts útiles

- `npm run dev` — dev server (puerto 3000)
- `npm run build` — build producción
- `npm run db:generate` — genera migración SQL a partir de cambios en schema.ts
- `npm run db:migrate` — aplica migraciones a la DB apuntada por `DATABASE_URL`
- `npm run db:push` — sync directo (sin migración) — solo dev
- `npm run db:seed` — siembra responsables iniciales
- `npm run db:import <csv-path> [--clear]` — importa el CSV legacy con el hack decimal de buckets

## Decisiones que tienen "por qué" no obvio

1. **In-flight no se reordena**: la prioridad ya está en el SB. Si reordenás in-flight, te aleja del orden canónico y empezás a tener dos verdades. Mejor que in-flight refleje SB y vos cambies en SB.

2. **Cross-bucket D&D va al final**: la posición inline cross-container con @dnd-kit es inconsistente (especialmente en mobile). Append-to-end + fine-tune después con ↑↓ es más confiable. El usuario aceptó esto explícitamente.

3. **Buckets permanentes 0-3**: el flujo del usuario es "cerrar semana, todo a Sin definir, repriorizar". Tener 0-3 siempre presentes hace ese paso fácil sin tener que "crear" buckets nuevos.

4. **Cerrar semana resetea TODAS las activas (incluye in-flight)**: la priorización es semanal completa. Si querías mantener una in-flight a través del cierre, no es el modelo. Fácil de cambiar si después se decide otra cosa.

5. **Logradas read-only**: una vez lograda, no se "deslogran". Si tocás una pensando que es un click normal y se desmarcara, perdés un logro. Y la vista es para motivarte mirándolo, no para gestionarlo.

6. **Highlight solo en bucket 0**: la idea es que el bucket 0 es lo que **vas a hacer ahora**. Los otros buckets son backlog. Pintar tiers en todos los buckets hace ruido y diluye la señal.

7. **Banner rojo en in-flight si no estás en la top-1**: es la única alerta proactiva de la app. Mantenerla solo para esto preserva su peso.

8. **Detalle como text libre, no markdown**: pegás links, notas, lo que sea. Si más adelante querés markdown, agregás `react-markdown` y el campo ya está.

9. **Postgres en lugar de SQLite/Turso**: integración nativa con Vercel + Neon free tier. Lo más fácil de deployar gratis. No hay nada Postgres-specific que importe en queries (sólo `gen_random_uuid` no se usa, `ne()` y `count(*)` son universales). Si más adelante hace falta moverlo, casi sin cambios.

10. **`@dnd-kit` deferido a client-only**: usa contadores internos para `aria-describedby` que se desincronizan entre server y client render. `dynamic({ ssr: false })` en `app-shell.tsx` evita el warning. Costo: un mini-flash al primer load.

## Dead code conocido

- `reorderInFlight()` en `src/app/actions.ts`: se usaba cuando in-flight era reordenable. Ya no se llama. La dejé en caso de que se quiera volver.
- `tasks.in_flight_order` (columna en DB): se usaba para el orden manual. Ya no determina el orden visual (que se calcula de `bucket` + `bucket_order`). La columna sigue ahí pero no se mantiene viva.

## Importar el CSV legacy

`src/db/import-csv.ts`. El CSV original tenía:

- Una columna "U.I." (prioridad) que era un decimal — `0`, `0.01`, `0.1`, `1`, `2.5`...
- El usuario usaba el decimal como hack para sub-priorizar dentro de un bucket entero: `0.11` está arriba de `0.9` por orden alfabético del string.
- Columnas L-S con marcas tipo `"Logrado!"`, `"En proceso"`, `"Pendiente"`, `"Delegado"`, `"Postergado"`.

El script:

- Parsea CSV manualmente (no usa lib externa, es 30 líneas).
- Split bucket en `(bucket entero, sub_order)` donde sub_order preserva el orden alfabético del decimal padding-right con ceros.
- Mapea estados textuales a enum.
- Crea responsables faltantes con color default.
- Tareas done (con "Logrado!") van directo a Logradas con `closed_week_at = now() - 7d`.
- `--clear` borra todo antes de importar.

Si llegara otro CSV con formato distinto, el script es un buen starting point pero probablemente requiera ajustar el parsing de la columna de bucket.
