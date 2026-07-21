import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
    CalendarClock, Loader2, Plus, Trash2, Copy, ChevronLeft, ChevronRight,
    RotateCcw, ArrowRight,
} from "lucide-react";
import { Link } from "react-router-dom";
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
import { Button } from "@/components/ui/button";
import { reglasTurnoService } from "@/services/reglasTurnoService";
import { SAP_NOMENCLATURA, type SAPCodigo } from "@/utils/sapNomenclatura";
import type { ReglaTurno } from "@/interfaces/Api.interface";

interface Props {
    onClose: () => void;
    onCreada?: () => void;
    codigoInicial?: string;
}

const HEADERS_DIA = ["L", "M", "Mi", "J", "V", "S", "D"];
const MESES_LARGO = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const DIAS_SEMANA_MINI = ["D", "L", "M", "M", "J", "V", "S"];

function todayPlusDays(days: number): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + days);
    return d;
}

function toIso(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isoToDate(iso: string): Date {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function celdaColor(codigo: string): { bg: string; fg: string } | null {
    const c = (codigo || "").trim().toUpperCase();
    if (!c) return null;
    const entry = SAP_NOMENCLATURA[c as SAPCodigo];
    if (!entry) return null;
    return { bg: entry.bg, fg: entry.fg };
}

interface ArranquePlan {
    id: string;
    fechaIso: string;
    patron: string[];
    semanas: number;
}

const MIN_ISO = toIso(todayPlusDays(1));

function nuevoArranque(fechaIso: string, patronSemilla: string[]): ArranquePlan {
    const patron = patronSemilla.length > 0 ? [...patronSemilla] : Array(4 * 7).fill("D");
    return {
        id: `arr-${fechaIso}-${Math.floor(performance.now() * 1000)}`,
        fechaIso,
        patron,
        semanas: Math.max(1, Math.floor(patron.length / 7)),
    };
}

export function AgendarRotacionModal({ onClose, onCreada, codigoInicial }: Props) {
    const [reglas, setReglas] = useState<ReglaTurno[]>([]);
    const [loadingReglas, setLoadingReglas] = useState(true);
    const [codigoRegla, setCodigoRegla] = useState<string>(codigoInicial ?? "");
    const [arranques, setArranques] = useState<ArranquePlan[]>([]);
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
                    setCodigoRegla(codigoInicial ?? disponibles[0].codigo);
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

    // Sembramos un arranque inicial cuando se selecciona una regla.
    useEffect(() => {
        if (!reglaSel) {
            setArranques([]);
            return;
        }
        setArranques(prev => {
            if (prev.length > 0) return prev;
            return [nuevoArranque(MIN_ISO, reglaSel.patron)];
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reglaSel?.codigo]);

    const agregarArranque = () => {
        if (!reglaSel) return;
        const usadas = new Set(arranques.map(a => a.fechaIso));
        // Sugerimos una fecha 30 días después del último arranque.
        const last = arranques[arranques.length - 1];
        let sugerida = last ? isoToDate(last.fechaIso) : todayPlusDays(1);
        sugerida.setDate(sugerida.getDate() + 30);
        while (usadas.has(toIso(sugerida))) {
            sugerida.setDate(sugerida.getDate() + 1);
        }
        const patronSemilla = last ? last.patron : reglaSel.patron;
        setArranques(prev => [...prev, nuevoArranque(toIso(sugerida), patronSemilla)]);
    };

    const quitarArranque = (id: string) => {
        setArranques(prev => prev.filter(a => a.id !== id));
    };

    const setFechaArranque = (id: string, fechaIso: string) => {
        setArranques(prev => prev.map(a => a.id === id ? { ...a, fechaIso } : a));
    };

    const setCeldaArranque = (id: string, idx: number, valor: string) => {
        const val = (valor || "").trim().toUpperCase().slice(0, 2);
        setArranques(prev => prev.map(a =>
            a.id === id
                ? { ...a, patron: a.patron.map((c, i) => (i === idx ? val : c)) }
                : a
        ));
    };

    const cambiarSemanas = (id: string, delta: number) => {
        setArranques(prev => prev.map(a => {
            if (a.id !== id) return a;
            const nuevas = Math.max(1, a.semanas + delta);
            const patron = nuevas > a.semanas
                ? [...a.patron, ...Array((nuevas - a.semanas) * 7).fill("D")]
                : a.patron.slice(0, nuevas * 7);
            return { ...a, semanas: nuevas, patron };
        }));
    };

    const copiarDeArranquePrevio = (id: string) => {
        const idx = arranques.findIndex(a => a.id === id);
        if (idx <= 0) return;
        const src = arranques[idx - 1];
        setArranques(prev => prev.map(a => a.id === id
            ? { ...a, patron: [...src.patron], semanas: src.semanas }
            : a
        ));
        toast.success("Patrón copiado del arranque anterior");
    };

    const restablecerAPatronVigente = (id: string) => {
        if (!reglaSel) return;
        const patron = reglaSel.patron.length > 0
            ? [...reglaSel.patron]
            : Array(4 * 7).fill("D");
        setArranques(prev => prev.map(a => a.id === id
            ? { ...a, patron, semanas: Math.max(1, Math.floor(patron.length / 7)) }
            : a
        ));
    };

    const arranquesValidos = useMemo(() => {
        if (arranques.length === 0) return false;
        const fechas = arranques.map(a => a.fechaIso);
        if (new Set(fechas).size !== fechas.length) return false;
        return arranques.every(a =>
            a.fechaIso >= MIN_ISO &&
            a.patron.length > 0 &&
            a.patron.length % 7 === 0 &&
            a.patron.every(c => c && c.trim().length > 0)
        );
    }, [arranques]);

    const handleSubmit = async () => {
        if (!codigoRegla) { toast.error("Selecciona una regla."); return; }
        if (!arranquesValidos) {
            toast.error("Cada arranque debe tener fecha ≥ mañana y patrón completo (múltiplo de 7).");
            return;
        }

        setSaving(true);
        try {
            const ordenados = [...arranques].sort((a, b) => a.fechaIso.localeCompare(b.fechaIso));
            let creadasTotal = 0;
            let omitidasTotal: string[] = [];
            for (const a of ordenados) {
                const resp = await reglasTurnoService.agendarRotaciones({
                    codigoRegla,
                    fechas: [a.fechaIso],
                    patronBaseline: a.patron.map(c => c.trim().toUpperCase()),
                    notas: notas.trim() || undefined,
                });
                creadasTotal += resp.creadas?.length ?? 0;
                if (resp.omitidas?.length) omitidasTotal.push(...resp.omitidas);
            }
            if (creadasTotal === 0) {
                toast.error("No se agendó ninguna fecha. " + omitidasTotal.join(" • "));
            } else {
                toast.success(
                    `${creadasTotal} arranque(s) agendado(s)${omitidasTotal.length ? ` — ${omitidasTotal.length} omitido(s)` : ""}`
                );
                onCreada?.();
                onClose();
            }
        } catch (e: any) {
            toast.error(e?.message ?? "Error al agendar los arranques");
        } finally {
            setSaving(false);
        }
    };

    return (
        <AlertDialog open onOpenChange={(open) => !open && !saving && onClose()}>
            <AlertDialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                        <CalendarClock className="size-5 text-continental-yellow" />
                        Fechas de arranque
                    </AlertDialogTitle>
                    <AlertDialogDescription asChild>
                        <div className="space-y-4 text-sm">
                            <p>
                                Programa uno o más <strong>arranques</strong> para esta regla. Cada arranque
                                fija su propio patrón en la fecha elegida; entre dos arranques rige el más reciente.
                                Selecciona la fecha en el mini-calendario (no la escribas) para evitar errores.
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
                                </div>
                                <div className="flex items-end">
                                    <Link
                                        to="/admin/calendario-anual"
                                        target="_blank"
                                        className="inline-flex items-center gap-1 text-xs text-continental-yellow hover:underline"
                                    >
                                        Ver cómo quedan los arranques ya guardados
                                        <ArrowRight className="size-3" />
                                    </Link>
                                </div>
                            </div>

                            <div className="space-y-4">
                                {arranques.map((a, i) => (
                                    <div key={a.id} className="border rounded-lg p-3 bg-continental-gray-4/20">
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-continental-yellow text-black text-xs font-semibold">
                                                    {i + 1}
                                                </span>
                                                <span className="text-sm font-semibold">
                                                    Arranque #{i + 1}
                                                </span>
                                                <span className="text-[11px] text-continental-gray-1">
                                                    ({new Date(a.fechaIso + "T00:00:00").toLocaleDateString("es-MX", { weekday: "short", day: "2-digit", month: "long", year: "numeric" })})
                                                </span>
                                            </div>
                                            {arranques.length > 1 && (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => quitarArranque(a.id)}
                                                    className="text-red-600 hover:text-red-800"
                                                >
                                                    <Trash2 className="size-4" />
                                                </Button>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4">
                                            <div>
                                                <Label className="text-xs">Fecha (click para seleccionar)</Label>
                                                <MiniCalendar
                                                    fechaIso={a.fechaIso}
                                                    onPick={(iso) => setFechaArranque(a.id, iso)}
                                                    fechasBloqueadas={arranques
                                                        .filter(x => x.id !== a.id)
                                                        .map(x => x.fechaIso)}
                                                />
                                            </div>
                                            <div>
                                                <div className="flex items-center justify-between mb-1">
                                                    <Label className="text-xs">Patrón que aplica desde esa fecha</Label>
                                                    <div className="flex items-center gap-2">
                                                        <Button type="button" variant="outline" size="sm"
                                                            onClick={() => cambiarSemanas(a.id, -1)}
                                                            disabled={a.semanas <= 1}
                                                        >− sem</Button>
                                                        <Button type="button" variant="outline" size="sm"
                                                            onClick={() => cambiarSemanas(a.id, 1)}
                                                        >+ sem</Button>
                                                        {i > 0 && (
                                                            <Button type="button" variant="outline" size="sm"
                                                                onClick={() => copiarDeArranquePrevio(a.id)}
                                                                title="Copiar el patrón del arranque anterior"
                                                            >
                                                                <Copy className="size-3 mr-1" /> Copiar previo
                                                            </Button>
                                                        )}
                                                        <Button type="button" variant="outline" size="sm"
                                                            onClick={() => restablecerAPatronVigente(a.id)}
                                                            title="Restablecer al patrón vigente de la regla"
                                                            disabled={!reglaSel}
                                                        >
                                                            <RotateCcw className="size-3 mr-1" /> Vigente
                                                        </Button>
                                                    </div>
                                                </div>
                                                <PatronEditor
                                                    codigoRegla={codigoRegla || "—"}
                                                    patron={a.patron}
                                                    semanas={a.semanas}
                                                    onCambiarCelda={(idx, v) => setCeldaArranque(a.id, idx, v)}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={agregarArranque}
                                    disabled={!reglaSel}
                                    className="w-full border-dashed"
                                >
                                    <Plus className="size-4 mr-1" /> Agregar otro arranque
                                </Button>
                            </div>

                            <div>
                                <Label className="text-xs">Notas (aplica a todos los arranques)</Label>
                                <textarea
                                    value={notas}
                                    onChange={(e) => setNotas(e.target.value)}
                                    rows={2}
                                    maxLength={500}
                                    placeholder="Ej. Arranque enero + arranque Semana Santa"
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
                        disabled={saving || loadingReglas || !reglaSel || !arranquesValidos}
                    >
                        {saving ? (
                            <><Loader2 className="size-4 animate-spin mr-1" /> Agendando…</>
                        ) : (
                            <>Agendar {arranques.length} arranque(s)</>
                        )}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

interface MiniCalendarProps {
    fechaIso: string;
    onPick: (iso: string) => void;
    fechasBloqueadas: string[];
}

const MiniCalendar = ({ fechaIso, onPick, fechasBloqueadas }: MiniCalendarProps) => {
    const sel = isoToDate(fechaIso);
    const [mesVista, setMesVista] = useState<Date>(new Date(sel.getFullYear(), sel.getMonth(), 1));
    const bloqueadas = new Set(fechasBloqueadas);
    const minIso = MIN_ISO;

    const anio = mesVista.getFullYear();
    const mes0 = mesVista.getMonth();
    const primerDiaSemana = new Date(anio, mes0, 1).getDay();
    const diasDelMes = new Date(anio, mes0 + 1, 0).getDate();

    const celdas: (Date | null)[] = [];
    for (let i = 0; i < primerDiaSemana; i++) celdas.push(null);
    for (let d = 1; d <= diasDelMes; d++) celdas.push(new Date(anio, mes0, d));

    return (
        <div className="border rounded-lg p-2 bg-white select-none">
            <div className="flex items-center justify-between mb-2">
                <Button type="button" variant="ghost" size="sm"
                    onClick={() => setMesVista(new Date(anio, mes0 - 1, 1))}
                >
                    <ChevronLeft className="size-4" />
                </Button>
                <span className="text-xs font-semibold">
                    {MESES_LARGO[mes0]} {anio}
                </span>
                <Button type="button" variant="ghost" size="sm"
                    onClick={() => setMesVista(new Date(anio, mes0 + 1, 1))}
                >
                    <ChevronRight className="size-4" />
                </Button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] text-continental-gray-1 mb-1">
                {DIAS_SEMANA_MINI.map((d, i) => <div key={i}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
                {celdas.map((d, i) => {
                    if (!d) return <div key={i} className="h-7" />;
                    const iso = toIso(d);
                    const bloqueada = bloqueadas.has(iso);
                    const antesDeMinimo = iso < minIso;
                    const seleccionada = iso === fechaIso;
                    const disabled = bloqueada || antesDeMinimo;
                    return (
                        <button
                            key={i}
                            type="button"
                            disabled={disabled}
                            onClick={() => onPick(iso)}
                            className={[
                                "h-7 text-[11px] rounded transition-colors",
                                disabled
                                    ? "bg-gray-100 text-gray-300 cursor-not-allowed line-through"
                                    : seleccionada
                                        ? "bg-continental-yellow text-black font-semibold ring-2 ring-continental-yellow"
                                        : "hover:bg-continental-yellow/20 text-continental-black",
                            ].join(" ")}
                            title={
                                bloqueada ? "Otro arranque ya usa esta fecha"
                                : antesDeMinimo ? "Debe ser posterior a hoy"
                                : ""
                            }
                        >
                            {d.getDate()}
                        </button>
                    );
                })}
            </div>
            <div className="mt-2 text-[10px] text-continental-gray-1">
                Fecha elegida: <strong className="text-continental-black">
                    {sel.toLocaleDateString("es-MX", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}
                </strong>
            </div>
        </div>
    );
};

interface PatronEditorProps {
    codigoRegla: string;
    patron: string[];
    semanas: number;
    onCambiarCelda: (idx: number, valor: string) => void;
}

const PatronEditor = ({ codigoRegla, patron, semanas, onCambiarCelda }: PatronEditorProps) => (
    <div className="overflow-x-auto border rounded bg-white">
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
                            {sg === 0 ? codigoRegla : `${codigoRegla}_${String(sg + 1).padStart(2, "0")}`}
                        </td>
                        {HEADERS_DIA.map((_, d) => {
                            const idx = sg * 7 + d;
                            const v = patron[idx] ?? "";
                            const color = celdaColor(v);
                            return (
                                <td key={d} className="px-0.5 py-0.5 text-center">
                                    <input
                                        value={v}
                                        onChange={(e) => onCambiarCelda(idx, e.target.value)}
                                        maxLength={2}
                                        placeholder="D"
                                        className="w-full text-center py-1 rounded border font-mono uppercase outline-none focus:ring-2 focus:ring-continental-yellow"
                                        style={color ? { backgroundColor: color.bg, color: color.fg } : undefined}
                                    />
                                </td>
                            );
                        })}
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);
