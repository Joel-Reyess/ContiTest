import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Building2, Loader2, Plus, RotateCcw } from "lucide-react";
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
import { areasService } from "@/services/areasService";
import type { ReglaTurno } from "@/interfaces/Api.interface";
import type { Area, Grupo } from "@/interfaces/Areas.interface";

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
 * Extrae la "base" de un código: R0267_04 → R0267, R0267 → R0267.
 * Toda regla con la misma base pertenece a la misma familia.
 */
const extraerBase = (code: string): string => {
    const c = code.trim().toUpperCase();
    const m = c.match(/^([A-Z0-9-]+?)(?:_\d+)?$/);
    return m ? m[1] : c;
};

/**
 * Alta manual de una regla desde SuperUsuario (task #85 / #89).
 * Muestra vista previa de reglas hermanas de la misma familia (por prefijo del
 * código) con sus patrones y áreas donde ya están asignadas. Permite además
 * asignar la nueva regla a un área en el mismo paso (crear + asignar).
 */
export function CrearReglaModal({ onClose, onCreada }: Props) {
    const [codigo, setCodigo] = useState("");
    const [semanas, setSemanas] = useState<number>(4);
    const [patron, setPatron] = useState<string[]>(() => Array.from({ length: 4 * 7 }, () => "D"));
    const [notas, setNotas] = useState("");
    const [saving, setSaving] = useState(false);

    const [reglasTodas, setReglasTodas] = useState<ReglaTurno[]>([]);
    const [gruposTodos, setGruposTodos] = useState<Grupo[]>([]);
    const [areasTodas, setAreasTodas] = useState<Area[]>([]);
    const [loadingContexto, setLoadingContexto] = useState(true);

    const [asignarAhora, setAsignarAhora] = useState(false);
    const [areaIdsAsig, setAreaIdsAsig] = useState<number[]>([]);
    const [filtroArea, setFiltroArea] = useState("");
    const [cantSubGrupos, setCantSubGrupos] = useState<number>(1);

    // Carga en paralelo: reglas + grupos + áreas para poder mostrar la familia.
    useEffect(() => {
        let cancel = false;
        setLoadingContexto(true);
        Promise.all([
            reglasTurnoService.getAll().catch(() => [] as ReglaTurno[]),
            areasService.getGroups().catch(() => [] as Grupo[]),
            areasService.getAreas().catch(() => [] as Area[]),
        ])
            .then(([rs, gs, as]) => {
                if (cancel) return;
                setReglasTodas(rs || []);
                setGruposTodos(gs || []);
                setAreasTodas(as || []);
            })
            .finally(() => { if (!cancel) setLoadingContexto(false); });
        return () => { cancel = true; };
    }, []);

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

    const areasById = useMemo(
        () => new Map(areasTodas.map(a => [a.areaId, a])),
        [areasTodas]
    );

    const baseCodigo = useMemo(() => extraerBase(codigo), [codigo]);
    const codigoUp = useMemo(() => codigo.trim().toUpperCase(), [codigo]);

    /**
     * Reglas de la misma familia: comparten base. Excluye la que se está
     * capturando ahora. Para cada hermana busca en Grupos las áreas donde ya
     * está asignada (uno o varias, ya que puede existir el mismo código en
     * distintas áreas si históricamente se replicó).
     */
    const familia = useMemo(() => {
        if (!baseCodigo || baseCodigo.length < 2) return [];
        return reglasTodas
            .filter(r =>
                (r.codigo === baseCodigo || r.codigo.startsWith(baseCodigo + "_"))
                && r.codigo !== codigoUp
            )
            .map(r => {
                const gs = gruposTodos.filter(g =>
                    g.rol === r.codigo || g.rol.startsWith(r.codigo + "_")
                );
                const areas = Array.from(new Set(
                    gs.map(g => areasById.get(g.areaId)?.nombreGeneral)
                      .filter((n): n is string => !!n)
                ));
                return { regla: r, areas };
            })
            .sort((a, b) => a.regla.codigo.localeCompare(b.regla.codigo));
    }, [baseCodigo, codigoUp, reglasTodas, gruposTodos, areasById]);

    /**
     * Sugerencia inicial: si activaste "asignar ahora" y aún no eliges áreas,
     * preseleccionamos las que ya usan reglas hermanas de la misma familia.
     */
    useEffect(() => {
        if (asignarAhora && areaIdsAsig.length === 0 && familia.length > 0) {
            const nombresSugeridos = Array.from(new Set(familia.flatMap(f => f.areas)));
            const ids = areasTodas
                .filter(a => nombresSugeridos.includes(a.nombreGeneral))
                .map(a => a.areaId);
            if (ids.length > 0) setAreaIdsAsig(ids);
        }
    }, [asignarAhora, familia, areasTodas, areaIdsAsig.length]);

    const toggleArea = (areaId: number) => {
        setAreaIdsAsig(prev =>
            prev.includes(areaId) ? prev.filter(id => id !== areaId) : [...prev, areaId]
        );
    };

    const areasFiltradas = useMemo(() => {
        const q = filtroArea.trim().toLowerCase();
        if (!q) return areasTodas;
        return areasTodas.filter(a =>
            (a.nombreGeneral || "").toLowerCase().includes(q) ||
            (a.unidadOrganizativaSap || "").toLowerCase().includes(q)
        );
    }, [areasTodas, filtroArea]);

    // Al cambiar semanas mantenemos cantSubGrupos en rango válido.
    useEffect(() => {
        if (cantSubGrupos > semanas) setCantSubGrupos(semanas);
    }, [semanas, cantSubGrupos]);

    const nombresSubGrupos = useMemo(() => {
        const arr: string[] = [];
        for (let i = 1; i <= cantSubGrupos; i++) {
            arr.push(i === 1 ? codigoUp : `${codigoUp}_${String(i).padStart(2, "0")}`);
        }
        return arr;
    }, [cantSubGrupos, codigoUp]);

    const handleSubmit = async () => {
        if (!codigoValido) {
            toast.error("El código debe ser alfanumérico (letras, dígitos, guion/guion bajo), máx. 20 caracteres.");
            return;
        }
        if (!patronValido) {
            toast.error("El patrón debe estar completo (múltiplo de 7 y sin celdas vacías).");
            return;
        }
        if (asignarAhora && areaIdsAsig.length === 0) {
            toast.error("Selecciona al menos un área destino o desactiva la asignación en línea.");
            return;
        }
        if (asignarAhora && (cantSubGrupos < 1 || cantSubGrupos > semanas)) {
            toast.error(`La cantidad de sub-grupos debe estar entre 1 y ${semanas}.`);
            return;
        }
        setSaving(true);
        try {
            const nueva = await reglasTurnoService.crear({
                codigo: codigoUp,
                patron: patron.map(c => c.trim().toUpperCase()),
                notas: notas.trim() || undefined,
            });

            if (asignarAhora && areaIdsAsig.length > 0) {
                const ok: string[] = [];
                const fail: { area: string; msg: string }[] = [];
                for (const areaId of areaIdsAsig) {
                    const nombre = areasById.get(areaId)?.nombreGeneral ?? `Área ${areaId}`;
                    try {
                        await reglasTurnoService.asignarAArea(nueva.codigo, {
                            areaId,
                            cantidadSubGrupos: cantSubGrupos,
                        });
                        ok.push(nombre);
                    } catch (e: any) {
                        fail.push({ area: nombre, msg: e?.message ?? "Error desconocido" });
                    }
                }
                if (ok.length > 0) {
                    toast.success(
                        `Regla ${nueva.codigo} creada y asignada a ${ok.length} área${ok.length === 1 ? "" : "s"} (${cantSubGrupos} sub-grupo${cantSubGrupos === 1 ? "" : "s"} c/u): ${ok.join(", ")}`
                    );
                }
                if (fail.length > 0) {
                    toast.error(
                        `No se pudo asignar en ${fail.length}: ${fail.map(f => `${f.area} (${f.msg})`).join(" · ")}`
                    );
                }
            } else {
                toast.success(`Regla ${nueva.codigo} creada (${nueva.estado})`);
            }
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
            <AlertDialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
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
                                <strong> Activa</strong>. Puedes asignarla al área en el mismo paso.
                            </p>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <Label className="text-xs">Código de la regla</Label>
                                    <input
                                        type="text"
                                        value={codigo}
                                        onChange={(e) => setCodigo(e.target.value)}
                                        maxLength={20}
                                        placeholder="Ej. R0144 o R0267_04"
                                        className="w-full border rounded px-2 py-2 text-sm font-mono uppercase"
                                    />
                                    {!codigoValido && codigo.length > 0 && (
                                        <div className="mt-1 text-[11px] text-red-600">
                                            Solo letras, dígitos, guion o guion bajo. Máx. 20.
                                        </div>
                                    )}
                                    {baseCodigo && baseCodigo !== codigoUp && (
                                        <div className="mt-1 text-[11px] text-continental-gray-1">
                                            Familia detectada: <span className="font-mono">{baseCodigo}</span>
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

                            {/* --- Vista previa de familia (task #89) --- */}
                            {codigo.length >= 2 && (
                                <div className="rounded-lg border border-continental-gray-3 bg-continental-gray-4/20 p-3">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="text-xs font-semibold">
                                            Reglas relacionadas (familia <span className="font-mono">{baseCodigo || "?"}</span>)
                                        </div>
                                        {loadingContexto && <Loader2 className="size-3 animate-spin text-continental-gray-1" />}
                                    </div>
                                    {loadingContexto ? (
                                        <div className="text-[11px] text-continental-gray-1">Cargando contexto…</div>
                                    ) : familia.length === 0 ? (
                                        <div className="text-[11px] text-continental-gray-1">
                                            No hay otras reglas registradas con esta base. Estás creando la primera de la familia.
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {familia.map(({ regla, areas }) => {
                                                const semanasR = Math.floor(regla.patron.length / 7);
                                                return (
                                                    <div key={regla.codigo} className="bg-white rounded border border-continental-gray-3 p-2">
                                                        <div className="flex items-center justify-between gap-2 mb-1 text-[11px]">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-mono font-semibold">{regla.codigo}</span>
                                                                <span className="text-continental-gray-1">
                                                                    {semanasR} sem · {regla.estado}
                                                                </span>
                                                            </div>
                                                            <div className="text-continental-gray-1">
                                                                {areas.length === 0
                                                                    ? "sin área asignada"
                                                                    : <>Área: <span className="font-medium text-continental-black">{areas.join(", ")}</span></>}
                                                            </div>
                                                        </div>
                                                        {regla.patron.length > 0 && (
                                                            <div className="overflow-x-auto">
                                                                <table className="text-[10px] font-mono">
                                                                    <thead>
                                                                        <tr>
                                                                            <th className="text-left pr-2 pb-0.5">S</th>
                                                                            {HEADERS_DIA.map(h => (
                                                                                <th key={h} className="px-1 pb-0.5 text-center">{h}</th>
                                                                            ))}
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {Array.from({ length: semanasR }).map((_, sg) => (
                                                                            <tr key={sg}>
                                                                                <td className="pr-2 py-0 text-continental-gray-1">S{sg + 1}</td>
                                                                                {HEADERS_DIA.map((_, d) => {
                                                                                    const v = regla.patron[sg * 7 + d] ?? "";
                                                                                    return (
                                                                                        <td key={d}
                                                                                            className={`px-1 py-0.5 text-center border ${turnoColor(v)}`}
                                                                                        >
                                                                                            {v}
                                                                                        </td>
                                                                                    );
                                                                                })}
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}

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
                                                        {sg === 0 ? (codigoUp || "—") : `${codigoUp || "—"}_${String(sg + 1).padStart(2, "0")}`}
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

                            {/* --- Asignar a área en línea (task #89) --- */}
                            <div className="rounded-lg border border-continental-gray-3 p-3">
                                <label className="flex items-center gap-2 cursor-pointer text-sm">
                                    <input
                                        type="checkbox"
                                        checked={asignarAhora}
                                        onChange={(e) => setAsignarAhora(e.target.checked)}
                                        className="size-4"
                                    />
                                    <Building2 className="size-4 text-continental-yellow" />
                                    <span className="font-medium">Asignar a un área ahora</span>
                                    <span className="text-[11px] text-continental-gray-1">
                                        (crea los sub-grupos en el área en el mismo paso)
                                    </span>
                                </label>

                                {asignarAhora && (
                                    <div className="mt-3 space-y-3">
                                        <div>
                                            <div className="flex items-center justify-between mb-1">
                                                <Label className="text-xs">
                                                    Áreas destino{" "}
                                                    <span className="text-continental-gray-1">
                                                        ({areaIdsAsig.length} seleccionada{areaIdsAsig.length === 1 ? "" : "s"})
                                                    </span>
                                                </Label>
                                                <div className="flex items-center gap-2 text-[11px]">
                                                    <button
                                                        type="button"
                                                        onClick={() => setAreaIdsAsig(areasFiltradas.map(a => a.areaId))}
                                                        className="px-2 py-0.5 border rounded hover:bg-continental-gray-4"
                                                        disabled={loadingContexto || areasFiltradas.length === 0}
                                                    >
                                                        Seleccionar todas
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setAreaIdsAsig([])}
                                                        className="px-2 py-0.5 border rounded hover:bg-continental-gray-4"
                                                        disabled={areaIdsAsig.length === 0}
                                                    >
                                                        Limpiar
                                                    </button>
                                                </div>
                                            </div>
                                            <input
                                                type="text"
                                                value={filtroArea}
                                                onChange={(e) => setFiltroArea(e.target.value)}
                                                placeholder="Filtrar por nombre o unidad SAP…"
                                                className="w-full border rounded px-2 py-1.5 text-sm mb-1"
                                                disabled={loadingContexto}
                                            />
                                            <div className="max-h-48 overflow-y-auto border rounded bg-white divide-y">
                                                {loadingContexto ? (
                                                    <div className="px-2 py-3 text-[11px] text-continental-gray-1">Cargando áreas…</div>
                                                ) : areasFiltradas.length === 0 ? (
                                                    <div className="px-2 py-3 text-[11px] text-continental-gray-1">Sin resultados.</div>
                                                ) : (
                                                    areasFiltradas.map(a => {
                                                        const checked = areaIdsAsig.includes(a.areaId);
                                                        return (
                                                            <label
                                                                key={a.areaId}
                                                                className={`flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer hover:bg-continental-gray-4/40 ${checked ? "bg-continental-yellow/10" : ""}`}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={checked}
                                                                    onChange={() => toggleArea(a.areaId)}
                                                                    className="size-4"
                                                                />
                                                                <span className="flex-1">{a.nombreGeneral}</span>
                                                                <span className="text-[11px] text-continental-gray-1 font-mono">
                                                                    {a.unidadOrganizativaSap}
                                                                </span>
                                                            </label>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        </div>

                                        <div>
                                            <Label className="text-xs">
                                                Cantidad de sub-grupos por área <span className="text-continental-gray-1">(máx. {semanas})</span>
                                            </Label>
                                            <input
                                                type="number"
                                                value={cantSubGrupos}
                                                min={1}
                                                max={semanas}
                                                onChange={(e) => setCantSubGrupos(Math.max(1, Math.min(semanas, Number(e.target.value) || 1)))}
                                                className="w-full border rounded px-2 py-2 text-sm"
                                            />
                                            <div className="mt-1 text-[11px] text-continental-gray-1">
                                                Se crearán por cada área: <span className="font-mono">{nombresSubGrupos.join(", ") || "—"}</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={(e) => { e.preventDefault(); handleSubmit(); }}
                        disabled={saving || !codigoValido || !patronValido || (asignarAhora && areaIdsAsig.length === 0)}
                    >
                        {saving ? (
                            <><Loader2 className="size-4 animate-spin mr-1" /> Guardando…</>
                        ) : asignarAhora ? (
                            <>Crear y asignar</>
                        ) : (
                            <>Crear regla</>
                        )}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
