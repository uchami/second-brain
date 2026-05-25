# Glosario — Second brain

Términos del dominio. Solo lo que tiene un significado preciso y compartido. Implementación vive en el código y en los specs (`spec.md`, `spec-habits.md`).

## Tareas

- **Tarea** — unidad de trabajo. Tabla `tasks`. Tiene `bucket`, `estado`, `eta`, etc.
- **In-flight** — set de hasta 6 tareas activas "en vuelo". Bool `in_flight` en `tasks`.
- **Bucket** — prioridad entera. `null` = "Sin definir". `0` = "Importante". Ver `bucketLabel()`.
- **Lograda** — tarea `done` que ya pasó por un cierre de semana (`closed_week_at != null`). Read-only.
- **Cierre de semana** — ritual que archiva las done de la semana y resetea las activas a `bucket=null`. Snapshot en `cierres_semana`.

## Hábitos (subspec, sin código todavía)

- **Hábito** — pregunta diaria configurable que el usuario contesta al cerrar el día. Solo frecuencia diaria en v1; la planificación semanal sigue viviendo fuera de la app (Excel personal del usuario).
- **Entry** / **Registro** — respuesta a un hábito en una fecha. Único por `(habito_id, fecha)`.
- **Skipped** — entry donde el usuario decidió explícitamente "hoy no trackeo esto". Distinto de "no contestado todavía".
- **Cerrar día** — ritual nocturno. Modal fullscreen lanzado desde la tab In-flight. Al guardar, activa sleep mode y dispara la animación de transición a la tab Habits y luego a "A mimir".
- **Tab Habits** — pantalla de revisión y edición del Journal. Cards por día (agrupados por semana). Es la fuente de verdad para ver/editar lo que registraste. **No** reemplaza al modal de Cerrar día: tocar el card de hoy abre el mismo modal.
- **Trackear hábito** — entry-point desde la tab Habits para registrar/editar **cualquier día**. Abre un calendario donde los días con entries están pintados y los vacíos están blancos. Reusa el modal de Cerrar día pero **sin** activar sleep mode ni animación.
- **Racha / streak** — días consecutivos donde el ritual se completó (todos los hábitos activos tienen entry con valor o skipped). Cálculo **reactivo puro** sobre la DB: backfill restaura, edit puede romper retroactivamente.
- **Sleep mode** — estado server-derivado de la app cuando el día ya se cerró o entró en horario nocturno. Tema dark, tab renombrada, modal de bienvenida. Defensivo, no bloqueante. **Nombre interno**: `sleepMode` en código, `sleep_mode_*` en columnas de config. **Nombre visible al usuario**: "A mimir" (voz interna del producto, voseo intencional).
- **Journal** — conjunto de entries del usuario a lo largo del tiempo. No es una tabla — es la lectura agregada de `habito_entries`. Reemplaza el cuaderno de papel que Uri usaba.
- **Planificación semanal** — proceso que Uri hace en Excel **fuera de la app**. Se alimenta del Journal. La app no la implementa en v1.
- **Cierre de semana (con hábitos)** — el mismo modal `CerrarSemanaDialog` actual + sub-sección nueva con métricas del Journal/hábitos abajo. No se convierte en pantalla full-screen ni cambia el flujo. No incluye reflexión escrita ni compromisos en v1.

## Configuración por usuario

- **`user_settings`** — singleton per user. Config a nivel "del usuario" (afecta toda la app). Hoy guarda `timezone`. Se crea on-demand al primer acceso del usuario autenticado.
- **`habit_config`** — singleton per user. Config a nivel "de hábitos" (afecta solo el feature de Journal). Hoy guarda `sleep_mode_inicio`, `sleep_mode_fin`, `sleep_mode_auto`, `smart_sleep`. Separado de `user_settings` aunque ambos sean singleton per user, porque conceptualmente son distintos y crecen distinto.
- **Timezone fija**: `user_settings.timezone` es la fuente de verdad. La app no infiere timezone del navegador. Si el usuario viaja, cambia el setting manualmente desde `/settings`.

## Multi-tenant

- **Usuario** — cuenta WorkOS. Todo en DB lleva `user_id text`. No hay sharing, no hay roles. `LEGACY_USER_ID = "legacy-owner"` marca rows pre-WorkOS.
