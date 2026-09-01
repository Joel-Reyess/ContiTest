import { useEffect, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Clock, CalendarClock, CheckCircle2, AlertCircle } from "lucide-react";
import { BloquesReservacionService } from "@/services/bloquesReservacionService";
import type { BloqueReservacion, EmpleadoBloque } from "@/interfaces/Api.interface";

/**
 * Cuándo le toca capturar a este operador, siempre visible.
 *
 * La información existía —el backend la usa para rechazar la captura con
 * "Todavía no es tu turno: tu bloque inicia el 02/09/2026 a las 09:00"— pero
 * solo se pintaba en la pantalla de validación del login, que se cierra sola a
 * los diez segundos. Adentro de la app no había ningún lugar donde consultarla,
 * así que el operador se enteraba de su horario únicamente al chocar con el
 * error. Aquí se muestra desde que abre la pantalla.
 *
 * Las tres reglas son las mismas del backend (ValidarTurnoDeCapturaAsync):
 * el bloque tiene que haber abierto, no haber cerrado, y dentro del bloque
 * manda la antigüedad. 'Saltado' no bloquea: para eso lo salta el jefe.
 */

interface Props {
    empleadoId: number;
    anio: number | null;
}

const fechaLarga = (iso: string) => format(new Date(iso), "EEEE d 'de' MMMM 'de' yyyy", { locale: es });
const hora = (iso: string) => format(new Date(iso), "HH:mm", { locale: es });

const faltanteLegible = (desde: Date, hasta: Date): string => {
    const minutos = Math.max(0, Math.round((hasta.getTime() - desde.getTime()) / 60000));
    const dias = Math.floor(minutos / 1440);
    const horas = Math.floor((minutos % 1440) / 60);
    if (dias > 0) return `${dias} día${dias === 1 ? "" : "s"}${horas > 0 ? ` y ${horas} h` : ""}`;
    if (horas > 0) return `${horas} h ${minutos % 60} min`;
    return `${minutos} min`;
};

const compañerosPendientes = (bloque: BloqueReservacion, empleadoId: number): EmpleadoBloque[] => {
    const ordenados = [...(bloque.empleadosAsignados ?? [])].sort((a, b) => {
        const ingresoA = new Date(a.fechaIngreso).getTime();
        const ingresoB = new Date(b.fechaIngreso).getTime();
        if (ingresoA === ingresoB) return parseInt(a.nomina) - parseInt(b.nomina);
        return ingresoA - ingresoB;
    });
    const miPosicion = ordenados.findIndex((e) => e.empleadoId === empleadoId);
    if (miPosicion <= 0) return [];
    return ordenados
        .slice(0, miPosicion)
        .filter((e) => e.estado !== "Reservado" && e.estado !== "Completado" && e.estado !== "Saltado");
};

export const MiTurnoBanner = ({ empleadoId, anio }: Props) => {
    const [bloque, setBloque] = useState<BloqueReservacion | null>(null);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!anio) return;
        let vigente = true;
        setCargando(true);
        BloquesReservacionService.obtenerBloquesPorEmpleado(empleadoId, anio)
            .then((r) => {
                if (!vigente) return;
                setBloque(r.bloques?.[0] ?? null);
                setError(null);
            })
            .catch((e: unknown) => {
                if (!vigente) return;
                setError(e instanceof Error ? e.message : "No se pudo consultar tu turno");
            })
            .finally(() => vigente && setCargando(false));
        return () => {
            vigente = false;
        };
    }, [empleadoId, anio]);

    if (!anio || cargando) return null;

    if (error || !bloque) {
        return (
            <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div className="text-sm text-amber-900">
                    <p className="font-medium">No pudimos leer los datos de tu turno.</p>
                    <p>Consúltalo con tu jefe de área o con el comité sindical.</p>
                </div>
            </div>
        );
    }

    const ahora = new Date();
    const inicio = new Date(bloque.fechaHoraInicio);
    const fin = new Date(bloque.fechaHoraFin);
    const pendientes = compañerosPendientes(bloque, empleadoId);

    let tono: string;
    let icono: React.ReactNode;
    let titulo: string;
    let detalle: string | null = null;

    if (ahora < inicio) {
        tono = "border-blue-300 bg-blue-50 text-blue-900";
        icono = <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />;
        titulo = "Todavía no es tu turno";
        detalle = `Faltan ${faltanteLegible(ahora, inicio)}.`;
    } else if (ahora > fin) {
        tono = "border-red-300 bg-red-50 text-red-900";
        icono = <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />;
        titulo = "Tu turno ya terminó";
        detalle = "Pide a tu jefe de área que te reasigne un turno.";
    } else if (pendientes.length > 0) {
        tono = "border-amber-300 bg-amber-50 text-amber-900";
        icono = <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />;
        titulo = "Tu bloque está abierto, pero aún no te toca";
        detalle =
            `Falta(n) por capturar ${pendientes.map((e) => e.nombreCompleto).join(", ")} ` +
            "(tienen más antigüedad). En cuanto capturen —o tu jefe los salte— podrás continuar.";
    } else {
        tono = "border-green-300 bg-green-50 text-green-900";
        icono = <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />;
        titulo = "Es tu turno: puedes capturar";
        detalle = `Tu bloque cierra el ${fechaLarga(bloque.fechaHoraFin)} a las ${hora(bloque.fechaHoraFin)}.`;
    }

    return (
        <div className={`flex items-start gap-3 rounded-lg border p-4 ${tono}`}>
            {icono}
            <div className="text-sm">
                <p className="font-semibold">{titulo}</p>
                <p className="mt-1">
                    Bloque {bloque.numeroBloque} — {fechaLarga(bloque.fechaHoraInicio)}, de{" "}
                    <span className="font-medium">{hora(bloque.fechaHoraInicio)}</span> a{" "}
                    <span className="font-medium">{hora(bloque.fechaHoraFin)}</span>
                </p>
                {detalle && <p className="mt-1">{detalle}</p>}
                <p className="mt-1 opacity-80">
                    {bloque.nombreArea} · {bloque.nombreGrupo}
                </p>
            </div>
        </div>
    );
};

export default MiTurnoBanner;
