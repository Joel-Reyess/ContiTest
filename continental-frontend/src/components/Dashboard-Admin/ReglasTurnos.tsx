import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, RotateCcw, Repeat, Pencil, AlertTriangle, Building2 } from "lucide-react";
import { AsignarReglaAAreaModal } from "./AsignarReglaAAreaModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import { reglasTurnoService } from "@/services/reglasTurnoService";
import type { ReglaTurno } from "@/interfaces/Api.interface";

const DIAS_SEMANA = ["L", "M", "X", "J", "V", "S", "D"];

const turnoColor = (turno: string): string => {
    const t = (turno || "").trim().toUpperCase();
    if (t === "D" || t === "0") return "bg-gray-200 text-gray-700";
    if (t === "1") return "bg-emerald-100 text-emerald-800 border border-emerald-300";
    if (t === "2") return "bg-amber-100 text-amber-800 border border-amber-300";
    if (t === "3") return "bg-sky-100 text-sky-800 border border-sky-300";
    return "bg-purple-100 text-purple-800 border border-purple-300";
};

const turnoEtiqueta = (turno: string): string => {
    const t = (turno || "").trim().toUpperCase();
    if (t === "D" || t === "0") return "Descanso";
    if (t === "1") return "Turno 1";
    if (t === "2") return "Turno 2";
    if (t === "3") return "Turno 3";
    return t;
};

const formatFecha = (iso?: string | null): string => {
    if (!iso) return "—";
    try {
        return new Date(iso).toLocaleString("es-MX", {
            year: "numeric", month: "short", day: "2-digit",
            hour: "2-digit", minute: "2-digit",
        });
    } catch {
        return iso ?? "—";
    }
};

// Equivalente al CrearRol del backend (TurnosHelper.cs): el sub-grupo N lee el
// mismo patrón base pero con offset (N-1)*7. La salida tiene la misma longitud
// que el patrón original.
const crearRolLocal = (patron: string[], gpoRef: number): string[] => {
    const n = patron.length;
    if (n === 0) return [];
    const offset = ((gpoRef - 1) * 7) % n;
    return patron.map((_, i) => patron[(i + offset) % n]);
};

// Espejo del helper RotarPatron del backend: dias positivo = la semana se adelanta,
// cada sub-grupo recibe el slice que antes tenía el sub-grupo SIGUIENTE del ciclo.
const rotarPatronLocal = (patron: string[], dias: number): string[] => {
    const n = patron.length;
    if (n === 0) return [];
    const shift = ((dias % n) + n) % n;
    return patron.map((_, i) => patron[(i + shift) % n]);
};

// Convención del proyecto: sub-grupo 1 = sin sufijo (R0144), sub-grupo 2 = R0144_02,
// sub-grupo 3 = R0144_03, etc. Coincide con el seed de Grupos en CreateGruposWithConfig.sql.
const nombreSubGrupo = (codigoBase: string, gpoRef: number): string =>
    gpoRef === 1 ? codigoBase : `${codigoBase}_${String(gpoRef).padStart(2, "0")}`;

interface PatronGridProps {
    patron: string[];
    titulo?: string;
}
const PatronGrid = ({ patron, titulo }: PatronGridProps) => {
    const semanas = Math.max(1, Math.floor(patron.length / 7));
    return (
        <div className="space-y-1">
            {titulo && <div className="text-xs font-medium text-continental-gray-1">{titulo}</div>}
            <div
                className="grid gap-1 text-xs font-mono w-full"
                style={{ gridTemplateColumns: "auto repeat(7, minmax(2.25rem, 1fr))" }}
            >
                <div />
                {DIAS_SEMANA.map((d) => (
                    <div key={`hdr-${d}`} className="text-center text-[10px] text-continental-gray-1">
                        {d}
                    </div>
                ))}
                {Array.from({ length: semanas }).map((_, sem) => (
                    <FragmentRow key={`sem-${sem}`} sem={sem} patron={patron} />
                ))}
            </div>
        </div>
    );
};

const FragmentRow = ({ sem, patron }: { sem: number; patron: string[] }) => (
    <>
        <div className="text-[10px] text-continental-gray-1 self-center pr-1">S{sem + 1}</div>
        {Array.from({ length: 7 }).map((_, dow) => {
            const idx = sem * 7 + dow;
            const t = patron[idx] ?? "";
            return (
                <div
                    key={`c-${sem}-${dow}`}
                    title={`Semana ${sem + 1} - ${DIAS_SEMANA[dow]}: ${turnoEtiqueta(t)}`}
                    className={`text-center py-1 rounded ${turnoColor(t)}`}
                >
                    {t}
                </div>
            );
        })}
    </>
);

interface SubGruposDerivadosProps {
    regla: ReglaTurno;
}
const SubGruposDerivados = ({ regla }: SubGruposDerivadosProps) => {
    const numGrupos = Math.max(1, Math.floor(regla.patron.length / 7));
    if (numGrupos === 1) {
        return (
            <div className="space-y-2">
                <div className="text-xs font-mono text-continental-gray-1">{regla.codigo}</div>
                <PatronGrid patron={regla.patron} />
            </div>
        );
    }
    return (
        <div className="space-y-4">
            <p className="text-[11px] text-continental-gray-1 -mt-1">
                Esta regla tiene {numGrupos} sub-grupos derivados (mismo patrón base con offset (n−1)×7).
            </p>
            {Array.from({ length: numGrupos }).map((_, i) => {
                const gpoRef = i + 1;
                const subPatron = crearRolLocal(regla.patron, gpoRef);
                return (
                    <div key={gpoRef} className="border-l-2 border-continental-yellow/60 pl-3 space-y-1">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-semibold">
                                {nombreSubGrupo(regla.codigo, gpoRef)}
                            </span>
                            <Badge variant="outline" className="text-[10px] font-mono">
                                Grupo {gpoRef}
                            </Badge>
                            <span className="text-[10px] text-continental-gray-1">
                                offset {((gpoRef - 1) * 7) % regla.patron.length}
                            </span>
                        </div>
                        <PatronGrid patron={subPatron} />
                    </div>
                );
            })}
        </div>
    );
};

interface EditorPatronProps {
    regla: ReglaTurno;
    onClose: () => void;
    onSaved: (updated: ReglaTurno) => void;
}
const EditorPatron = ({ regla, onClose, onSaved }: EditorPatronProps) => {
    const [patron, setPatron] = useState<string[]>(regla.patron);
    const [notas, setNotas] = useState(regla.notas ?? "");
    const [saving, setSaving] = useState(false);

    const semanas = Math.max(1, Math.floor(patron.length / 7));
    const cambiarCelda = (idx: number, valor: string) => {
        const next = [...patron];
        next[idx] = valor.trim().toUpperCase();
        setPatron(next);
    };

    const handleSave = async () => {
        if (patron.length % 7 !== 0) {
            toast.error("La longitud del patrón debe ser múltiplo de 7");
            return;
        }
        if (patron.some(c => !c)) {
            toast.error("Todas las celdas deben tener un valor");
            return;
        }
        setSaving(true);
        try {
            const updated = await reglasTurnoService.actualizarPatron(regla.codigo, {
                patron,
                notas: notas || undefined,
            });
            toast.success(`Regla ${regla.codigo} actualizada`);
            onSaved(updated);
            onClose();
        } catch (err: any) {
            toast.error(err?.message ?? "Error al actualizar la regla");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
                <div className="p-4 border-b">
                    <h3 className="text-lg font-semibold">Editar patrón — {regla.codigo}</h3>
                    <p className="text-xs text-continental-gray-1 mt-1">
                        Cada celda acepta <code className="bg-gray-100 px-1 rounded">1</code>, <code className="bg-gray-100 px-1 rounded">2</code>,{" "}
                        <code className="bg-gray-100 px-1 rounded">3</code> o <code className="bg-gray-100 px-1 rounded">D</code>.
                        Para rotar todo 7 días, usa el botón "Recorrer 7 días" en la lista.
                    </p>
                </div>
                <div className="p-4 space-y-4">
                    <div className="grid gap-1 text-xs font-mono" style={{ gridTemplateColumns: "auto repeat(7, minmax(2.5rem, 1fr))" }}>
                        <div />
                        {DIAS_SEMANA.map((d) => (
                            <div key={`eh-${d}`} className="text-center text-[10px] text-continental-gray-1">
                                {d}
                            </div>
                        ))}
                        {Array.from({ length: semanas }).map((_, sem) => (
                            <FragmentRowEditor key={`er-${sem}`} sem={sem} patron={patron} onChange={cambiarCelda} />
                        ))}
                    </div>
                    <div>
                        <Label htmlFor="notas-regla">Notas (opcional)</Label>
                        <Textarea
                            id="notas-regla"
                            value={notas}
                            onChange={(e) => setNotas(e.target.value)}
                            placeholder="Ej. Rotación de Semana Santa 2026"
                            className="mt-1"
                        />
                    </div>
                </div>
                <div className="p-4 border-t flex justify-end gap-2">
                    <Button variant="outline" onClick={onClose} disabled={saving}>
                        Cancelar
                    </Button>
                    <Button onClick={handleSave} disabled={saving}>
                        {saving && <Loader2 className="size-4 mr-1 animate-spin" />}
                        Guardar
                    </Button>
                </div>
            </div>
        </div>
    );
};

const FragmentRowEditor = ({
    sem, patron, onChange,
}: { sem: number; patron: string[]; onChange: (idx: number, val: string) => void }) => (
    <>
        <div className="text-[10px] text-continental-gray-1 self-center pr-1">S{sem + 1}</div>
        {Array.from({ length: 7 }).map((_, dow) => {
            const idx = sem * 7 + dow;
            const t = patron[idx] ?? "";
            return (
                <input
                    key={`ec-${sem}-${dow}`}
                    value={t}
                    onChange={(e) => onChange(idx, e.target.value)}
                    maxLength={2}
                    className={`text-center py-1 rounded font-mono uppercase outline-none ${turnoColor(t)} focus:ring-2 focus:ring-continental-yellow`}
                />
            );
        })}
    </>
);

export const ReglasTurnos = () => {
    const [reglas, setReglas] = useState<ReglaTurno[]>([]);
    const [loading, setLoading] = useState(true);
    const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());
    const [editando, setEditando] = useState<ReglaTurno | null>(null);
    const [asignando, setAsignando] = useState<ReglaTurno | null>(null);
    const [confirmRotar, setConfirmRotar] = useState<{ codigos: string[]; dias: number } | null>(null);
    const [rotating, setRotating] = useState(false);
    const [filtroEstado, setFiltroEstado] = useState<'todas' | 'activas' | 'pendientes'>('todas');

    const cargar = async () => {
        setLoading(true);
        try {
            const data = await reglasTurnoService.getAll();
            setReglas(data);
        } catch (err: any) {
            toast.error(err?.message ?? "Error al cargar reglas");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        cargar();
    }, []);

    const toggleSel = (codigo: string) => {
        setSeleccionadas(prev => {
            const next = new Set(prev);
            if (next.has(codigo)) next.delete(codigo);
            else next.add(codigo);
            return next;
        });
    };

    const toggleSelTodas = () => {
        if (seleccionadas.size === reglas.length) {
            setSeleccionadas(new Set());
        } else {
            setSeleccionadas(new Set(reglas.map(r => r.codigo)));
        }
    };

    const ejecutarRotacion = async () => {
        if (!confirmRotar) return;
        setRotating(true);
        try {
            const afectadas = await reglasTurnoService.rotar({
                codigos: confirmRotar.codigos,
                dias: confirmRotar.dias,
            });
            toast.success(`${afectadas.length} regla(s) rotada(s) ${confirmRotar.dias} día(s)`);
            // Refrescar (las afectadas vienen actualizadas, pero pedimos all por simplicidad)
            await cargar();
            setSeleccionadas(new Set());
            setConfirmRotar(null);
        } catch (err: any) {
            toast.error(err?.message ?? "Error al rotar reglas");
        } finally {
            setRotating(false);
        }
    };

    const previewRotacion = useMemo(() => {
        if (!confirmRotar) return [];
        return reglas
            .filter(r => confirmRotar.codigos.includes(r.codigo))
            .map(r => ({
                codigo: r.codigo,
                patron: r.patron,
            }));
    }, [confirmRotar, reglas]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="size-6 animate-spin text-continental-gray-1" />
            </div>
        );
    }

    const totalSeleccionadas = seleccionadas.size;
    const pendientesCount = reglas.filter(r => r.estado === 'PendienteConfiguracion').length;
    const reglasFiltradas = reglas.filter(r => {
        if (filtroEstado === 'activas') return r.estado !== 'PendienteConfiguracion';
        if (filtroEstado === 'pendientes') return r.estado === 'PendienteConfiguracion';
        return true;
    });

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-4">
            {pendientesCount > 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-start gap-2">
                    <AlertTriangle className="size-4 mt-0.5 shrink-0" />
                    <div>
                        <strong>{pendientesCount}</strong> regla{pendientesCount === 1 ? "" : "s"} llegó del Excel de SAP
                        y aún no tiene patrón capturado. Filtra por <em>Pendientes</em> abajo, pulsa el ícono
                        <Pencil className="inline size-3 mx-0.5" />
                        para capturar el patrón y quedará dada de alta automáticamente (estado <strong>Activa</strong>).
                    </div>
                </div>
            )}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Reglas de turnos</h1>
                    <p className="text-sm text-continental-gray-1 mt-1">
                        Recorrer el patrón de las reglas cuando rotan los turnos (Enero, Semana Santa, fin de año).
                        Cada sub-grupo conserva su etiqueta (R0144, R0144_02, …); con <strong>7 días positivos</strong> la semana
                        se adelanta: cada sub-grupo pasa a ver el horario que antes tenía el sub-grupo siguiente del ciclo.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={cargar}>
                        <RotateCcw className="size-4 mr-1" /> Refrescar
                    </Button>
                    <Button
                        onClick={() => setConfirmRotar({ codigos: Array.from(seleccionadas), dias: 7 })}
                        disabled={totalSeleccionadas === 0}
                    >
                        <Repeat className="size-4 mr-1" />
                        Recorrer 7 días en {totalSeleccionadas} seleccionada{totalSeleccionadas === 1 ? "" : "s"}
                    </Button>
                </div>
            </div>

            <div className="flex items-center gap-3 px-1 flex-wrap">
                <div className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        checked={totalSeleccionadas === reglasFiltradas.length && reglasFiltradas.length > 0}
                        onChange={() => {
                            if (totalSeleccionadas === reglasFiltradas.length) setSeleccionadas(new Set());
                            else setSeleccionadas(new Set(reglasFiltradas.map(r => r.codigo)));
                        }}
                        className="size-4"
                        id="sel-todas"
                    />
                    <label htmlFor="sel-todas" className="text-sm cursor-pointer">
                        Seleccionar visibles ({reglasFiltradas.length})
                    </label>
                </div>
                <div className="flex gap-1 ml-auto">
                    {(['todas', 'activas', 'pendientes'] as const).map(f => (
                        <button
                            key={f}
                            onClick={() => setFiltroEstado(f)}
                            className={[
                                'px-3 py-1 rounded-full text-xs font-medium transition-colors capitalize',
                                filtroEstado === f
                                    ? 'bg-continental-yellow text-black'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                            ].join(' ')}
                        >
                            {f}
                            {f === 'pendientes' && pendientesCount > 0 && (
                                <span className="ml-1 bg-amber-500 text-white rounded-full px-1.5 py-0.5 text-[10px]">
                                    {pendientesCount}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {reglasFiltradas.map((regla) => (
                    <Card key={regla.codigo} className="overflow-hidden">
                        <CardHeader className="pb-3">
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={seleccionadas.has(regla.codigo)}
                                        onChange={() => toggleSel(regla.codigo)}
                                        className="size-4"
                                    />
                                    <CardTitle className="text-base font-mono">{regla.codigo}</CardTitle>
                                    <Badge variant="outline" className="font-mono text-xs">
                                        {regla.patron.length} días / {Math.floor(regla.patron.length / 7)} sem
                                    </Badge>
                                    {regla.estado === 'PendienteConfiguracion' && (
                                        <Badge className="bg-amber-500 text-white text-[10px] uppercase tracking-wide">
                                            Pendiente
                                        </Badge>
                                    )}
                                </div>
                                <div className="flex gap-1">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => setEditando(regla)}
                                        title="Editar patrón manualmente"
                                    >
                                        <Pencil className="size-3.5" />
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => setAsignando(regla)}
                                        title="Asignar a un área (crear grupos)"
                                        className="border-blue-400 text-blue-700 hover:bg-blue-50"
                                    >
                                        <Building2 className="size-3.5" />
                                    </Button>
                                    <Button
                                        size="sm"
                                        onClick={() =>
                                            setConfirmRotar({ codigos: [regla.codigo], dias: 7 })
                                        }
                                        disabled={regla.estado === 'PendienteConfiguracion'}
                                    >
                                        <Repeat className="size-3.5 mr-1" />
                                        Recorrer 7
                                    </Button>
                                </div>
                            </div>
                            <div className="text-[11px] text-continental-gray-1 flex flex-wrap gap-x-3 gap-y-0.5">
                                <span>
                                    Fecha ref: <strong>{new Date(regla.fechaReferencia).toLocaleDateString("es-MX")}</strong>
                                </span>
                                <span>
                                    Última rotación:{" "}
                                    <strong>{formatFecha(regla.ultimaRotacion)}</strong>
                                    {regla.ultimoUsuarioRotacionNombre && ` por ${regla.ultimoUsuarioRotacionNombre}`}
                                </span>
                                {regla.diasRotadosAcumulado !== 0 && (
                                    <span>
                                        Acumulado: <strong>{regla.diasRotadosAcumulado} días</strong>
                                    </span>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent>
                            <SubGruposDerivados regla={regla} />
                        </CardContent>
                    </Card>
                ))}
            </div>

            {editando && (
                <EditorPatron
                    regla={editando}
                    onClose={() => setEditando(null)}
                    onSaved={(updated) =>
                        setReglas((prev) =>
                            prev.map(r => r.codigo === updated.codigo ? updated : r)
                        )
                    }
                />
            )}

            {asignando && (
                <AsignarReglaAAreaModal
                    regla={asignando}
                    onClose={() => setAsignando(null)}
                    onAsignada={(updated) => {
                        setReglas(prev => prev.map(r => r.codigo === updated.codigo ? { ...r, estado: updated.estado } : r));
                    }}
                />
            )}

            <AlertDialog
                open={!!confirmRotar}
                onOpenChange={(open) => !open && !rotating && setConfirmRotar(null)}
            >
                <AlertDialogContent className="max-w-[95vw] sm:max-w-[90vw] lg:max-w-6xl max-h-[90vh] overflow-y-auto">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="size-5 text-amber-500" />
                            Confirmar recorrido de {confirmRotar?.codigos.length} regla(s)
                        </AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="space-y-3">
                                <p>
                                    Cada sub-grupo se queda con su etiqueta actual (R0144, R0144_02, …).
                                    El patrón se desliza <strong>{confirmRotar?.dias ?? 0} día(s)</strong>: la semana se adelanta,
                                    cada sub-grupo pasa a ver el horario que antes tenía el sub-grupo siguiente del ciclo.
                                </p>
                                <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-2">
                                    {previewRotacion.map(p => {
                                        const numGrupos = Math.max(1, Math.floor(p.patron.length / 7));
                                        const patronRotado = rotarPatronLocal(p.patron, confirmRotar?.dias ?? 0);
                                        return (
                                            <div key={p.codigo} className="border rounded p-3">
                                                <div className="font-mono text-sm font-semibold mb-2">{p.codigo}</div>
                                                <div className="text-[11px] text-continental-gray-1 mb-2">
                                                    Horario por sub-grupo (antes → después):
                                                </div>
                                                <div className="space-y-3">
                                                    {Array.from({ length: numGrupos }).map((_, i) => {
                                                        const gpoRef = i + 1;
                                                        return (
                                                            <div key={gpoRef} className="border-l-2 border-continental-yellow/60 pl-3 space-y-1">
                                                                <div className="text-xs font-mono font-semibold">
                                                                    {nombreSubGrupo(p.codigo, gpoRef)}
                                                                </div>
                                                                <PatronGrid patron={crearRolLocal(p.patron, gpoRef)} titulo="Antes" />
                                                                <PatronGrid patron={crearRolLocal(patronRotado, gpoRef)} titulo="Después" />
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={rotating}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => {
                                e.preventDefault();
                                ejecutarRotacion();
                            }}
                            disabled={rotating}
                        >
                            {rotating && <Loader2 className="size-4 mr-1 animate-spin" />}
                            Confirmar rotación
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

export default ReglasTurnos;
