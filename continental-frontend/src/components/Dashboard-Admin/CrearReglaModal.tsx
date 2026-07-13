import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, RotateCcw } from "lucide-react";
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

interface Props {
    onClose: () => void;
    onCreada?: () => void;
}

const HEADERS_DIA = ["L", "M", "Mi", "J", "V", "S", "D"];

const turnoColor = (turno: string): string => {
    const t = (turno || "").trim().toUpperCase();
    if (t === "D" || t === "0") return "bg-gray-200 text-gray-700 border-gray-300";
    if (t === "1") return "bg-emerald-100 text-emerald-800 border-emerald-300";
    if (t === "2") return "bg-amber-100 text-amber-800 border-amber-300";
    if (t === "3") return "bg-sky-100 text-sky-800 border-sky-300";
    if (!t) return "bg-white border-continental-gray-3";
    return "bg-purple-100 text-purple-800 border-purple-300";
};

/**
 * Alta manual de una regla desde SuperUsuario (task #85 extended).
 * Útil cuando la regla existe en el Excel de RolesEmpleadosSAP pero no se ha
 * reflejado en la app (no llegó por sync o el auto-descubrimiento no la halló).
 */
export function CrearReglaModal({ onClose, onCreada }: Props) {
    const [codigo, setCodigo] = useState("");
    const [semanas, setSemanas] = useState<number>(4);
    const [patron, setPatron] = useState<string[]>(() => Array.from({ length: 4 * 7 }, () => "D"));
    const [notas, setNotas] = useState("");
    const [saving, setSaving] = useState(false);

    const setCelda = (idx: number, v: string) => {
        const val = (v || "").trim().toUpperCase().slice(0, 2);
        setPatron(prev => prev.map((c, i) => (i === idx ? val : c)));
    };

    const agregarSemana = () => {
        setPatron(prev => [...prev, ...Array(7).fill("D")]);
        setSemanas(s => s + 1);
    };

    const quitarSemana = () => {
        if (semanas <= 1) return;
        setPatron(prev => prev.slice(0, prev.length - 7));
        setSemanas(s => s - 1);
    };

    const limpiarPatron = () => {
        setPatron(Array.from({ length: semanas * 7 }, () => "D"));
        toast.success("Patrón reiniciado a descansos");
    };

    const codigoValido = useMemo(
        () => /^[A-Za-z0-9_-]{1,20}$/.test(codigo.trim()),
        [codigo]
    );

    const patronValido = useMemo(() => {
        if (patron.length === 0) return false;
        if (patron.length % 7 !== 0) return false;
        return patron.every(c => c && c.trim().length > 0);
    }, [patron]);

    const handleSubmit = async () => {
        if (!codigoValido) {
            toast.error("El código debe ser alfanumérico (letras, dígitos, guion/guion bajo), máx. 20 caracteres.");
            return;
        }
        if (!patronValido) {
            toast.error("El patrón debe estar completo (múltiplo de 7 y sin celdas vacías).");
            return;
        }
        setSaving(true);
        try {
            const nueva = await reglasTurnoService.crear({
                codigo: codigo.trim().toUpperCase(),
                patron: patron.map(c => c.trim().toUpperCase()),
                notas: notas.trim() || undefined,
            });
            toast.success(`Regla ${nueva.codigo} creada (${nueva.estado})`);
            onCreada?.();
            onClose();
        } catch (e: any) {
            toast.error(e?.message ?? "Error al crear la regla");
        } finally {
            setSaving(false);
        }
    };

    return (
        <AlertDialog open onOpenChange={(open) => !open && !saving && onClose()}>
            <AlertDialogContent className="max-w-4xl">
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                        <Plus className="size-5 text-continental-yellow" />
                        Crear regla de turnos
                    </AlertDialogTitle>
                    <AlertDialogDescription asChild>
                        <div className="space-y-4 text-sm">
                            <p>
                                Alta manual cuando la regla existe en el <em>Excel de SAP</em> pero
                                no aparece en la app. Captura código y patrón — al guardar quedará
                                <strong> Activa</strong> y podrás asignarla a un área.
                            </p>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <Label className="text-xs">Código de la regla</Label>
                                    <input
                                        type="text"
                                        value={codigo}
                                        onChange={(e) => setCodigo(e.target.value)}
                                        maxLength={20}
                                        placeholder="Ej. R0144"
                                        className="w-full border rounded px-2 py-2 text-sm font-mono uppercase"
                                    />
                                    {!codigoValido && codigo.length > 0 && (
                                        <div className="mt-1 text-[11px] text-red-600">
                                            Solo letras, dígitos, guion o guion bajo. Máx. 20.
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <Label className="text-xs">Notas (opcional)</Label>
                                    <input
                                        type="text"
                                        value={notas}
                                        onChange={(e) => setNotas(e.target.value)}
                                        maxLength={500}
                                        placeholder="Origen del alta manual"
                                        className="w-full border rounded px-2 py-2 text-sm"
                                    />
                                </div>
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <Label className="text-xs">Patrón (editable)</Label>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={quitarSemana}
                                            disabled={semanas <= 1}
                                            className="text-[11px] px-2 py-0.5 border rounded hover:bg-continental-gray-4 disabled:opacity-40"
                                        >
                                            − semana
                                        </button>
                                        <button
                                            type="button"
                                            onClick={agregarSemana}
                                            className="text-[11px] px-2 py-0.5 border rounded hover:bg-continental-gray-4"
                                        >
                                            + semana
                                        </button>
                                        <button
                                            type="button"
                                            onClick={limpiarPatron}
                                            className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 border rounded hover:bg-continental-gray-4"
                                        >
                                            <RotateCcw className="size-3" /> Limpiar
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
                                            {Array.from({ length: semanas }).map((_, sg) => (
                                                <tr key={sg} className="border-t">
                                                    <td className="px-2 py-0.5 whitespace-nowrap text-continental-gray-1">
                                                        {sg === 0 ? (codigo.toUpperCase() || "—") : `${codigo.toUpperCase() || "—"}_${String(sg + 1).padStart(2, "0")}`}
                                                    </td>
                                                    {HEADERS_DIA.map((_, d) => {
                                                        const idx = sg * 7 + d;
                                                        const v = patron[idx] ?? "";
                                                        return (
                                                            <td key={d} className="px-0.5 py-0.5 text-center">
                                                                <input
                                                                    value={v}
                                                                    onChange={(e) => setCelda(idx, e.target.value)}
                                                                    maxLength={2}
                                                                    placeholder="D"
                                                                    className={`w-full text-center py-1 rounded border font-mono uppercase outline-none focus:ring-2 focus:ring-continental-yellow ${turnoColor(v)}`}
                                                                />
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="mt-2 text-[11px] text-continental-gray-1">
                                    Turnos válidos: <b>D</b>=descanso · <b>1</b>=T1 · <b>2</b>=T2 · <b>3</b>=T3
                                    {!patronValido && <span className="text-red-600 ml-2">Completa todas las celdas.</span>}
                                </div>
                            </div>
                        </div>
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={(e) => { e.preventDefault(); handleSubmit(); }}
                        disabled={saving || !codigoValido || !patronValido}
                    >
                        {saving ? (
                            <><Loader2 className="size-4 animate-spin mr-1" /> Creando…</>
                        ) : (
                            <>Crear regla</>
                        )}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
