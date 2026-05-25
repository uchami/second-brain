import type { HabitoTipo } from "@/db/schema";

// Set de ejemplo que se ofrece a usuarios con count(hábitos) === 0 desde
// /settings → Hábitos. Cubre los 5 tipos de respuesta más una segunda si_no.
// Ver spec-habits.md "Set de ejemplo desde /settings".

export type HabitDefault = {
  pregunta: string;
  tipo: HabitoTipo;
};

export const HABIT_DEFAULTS: HabitDefault[] = [
  { pregunta: "¿Cómo te sentiste hoy?", tipo: "emocion" },
  { pregunta: "¿Cómo dormiste anoche?", tipo: "escala_1_10" },
  { pregunta: "Moviste el cuerpo hoy?", tipo: "si_no" },
  { pregunta: "¿Comiste bien hoy?", tipo: "estrellas" },
  { pregunta: "¿Hiciste algo que te haga sentir orgulloso?", tipo: "si_no" },
  { pregunta: "Reflexión libre del día", tipo: "texto" },
];
