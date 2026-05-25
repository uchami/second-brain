# Habit tracking — plan de implementación

Orden de ejecución de las 14 tareas que cierran el feature definido en [spec-habits.md](../spec-habits.md). Cada fase es verificable de forma aislada antes de pasar a la siguiente. Glosario en [CONTEXT.md](../CONTEXT.md). Decisiones no obvias en [docs/adr/](./adr/).

## Fase A — Foundations

Schema y datos. Sin UI todavía. Verificable corriendo migración y testeando server actions desde `next dev` + un curl o una página de debug.

### 1. Schema + constants: 4 tablas + emociones + defaults

Agregar en `src/db/schema.ts`: `habitos`, `habito_entries`, `habit_config`, `user_settings`. Todas con `user_id text`, índices por user_id, `(habito_id, fecha)` unique en entries, `user_id` unique en singletons. Crear `src/lib/emociones.ts` con las 13 canónicas + orden semántico + helper `parseEmocionValue(v)`. Crear `src/lib/habit-defaults.ts` con los 6 hábitos seed. Generar y aplicar migración Drizzle.

### 2. Server: CRUD de hábitos + configs + entries upsert

Server actions en `src/app/actions.ts` (o un archivo nuevo `habit-actions.ts` si crece): `createHabito`, `updateHabito`, `archiveHabito`, `reorderHabitos`, `getOrCreateHabitConfig`, `updateHabitConfig`, `getOrCreateUserSettings`, `updateUserSettings`, `upsertHabitoEntries` (recibe array `{habito_id, valor?, skipped?}`, valida estado ilegal `(valor=NULL, skipped=false)`, hace upsert por `(habito_id, fecha)`). Todas filtran por `getCurrentUserId()`.

### 3. Server: cálculo de sleepMode + streak

En `src/lib/sleep-mode.ts`: función `computeSleepMode(userId, now)` que devuelve `{ active: boolean, reason: 'cerrado' | 'horario' | null }`. Requiere `count(habitos activos) > 0`. En `src/lib/streak.ts`: función `computeStreak(userId, today)` que devuelve int — cuenta días hacia atrás desde hoy donde TODOS los hábitos activos en ese día tienen entry (valor o skipped). Modificar `getAllData()` en `src/app/page.tsx` para incluir `sleepMode`, `streak`, `habitos`, `habito_entries` de la última semana, `habit_config`, `user_settings` en el payload.

## Fase B — Settings + datos manuales

Pantalla de configuración. Verificable: podés crear hábitos, configurar sleep mode + timezone, y cargar el set de ejemplo.

### 4. /settings: refactor a tabs internas

Reescribir `src/app/settings/page.tsx`: agregar Radix `<Tabs>` con 4 tabs (**Hábitos** default, **Modo A mimir**, **Responsables**, **Cuenta**). Mover el `ResponsablesEditor` actual a la tab Responsables sin cambios funcionales. Crear componentes `<HabitsEditor />`, `<SleepModeConfig />`, `<CuentaSettings />` (timezone select). Para el select de timezone usar `Intl.supportedValuesOf('timeZone')` con default `America/Montevideo`.

### 5. HabitsEditor: lista + add + edit + reorder + "Cargar set de ejemplo"

Componente para la tab Hábitos de /settings. Lista plana de hábitos activos, cada uno editable inline (pregunta, tipo, archivar, eliminar). Reordenar con `@dnd-kit` (patrón ya usado en `SBBucket`). Botón "Agregar hábito" abajo abre un mini-form. Si `count(hábitos) === 0`, mostrar panel destacado arriba con CTA "Cargar set de ejemplo" que llama a un server action que inserta los 6 hábitos de `habit-defaults.ts`. El panel desaparece automáticamente al haber al menos 1 hábito.

## Fase C — Ritual diario

El núcleo del feature. Verificable: podés cerrar el día desde In-flight, la app entra en sleep mode (dark + rename + welcome modal), banner nocturno aparece si corresponde, badge de racha visible.

### 6. Modal Cerrar día: shell + lista + tres modos

`src/components/cerrar-dia-modal.tsx`. Modal fullscreen Radix. Lista vertical de todos los hábitos activos en orden. Copy contextual arriba. Botón "Guardar y dormir" sticky abajo. Props: `mode: 'ritual' | 'edit-hoy' | 'trackear-otro'` + `fecha` + `entriesIniciales`. Pre-carga entries existentes en modo edit/trackear. Al apretar guardar: si hay hábitos sin contestar, abre sub-diálogo "Quedaron N sin contestar" con botones "Volver al cierre" / "Skip por hoy". Cliente arma payload `{habito_id, value | skipped: true}[]` y llama a `upsertHabitoEntries`.

### 7. Inputs por tipo de hábito (5 componentes)

En `src/components/habit-inputs/`: `<TextoInput />`, `<EstrellasInput />` (5 estrellas tappeables), `<Escala1a10Input />` (slider o números), `<SiNoInput />` (toggle), `<EmocionInput />` (select agrupado por valencia/energía con divider, + opción "Otro" que muestra textbox). Cada uno expone `{ value, onChange, onClear }`. El estado "sin contestar" es `value === undefined`. El componente NO conoce skipped — eso es decisión del modal.

### 8. Sleep mode UI: dark theme + tab rename + welcome modal + banner

En `AppShell`: cuando `sleepMode.active === true`, aplicar tema dark (override de Tailwind via clase root). Renombrar tab "In-flight" a "A mimir" con ícono luna. Modal de bienvenida en cold open / `visibilitychange → visible`: dispara solo una vez por sesión + foreground (usar `sessionStorage` flag). Copy: _"Cerraste el día. Andá a dormir, no seas bobo. Es más productivo dormir bien y hacer eso mañana."_ + botón "OK, ya voy". No bloquea. Si `sleepMode.reason === 'horario'` (no hay entries de hoy), banner persistente arriba de la tab con copy _"No trackeaste tus hábitos hoy..."_ + botón "Trackear ahora" que abre el modal.

### 9. Botón "Cerrar día" en In-flight + badge de racha

Agregar botón abajo del listado de In-flight (oculto si `count(hábitos activos) === 0`). Color neutro de día, color destacado (ámbar/violeta) cuando entró el horario de sleep mode y no hay entries de hoy. Badge chico al lado con la racha actual (ej. `🔥 7`). Al tap, abre el modal en modo `ritual` (si no hay entries de hoy) o `edit-hoy` (si ya hay).

## Fase D — Journal review + cierre semanal

Tab nueva, backfill, animaciones, métricas en cierre de semana. Verificable: tab Habits muestra historial, podés trackear cualquier día desde el calendario, animación post-cierre funciona, cierre de semana incluye stats de hábitos.

### 10. Tab Habits: cards por día agrupados por semana + streak banner

Nueva tab en `AppShell`. Banner full-width arriba con la racha actual (copy + número grande). Cards por día agrupados por semana (header `Semana del DD–DD mes YYYY · N días trackeados`). Header de card: fecha + status compacto (`5/5 cerrado · 1 skipped` / `3/5 sin cerrar` / `Sin entries`). Body colapsable: muestra cada hábito read-only + botón "Editar este día" abajo que abre modal en modo `edit-hoy`. Carga inicial: últimas 8 semanas, botón "Ver más" abajo. Empty state si no hay hábitos configurados: mensaje + link a /settings.

### 11. "Trackear hábito": botón + calendario + reuso del modal

Botón arriba de la tab Habits (al lado del streak banner o abajo). Abre un calendario (mes actual + navegación a meses anteriores). Cada día: pintado sólido si tiene al menos una entry, blanco si no tiene ninguna. Tap día → abre el modal de Cerrar día en modo `trackear-otro` con `fecha=ese día` y `entriesIniciales` pre-cargadas si existen. Al guardar: **NO** activa sleep mode, **NO** animación post-cierre, solo cierra modal + refresh + toast.

### 12. Animación post-cierre del ritual nocturno

Solo en modo `ritual` del modal. Al guardar:

1. Sleep mode optimístico (dark + rename) inmediato.
2. Cierra modal.
3. Navega a tab Habits (router.push o cambio de tab).
4. Freeza interacción (overlay con `pointer-events: none` en el shell).
5. Espera ~1s.
6. La card del día aparece con animación de "push" (CSS transform/keyframes: scale + slide-in desde arriba empujando el resto hacia abajo) + halo verde (box-shadow animado).
7. Espera ~2s.
8. Navega a tab "A mimir".
9. Toast `Buenas noches. A mimir.`.

Implementar con Framer Motion o CSS keyframes — decidir según peso. Si el usuario navega manualmente durante la animación, abortar gracefully.

### 13. CerrarSemanaDialog: sub-sección de stats de hábitos

Agregar al modal existente, abajo de las stats de tareas. Server: extender `getCerrarSemanaPreview()` para incluir `habitMetrics: HabitWeekMetric[]` (por hábito activo con entries en la semana: avg, count, top emociones, textos, delta vs semana anterior). UI: componentes `<HeatmapSiNo />`, `<EstrellasPromedio />` (5 estrellas con relleno parcial), `<NumeroEscalaPromedio />`, `<TopEmociones />` (top 3 con counts), `<TextosColapsables />`. Reglas: skipped/sin-entry no entran en promedios; delta solo si ambas semanas tienen al menos 1 entry.

## Cierre

### 14. QA final: empty states + mobile + copy

Pasada final de QA en Chrome (la app no tiene preview server — ver `~/.claude/projects/-Applications-workspace-second-brain/memory/feedback_no_preview.md`). Verificar:

- Empty state de tab Habits sin hábitos.
- Botón Cerrar día oculto sin hábitos.
- Sleep mode no activa sin hábitos.
- Modal de bienvenida solo en cold open.
- Banner "no trackeaste" coexiste sin solapar con banner rojo de In-flight.
- Modal en mobile (375px) no rebalsa; sticky button "Guardar y dormir" funciona.
- D&D de hábitos en /settings.
- Cierre de semana con y sin hábitos.
- Convención de copy: voseo solo en motivacionales (_"Cerraste el día..."_, _"Andá a dormir..."_), neutro en el resto.

---

## Cómo arrancar en una sesión nueva

Para contextualizar un agente nuevo, pasale este prompt:

> Vamos a implementar el feature de habit tracking. Leé en este orden:
>
> 1. `spec-habits.md` — qué construir.
> 2. `CONTEXT.md` — glosario del dominio.
> 3. `docs/adr/0001-streak-reactivo-puro.md` — decisión no obvia sobre cálculo de racha.
> 4. `docs/habits-implementation-plan.md` — plan de 14 tareas en 4 fases.
> 5. `spec.md` (raíz del repo) — contexto general de la app.
>
> Arrancamos por la Fase A, tarea 1. Cuando termines cada tarea, pará y mostrame qué hiciste antes de pasar a la siguiente.
