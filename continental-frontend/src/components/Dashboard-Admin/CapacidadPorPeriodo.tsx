import { useCallback, useEffect, useMemo, useState } from "react";
import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { Gauge, Plus, RotateCcw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVacationConfig } from "@/hooks/useVacationConfig";
import { areasService } from "@/services/areasService";
import type { Area } from "@/interfaces/Areas.interface";
import {
    capacidadPorcentajeService,
    type AlcanceCapacidad,
    type CapacidadesPorcentajeResponse,
    type PeriodoCapacidad,
} from "@/services/capacidadPorcentajeService";

const hoyIso = () => format(new Date(), "yyyy-MM-dd");

/**
 * Capacidad adicional por periodo (oct-2026, punto 3 del requerimiento de
 * planeación anual): con autorización de tiempo extra, Ingeniería Industrial
 * puede permitir un porcentaje de ausencia distinto al general durante un día,
 * una semana o un mes, para toda la planta, un área o un grupo. Mientras está
 * vigente manda sobre el general; al terminar vuelve el general. Se refleja en
 * la captura, la asignación de días por la empresa, la reprogramación, los
 * calendarios y los dashboards (todos preguntan el límite al mismo lugar).
 */
export const CapacidadPorPeriodo = () => {
    const { config } = useVacationConfig();
    const anios = [config?.anioVigente, config?.anioProgramacionAnual]
        .filter((a): a is number => typeof a === "number")
        .filter((a, i, arr) => arr.indexOf(a) === i)
        .sort((a, b) => a - b);

    const [anio, setAnio] = useState<number | null>(null);
    const anioElegido = anio ?? config?.anioProgramacionAnual ?? config?.anioVigente ?? new Date().getFullYear();
    const [verDesactivadas, setVerDesactivadas] = useState(false);
    const [datos, setDatos] = useState<CapacidadesPorcentajeResponse | null>(null);
    const [cargando, setCargando] = useState(false);
    const [areas, setAreas] = useState<Area[]>([]);

    // Formulario
    const [alcance, setAlcance] = useState<AlcanceCapacidad>("Planta");
    const [areaId, setAreaId] = useState<number | "">("");
    const [grupoId, setGrupoId] = useState<number | "">("");
    const [periodo, setPeriodo] = useState<PeriodoCapacidad>("Mes");
    const [fecha, setFecha] = useState<string>(hoyIso());
    const [fechaFin, setFechaFin] = useState<string>("");
    const [mes, setMes] = useState<string>(format(new Date(), "yyyy-MM"));
    const [porcentaje, setPorcentaje] = useState<string>("");
    const [motivo, setMotivo] = useState("");
    const [guardando, setGuardando] = useState(false);

    const cargar = useCallback(async () => {
        setCargando(true);
        try {
            setDatos(await capacidadPorcentajeService.listar(anioElegido, verDesactivadas));
        } catch (e) {
            toast.error("No se pudieron cargar las capacidades", { description: (e as Error).message });
        } finally {
            setCargando(false);
        }
    }, [anioElegido, verDesactivadas]);

    useEffect(() => {
        cargar();
    }, [cargar]);

    useEffect(() => {
        areasService
            .getAreas()
            .then((a) => setAreas([...a].sort((x, y) => x.nombreGeneral.localeCompare(y.nombreGeneral, "es"))))
            .catch(() => setAreas([]));
    }, []);

    const gruposDelArea = useMemo(
        () => areas.find((a) => a.areaId === areaId)?.grupos ?? [],
        [areas, areaId]
    );

    const fechaLarga = (iso: string) => format(parseISO(iso.slice(0, 10)), "EEE dd/MM/yyyy", { locale: es });

    // Lo que se va a guardar, dicho en palabras, antes de guardar.
    const rangoElegido = useMemo(() => {
        try {
            if (periodo === "Mes") {
                const ini = parseISO(`${mes}-01`);
                return `todo ${format(ini, "MMMM yyyy", { locale: es })}`;
            }
            if (periodo === "Semana") {
                const lunes = startOfWeek(parseISO(fecha), { weekStartsOn: 1 });
                return `semana del lunes ${format(lunes, "dd/MM")} al domingo ${format(addDays(lunes, 6), "dd/MM/yyyy")}`;
            }
            return fechaFin && fechaFin !== fecha
                ? `del ${format(parseISO(fecha), "dd/MM")} al ${format(parseISO(fechaFin), "dd/MM/yyyy")}`
                : `el ${format(parseISO(fecha), "EEE dd/MM/yyyy", { locale: es })}`;
        } catch {
            return "";
        }
    }, [periodo, mes, fecha, fechaFin]);

    const guardar = async () => {
        const pct = Number(porcentaje);
        if (!pct || pct <= 0 || pct > 100) {
            toast.error("Escribe un porcentaje entre 0.1 y 100");
            return;
        }
        if (alcance === "Area" && !areaId) {
            toast.error("Selecciona el área");
            return;
        }
        if (alcance === "Grupo" && !grupoId) {
            toast.error("Selecciona el grupo");
            return;
        }
        setGuardando(true);
        try {
            await capacidadPorcentajeService.crear({
                alcance,
                areaId: alcance === "Area" && areaId ? Number(areaId) : undefined,
                grupoId: alcance === "Grupo" && grupoId ? Number(grupoId) : undefined,
                periodo,
                fechaInicio: periodo === "Mes" ? `${mes}-01` : fecha,
                fechaFin: periodo === "Dia" && fechaFin ? fechaFin : undefined,
                porcentaje: pct,
                motivo: motivo.trim() || undefined,
            });
            toast.success("Capacidad guardada", { description: `${pct}% ${rangoElegido}` });
            setPorcentaje("");
            setMotivo("");
            await cargar();
        } catch (e) {
            toast.error("No se pudo guardar", { description: (e as Error).message, duration: 10000 });
        } finally {
            setGuardando(false);
        }
    };

    const cambiarEstado = async (id: number, activar: boolean) => {
        try {
            if (activar) await capacidadPorcentajeService.reactivar(id);
            else await capacidadPorcentajeService.desactivar(id);
            toast.success(activar ? "Reactivada" : "Desactivada: en esas fechas vuelve a regir el porcentaje general");
            await cargar();
        } catch (e) {
            toast.error("No se pudo completar", { description: (e as Error).message, duration: 10000 });
        }
    };

    const alcanceTexto = (c: { alcance: AlcanceCapacidad; area?: string | null; grupo?: string | null }) =>
        c.alcance === "Planta" ? "Toda la planta" : c.alcance === "Area" ? `Área: ${c.area ?? "—"}` : `Grupo: ${c.grupo ?? "—"} (${c.area ?? "—"})`;

    return (
        <div className="p-4 bg-white border border-continental-gray-3 rounded-lg space-y-6">
            <div>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Gauge className="w-5 h-5" /> Capacidad por periodo
                </h2>
                <p className="text-sm text-continental-gray-1 mt-1">
                    Con autorización de tiempo extra se puede permitir un porcentaje de ausencia distinto al general durante
                    un día, una semana (lunes a domingo) o un mes, para toda la planta, un área o un grupo. Mientras está
                    vigente manda sobre el general; al terminar el periodo vuelve el general. Se aplica en la captura, la
                    asignación de días por la empresa, la reprogramación, los calendarios y los dashboards.
                </p>
                {datos && (
                    <p className="text-sm mt-2">
                        Porcentaje general: <strong>{datos.porcentajeGeneral}%</strong>
                        {datos.anioPreparacion && datos.porcentajePreparacion ? (
                            <>
                                {" "}· {datos.anioPreparacion} (en preparación): <strong>{datos.porcentajePreparacion}%</strong>
                            </>
                        ) : null}
                        <span className="text-continental-gray-1"> (se cambian arriba, en la configuración del periodo)</span>
                    </p>
                )}
                <p className="text-xs text-continental-gray-1 mt-1">
                    Si en un mismo día aplican varias, manda la más específica: primero la de día, luego la de semana y luego
                    la de mes; con el mismo periodo, la de grupo, luego la de área y luego la de planta. Una excepción de un
                    grupo para un día capturada en el calendario del área manda sobre todas.
                </p>
            </div>

            {datos && !datos.tablaExiste && (
                <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                    Falta crear la tabla en la base: corre <code>Scripts/Migration_CapacidadesPorcentaje.sql</code>. Mientras
                    tanto rige solo el porcentaje general.
                </div>
            )}

            {/* Alta */}
            <section className="rounded-lg border p-4 space-y-3">
                <h3 className="font-semibold flex items-center gap-2">
                    <Plus className="w-4 h-4" /> Nueva capacidad
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                    <label className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-continental-gray-1">Aplica a</span>
                        <select className="h-9 rounded-md border px-2" value={alcance} onChange={(e) => setAlcance(e.target.value as AlcanceCapacidad)}>
                            <option value="Planta">Toda la planta</option>
                            <option value="Area">Un área (unidad organizativa)</option>
                            <option value="Grupo">Un grupo</option>
                        </select>
                    </label>
                    {alcance !== "Planta" && (
                        <label className="flex flex-col gap-1">
                            <span className="text-xs font-medium text-continental-gray-1">Área</span>
                            <select
                                className="h-9 rounded-md border px-2"
                                value={areaId}
                                onChange={(e) => {
                                    setAreaId(e.target.value ? Number(e.target.value) : "");
                                    setGrupoId("");
                                }}
                            >
                                <option value="">Selecciona…</option>
                                {areas.map((a) => (
                                    <option key={a.areaId} value={a.areaId}>
                                        {a.nombreGeneral}
                                    </option>
                                ))}
                            </select>
                        </label>
                    )}
                    {alcance === "Grupo" && (
                        <label className="flex flex-col gap-1">
                            <span className="text-xs font-medium text-continental-gray-1">Grupo</span>
                            <select
                                className="h-9 rounded-md border px-2"
                                value={grupoId}
                                onChange={(e) => setGrupoId(e.target.value ? Number(e.target.value) : "")}
                                disabled={!areaId}
                            >
                                <option value="">{areaId ? "Selecciona…" : "Primero el área"}</option>
                                {gruposDelArea.map((g) => (
                                    <option key={g.grupoId} value={g.grupoId}>
                                        {g.rol}
                                    </option>
                                ))}
                            </select>
                        </label>
                    )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
                    <label className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-continental-gray-1">Periodo</span>
                        <select className="h-9 rounded-md border px-2" value={periodo} onChange={(e) => setPeriodo(e.target.value as PeriodoCapacidad)}>
                            <option value="Mes">Mes</option>
                            <option value="Semana">Semana</option>
                            <option value="Dia">Día</option>
                        </select>
                    </label>
                    {periodo === "Mes" ? (
                        <label className="flex flex-col gap-1">
                            <span className="text-xs font-medium text-continental-gray-1">Mes</span>
                            <input type="month" className="h-9 rounded-md border px-2" value={mes} onChange={(e) => setMes(e.target.value)} />
                        </label>
                    ) : (
                        <label className="flex flex-col gap-1">
                            <span className="text-xs font-medium text-continental-gray-1">
                                {periodo === "Semana" ? "Cualquier día de la semana" : "Día"}
                            </span>
                            <input type="date" className="h-9 rounded-md border px-2" value={fecha} onChange={(e) => setFecha(e.target.value)} />
                        </label>
                    )}
                    {periodo === "Dia" && (
                        <label className="flex flex-col gap-1">
                            <span className="text-xs font-medium text-continental-gray-1">Hasta (opcional, máx. 31 días)</span>
                            <input type="date" className="h-9 rounded-md border px-2" value={fechaFin} min={fecha} onChange={(e) => setFechaFin(e.target.value)} />
                        </label>
                    )}
                    <label className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-continental-gray-1">% de ausencia permitido</span>
                        <input
                            type="number"
                            step="0.1"
                            min="0.1"
                            max="100"
                            className="h-9 rounded-md border px-2"
                            value={porcentaje}
                            onChange={(e) => setPorcentaje(e.target.value)}
                            placeholder={datos ? `General ${datos.porcentajeGeneral}` : ""}
                        />
                    </label>
                </div>
                <label className="flex flex-col gap-1 text-sm">
                    <span className="text-xs font-medium text-continental-gray-1">Motivo (ej. tiempo extra autorizado por…)</span>
                    <input className="h-9 rounded-md border px-2" maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                </label>
                <div className="flex flex-wrap items-center gap-3">
                    <Button variant="continental" onClick={guardar} disabled={guardando || (datos ? !datos.tablaExiste : false)}>
                        {guardando ? "Guardando…" : "Guardar capacidad"}
                    </Button>
                    {porcentaje && rangoElegido && (
                        <span className="text-sm text-continental-gray-1">
                            Se guardará: <strong>{porcentaje}%</strong> {rangoElegido},{" "}
                            {alcance === "Planta"
                                ? "toda la planta"
                                : alcance === "Area"
                                  ? areas.find((a) => a.areaId === areaId)?.nombreGeneral ?? "área sin elegir"
                                  : gruposDelArea.find((g) => g.grupoId === grupoId)?.rol ?? "grupo sin elegir"}
                            .
                        </span>
                    )}
                </div>
            </section>

            {/* Lista */}
            <section className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                    <h3 className="font-semibold mr-auto">Capacidades del año</h3>
                    <select
                        className="h-9 rounded-md border px-2 text-sm"
                        value={anioElegido}
                        onChange={(e) => setAnio(Number(e.target.value))}
                    >
                        {(anios.length ? anios : [anioElegido]).map((a) => (
                            <option key={a} value={a}>
                                {a}
                            </option>
                        ))}
                    </select>
                    <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={verDesactivadas} onChange={(e) => setVerDesactivadas(e.target.checked)} />
                        Ver también las desactivadas
                    </label>
                </div>
                {cargando ? (
                    <p className="text-sm text-continental-gray-1">Cargando…</p>
                ) : !datos || datos.capacidades.length === 0 ? (
                    <p className="text-sm text-continental-gray-1">
                        No hay capacidades en {anioElegido}: todo el año rige el porcentaje general.
                    </p>
                ) : (
                    <div className="overflow-x-auto border rounded-lg">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-left">
                                <tr>
                                    <th className="px-3 py-2 font-medium">Periodo</th>
                                    <th className="px-3 py-2 font-medium">Fechas</th>
                                    <th className="px-3 py-2 font-medium">Aplica a</th>
                                    <th className="px-3 py-2 font-medium text-right">%</th>
                                    <th className="px-3 py-2 font-medium">Motivo</th>
                                    <th className="px-3 py-2 font-medium">Registro</th>
                                    <th className="px-3 py-2" />
                                </tr>
                            </thead>
                            <tbody>
                                {datos.capacidades.map((c) => (
                                    <tr key={c.id} className={`border-t align-top ${c.activa ? "" : "text-continental-gray-1 bg-slate-50"}`}>
                                        <td className="px-3 py-1.5">{c.periodo === "Dia" ? "Día" : c.periodo}</td>
                                        <td className="px-3 py-1.5 tabular-nums whitespace-nowrap">
                                            {c.fechaInicio === c.fechaFin
                                                ? fechaLarga(c.fechaInicio)
                                                : `${fechaLarga(c.fechaInicio)} – ${fechaLarga(c.fechaFin)}`}
                                        </td>
                                        <td className="px-3 py-1.5">{alcanceTexto(c)}</td>
                                        <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{c.porcentaje}%</td>
                                        <td className="px-3 py-1.5">{c.motivo || "—"}</td>
                                        <td className="px-3 py-1.5 text-xs">
                                            Alta: {c.creadoPor ?? "—"} · {format(new Date(c.fechaCreacion), "dd/MM/yyyy HH:mm")}
                                            {!c.activa && (
                                                <div>
                                                    Desactivada: {c.desactivadoPor ?? "—"}
                                                    {c.fechaDesactivacion ? ` · ${format(new Date(c.fechaDesactivacion), "dd/MM/yyyy HH:mm")}` : ""}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-3 py-1.5 text-right whitespace-nowrap">
                                            {c.activa ? (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="text-red-700 border-red-300"
                                                    onClick={() => {
                                                        if (window.confirm(`¿Desactivar ${c.porcentaje}% (${c.descripcion})? En esas fechas vuelve a regir el porcentaje general.`))
                                                            cambiarEstado(c.id, false);
                                                    }}
                                                >
                                                    <XCircle className="w-4 h-4 mr-1" /> Desactivar
                                                </Button>
                                            ) : (
                                                <Button size="sm" variant="outline" onClick={() => cambiarEstado(c.id, true)}>
                                                    <RotateCcw className="w-4 h-4 mr-1" /> Reactivar
                                                </Button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
};
