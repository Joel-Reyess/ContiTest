/**
 * Los bloques de captura corren en HORA DE MÉXICO.
 *
 * El backend guarda FechaHoraInicio/FechaHoraFin como DateTime sin zona y los
 * compara contra DateTime.Now del servidor, que está en México. O sea: la
 * ventana de un bloque es un instante único e igual para todo el mundo, y está
 * escrita en hora de pared de México ("2026-09-22T09:00:00" = las 9 de la
 * mañana en Monterrey).
 *
 * El navegador no sabe eso. new Date("2026-09-22T09:00:00") —sin Z ni offset—
 * se interpreta como hora LOCAL de quien abre la app:
 *
 *   - En México coincide con lo que quiso decir el backend, así que todo
 *     funcionaba de casualidad.
 *   - En Porto (UTC+1 en verano) el navegador entiende "las 9 de Porto", que
 *     en realidad son las 2 de la madrugada en México. La app daba por abierto
 *     el bloque 7 horas antes de tiempo y por cerrado 7 horas antes también,
 *     y el reloj de "tiempo restante" contaba hacia el instante equivocado.
 *     Peor: la vista de turnos le mandaba al backend SU hora de pared, así
 *     que el servidor buscaba el bloque vigente a una hora que no era.
 *
 * Aquí se traduce en los dos sentidos. Nadie "cambia de horario": el operador
 * de Porto captura en la misma ventana que sus compañeros de Monterrey, sólo
 * que en su reloj eso cae a otra hora, y la app se lo dice.
 *
 * Para FECHAS sin hora (vacaciones, calendario) no se usa esto sino
 * fechaLocalISO de utils/fechaLocal: ahí el backend trabaja con DateOnly y lo
 * que importa es el día, no el instante.
 */

export const TZ_MEXICO = 'America/Mexico_City';

const PARTES: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
};

const partesEnZona = (instante: Date, zona: string): Record<string, string> => {
    const partes: Record<string, string> = {};
    for (const p of new Intl.DateTimeFormat('en-US', { ...PARTES, timeZone: zona }).formatToParts(instante)) {
        partes[p.type] = p.value;
    }
    return partes;
};

/** Milisegundos que la zona va por delante de UTC en ese instante concreto. */
const desfaseDeZona = (instante: Date, zona: string): number => {
    const p = partesEnZona(instante, zona);
    const comoSiFueraUTC = Date.UTC(
        Number(p.year),
        Number(p.month) - 1,
        Number(p.day),
        Number(p.hour) % 24,
        Number(p.minute),
        Number(p.second),
    );
    return comoSiFueraUTC - instante.getTime();
};

const TRAE_ZONA = /(?:[Zz]|[+-]\d{2}:?\d{2})$/;

/**
 * Convierte una fecha/hora de pared de México —como la manda el backend— en el
 * instante real al que corresponde. Es lo único con lo que se puede comparar
 * contra new Date() sin equivocarse de zona.
 *
 * Si la cadena ya trae zona explícita (Z u offset) se respeta tal cual: ahí el
 * backend sí dijo de qué instante habla.
 */
export const instanteDeHoraMexico = (fechaHora: string | Date | null | undefined): Date => {
    if (fechaHora instanceof Date) return fechaHora;
    if (!fechaHora) return new Date(NaN);

    const texto = fechaHora.trim();
    if (TRAE_ZONA.test(texto)) return new Date(texto);

    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(texto);
    if (!m) return new Date(texto);

    const comoSiFueraUTC = Date.UTC(
        Number(m[1]),
        Number(m[2]) - 1,
        Number(m[3]),
        Number(m[4] ?? 0),
        Number(m[5] ?? 0),
        Number(m[6] ?? 0),
    );

    // Dos pasadas: la primera estima el desfase con el instante aproximado, la
    // segunda lo corrige si esa estimación cayó del otro lado de un cambio de
    // horario. México ya no tiene horario de verano, pero esto lo deja bien
    // aunque vuelva o aunque se cambie TZ_MEXICO.
    const primera = comoSiFueraUTC - desfaseDeZona(new Date(comoSiFueraUTC), TZ_MEXICO);
    const segunda = comoSiFueraUTC - desfaseDeZona(new Date(primera), TZ_MEXICO);
    return new Date(segunda);
};

/**
 * La hora de pared de México AHORA, en el formato que espera el backend
 * ("YYYY-MM-DDTHH:mm:ss"). Es lo que hay que mandar cuando se le pregunta al
 * servidor "qué bloque está corriendo en este momento": si se le manda la hora
 * del navegador, desde fuera de México contesta por el bloque equivocado.
 */
export const ahoraEnMexicoISO = (): string => {
    const p = partesEnZona(new Date(), TZ_MEXICO);
    const hora = p.hour === '24' ? '00' : p.hour;
    return `${p.year}-${p.month}-${p.day}T${hora}:${p.minute}:${p.second}`;
};

/** Formatea en hora de México, venga de donde venga quien está mirando. */
export const formatoMexico = (
    fechaHora: string | Date | null | undefined,
    opciones: Intl.DateTimeFormatOptions,
): string => {
    const instante = instanteDeHoraMexico(fechaHora);
    if (Number.isNaN(instante.getTime())) return '—';
    return instante.toLocaleString('es-MX', { timeZone: TZ_MEXICO, ...opciones });
};

/** "22/9/2026", en hora de México. */
export const fechaMexico = (fechaHora: string | Date | null | undefined): string =>
    formatoMexico(fechaHora, { day: 'numeric', month: 'numeric', year: 'numeric' });

/** "22 sep", en hora de México. */
export const fechaCortaMexico = (fechaHora: string | Date | null | undefined): string =>
    formatoMexico(fechaHora, { day: '2-digit', month: 'short' });

/** "09:00", en hora de México. */
export const horaMexico = (fechaHora: string | Date | null | undefined): string =>
    formatoMexico(fechaHora, { hour: '2-digit', minute: '2-digit', hour12: false });

/** true si el navegador NO está a la misma hora que México. */
export const navegadorFueraDeMexico = (): boolean => {
    const ahora = new Date();
    return desfaseDeZona(ahora, TZ_MEXICO) !== -ahora.getTimezoneOffset() * 60000;
};

/**
 * El mismo instante, escrito en el reloj de quien está mirando. Sirve para
 * decirle al de Porto "tu bloque abre a las 09:00 de México — las 16:00 en tu
 * hora" en vez de dejarlo adivinando.
 */
export const enHoraDelNavegador = (fechaHora: string | Date | null | undefined): string => {
    const instante = instanteDeHoraMexico(fechaHora);
    if (Number.isNaN(instante.getTime())) return '—';
    return instante.toLocaleString('es-MX', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
};
