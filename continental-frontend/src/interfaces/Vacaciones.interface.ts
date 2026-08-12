export interface VacacionesConfig {
  id: number;
  porcentajeAusenciaMaximo: number; // Ej: 4.5
  periodoActual: 'ProgramacionAnual' | 'Reprogramacion' | 'Cerrado';
  anioVigente: number;
  /** Año cuya programación anual se está PREPARANDO mientras anioVigente sigue
   *  operando (coexistencia). null/undefined = sin preparación en curso. */
  anioProgramacionAnual?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface VacacionesConfigUpdateRequest {
  porcentajeAusenciaMaximo: number;
  periodoActual: 'ProgramacionAnual' | 'Reprogramacion' | 'Cerrado';
  anioVigente: number;
  /** OJO: el backend persiste siempre este campo; si no quieres cambiarlo,
   *  reenvía el valor actual de la config (omitirlo equivale a borrarlo). */
  anioProgramacionAnual?: number | null;
}
