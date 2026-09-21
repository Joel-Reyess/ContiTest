/**
 * YYYY-MM-DD con la fecha LOCAL de quien está usando la app.
 *
 * NO usar toISOString() para esto. toISOString convierte a UTC, y el día
 * cambia según la zona horaria de la computadora:
 *
 *   - En México (UTC-6) la medianoche local son las 06:00 UTC del MISMO día,
 *     así que toISOString acierta por casualidad.
 *   - Al este de Greenwich (UTC+), la medianoche local cae en el día ANTERIOR
 *     y toISOString devuelve un día menos.
 *
 * El backend trabaja con fechas locales (DateOnly, sin zona horaria), así que
 * todo lo que viaje al servidor o se compare contra lo que el servidor manda
 * tiene que armarse con los getters locales, como aquí.
 */
export const fechaLocalISO = (d: Date): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
