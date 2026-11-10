import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarOff } from "lucide-react";
import { reglasDomingoService, type ReglaDomingo } from "@/services/reglasDomingoService";
import { esNoLaborable, isoLocal } from "@/utils/reglasDomingo";

/**
 * Aviso arriba del calendario de selección: en qué periodos los domingos (o
 * sábados) no son laborables para la unidad organizativa del empleado, y qué
 * domingos dentro de esos periodos quedaron "en base a rol" (se trabaja según el
 * rol). Los no laborables se ven rayados en el calendario y no se pueden elegir.
 */
export const AvisoDomingosNoLaborables = ({ empleadoId, anio }: { empleadoId?: number; anio?: number | null }) => {
    const [reglas, setReglas] = useState<ReglaDomingo[]>([]);

    useEffect(() => {
        if (!empleadoId || !anio) {
            setReglas([]);
            return;
        }
        let vigente = true;
        reglasDomingoService
            .delEmpleado(empleadoId, anio)
            .then((r) => vigente && setReglas(r))
            .catch(() => vigente && setReglas([]));
        return () => {
            vigente = false;
        };
    }, [empleadoId, anio]);

    // Cada periodo sin domingos con los fines de semana que otra regla (más
    // corta) dejó en base a rol. Los que ya no tienen ningún día no laborable no
    // se muestran.
    const periodos = useMemo(() => {
        return reglas
            .filter((r) => r.activa && r.tipo === "SinDomingo")
            .sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio))
            .map((r) => {
                const conRol: string[] = [];
                let alguno = false;
                const fin = parseISO(r.fechaFin.slice(0, 10));
                for (let d = parseISO(r.fechaInicio.slice(0, 10)); d <= fin; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
                    const dow = d.getDay();
                    if (dow !== 0 && !(dow === 6 && r.incluyeSabado)) continue;
                    if (esNoLaborable(reglas, d)) alguno = true;
                    else conRol.push(isoLocal(d));
                }
                return { r, conRol, alguno };
            })
            .filter((p) => p.alguno);
    }, [reglas]);

    if (periodos.length === 0) return null;
    const fecha = (iso: string) => format(parseISO(iso.slice(0, 10)), "d 'de' MMMM", { locale: es });
    const fechaCorta = (iso: string) => format(parseISO(iso.slice(0, 10)), "EEE d MMM", { locale: es });

    return (
        <div className="mx-2 mb-3 flex items-start gap-2 rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-800">
            <CalendarOff className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
                <p className="font-medium">Días no laborables para tu unidad organizativa en {anio}</p>
                <ul className="mt-0.5">
                    {periodos.map(({ r, conRol }) => (
                        <li key={r.id}>
                            {r.fechaInicio.slice(0, 10) === r.fechaFin.slice(0, 10)
                                ? `El ${fecha(r.fechaInicio)}`
                                : `Del ${fecha(r.fechaInicio)} al ${fecha(r.fechaFin)}`}
                            : {r.incluyeSabado ? "sábados y domingos" : "domingos"}
                            {conRol.length > 0 && (
                                <span className="text-slate-600"> (excepto {conRol.map(fechaCorta).join(", ")}: en base a tu rol)</span>
                            )}
                            .
                        </li>
                    ))}
                </ul>
                <p className="text-xs text-slate-600 mt-0.5">
                    Se ven rayados en el calendario: esos días no se programan vacaciones ni días por la empresa.
                </p>
            </div>
        </div>
    );
};
