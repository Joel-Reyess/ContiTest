// Nomenclatura SAP compartida entre calendarios (Calendar semanal/diario, Roles Semanales,
// vista por empleado). Fuente única de verdad para código-color-etiqueta.

export type SAPCodigo =
    | '1' | '2' | '3' | 'D' | 'CD'
    | 'V' | 'P' | 'E' | 'A' | 'M' | 'G' | 'R' | 'S' | 'O' | 'H' | 'F' | 'C' | 'T';

export interface SAPEntry {
    codigo: SAPCodigo;
    label: string;
    bg: string;      // color de fondo (hex)
    fg: string;      // color de texto (hex)
    chipBg: string;  // clase tailwind para chips
    chipFg: string;
    grupo: 'turno' | 'descanso' | 'vacacion' | 'permiso' | 'incapacidad' | 'otro';
}

export const SAP_NOMENCLATURA: Record<SAPCodigo, SAPEntry> = {
    '1': { codigo: '1', label: 'Turno 1', bg: '#d1fae5', fg: '#065f46', chipBg: 'bg-emerald-100', chipFg: 'text-emerald-700', grupo: 'turno' },
    '2': { codigo: '2', label: 'Turno 2', bg: '#fef3c7', fg: '#92400e', chipBg: 'bg-yellow-100', chipFg: 'text-yellow-700', grupo: 'turno' },
    '3': { codigo: '3', label: 'Turno 3', bg: '#dbeafe', fg: '#1e40af', chipBg: 'bg-blue-100', chipFg: 'text-blue-700', grupo: 'turno' },
    'D': { codigo: 'D', label: 'Descanso', bg: '#f3f4f6', fg: '#374151', chipBg: 'bg-gray-100', chipFg: 'text-gray-700', grupo: 'descanso' },
    'CD': { codigo: 'CD', label: 'Cubre descansos', bg: '#e0e7ff', fg: '#3730a3', chipBg: 'bg-indigo-100', chipFg: 'text-indigo-700', grupo: 'descanso' },
    'V': { codigo: 'V', label: 'Vacaciones', bg: '#f3e8ff', fg: '#6b21a8', chipBg: 'bg-purple-100', chipFg: 'text-purple-700', grupo: 'vacacion' },
    'P': { codigo: 'P', label: 'Permiso con goce', bg: '#dcfce7', fg: '#15803d', chipBg: 'bg-green-100', chipFg: 'text-green-700', grupo: 'permiso' },
    'G': { codigo: 'G', label: 'Permiso sin goce', bg: '#fef3c7', fg: '#92400e', chipBg: 'bg-amber-100', chipFg: 'text-amber-700', grupo: 'permiso' },
    'H': { codigo: 'H', label: 'Permiso sin goce alterno', bg: '#e0e7ff', fg: '#3730a3', chipBg: 'bg-indigo-100', chipFg: 'text-indigo-700', grupo: 'permiso' },
    'O': { codigo: 'O', label: 'Permiso por paternidad', bg: '#cffafe', fg: '#155e75', chipBg: 'bg-cyan-100', chipFg: 'text-cyan-700', grupo: 'permiso' },
    'E': { codigo: 'E', label: 'Incapacidad por enfermedad', bg: '#fee2e2', fg: '#b91c1c', chipBg: 'bg-red-100', chipFg: 'text-red-700', grupo: 'incapacidad' },
    'A': { codigo: 'A', label: 'Incapacidad por accidente', bg: '#ffedd5', fg: '#c2410c', chipBg: 'bg-orange-100', chipFg: 'text-orange-700', grupo: 'incapacidad' },
    'M': { codigo: 'M', label: 'Incapacidad por maternidad', bg: '#fce7f3', fg: '#be185d', chipBg: 'bg-pink-100', chipFg: 'text-pink-700', grupo: 'incapacidad' },
    'R': { codigo: 'R', label: 'Incapacidad por riesgo', bg: '#ffe4e6', fg: '#9f1239', chipBg: 'bg-rose-100', chipFg: 'text-rose-700', grupo: 'incapacidad' },
    'S': { codigo: 'S', label: 'Suspensión', bg: '#f1f5f9', fg: '#334155', chipBg: 'bg-slate-100', chipFg: 'text-slate-700', grupo: 'otro' },
    'F': { codigo: 'F', label: 'Festivo trabajado', bg: '#ccfbf1', fg: '#0f766e', chipBg: 'bg-teal-100', chipFg: 'text-teal-700', grupo: 'otro' },
    'C': { codigo: 'C', label: 'Día empresa reprogramado', bg: '#fef3c7', fg: '#92400e', chipBg: 'bg-amber-100', chipFg: 'text-amber-800', grupo: 'otro' },
    'T': { codigo: 'T', label: 'Fuera de tiempo', bg: '#e5e7eb', fg: '#374151', chipBg: 'bg-slate-100', chipFg: 'text-slate-600', grupo: 'otro' },
};

// Convierte un tipoIncidencia arbitrario (letra corta o texto largo) a un SAPCodigo.
// Retorna null si no matchea nada.
export const codigoFromTipoIncidencia = (tipoIncidencia?: string | null): SAPCodigo | null => {
    if (!tipoIncidencia) return null;
    const t = tipoIncidencia.trim();
    // Match directo por código corto (1, 2, 3, V, P, E, A, M, CD, ...)
    const upper = t.toUpperCase();
    if (upper in SAP_NOMENCLATURA) return upper as SAPCodigo;

    // Match por texto largo — orden importa (más específico primero).
    const lower = t.toLowerCase();
    if (lower.includes('maternidad')) return 'M';
    if (lower.includes('paternidad')) return 'O';
    if (lower.includes('riesgo')) return 'R';
    if (lower.includes('accidente')) return 'A';
    if (lower.includes('enfermedad')) return 'E';
    if (lower.includes('incapacidad')) return 'E';
    if (lower.includes('suspensi')) return 'S';
    if (lower.includes('festivo')) return 'F';
    if (lower.includes('defunci') || lower.includes('con goce')) return 'P';
    if (lower.includes('paternidad')) return 'O';
    if (lower.includes('sin goce')) return 'G';
    if (lower.includes('reprog')) return 'C';
    if (lower.includes('vacacion')) return 'V';
    return null;
};

export const getSAPEntry = (codigo?: string | null): SAPEntry | null => {
    const c = codigoFromTipoIncidencia(codigo);
    return c ? SAP_NOMENCLATURA[c] : null;
};

// Grupos ordenados para renderizar la leyenda.
export const NOMENCLATURA_LEGEND_GROUPS: { titulo: string; codigos: SAPCodigo[] }[] = [
    { titulo: 'Turnos', codigos: ['1', '2', '3', 'D', 'CD'] },
    { titulo: 'Vacaciones y festivos', codigos: ['V', 'F', 'C'] },
    { titulo: 'Permisos', codigos: ['P', 'G', 'H', 'O'] },
    { titulo: 'Incapacidades', codigos: ['E', 'A', 'M', 'R'] },
    { titulo: 'Otros', codigos: ['S', 'T'] },
];
