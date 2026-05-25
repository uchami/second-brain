# Habit tracking — subspec

Subspec del [spec principal](spec.md). Cubre el feature de **tracking manual de hábitos**, el modo **A mimir** y la **pantalla de cierre de semana** con analítica de hábitos.

> Status: **diseño cerrado, listo para implementar**. Plan de ejecución en [docs/habits-implementation-plan.md](docs/habits-implementation-plan.md). Glosario en [CONTEXT.md](CONTEXT.md). Decisiones no obvias en [docs/adr/](docs/adr/).

## Por qué existe este feature

Uri venía trackeando sus hábitos semanales en un cuaderno de papel (su "journal") que funcionaba como apoyo del second brain. Como ahora el second brain vive 100% en esta app, el cuaderno quedó olvidado y los hábitos también. La consecuencia es perder la métrica que sostiene el resto del sistema ("semanas comparables aseguran resultados sostenidos").

Migrar el journal de papel a la app cierra el loop: el mismo lugar donde priorizo y ejecuto es el lugar donde mido cómo estoy. Sin contexto duplicado, sin app extra.

El archivo de referencia es `~/Downloads/Planificacion semanal (3).xlsx`, donde Uri vino registrando estos hábitos por semana desde enero. Sirvió como input de diseño; la app no se acopla a ese archivo.

## Alcance inicial — "solo lo que no se trackea solo"

Excluye explícitamente cualquier cosa que el teléfono / wearable ya mida (sueño automático vía HealthKit, pasos, etc.). Eso queda para una integración futura. El alcance es **preguntas manuales** que el usuario contesta al cerrar el día.

## Conceptos

### Hábito

Una pregunta configurable. Tiene:

- **Pregunta** (texto, ej. `¿Cómo dormiste anoche?`)
- **Tipo de respuesta** — uno de:
  - `texto` — campo libre (ej. `Alguna reflexión?`)
  - `estrellas` — 1 a 5
  - `escala_1_10` — slider o números 1-10
  - `si_no` — toggle
  - `emocion` — selector de lista fija (ver más abajo)
- **Orden** global (entero, sparse al estilo de `bucket_order` en tasks).
- **Activo/archivado** — para apagar hábitos sin perder histórico.

**Lista fija de emociones** — 13 canónicas + opción **"Otro"** con texto libre. Basada en consenso de Plutchik / Ekman / Geneva Emotion Wheel, organizada por valencia y energía. La lista vive en `src/lib/emociones.ts` y es editable solo en código (no UI). Single-select.

**Orden semántico** (no alfabético) — grupos separados visualmente en el select con un divider:

| Grupo | Emoción | Slug |
|---|---|---|
| Agradable · alta energía | Alegría | `alegria` |
| | Entusiasmo | `entusiasmo` |
| | Orgullo | `orgullo` |
| Agradable · baja energía | Calma | `calma` |
| | Gratitud | `gratitud` |
| Desagradable · alta energía | Ansiedad | `ansiedad` |
| | Enojo | `enojo` |
| | Frustración | `frustracion` |
| | Miedo | `miedo` |
| Desagradable · baja energía | Tristeza | `tristeza` |
| | Vergüenza | `verguenza` |
| | Aburrimiento | `aburrimiento` |
| Mixta | Sorpresa | `sorpresa` |
| — | **Otro** (con textbox) | `otro:<texto>` |

**Storage en `habito_entries.valor`**:
- Emoción canónica: el slug (ej. `"alegria"`, `"verguenza"`).
- Otro: `"otro:<texto libre>"` (mismo campo, prefijo `otro:` parseable). Ej. `"otro:nostalgia"`.

**Agregación en cierre de semana**: el top 3 cuenta `"Otro"` como una sola categoría (agrupa todos los `otro:*`). En el card del día en la tab Habits se muestra el texto custom ("nostalgia") en lugar del genérico "Otro".

**Multi-tenant note**: la lista es hardcoded global. Si en el futuro otros usuarios usan la app, heredan esta lista. Si llega a necesitarse, una migración a una tabla `emociones (user_id, slug, label, orden, valencia, arousal)` es factible — pero out of scope en v1.

### Registro de hábito (entry)

Una respuesta concreta a un hábito en una fecha. Tiene:

- `habito_id`
- `fecha` (día calendario en tz local del usuario — ver decisión #3)
- `valor` (string, se castea según el tipo)
- `skipped` (bool) — `true` cuando el usuario eligió explícitamente "no voy a trackear esto hoy". Distinto de `valor IS NULL` que significa "no contestado todavía".
- `created_at`

**Unicidad**: un solo registro por `(habito_id, fecha)`. El segundo "Cerrar día" del mismo día sobreescribe (con confirmación, ver UX).

## Defaults / onboarding

Una cuenta brand-new arranca con **0 hábitos** (no se siembra nada por default). Razones:
- La app es multi-tenant; otro usuario no tendría por qué heredar los hábitos de Uri.
- Las tablas singleton (`habit_config`, `user_settings`) se crean on-demand al primer acceso, con todos sus campos en default.

### Set de ejemplo desde `/settings → Hábitos`

Si el usuario tiene `count(hábitos) === 0`, la pantalla de config muestra un panel destacado arriba:

> ¿Querés arrancar con un set predefinido? Te creamos hábitos típicos que después podés editar o borrar.
> **[Cargar set de ejemplo]**

Al apretar el botón se insertan los hábitos hardcoded en `src/lib/habit-defaults.ts`. El panel desaparece automáticamente porque `count() > 0`. No reaparece después (no hay forma de "volver a sembrar"; si querés más, los agregás manualmente).

**Contenido del set de ejemplo** (6 hábitos, uno por cada tipo + cobertura de áreas vitales típicas):

```ts
[
  { pregunta: "¿Cómo te sentiste hoy?", tipo: "emocion" },
  { pregunta: "¿Cómo dormiste anoche?", tipo: "escala_1_10" },
  { pregunta: "Moviste el cuerpo hoy?", tipo: "si_no" },
  { pregunta: "¿Comiste bien hoy?", tipo: "estrellas" },
  { pregunta: "¿Hiciste algo que te haga sentir orgulloso?", tipo: "si_no" },
  { pregunta: "Reflexión libre del día", tipo: "texto" },
]
```

### Empty states

- **Tab Habits sin hábitos**: muestra un mensaje + botón "Configurar hábitos" que linkea a `/settings → Hábitos`.
- **Botón "Cerrar día" en In-flight sin hábitos**: oculto. No tiene sentido cerrar un día si no hay nada que cerrar.
- **Sleep mode sin hábitos**: deshabilitado por completo. El cálculo de `sleepMode` exige `count(hábitos) > 0` además de las condiciones de entries u horario. Sin hábitos no se entra en A mimir aunque sean las 23:00.

## Pantalla de configuración de hábitos

`/settings` pasa a tener **tabs internas** (no sub-rutas). Estructura:

- **Hábitos** (tab por defecto cuando entrás a `/settings`)
- **Modo A mimir**
- **Responsables**
- **Cuenta** (timezone vive acá)

El patrón Tabs ya está en uso en la app (`AppShell`), se reusa la primitive de `src/components/ui/`.

Lista plana de hábitos configurados (sin agrupar). Por cada hábito:

- Pregunta editable inline.
- Tipo de respuesta (select).
- Toggle activo/archivado.
- Botón eliminar (con confirmación; el delete es soft — marca archivado pero conserva los registros históricos).
- Reordenar por D&D en la lista plana.

Botón **"Agregar hábito"** abajo de la lista.

### Config de "modo A mimir"

En la tab "Modo A mimir" de `/settings`:

- Hora de **inicio automático** (default 21:00).
- Hora de **fin automático** (default 05:00).
- Toggle "Activar modo A mimir automáticamente" (default ON).

## Botón "Cerrar día"

Vive en la tab **In-flight**. Visible siempre, abajo del listado de tareas. Color neutro de día, color destacado (ámbar/violeta) cuando ya entró el horario de A mimir y todavía no se cerró el día.

Al tocarlo:

1. Abre un **modal fullscreen "Cierre del día"** con las preguntas de hábitos diarios.
2. **Todos los hábitos visibles en una lista vertical scrolleable**, en el orden definido en config. NO es step-by-step.
3. Un breve copy contextual arriba del primer hábito, ej. _"Repasá tu día. Lo que no quieras trackear hoy, dejalo vacío y al final lo skipiamos."_
4. Cada respuesta es **opcional**: el usuario puede dejar vacío.
5. Abajo del listado, botón **"Guardar y dormir"** (sticky en mobile).
6. Si hay hábitos sin contestar, antes de guardar aparece un sub-diálogo:
   > "Quedaron N sin contestar. ¿Qué hago con ellos?"
   - **Botón "Volver al cierre"** — cierra el sub-diálogo y deja el modal abierto.
   - **Botón "Skip por hoy"** — marca esos hábitos como `skipped=true` y guarda todo.

   No hay opción de "guardado parcial". Entries con `valor=NULL, skipped=false` son estado ilegal — el server action recibe cada hábito como `{ value }` o `{ skipped: true }`, nunca vacío.
7. Al guardar (ritual nocturno):
   - Server: inserta/upserta los registros. Marca sleep mode como activo (server-derivado, ver "Modo A mimir").
   - Cliente entra en sleep mode **optimísticamente** (tema dark, tab renombrada).
   - **Animación post-cierre** (con la pantalla congelada, sin interacción):
     a. Cierra el modal.
     b. Navega a la **tab Habits**, espera ~1s.
     c. Aparece la card del día recién cerrado con animación de "push" (empuja al resto hacia abajo) + halo verde a su alrededor.
     d. ~2s después, navega automáticamente a la tab **"A mimir"** (la ex-In-flight).
   - Toast `Buenas noches. A mimir.` aparece al final, en la tab "A mimir".

### Modos del modal

El mismo componente de modal sirve para tres flujos. Lo que cambia es:

| Flujo | Pre-cargado | Activa sleep mode | Animación post-save |
|---|---|---|---|
| **Ritual nocturno** (botón "Cerrar día" desde In-flight, sin entries de hoy) | No | Sí (si no estaba ya) | Sí |
| **Edit de hoy** (re-abrir desde In-flight o desde card en Habits) | Sí | No (idempotente) | No |
| **Trackear otro día** (calendario en tab Habits) | Sí si existe, vacío si es backfill | No | No |

Al guardar de nuevo (cualquier modo edit), sobreescribe sin preguntar — no hay versionado de respuestas.

## Modo "A mimir" (interno: `sleepMode`)

Nombre visible al usuario: **"A mimir"** (voz interna de Uri, voseo). Identificador en código: **`sleepMode`** (columnas, props, helpers, server actions). Mantener esta separación a lo largo de todo el código.

Estado **server-derivado** — no es columna en DB, es un booleano que el server calcula en cada request y manda al cliente como prop (mismo patrón que el resto de `getAllData()` en `src/app/page.tsx`). Se determina por:

- El usuario tiene `count(hábitos activos) > 0` (sin hábitos, sleep mode está siempre OFF) **Y**
- (`tracking_cerrado_hoy = true` — existe al menos un `habito_entry` con `fecha = hoy en tz del usuario`, sea con valor o skipped — **O** `hora_actual_server_en_tz_del_usuario ∈ [config.sleep_mode_inicio, config.sleep_mode_fin]` y `config.sleep_mode_auto = true`).

El cliente nunca decide el modo por sí solo. Excepción: al guardar "Cerrar día" el cliente entra en sleep mode **optimísticamente** sin esperar refresh, igual que el patrón de `done` en tareas (ver commit `e5e19f4`).

**Cross-device**: si cerrás el día en el celular y abrís la laptop, la laptop entra en sleep mode al próximo refresh (no hay push en tiempo real). Aceptable porque el caso de uso nocturno es secuencial, no paralelo.

Cuando está activo:

1. **Tema dark** en toda la app (override del tema normal).
2. **Tab In-flight renombrada a "A mimir"**. Mismo ícono o uno de luna.
3. **Modal de bienvenida** cada vez que se abre la app (no en cada navegación interna — solo en cold open / al traer a foreground). Copy:
   > Cerraste el día. Andá a dormir, no seas bobo. Es más productivo dormir bien y hacer eso mañana.
   Con un botón "OK, ya voy" que cierra el modal y deja usar la app. **No bloquea**: si el usuario insiste en usar la app, puede.
4. **Si el modo se activó por horario automático y NO hay registros de hoy**, la tab A mimir muestra un banner persistente arriba:
   > No trackeaste tus hábitos hoy, hacelo, es un minuto. Recordá: semanas comparables aseguran resultados sostenidos.
   Con un botón directo "Trackear ahora" que abre el modal de Cerrar día.

### Desactivación

- Automática: cuando `hora_actual > config.fin` (default 05:00) **y** `tracking_cerrado_hoy` es de ayer (no hoy).
- Manual: no se expone botón "salir de A mimir" — la idea es defensiva.

### Modal de bienvenida — copy

> Cerraste el día. Andá a dormir, no seas bobo. Es más productivo dormir bien y hacer eso mañana.

(Nota de convenciones: el spec principal pide español neutro sin voseo. Este copy es la voz del producto y usa voseo intencional porque es el tono interno de Uri hablándose a sí mismo. Decisión: las **etiquetas y botones del sistema** quedan neutros, los **textos motivacionales y de framing personal** mantienen el voseo. Documentar caso por caso al implementar.)

## Tab Habits

Tab nueva, junto a In-flight y Second brain (la app pasa a tener 3 tabs). Es **lectura y edición** del Journal: la fuente de verdad para ver lo que registraste y para corregir el pasado.

### Estructura

- Cards por día, agrupados por semana (mismo patrón visual y de agrupación que `LogradasSection`).
- Header de cada grupo: `Semana del DD – DD mes YYYY · N días trackeados`.
- Header de cada card: fecha + status compacto (ej. `5/5 cerrado · 1 skipped` o `3/5 sin cerrar`).
- Body del card **colapsado por default**. Tap en el header → expande y muestra cada hábito con su respuesta (read-only). Para editar, botón **"Editar este día"** abajo del card expandido que abre el modal de Cerrar día pre-cargado. No hay edit individual in-place — todo edit pasa por el modal (una sola fuente de UI).
- El día de **hoy** se muestra arriba del todo, con tratamiento visual destacado. Si todavía no se cerró, muestra un CTA "Cerrar día" que abre el modal igual que el botón de In-flight.
- Carga inicial: últimas 8 semanas. Botón "Ver más" abajo para paginar hacia el pasado.

### Botón "Trackear hábito"

Arriba de la tab. Abre un **calendario** (mes actual + navegación a meses anteriores). En el calendario:

- **Día con al menos una entry** → pintado (color sólido).
- **Día sin ninguna entry** → blanco.

Tap en un día (pintado o blanco) → abre el **mismo modal** de Cerrar día, con las respuestas pre-cargadas si existen. Diferencia clave: el modal en modo "trackear otro día" **NO activa sleep mode** al guardar, **NO dispara la animación post-cierre**, y al guardar simplemente vuelve a la tab Habits y muestra un toast.

### Edición de hoy

Tap en el card de hoy en la tab Habits → abre el modal de Cerrar día pre-cargado. Si sleep mode ya está activo (porque ya cerraste antes), el modal está en modo "edit" igual que para días pasados: NO re-activa sleep mode, NO dispara animación.

## Cierre de semana — sumar métricas de hábitos al modal existente

`CerrarSemanaDialog` se mantiene como modal. No se convierte en página ni se rediseña. Solo se le **agregan métricas de hábitos** debajo de las stats de tareas que ya muestra.

### Qué se suma al modal

Una sub-sección nueva, debajo del bloque actual de stats de tareas. Por cada hábito activo se muestra una línea con visualización y comparativa según el tipo:

| Tipo | Visualización en cierre de semana | Comparativa |
|---|---|---|
| `si_no` | Mini-heatmap de 7 cuadraditos. Verde = sí, gris = no, borde sin relleno = skipped, vacío sin borde = sin entry. | `4/7 (vs 5/7 anterior)` |
| `estrellas` | Las 5 estrellas con relleno al promedio de la semana (ej. 4.2 → 4 enteras + 1 parcial). | `Δ vs semana anterior` (ej. `+0.3 ★`) |
| `escala_1_10` | Número grande del promedio (ej. `6.4`). | `Δ vs semana anterior` (ej. `+0.8`) |
| `emocion` | Top 3 emociones de la semana con count. Ej. `Calma (3) · Gratitud (2) · Ansiedad (1)`. | Sin comparativa (categórico). |
| `texto` | Sin visualización agregada. Bloque colapsable "Ver respuestas (N) ↓" que expande la lista de textos cronológica con fecha. | No aplica. |

Reglas para los promedios y comparativas:
- Skipped y sin-entry **no entran** en el cálculo de promedio.
- Comparativa requiere al menos una entry en la semana actual Y en la anterior. Si falta una, se omite la línea de delta.
- En `si_no`, el ratio `X/7` cuenta solo entries con valor (no skipped, no sin-entry).

Si el modal queda muy alto en mobile, hacer scroll interno está bien — sigue siendo modal, no pantalla.

### Lo que NO cambia

- El flujo `getCerrarSemanaPreview()` + confirmar + `cerrarSemana()` queda igual.
- El botón "Cerrar semana" sigue viviendo solo en el SB tab.
- No hay ruta `/cierre-semana` ni overlay full-screen.
- No hay "reflexión semanal" ni "compromisos" dentro de la app — eso vive en el Excel de planificación de Uri.

## Modelo de datos

Cuatro tablas nuevas en `src/db/schema.ts`. Todas con `user_id text` y query siempre filtrada por user autenticado.

### `habitos`
- `id` (uuid)
- `pregunta` (text)
- `tipo` enum: `texto | estrellas | escala_1_10 | si_no | emocion`
- `orden` (int, sparse: 100, 200, 300...)
- `archivado` (bool, default false)
- `created_at`

> Nota: en v1 solo se modelan hábitos diarios. La columna `frecuencia` no se crea — cuando aparezca el primer hábito semanal real, una migración Drizzle la agrega.

### `habito_entries`
- `id` (uuid)
- `habito_id` (fk)
- `fecha` (date)
- `valor` (text nullable)
- `skipped` (bool, default false)
- `created_at`
- **Unique** `(habito_id, fecha)`

### `habit_config`
Singleton por usuario (PK lógica `user_id`). Config del feature de hábitos. Guarda:
- `user_id` (text, unique)
- `sleep_mode_inicio` (time, default `21:00`)
- `sleep_mode_fin` (time, default `05:00`)
- `sleep_mode_auto` (bool, default true)
- `updated_at`

### `user_settings`
Singleton por usuario (PK lógica `user_id`). Config a nivel usuario, no específica de hábitos. Separada de `habit_config` a propósito: `timezone` afecta `done_at`, `closed_week_at`, y cualquier feature futuro que use fechas. Guarda:
- `user_id` (text, unique)
- `timezone` (text, default `America/Montevideo`) — IANA tz string
- `updated_at`

## Migración del Excel histórico

Out of scope inicial pero anotado: similar al import del CSV legacy, se puede escribir `src/db/import-habits.ts` que parsee el `.xlsx` y popule `habito_entries` retroactivamente. Útil para tener gráficos comparativos desde día 1.

## Cosas que Uri propuso y quedan tal cual

- Selector de tipo de pregunta en config (✓ incluido).
- Botón Cerrar día en In-flight (✓).
- Modo A mimir con dark mode y modal recurrente (✓).
- Horario auto configurable (✓).
- Cartel "no trackeaste" si auto sin tracking (✓).
- Campos opcionales con confirmación explícita (✓ via skipped).
- Visualización de hábitos al cerrar semana (✓ — pero como sub-sección del modal existente, no como pantalla aparte).

## Decisiones tomadas

1. **Solo preguntas diarias**. El Excel que sirvió de referencia era el *dashboard semanal* que Uri alimentaba desde su journal en papel. Esta app reemplaza el journal, no la planificación. La planificación semanal sigue siendo en Excel afuera de la app, alimentada por la data que sale de estas preguntas. El campo `frecuencia` **no se crea en v1** — cuando aparezca el primer hábito semanal real se agrega con una migración. La vista semanal agrega los daily automáticamente (ej. "4/7 días desayuné").

2. **Sin push notifications en v1**. El único recordatorio es el banner que aparece al abrir la app en modo A mimir si no se cerró el día. Suficiente. Cuando haya service worker serio para PWA offline se reevalúa.

3. **Timezone fija, configurable desde `/settings`, default `America/Montevideo`**. Vive en `user_settings.timezone` (tabla nueva, separada de `habit_config`). Default GMT-3. La app **no** infiere timezone del navegador — si el usuario viaja, cambia el setting a mano. Razón: el ritual nocturno tiene que ser consistente; un viaje no debería cambiar la hora de "A mimir" automáticamente. El `fecha` de `habito_entries` y todas las stats por-día se calculan en esta tz.

4. **Streak (racha) — qué cuenta y dónde se muestra**.

   **Qué cuenta como "día con tracking"**: un día cuenta si tiene entries para **todos los hábitos activos de ese día**, cada uno con `valor IS NOT NULL` o `skipped=true`. La racha mide adherencia al ritual de **cerrar el día**, no perfección de las respuestas. Skip está OK porque fue decisión consciente.

   **Backfill y edición afectan la racha retroactivamente** (cálculo reactivo puro sobre el estado actual de la DB). Si backfilleás un día que faltaba, la racha se restaura. Si borrás una entry vieja, se puede romper retroactivamente. Es la forma honesta y barata de calcular.

   **Dónde se muestra**:
   - **Badge chico** al lado del botón "Cerrar día" en la tab In-flight.
   - **Banner full-width** arriba en la tab Habits.
   - NO se muestra en la tab Second brain (no es relevante ahí).

5. **Sin restricciones temporales en backfill ni edición**. La tab Habits con calendario es el lugar para registrar cualquier día (incluso meses atrás) y para editar entries existentes. No hay límite de 7 días: si lo necesitás, lo hacés. El link "Trackear día anterior" del modal queda eliminado — su función la cumple ahora el botón "Trackear hábito" de la tab Habits.

6. **Compromisos / planificación semanal — fuera de la app**. Uri sigue haciendo la planificación semanal en su Excel personal, alimentado por la data del Journal. La app no implementa "compromisos" ni "reflexión semanal" en v1 ni en una versión próxima — es decisión del producto.

7. **Sleep automático vía HealthKit — fuera de v1**. Flaggeado, no se hace. Por extensión: no hay tracking "inteligente" de sueño. Si Uri quiere trackear horas de sueño o descanso percibido, suma esos hábitos manualmente como cualquier otro.

8. **Banner rojo de In-flight y banner "no trackeaste" coexisten**. En horarios distintos: el banner rojo de top-1 vive durante el día activo, el banner de "no trackeaste" sólo aparece en modo A mimir nocturno. Ninguno diluye al otro porque nunca conviven en pantalla.

### Nota sobre multi-tenancy

La app ya no es single-user. Cada row de DB tiene `user_id` (id de WorkOS — ver spec principal, sección Auth, y `src/db/schema.ts`). Las cuatro tablas nuevas (`habitos`, `habito_entries`, `habit_config`, `user_settings`) llevan `user_id` y toda query filtra por el `user_id` autenticado. Las dos singleton (`habit_config`, `user_settings`) tienen unique constraint en `user_id`.
