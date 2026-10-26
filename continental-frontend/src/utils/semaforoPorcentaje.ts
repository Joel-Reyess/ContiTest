/** Límite que se usa cuando la fila no trae el suyo (el general de siempre). */
export const LIMITE_POR_OMISION = 4.5

/**
 * Color del % de una solicitud contra el límite que rige ESE día para su grupo
 * (general, del año en preparación, capacidad por periodo o excepción). Rojo si
 * lo pasa, amarillo desde dos tercios del límite (con 4.5% queda en 3%, como
 * antes de que el límite pudiera cambiar por periodo).
 */
export function clasePorcentaje(pct: number, limite?: number | null): string {
    const max = limite && limite > 0 ? limite : LIMITE_POR_OMISION
    if (pct > max) return 'text-red-600 font-bold'
    if (pct > (max * 2) / 3) return 'text-yellow-600 font-semibold'
    return 'text-gray-900 font-semibold'
}
