import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarOff } from "lucide-react";
import { reglasDomingoService, type ReglaDomingo } from "@/services/reglasDomingoService";

/**
 * Aviso arriba del calendario de selección: en qué periodos los domingos (o
 * sábados) no son laborables para la unidad organizativa del empleado. Esos
 * días se ven rayados en el calendario y no se pueden elegir.
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
            .then((r) => vigente && setReglas(r.filter((x) => x.tipo === "SinDomingo")))
            .catch(() => vigente && setReglas([]));
        return () => {
            vigente = false;
        };
    }, [empleadoId, anio]);

    if (reglas.length === 0) return null;
    const fecha = (iso: string) => format(parseISO(iso.slice(0, 10)), "d 'de' MMMM", { locale: es });

    return (
        <div className="mx-2 mb-3 flex items-start gap-2 rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-800">
            <CalendarOff className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
                <p className="font-medium">Días no laborables para tu unidad organizativa en {anio}</p>
                <ul className="mt-0.5">
                    {reglas.map((r) => (
                        <li key={r.id}>
                            Del {fecha(r.fechaInicio)} al {fecha(r.fechaFin)}: {r.incluyeSabado ? "sábados y domingos" : "domingos"}.
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
