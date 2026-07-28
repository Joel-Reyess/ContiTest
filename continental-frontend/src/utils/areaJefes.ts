// Un área puede tener varios jefes. La fuente de verdad es la tabla AreaJefes,
// que el backend expone como `jefes[]`; `jefeId`/`jefeSuplenteId` son las dos
// columnas legacy y solo alcanzan para los dos primeros.
//
// Filtrar únicamente por las columnas legacy dejaba invisible a cualquier jefe
// adicional: entraba a su dashboard pero no veía calendario, plantilla ni roles
// semanales de esa área.
export function esJefeDelArea(area: any, userId?: number | null): boolean {
    if (!area || userId == null) return false;

    const enAreaJefes = Array.isArray(area.jefes) &&
        area.jefes.some((j: any) => (j?.id ?? j?.userId) === userId);

    // Legacy: se conserva por si el área todavía no tiene filas en AreaJefes.
    const enLegacy = area.jefeId === userId ||
        area.jefeSuplenteId === userId ||
        area.jefe?.id === userId ||
        area.jefeSuplente?.id === userId;

    return enAreaJefes || enLegacy;
}
