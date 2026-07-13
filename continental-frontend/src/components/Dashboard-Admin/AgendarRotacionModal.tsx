import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Loader2, Plus, RotateCcw, X } from "lucide-react";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { reglasTurnoService } from "@/services/reglasTurnoService";
import type { ReglaTurno } from "@/interfaces/Api.interface";

interface Props {
    onClose: () => void;
    onCreada?: () => void;
}

const HEADERS_DIA = ["L", "M", "Mi", "J", "V", "S", "D"];

/** Colores por turno — mismo esquema que la pestaña Reglas de turnos. */
const turnoColor = (turno: string): string => {
    const t = (turno || "").trim().toUpperCase();
    if (t === "D" || t === "0") return "bg-gray-200 text-gray-700 border-gray-300";
    if (t === "1") return "bg-emerald-100 text-emerald-800 border-emerald-300";
    if (t === "2") return "bg-amber-100 text-amber-800 border-amber-300";
    if (t === "3") return "bg-sky-100 text-sky-800 border-sky-300";
    return "bg-purple-100 text-purple-800 border-purple-300";
};

function todayIsoPlusDays(days: number): string {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
}

/**
 * "Fecha de ejecución arranque" (task #84).
 * Fija el patrón editado como baseline de la regla en una o varias fechas
 * futuras. Sustituye a la programación de rotaciones N-días: aquí el
 * SuperUsuario captura el orden completo del año (enero/abril típico) en
 * una vista tipo Excel y ese día se aplica tal cual.
 */
export function AgendarRotacionModal({ onClose, onCreada }: Props) {
    const [reglas, setReglas] = useState<ReglaTurno[]>([]);
    const [loadingReglas, setLoadingReglas] = useState(true);
    const [codigoRegla, setCodigoRegla] = useState<string>("");
    const [patron, setPatron] = useState<string[]>([]);
    const [semanasCount, setSemanasCount] = useState<number>(0);
    const [fechas, setFechas] = useState<string[]>([todayIsoPlusDays(1)]);
    const [notas, setNotas] = useState("");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let cancel = false;
        setLoadingReglas(true);
        reglasTurnoService.getAll()
            .then(rs => {
                if (cancel) return;
                const disponibles = (rs || [])
                    .filter(r => r.patron.length > 0 || r.estado === "PendienteConfiguracion");
                setReglas(disponibles);
                if (disponibles.length && !codigoRegla) {
                    setCodigoRegla(disponibles[0].codigo);
                }
            })
            .catch(() => { if (!cancel) toast.error("Error al cargar reglas"); })
            .finally(() => { if (!cancel) setLoadingReglas(false); });
        return () => { cancel = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const reglaSel = useMemo(
        () => reglas.find(r => r.codigo === codigoRegla),
        [reglas, codigoRegla]
    );

    // Al cambiar de regla, sembramos el patrón editable con el patrón vigente.
    // Si la regla es Pendiente (patrón vacío) sembramos 4 semanas de descanso.
    useEffect(() => {
        if (!reglaSel) {
            setPatron([]);
            setSemanasCount(0);
            return;
        }
        if (reglaSel.patron.length > 0) {
            setPatron([...reglaSel.patron]);
            setSemanasCount(Math.floor(reglaSel.patron.length / 7));
        } else {
            const semanas = 4;
            setPatron(Array.from({ length: semanas * 7 }, () => "D"));
            setSemanasCount(semanas);
        }
    }, [reglaSel]);

    const setCelda = (idx: number, v: string) => {
        const val = (v || "").trim().toUpperCase().slice(0, 2);
        setPatron(prev => prev.map((c, i) => (i === idx ? val : c)));
    };

    const resetPatronDesdeRegla = () => {
        if (!reglaSel) return;
        if (reglaSel.patron.length > 0) {
            setPatron([...reglaSel.patron]);
            setSemanasCount(Math.floor(reglaSel.patron.length / 7));
        } else {
            setPatron(Array.from({ length: 4 * 7 }, () => "D"));
            setSemanasCount(4);
        }
        toast.success("Patrón restablecido a su valor vigente");
    };

    const agregarSemana = () => {
        setPatron(prev => [...prev, ...Array(7).fill("D")]);
        setSemanasCount(s => s + 1);
    };

    const quitarSemana = () => {
        if (semanasCount <= 1) return;
        setPatron(prev => prev.slice(0, prev.length - 7));
        setSemanasCount(s => s - 1);
    };

    const minDate = todayIsoPlusDays(1);
    const addFecha = () => setFechas(prev => [...prev, minDate]);
    const removeFecha = (idx: number) => setFechas(prev => prev.filter((_, i) => i !== idx));
    const setFecha = (idx: number, v: string) =>
        setFechas(prev => prev.map((f, i) => (i === idx ? v : f)));

    const patronValido = useMemo(() => {
        if (patron.length === 0) return false;
        if (patron.length % 7 !== 0) return false;
        return patron.every(c => c && c.trim().length > 0);
    }, [patron]);

    const handleSubmit = async () => {
        if (!codigoRegla) { toast.error("Selecciona una regla."); return; }
        if (!patronValido) {
            toast.error("El patrón debe estar completo (múltiplo de 7 y sin celdas vacías).");
            return;
        }
        const fechasValidas = Array.from(new Set(fechas.filter(f => f && f >= minDate)));
        if (fechasValidas.length === 0) {
            toast.error("Debes indicar al menos una fecha futura.");
            return;
        }

        setSaving(true);
        try {
            const resp = await reglasTurnoService.agendarRotaciones({
                codigoRegla,
                fechas: fechasValidas,
                patronBaseline: patron.map(c => c.trim().toUpperCase()),
                notas: notas.trim() || undefined,
            });
            const creadas = resp.creadas?.length ?? 0;
            const omitidas = resp.omitidas?.length ?? 0;
            if (creadas === 0) {
                toast.error("No se agendó ninguna fecha. " + (resp.omitidas?.join(" • ") ?? ""));
            } else {
                toast.success(
                    `${creadas} fecha(s) de arranque agendada(s)${omitidas ? ` — ${omitidas} omitida(s)` : ""}`
                );
                onCreada?.();
                onClose();
            }
        } catch (e: any) {
            toast.error(e?.message ?? "Error al agendar la fecha de arranque");
        } finally {
            setSaving(false);
        }
    };

    return (
        <AlertDialog open onOpenChange={(open) => !open && !saving && onClose()}>
            <AlertDialogContent className="max-w-4xl">
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                        <CalendarClock className="size-5 text-continental-yellow" />
                        Fecha de ejecución arranque
                    </AlertDialogTitle>
                    <AlertDialogDescription asChild>
                        <div className="space-y-4 text-sm">
                            <p>
                                Captura el orden de las reglas como quedarán a partir de una fecha
                                (típicamente <strong>enero</strong> o <strong>abril</strong>). Al llegar
                                esa fecha, este patrón se fija como baseline de la regla y se queda así
                                todo el año. No afecta <em>Empleados.Rol</em> ni al grupo asignado.
                            </p>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <Label className="text-xs">Regla</Label>
                                    {loadingReglas ? (
                                        <div className="flex items-center gap-2 text-continental-gray-1 text-xs py-2">
                                            <Loader2 className="size-3 animate-spin" /> Cargando reglas…
                                        </div>
                                    ) : (
                                        <select
                                            value={codigoRegla}
                                            onChange={(e) => setCodigoRegla(e.target.value)}
                                            className="w-full border rounded px-2 py-2 text-sm"
                                        >
                                            {reglas.length === 0 && <option value="">(sin reglas disponibles)</option>}
                                            {reglas.map(r => (
                                                <option key={r.codigo} value={r.codigo}>
                                                    {r.codigo}
                                                    {r.estado === "PendienteConfiguracion" ? "  (pendiente)" : ""}
                                                    {r.patron.length > 0 ? `  ·  ${Math.floor(r.patron.length / 7)} sem` : ""}
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                    {reglaSel?.estado === "PendienteConfiguracion" && (
                                        <div className="mt-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                                            Esta regla llegó del Excel de SAP y aún no tiene patrón. Al agendar
                                            un arranque quedará configurada y podrás asignarla a un área.
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <Label className="text-xs">Fechas de arranque (mín. mañana)</Label>
                                    <div className="space-y-1 pt-1">
                                        {fechas.map((f, i) => (
                                            <div key={i} className="flex items-center gap-2">
                                                <input
                                                    type="date"
                                                    min={minDate}
                                                    value={f}
                                                    onChange={(e) => setFecha(i, e.target.value)}
                                                    className="border rounded px-2 py-1 text-sm"
                                                />
                                                {fechas.length > 1 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => removeFecha(i)}
                                                        className="text-red-600 hover:text-red-800"
                                                        title="Quitar fecha"
                                                    >
                                                        <X className="size-4" />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                        <button
                                            type="button"
                                            onClick={addFecha}
                                            className="inline-flex items-center gap-1 text-xs text-continental-yellow hover:underline mt-1"
                                        >
                                            <Plus className="size-3" /> Agregar otra fecha
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <Label className="text-xs">Orden de las reglas (editable)</Label>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={quitarSemana}
                                            disabled={semanasCount <= 1}
                                            className="text-[11px] px-2 py-0.5 border rounded hover:bg-continental-gray-4 disabled:opacity-40"
                                            title="Quitar la última semana"
                                        >
                                            − semana
                                        </button>
                                        <button
                                            type="button"
                                            onClick={agregarSemana}
                                            className="text-[11px] px-2 py-0.5 border rounded hover:bg-continental-gray-4"
                                            title="Agregar una semana al final"
                                        >
                                            + semana
                                        </button>
                                        <button
                                            type="button"
                                            onClick={resetPatronDesdeRegla}
                                            disabled={!reglaSel}
                                            className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 border rounded hover:bg-continental-gray-4 disabled:opacity-40"
                                            title="Restablecer al patrón actual de la regla"
                                        >
                                            <RotateCcw className="size-3" /> Restablecer
                                        </button>
                                    </div>
                                </div>
                                <div className="overflow-x-auto border rounded-lg bg-white">
                                    <table className="min-w-full text-[11px] font-mono">
                                        <thead>
                                            <tr className="bg-continental-gray-4/40">
                                                <th className="text-left px-2 py-1">Sub-grupo</th>
                                                {HEADERS_DIA.map(h => (
                                                    <th key={h} className="px-1 py-1 text-center">{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {Array.from({ length: semanasCount }).map((_, sg) => (
                                                <tr key={sg} className="border-t">
                                                    <td className="px-2 py-0.5 whitespace-nowrap text-continental-gray-1">
                                                        {sg === 0 ? (codigoRegla || "—") : `${codigoRegla || "—"}_${String(sg + 1).padStart(2, "0")}`}
                                                    </td>
                                                    {HEADERS_DIA.map((_, d) => {
                                                        const idx = sg * 7 + d;
                                                        const v = patron[idx] ?? "";
                                                        const vigente = reglaSel?.patron?.[idx];
                                                        const cambia = vigente !== undefined && vigente !== v;
                                                        return (
                                                            <td key={d} className="px-0.5 py-0.5 text-center">
                                                                <input
                                                                    value={v}
                                                                    onChange={(e) => setCelda(idx, e.target.value)}
                                                                    maxLength={2}
                                                                    placeholder="D"
                                                                    className={`w-full text-center py-1 rounded border font-mono uppercase outline-none focus:ring-2 focus:ring-continental-yellow ${turnoColor(v)} ${cambia ? "ring-1 ring-amber-400" : ""}`}
                                                                    title={cambia ? `Vigente: ${vigente} → Nuevo: ${v || "(vacío)"}` : undefined}
                                                                />
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-continental-gray-1">
                                    <span>Turnos válidos: <b>D</b>=descanso · <b>1</b>=T1 · <b>2</b>=T2 · <b>3</b>=T3</span>
                                    <span className="text-amber-700">Celdas con anillo ámbar = cambian respecto al patrón vigente.</span>
                                    {!patronValido && <span className="text-red-600">El patrón debe tener todas las celdas llenas.</span>}
                                </div>
                            </div>

                            <div>
                                <Label className="text-xs">Notas (opcional)</Label>
                                <textarea
                                    value={notas}
                                    onChange={(e) => setNotas(e.target.value)}
                                    rows={2}
                                    maxLength={500}
                                    placeholder="Ej. Arranque de año 2027 · orden confirmado con RH"
                                    className="w-full border rounded px-2 py-1.5 text-sm"
                                />
                            </div>
                        </div>
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={(e) => { e.preventDefault(); handleSubmit(); }}
                        disabled={saving || loadingReglas || !reglaSel || !patronValido}
                    >
                        {saving ? (
                            <><Loader2 className="size-4 animate-spin mr-1" /> Agendando…</>
                        ) : (
                            <>Agendar fecha de arranque</>
                        )}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
