import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
    CalendarClock, Loader2, PlayCircle, X, RotateCcw, Pencil,
    CheckCircle2, Circle, AlertTriangle, Eye, EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { reglasTurnoService } from "@/services/reglasTurnoService";
import type { ReglaTurno, RotacionProgramada, EstadoRotacionProgramada } from "@/interfaces/Api.interface";
import { AgendarRotacionModal } from "./AgendarRotacionModal";
import { SubGruposDerivados } from "./ReglasTurnos";

/**
 * Fechas de arranque por regla — misma lectura que la pestaña "Reglas de
 * turnos": una tarjeta por regla con su patrón y sus sub-grupos, y en cada
 * una la fecha en la que arranca ese patrón para el año elegido. También se
 * pueden seleccionar varias reglas y agendarles el mismo arranque de una vez
 * (el caso típico: todas arrancan el primer lunes de enero y otra vez en
 * Semana Santa).
 *
 * El arranque usa el patrón VIGENTE de la regla tal como se ve en la tarjeta.
 * Si para un arranque concreto el patrón debe ser distinto, "Editar patrón…"
 * abre el modo avanzado (el modal de siempre) ya posicionado en esa regla.
 *
 * Antes esto era sólo un modal: una regla a la vez, mini-calendario y patrón
 * editable, y sin ver qué reglas ya tenían arranque y cuáles no. Con 30+
 * reglas no se sabía por dónde ibas.
 */

const badgeClasses: Record<EstadoRotacionProgramada, string> = {
    Pendiente: "bg-blue-100 text-blue-800 border-blue-200",
    Ejecutada: "bg-emerald-100 text-emerald-800 border-emerald-200",
    Cancelada: "bg-continental-gray-4 text-continental-gray-1 border-continental-gray-3",
    Fallida: "bg-red-100 text-red-800 border-red-200",
};

function hoyIso(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDate(iso: string): string {
    if (!iso) return "";
    const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
    return d.toLocaleDateString("es-MX", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}

type Filtro = "todas" | "sinArranque" | "conArranque" | "pendientes";

interface Props {
    /** Año sobre el que se trabaja al abrir (por omisión: el año en curso). */
    anioInicial?: number;
}

export function RotacionesProgramadasPanel({ anioInicial }: Props) {
    const anioActual = new Date().getFullYear();
    const [anio, setAnio] = useState<number>(anioInicial ?? anioActual);
    const [reglas, setReglas] = useState<ReglaTurno[]>([]);
    const [items, setItems] = useState<RotacionProgramada[]>([]);
    const [loading, setLoading] = useState(true);
    const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());
    const [filtro, setFiltro] = useState<Filtro>("todas");
    const [mostrarPatrones, setMostrarPatrones] = useState(true);
    const [fechaLote, setFechaLote] = useState<string>("");
    const [notasLote, setNotasLote] = useState<string>("");
    const [fechaPorRegla, setFechaPorRegla] = useState<Record<string, string>>({});
    const [agendando, setAgendando] = useState<string | null>(null); // codigo o "__lote__"
    const [cancelando, setCancelando] = useState<number | null>(null);
    const [aplicando, setAplicando] = useState(false);
    const [modalAvanzado, setModalAvanzado] = useState<{ codigo?: string } | null>(null);

    const minIso = hoyIso();

    const load = async () => {
        setLoading(true);
        try {
            const [rs, rows] = await Promise.all([
                reglasTurnoService.getAll(),
                // Todo el historial: el filtro por año se hace aquí para poder
                // cambiar de año sin volver a pedir.
                reglasTurnoService.listarRotacionesProgramadas(),
            ]);
            setReglas([...(rs || [])].sort((a, b) => a.codigo.localeCompare(b.codigo)));
            setItems(rows);
        } catch (e: any) {
            toast.error(e?.message ?? "Error al cargar reglas y arranques");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    // El año preparado llega cuando carga la configuración; si cambia, la
    // vista se mueve a ese año (el usuario siempre puede cambiarlo a mano).
    useEffect(() => {
        if (anioInicial) setAnio(anioInicial);
    }, [anioInicial]);

    // Arranques (con patrón) del año elegido, por regla. Las rotaciones legacy
    // (N días, sin patrón) siguen visibles en el historial de abajo.
    const arranquesPorRegla = useMemo(() => {
        const map = new Map<string, RotacionProgramada[]>();
        for (const r of items) {
            if (r.fechaEjecucion.slice(0, 4) !== String(anio)) continue;
            if (!r.patronBaseline || r.patronBaseline.length === 0) continue;
            if (r.estado === "Cancelada") continue;
            const arr = map.get(r.codigoRegla) ?? [];
            arr.push(r);
            map.set(r.codigoRegla, arr);
        }
        for (const arr of map.values()) arr.sort((a, b) => a.fechaEjecucion.localeCompare(b.fechaEjecucion));
        return map;
    }, [items, anio]);

    const reglasFiltradas = useMemo(() => reglas.filter(r => {
        const tiene = (arranquesPorRegla.get(r.codigo)?.length ?? 0) > 0;
        if (filtro === "sinArranque") return !tiene;
        if (filtro === "conArranque") return tiene;
        if (filtro === "pendientes") return r.estado === "PendienteConfiguracion";
        return true;
    }), [reglas, filtro, arranquesPorRegla]);

    const totalConArranque = reglas.filter(r => (arranquesPorRegla.get(r.codigo)?.length ?? 0) > 0).length;
    const pendientesCount = reglas.filter(r => r.estado === "PendienteConfiguracion").length;

    const toggleSel = (codigo: string) => {
        setSeleccionadas(prev => {
            const next = new Set(prev);
            if (next.has(codigo)) next.delete(codigo); else next.add(codigo);
            return next;
        });
    };

    const fechaValida = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso) && iso >= minIso;

    /**
     * Agenda el arranque de una o varias reglas en la misma fecha, con el
     * patrón vigente de cada una. Una petición por regla (el endpoint es por
     * regla); se acumulan resultados y se informa todo junto.
     */
    const agendar = async (codigos: string[], fechaIso: string, notas: string, etiqueta: string) => {
        if (!fechaValida(fechaIso)) {
            toast.error("Elige una fecha de hoy en adelante.");
            return;
        }
        setAgendando(etiqueta);
        let creadas = 0;
        const omitidas: string[] = [];
        const sinPatron: string[] = [];
        const errores: string[] = [];
        try {
            for (const codigo of codigos) {
                const regla = reglas.find(r => r.codigo === codigo);
                if (!regla) continue;
                if (!regla.patron || regla.patron.length === 0 || regla.patron.length % 7 !== 0) {
                    sinPatron.push(codigo);
                    continue;
                }
                try {
                    const resp = await reglasTurnoService.agendarRotaciones({
                        codigoRegla: codigo,
                        fechas: [fechaIso],
                        patronBaseline: regla.patron.map(c => (c || "").trim().toUpperCase()),
                        notas: notas.trim() || undefined,
                    });
                    creadas += resp.creadas?.length ?? 0;
                    if (resp.omitidas?.length) omitidas.push(...resp.omitidas);
                } catch (e: any) {
                    errores.push(`${codigo}: ${e?.message ?? "error"}`);
                }
            }
            const partes: string[] = [];
            if (creadas) partes.push(`${creadas} arranque(s) agendado(s) el ${formatDate(fechaIso)}`);
            if (omitidas.length) partes.push(`${omitidas.length} omitido(s): ${omitidas.join(" • ")}`);
            if (sinPatron.length) partes.push(`${sinPatron.length} sin patrón capturado (${sinPatron.join(", ")}): captúralo primero en Reglas de turnos`);
            if (errores.length) partes.push(errores.join(" • "));
            if (creadas > 0 && errores.length === 0) toast.success(partes.join(". "));
            else if (creadas > 0) toast.warning(partes.join(". "));
            else toast.error(partes.join(". ") || "No se agendó ningún arranque.");
            if (creadas > 0) {
                await load();
                if (etiqueta === "__lote__") setSeleccionadas(new Set());
            }
        } finally {
            setAgendando(null);
        }
    };

    const handleCancelar = async (id: number) => {
        if (!confirm("¿Cancelar este arranque agendado?")) return;
        setCancelando(id);
        try {
            await reglasTurnoService.cancelarRotacionProgramada(id);
            toast.success("Arranque cancelado");
            await load();
        } catch (e: any) {
            toast.error(e?.message ?? "Error al cancelar");
        } finally {
            setCancelando(null);
        }
    };

    // Aplica los arranques cuya fecha ya llegó (hoy incluido). En producción lo
    // hace el proceso en segundo plano; en pruebas está apagado, así que sin
    // este botón no hay forma de comprobar que el arranque deja el rol como se
    // capturó.
    const handleAplicarPendientes = async () => {
        const vencidos = items.filter(
            i => i.estado === "Pendiente" && i.fechaEjecucion.slice(0, 10) <= hoyIso()
        );
        if (vencidos.length === 0) {
            toast.info("No hay arranques vencidos por aplicar (todos tienen fecha futura).");
            return;
        }
        if (!confirm(`Se aplicarán ${vencidos.length} arranque(s)/rotación(es) con fecha ya cumplida. ¿Continuar?`)) return;
        setAplicando(true);
        try {
            const ejecutadas = await reglasTurnoService.ejecutarRotacionesPendientes();
            toast.success(`${ejecutadas} movimiento(s) aplicado(s).`);
            await load();
        } catch (e: any) {
            toast.error(e?.message ?? "Error al aplicar los pendientes");
        } finally {
            setAplicando(false);
        }
    };

    const aniosDisponibles = useMemo(() => {
        const set = new Set<number>([anioActual - 1, anioActual, anioActual + 1, anioActual + 2, anio]);
        for (const r of items) set.add(Number(r.fechaEjecucion.slice(0, 4)));
        return Array.from(set).filter(n => !Number.isNaN(n)).sort((a, b) => a - b);
    }, [items, anioActual, anio]);

    const historial = useMemo(() => {
        const pend = items.filter(i => i.estado === "Pendiente");
        const otras = items.filter(i => i.estado !== "Pendiente");
        return [...pend, ...otras];
    }, [items]);

    const totalSeleccionadas = seleccionadas.size;
    const selVisiblesTodas = reglasFiltradas.length > 0 && reglasFiltradas.every(r => seleccionadas.has(r.codigo));

    return (
        <div className="mt-6 border border-continental-gray-3 rounded-lg bg-white">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-continental-gray-3 flex-wrap">
                <div className="flex items-center gap-2">
                    <CalendarClock className="size-5 text-continental-yellow" />
                    <h3 className="font-semibold text-continental-black">
                        Fechas de arranque por regla
                    </h3>
                    <span className="text-xs text-continental-gray-1">
                        (independiente de <em>Reglas de turnos</em>)
                    </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <Label htmlFor="anio-arranques" className="text-xs">Año</Label>
                    <select
                        id="anio-arranques"
                        value={anio}
                        onChange={(e) => setAnio(Number(e.target.value))}
                        className="border rounded px-2 py-1.5 text-sm"
                    >
                        {aniosDisponibles.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                    <Button variant="outline" size="sm" onClick={load} disabled={loading}>
                        <RotateCcw className="size-4 mr-1" /> Refrescar
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleAplicarPendientes}
                        disabled={aplicando || loading}
                        title="Aplica los arranques cuya fecha ya llegó (hoy incluido) sin esperar al proceso automático"
                    >
                        {aplicando ? <Loader2 className="size-4 animate-spin mr-1" /> : <PlayCircle className="size-4 mr-1" />}
                        Aplicar vencidos
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setModalAvanzado({})}
                        title="Modo avanzado: agendar con un patrón distinto al vigente, o varios arranques de una regla"
                    >
                        <Pencil className="size-4 mr-1" /> Modo avanzado
                    </Button>
                </div>
            </div>

            <div className="p-4 space-y-4">
                <p className="text-xs text-continental-gray-1">
                    En cada regla elige la fecha en la que arranca su patrón para {anio} (enero, Semana Santa, etc.)
                    y pulsa <strong>Agendar</strong>; o marca varias reglas y agéndales la misma fecha abajo.
                    Al llegar la fecha el patrón que ves en la tarjeta queda fijado como rol de esa regla.
                    No mueve empleados de grupo ni cambia SAP.
                </p>

                {!loading && reglas.length > 0 && (
                    <div className={`text-sm rounded-lg border px-3 py-2 flex items-center gap-2 ${
                        totalConArranque === reglas.length
                            ? "border-green-200 bg-green-50 text-green-800"
                            : "border-amber-200 bg-amber-50 text-amber-800"
                    }`}>
                        {totalConArranque === reglas.length
                            ? <CheckCircle2 className="size-4" />
                            : <AlertTriangle className="size-4" />}
                        <span>
                            <strong>{totalConArranque}</strong> de <strong>{reglas.length}</strong> reglas con arranque agendado para {anio}
                            {pendientesCount > 0 && ` · ${pendientesCount} sin patrón (pendientes de Reglas de turnos)`}
                        </span>
                    </div>
                )}

                {/* Lote: misma fecha para las seleccionadas */}
                <div className="border border-continental-yellow/60 bg-continental-yellow/5 rounded-lg p-3 flex items-end gap-3 flex-wrap">
                    <div className="flex items-center gap-2 pb-2">
                        <input
                            type="checkbox"
                            id="sel-visibles-arr"
                            className="size-4"
                            checked={selVisiblesTodas}
                            onChange={() => {
                                if (selVisiblesTodas) setSeleccionadas(new Set());
                                else setSeleccionadas(new Set(reglasFiltradas.map(r => r.codigo)));
                            }}
                        />
                        <label htmlFor="sel-visibles-arr" className="text-sm cursor-pointer">
                            Seleccionar visibles ({reglasFiltradas.length})
                        </label>
                    </div>
                    <div>
                        <Label htmlFor="fecha-lote" className="text-xs">Fecha de arranque para las seleccionadas</Label>
                        <input
                            id="fecha-lote"
                            type="date"
                            min={minIso}
                            value={fechaLote}
                            onChange={(e) => setFechaLote(e.target.value)}
                            className="block border rounded px-2 py-1.5 text-sm"
                        />
                    </div>
                    <div className="flex-1 min-w-[180px]">
                        <Label htmlFor="notas-lote" className="text-xs">Notas (opcional)</Label>
                        <input
                            id="notas-lote"
                            type="text"
                            maxLength={500}
                            value={notasLote}
                            onChange={(e) => setNotasLote(e.target.value)}
                            placeholder={`Ej. Arranque enero ${anio}`}
                            className="block w-full border rounded px-2 py-1.5 text-sm"
                        />
                    </div>
                    <Button
                        onClick={() => agendar(Array.from(seleccionadas), fechaLote, notasLote, "__lote__")}
                        disabled={totalSeleccionadas === 0 || !fechaValida(fechaLote) || agendando !== null}
                        title={totalSeleccionadas === 0 ? "Marca al menos una regla" : !fechaValida(fechaLote) ? "Elige una fecha de hoy en adelante" : ""}
                    >
                        {agendando === "__lote__" ? <Loader2 className="size-4 animate-spin mr-1" /> : <CalendarClock className="size-4 mr-1" />}
                        Agendar en {totalSeleccionadas} seleccionada{totalSeleccionadas === 1 ? "" : "s"}
                    </Button>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    {([
                        ["todas", "Todas"],
                        ["sinArranque", `Sin arranque ${anio}`],
                        ["conArranque", `Con arranque ${anio}`],
                        ["pendientes", "Sin patrón"],
                    ] as [Filtro, string][]).map(([f, label]) => (
                        <button
                            key={f}
                            onClick={() => setFiltro(f)}
                            className={[
                                "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                                filtro === f ? "bg-continental-yellow text-black" : "bg-gray-100 text-gray-600 hover:bg-gray-200",
                            ].join(" ")}
                        >
                            {label}
                            {f === "sinArranque" && reglas.length - totalConArranque > 0 && (
                                <span className="ml-1 bg-amber-500 text-white rounded-full px-1.5 py-0.5 text-[10px]">
                                    {reglas.length - totalConArranque}
                                </span>
                            )}
                        </button>
                    ))}
                    <button
                        onClick={() => setMostrarPatrones(v => !v)}
                        className="ml-auto inline-flex items-center gap-1 text-xs text-continental-gray-1 hover:text-continental-black"
                    >
                        {mostrarPatrones ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                        {mostrarPatrones ? "Ocultar patrones" : "Mostrar patrones"}
                    </button>
                </div>

                {loading ? (
                    <div className="flex items-center gap-2 text-continental-gray-1 text-sm py-4">
                        <Loader2 className="size-4 animate-spin" /> Cargando reglas y arranques…
                    </div>
                ) : reglas.length === 0 ? (
                    <div className="text-sm text-continental-gray-1 py-4">
                        No hay reglas de turno dadas de alta.
                    </div>
                ) : reglasFiltradas.length === 0 ? (
                    <div className="text-sm text-continental-gray-1 py-4">
                        Ninguna regla coincide con el filtro.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {reglasFiltradas.map(regla => {
                            const arranques = arranquesPorRegla.get(regla.codigo) ?? [];
                            const tiene = arranques.length > 0;
                            const sinPatron = !regla.patron || regla.patron.length === 0;
                            const fechaCard = fechaPorRegla[regla.codigo] ?? "";
                            const ocupado = agendando === regla.codigo;
                            return (
                                <Card key={regla.codigo} className={`overflow-hidden ${tiene ? "border-green-200" : ""}`}>
                                    <CardHeader className="pb-3">
                                        <div className="flex items-start justify-between gap-2 flex-wrap">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <input
                                                    type="checkbox"
                                                    checked={seleccionadas.has(regla.codigo)}
                                                    onChange={() => toggleSel(regla.codigo)}
                                                    className="size-4"
                                                />
                                                {tiene
                                                    ? <CheckCircle2 className="size-4 text-green-600" />
                                                    : <Circle className="size-4 text-gray-300" />}
                                                <CardTitle className="text-base font-mono">{regla.codigo}</CardTitle>
                                                <Badge variant="outline" className="font-mono text-xs">
                                                    {regla.patron.length} días / {Math.max(1, Math.floor(regla.patron.length / 7))} sem
                                                </Badge>
                                                {regla.estado === "PendienteConfiguracion" && (
                                                    <Badge className="bg-amber-500 text-white text-[10px] uppercase tracking-wide">
                                                        Sin patrón
                                                    </Badge>
                                                )}
                                            </div>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => setModalAvanzado({ codigo: regla.codigo })}
                                                title="Agendar con un patrón distinto al vigente (modo avanzado)"
                                            >
                                                <Pencil className="size-3.5 mr-1" /> Editar patrón…
                                            </Button>
                                        </div>
                                        <div className="text-[11px] text-continental-gray-1 flex flex-wrap gap-x-3 gap-y-0.5">
                                            <span>
                                                Fecha ref: <strong>{new Date(regla.fechaReferencia).toLocaleDateString("es-MX")}</strong>
                                            </span>
                                            {regla.gruposVisibles && regla.gruposVisibles.length > 0 && (
                                                <span>Grupos: <strong>{regla.gruposVisibles.join(", ")}</strong></span>
                                            )}
                                        </div>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        {/* Arranques del año */}
                                        <div>
                                            <div className="text-xs font-medium text-continental-gray-1 mb-1">
                                                Arranques {anio}
                                            </div>
                                            {tiene ? (
                                                <ul className="space-y-1">
                                                    {arranques.map(a => (
                                                        <li key={a.id} className="flex items-center gap-2 text-sm flex-wrap">
                                                            <span className="font-medium">{formatDate(a.fechaEjecucion)}</span>
                                                            <span className={`inline-block text-[11px] px-2 py-0.5 rounded border ${badgeClasses[a.estado]}`}>
                                                                {a.estado}
                                                            </span>
                                                            <span className="text-[11px] text-continental-gray-1">
                                                                patrón {Math.floor((a.patronBaseline?.length ?? 0) / 7)} sem
                                                                {a.notas ? ` · ${a.notas}` : ""}
                                                            </span>
                                                            {a.estado === "Fallida" && a.mensajeError && (
                                                                <span className="text-[11px] text-red-700" title={a.mensajeError}>
                                                                    {a.mensajeError}
                                                                </span>
                                                            )}
                                                            {a.estado === "Pendiente" && (
                                                                <button
                                                                    onClick={() => handleCancelar(a.id)}
                                                                    disabled={cancelando === a.id}
                                                                    className="text-red-600 hover:text-red-800 disabled:opacity-50 ml-auto"
                                                                    title="Cancelar este arranque"
                                                                >
                                                                    {cancelando === a.id
                                                                        ? <Loader2 className="size-4 animate-spin" />
                                                                        : <X className="size-4" />}
                                                                </button>
                                                            )}
                                                        </li>
                                                    ))}
                                                </ul>
                                            ) : (
                                                <div className="text-sm text-amber-700">Sin arranque agendado para {anio}.</div>
                                            )}
                                        </div>

                                        {/* Agendar en esta regla */}
                                        <div className="flex items-end gap-2 flex-wrap border-t pt-3">
                                            <div>
                                                <Label htmlFor={`fecha-${regla.codigo}`} className="text-xs">Fecha de arranque</Label>
                                                <input
                                                    id={`fecha-${regla.codigo}`}
                                                    type="date"
                                                    min={minIso}
                                                    value={fechaCard}
                                                    onChange={(e) => setFechaPorRegla(prev => ({ ...prev, [regla.codigo]: e.target.value }))}
                                                    className="block border rounded px-2 py-1.5 text-sm"
                                                />
                                            </div>
                                            <Button
                                                size="sm"
                                                onClick={() => agendar([regla.codigo], fechaCard, "", regla.codigo)}
                                                disabled={sinPatron || !fechaValida(fechaCard) || agendando !== null}
                                                title={sinPatron
                                                    ? "Esta regla no tiene patrón; captúralo en Reglas de turnos o usa Editar patrón…"
                                                    : !fechaValida(fechaCard) ? "Elige una fecha de hoy en adelante" : "Agendar con el patrón vigente"}
                                            >
                                                {ocupado ? <Loader2 className="size-4 animate-spin mr-1" /> : <CalendarClock className="size-4 mr-1" />}
                                                Agendar
                                            </Button>
                                        </div>

                                        {mostrarPatrones && (
                                            sinPatron ? (
                                                <p className="text-xs text-amber-700">
                                                    Sin patrón capturado. Usa <strong>Editar patrón…</strong> para capturarlo en el arranque,
                                                    o captúralo en <em>Reglas de turnos</em>.
                                                </p>
                                            ) : (
                                                <SubGruposDerivados regla={regla} />
                                            )
                                        )}
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                )}

                {/* Historial completo (todas las reglas, todos los años) */}
                <details className="border border-continental-gray-3 rounded-lg">
                    <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-continental-black select-none">
                        Historial de arranques y rotaciones ({historial.length})
                    </summary>
                    <div className="p-3 overflow-x-auto">
                        {historial.length === 0 ? (
                            <div className="text-sm text-continental-gray-1 py-2">No hay rotaciones programadas.</div>
                        ) : (
                            <table className="min-w-full text-sm">
                                <thead>
                                    <tr className="text-left text-xs text-continental-gray-1 border-b border-continental-gray-3">
                                        <th className="py-2 pr-3">Fecha</th>
                                        <th className="py-2 pr-3">Regla</th>
                                        <th className="py-2 pr-3">Tipo</th>
                                        <th className="py-2 pr-3">Estado</th>
                                        <th className="py-2 pr-3">Creada por</th>
                                        <th className="py-2 pr-3">Notas</th>
                                        <th className="py-2"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {historial.map(r => (
                                        <tr key={r.id} className="border-b border-continental-gray-3 last:border-0">
                                            <td className="py-2 pr-3 whitespace-nowrap">{formatDate(r.fechaEjecucion)}</td>
                                            <td className="py-2 pr-3 font-mono">{r.codigoRegla}</td>
                                            <td className="py-2 pr-3 text-xs">
                                                {r.patronBaseline && r.patronBaseline.length > 0 ? (
                                                    <span className="inline-block px-2 py-0.5 rounded border bg-continental-yellow/20 border-continental-yellow text-continental-black font-medium"
                                                          title={`Arranque · patrón de ${r.patronBaseline.length / 7} sem`}>
                                                        Arranque ({r.patronBaseline.length / 7} sem)
                                                    </span>
                                                ) : (
                                                    <span className="inline-block px-2 py-0.5 rounded border bg-continental-gray-4 border-continental-gray-3 text-continental-gray-1"
                                                          title="Rotación legacy N días">
                                                        Rotación {r.diasRotacion}d
                                                    </span>
                                                )}
                                            </td>
                                            <td className="py-2 pr-3">
                                                <span className={`inline-block text-[11px] px-2 py-0.5 rounded border ${badgeClasses[r.estado]}`}>
                                                    {r.estado}
                                                </span>
                                                {r.estado === "Fallida" && r.mensajeError && (
                                                    <div className="text-[10px] text-red-700 max-w-[240px] truncate" title={r.mensajeError}>
                                                        {r.mensajeError}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="py-2 pr-3 text-xs">{r.createdByUserNombre ?? "—"}</td>
                                            <td className="py-2 pr-3 text-xs text-continental-gray-1 max-w-[220px] truncate" title={r.notas ?? ""}>
                                                {r.notas ?? "—"}
                                            </td>
                                            <td className="py-2 text-right">
                                                {r.estado === "Pendiente" && (
                                                    <button
                                                        onClick={() => handleCancelar(r.id)}
                                                        disabled={cancelando === r.id}
                                                        className="text-red-600 hover:text-red-800 disabled:opacity-50"
                                                        title="Cancelar"
                                                    >
                                                        {cancelando === r.id
                                                            ? <Loader2 className="size-4 animate-spin" />
                                                            : <X className="size-4" />}
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </details>
            </div>

            {modalAvanzado && (
                <AgendarRotacionModal
                    codigoInicial={modalAvanzado.codigo}
                    onClose={() => setModalAvanzado(null)}
                    onCreada={() => load()}
                />
            )}
        </div>
    );
}
