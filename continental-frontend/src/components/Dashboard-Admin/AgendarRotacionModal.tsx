import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
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

const DIAS_OPCIONES = [7, 14, 21] as const;
const HEADERS_DIA = ["L", "M", "Mi", "J", "V", "S", "D"];

/**
 * Rota el patrón `n` posiciones: newPatron[i] = oldPatron[(i + n) mod N].
 * Misma semántica que ReglasTurnoService.RotarPatron en backend (#80).
 */
function rotarPatronLocal(patron: string[], dias: number): string[] {
    const n = patron.length;
    if (n === 0) return [];
    const shift = ((dias % n) + n) % n;
    const result: string[] = new Array(n);
    for (let i = 0; i < n; i++) result[i] = patron[(i + shift) % n];
    return result;
}

function todayIsoPlusDays(days: number): string {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
}

export function AgendarRotacionModal({ onClose, onCreada }: Props) {
    const [reglas, setReglas] = useState<ReglaTurno[]>([]);
    const [loadingReglas, setLoadingReglas] = useState(true);
    const [codigoRegla, setCodigoRegla] = useState<string>("");
    const [diasRotacion, setDiasRotacion] = useState<number>(7);
    const [fechas, setFechas] = useState<string[]>([todayIsoPlusDays(1)]);
    const [notas, setNotas] = useState("");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let cancel = false;
        setLoadingReglas(true);
        reglasTurnoService.getAll()
            .then(rs => {
                if (cancel) return;
                const activas = (rs || []).filter(r => r.estado === "Activa" && r.patron.length > 0);
                setReglas(activas);
                if (activas.length && !codigoRegla) setCodigoRegla(activas[0].codigo);
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

    const semanasPatron = reglaSel ? Math.floor(reglaSel.patron.length / 7) : 0;

    const patronRotado = useMemo(() => {
        if (!reglaSel || reglaSel.patron.length === 0) return [] as string[];
        return rotarPatronLocal(reglaSel.patron, diasRotacion);
    }, [reglaSel, diasRotacion]);

    const minDate = todayIsoPlusDays(1);

    const addFecha = () => setFechas(prev => [...prev, minDate]);
    const removeFecha = (idx: number) => setFechas(prev => prev.filter((_, i) => i !== idx));
    const setFecha = (idx: number, v: string) =>
        setFechas(prev => prev.map((f, i) => (i === idx ? v : f)));

    const handleSubmit = async () => {
        if (!codigoRegla) { toast.error("Selecciona una regla."); return; }
        if (!reglaSel || reglaSel.patron.length === 0) {
            toast.error("La regla no tiene patrón configurado.");
            return;
        }
        const fechasValidas = Array.from(new Set(fechas.filter(f => f && f >= minDate)));
        if (fechasValidas.length === 0) {
            toast.error("Debes indicar al menos una fecha futura.");
            return;
        }
        if (!DIAS_OPCIONES.includes(diasRotacion as any)) {
            toast.error("Los días a rotar deben ser 7, 14 o 21.");
            return;
        }

        setSaving(true);
        try {
            const resp = await reglasTurnoService.agendarRotaciones({
                codigoRegla,
                fechas: fechasValidas,
                diasRotacion,
                notas: notas.trim() || undefined,
            });
            const creadas = resp.creadas?.length ?? 0;
            const omitidas = resp.omitidas?.length ?? 0;
            if (creadas === 0) {
                toast.error("No se agendó ninguna rotación. " + (resp.omitidas?.join(" • ") ?? ""));
            } else {
                toast.success(
                    `${creadas} rotación(es) agendada(s)${omitidas ? ` — ${omitidas} omitida(s)` : ""}`
                );
                onCreada?.();
                onClose();
            }
        } catch (e: any) {
            toast.error(e?.message ?? "Error al agendar la rotación");
        } finally {
            setSaving(false);
        }
    };

    return (
        <AlertDialog open onOpenChange={(open) => !open && !saving && onClose()}>
            <AlertDialogContent className="max-w-3xl">
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                        <CalendarClock className="size-5 text-continental-yellow" />
                        Agendar rotación de regla
                    </AlertDialogTitle>
                    <AlertDialogDescription asChild>
                        <div className="space-y-4 text-sm">
                            <p>
                                El patrón se rotará automáticamente en la(s) fecha(s) indicada(s).
                                <strong> No afecta a Empleados.Rol ni al grupo asignado</strong>: sólo desliza
                                la secuencia del patrón (misma semántica que <em>Recorrer 7</em>).
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
                                            {reglas.length === 0 && <option value="">(no hay reglas activas con patrón)</option>}
                                            {reglas.map(r => (
                                                <option key={r.codigo} value={r.codigo}>
                                                    {r.codigo} ({Math.floor(r.patron.length / 7)} semanas)
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                </div>

                                <div>
                                    <Label className="text-xs">Días a rotar</Label>
                                    <div className="flex gap-2 pt-1">
                                        {DIAS_OPCIONES.map(d => (
                                            <button
                                                key={d}
                                                type="button"
                                                onClick={() => setDiasRotacion(d)}
                                                className={`px-3 py-1.5 text-xs rounded border transition-colors ${diasRotacion === d
                                                    ? "bg-continental-yellow border-continental-yellow text-black font-semibold"
                                                    : "bg-white border-continental-gray-3 hover:bg-continental-gray-4"
                                                    }`}
                                            >
                                                {d} días
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div>
                                <Label className="text-xs">Fechas de ejecución (mín. mañana)</Label>
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

                            <div>
                                <Label className="text-xs">Notas (opcional)</Label>
                                <textarea
                                    value={notas}
                                    onChange={(e) => setNotas(e.target.value)}
                                    rows={2}
                                    maxLength={500}
                                    placeholder="Ej. Cambio de ciclo por Semana Santa"
                                    className="w-full border rounded px-2 py-1.5 text-sm"
                                />
                            </div>

                            {reglaSel && reglaSel.patron.length > 0 && (
                                <div className="border rounded-lg p-3 bg-continental-gray-4/40">
                                    <div className="text-xs font-semibold mb-2">
                                        Vista previa · {reglaSel.codigo} · {semanasPatron} sub-grupo(s) ·
                                        rotación de {diasRotacion} día(s)
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full text-[11px] font-mono">
                                            <thead>
                                                <tr>
                                                    <th className="text-left pr-2 pb-1">Sub-grupo</th>
                                                    {HEADERS_DIA.map(h => (
                                                        <th key={h} className="px-1 pb-1 text-center">{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {Array.from({ length: semanasPatron }).map((_, sg) => (
                                                    <tr key={sg}>
                                                        <td className="pr-2 py-0.5 whitespace-nowrap">
                                                            {sg === 0 ? reglaSel.codigo : `${reglaSel.codigo}_${String(sg + 1).padStart(2, "0")}`}
                                                        </td>
                                                        {HEADERS_DIA.map((_, d) => {
                                                            const idx = sg * 7 + d;
                                                            const antes = reglaSel.patron[idx];
                                                            const despues = patronRotado[idx];
                                                            const cambia = antes !== despues;
                                                            return (
                                                                <td
                                                                    key={d}
                                                                    className={`px-1 py-0.5 text-center border ${cambia
                                                                        ? "bg-amber-100 border-amber-300 font-semibold"
                                                                        : "bg-white border-continental-gray-3"
                                                                        }`}
                                                                    title={cambia ? `Cambia de ${antes} a ${despues}` : ""}
                                                                >
                                                                    {despues}
                                                                    {cambia && (
                                                                        <div className="text-[9px] text-continental-gray-1 line-through">
                                                                            {antes}
                                                                        </div>
                                                                    )}
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="mt-2 text-[11px] text-continental-gray-1">
                                        Las celdas resaltadas cambiarán a partir de cada fecha agendada.
                                    </div>
                                </div>
                            )}
                        </div>
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={(e) => { e.preventDefault(); handleSubmit(); }}
                        disabled={saving || loadingReglas || !reglaSel || reglaSel.patron.length === 0}
                    >
                        {saving ? (
                            <><Loader2 className="size-4 animate-spin mr-1" /> Agendando…</>
                        ) : (
                            <>Agendar</>
                        )}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
