import type { ReglaDomingo } from "@/services/reglasDomingoService";

/**
 * Qué regla dominical manda en un día, igual que CalendarioLaboralService en el
 * backend (nov-2026): la de periodo más corto (un domingo suelto manda sobre un
 * periodo largo); si duran lo mismo, la del grupo antes que la del área; si aun
 * así empatan, la más reciente. Recibe solo reglas que ya aplican a la unidad o
 * grupo que se está viendo.
 */

const dia = (iso: string) => iso.slice(0, 10);
const duracion = (r: ReglaDomingo) =>
    Math.round((Date.parse(`${dia(r.fechaFin)}T00:00:00Z`) - Date.parse(`${dia(r.fechaInicio)}T00:00:00Z`)) / 86400000);

export const isoLocal = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function reglaQueManda(reglas: ReglaDomingo[], iso: string): ReglaDomingo | undefined {
    return reglas
        .filter((r) => r.activa && dia(r.fechaInicio) <= iso && iso <= dia(r.fechaFin))
        .sort(
            (a, b) =>
                duracion(a) - duracion(b) ||
                (b.grupoId ? 1 : 0) - (a.grupoId ? 1 : 0) ||
                b.fechaCreacion.localeCompare(a.fechaCreacion) ||
                b.id - a.id
        )[0];
}

/** El día queda no laborable (NL) por una regla dominical. */
export function esNoLaborable(reglas: ReglaDomingo[], fecha: Date): boolean {
    const dow = fecha.getDay();
    if (dow !== 0 && dow !== 6) return false;
    const r = reglaQueManda(reglas, isoLocal(fecha));
    return !!r && r.tipo === "SinDomingo" && (dow === 0 || r.incluyeSabado);
}

/** Sábados y domingos no laborables de un año (yyyy-MM-dd). */
export function noLaborablesDelAnio(reglas: ReglaDomingo[], anio: number): Set<string> {
    const dias = new Set<string>();
    if (reglas.length === 0) return dias;
    for (let d = new Date(anio, 0, 1); d.getFullYear() === anio; d.setDate(d.getDate() + 1)) {
        if (esNoLaborable(reglas, d)) dias.add(isoLocal(d));
    }
    return dias;
}
