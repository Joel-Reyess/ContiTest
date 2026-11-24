import { useCallback, useEffect, useMemo, useState } from "react";
import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { ArrowLeft, Gauge, Pencil, Plus, RotateCcw, Users, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVacationConfig } from "@/hooks/useVacationConfig";
import { areasService } from "@/services/areasService";
import { vacacionesService } from "@/services/vacacionesService";
import type { Area } from "@/interfaces/Areas.interface";
import {
    capacidadPorcentajeService,
    type AlcanceCapacidad,
    type AplicaCapacidad,
    type CapacidadPorcentaje,
    type CapacidadesPorcentajeResponse,
    type MedicionCapacidad,
    type PeriodoCapacidad,
    type PersonalDelDia,
    type TurnoCapacidad,
    nombrePeriodoCapacidad,
    nombreTurnoCapacidad,
} from "@/services/capacidadPorcentajeService";
import { ReglasDomingoPanel } from "./ReglasDomingoPanel";

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
interface CapacidadPorPeriodoProps {
    /** Regresa a la secuencia de programación anual (pestaña General). */
    onRegresarSecuencia?: () => void;
}

export const CapacidadPorPeriodo = ({ onRegresarSecuencia }: CapacidadPorPeriodoProps = {}) => {
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
    const [aplicaA, setAplicaA] = useState<AplicaCapacidad>("Ambos");
    const [turno, setTurno] = useState<TurnoCapacidad>("");
    const [areaId, setAreaId] = useState<number | "">("");
    const [grupoId, setGrupoId] = useState<number | "">("");
    const [periodo, setPeriodo] = useState<PeriodoCapacidad>("Mes");
    const [fecha, setFecha] = useState<string>(hoyIso());
    const [fechaFin, setFechaFin] = useState<string>("");
    const [mes, setMes] = useState<string>(format(new Date(), "yyyy-MM"));
    const [porcentaje, setPorcentaje] = useState<string>("");
    const [motivo, setMotivo] = useState("");
    const [guardando, setGuardando] = useState(false);
    // Por día (nov-2026): el % contra todo el personal del área que trabaja ese día.
    const [medicion, setMedicion] = useState<MedicionCapacidad>("Grupo");
    // Periodo "Año": el año completo.
    const [anioCapacidad, setAnioCapacidad] = useState<number>(anioElegido);
    // Editar en su lugar: id de la capacidad que se está editando (null = alta nueva).
    const [editandoId, setEditandoId] = useState<number | null>(null);
    // Vista previa "por día": cuántas personas trabajan cada día en el área.
    const [desdePrevia, setDesdePrevia] = useState<string>("");
    const [previa, setPrevia] = useState<PersonalDelDia[] | null>(null);
    const porDia = alcance === "Area" && medicion === "Dia";
    // El año del formulario sigue al de la lista (la configuración llega después de montar).
    useEffect(() => {
        if (editandoId == null) setAnioCapacidad(anioElegido);
    }, [anioElegido, editandoId]);

    // "General": el porcentaje de siempre (y el del año en preparación), aquí
    // mismo para que Ingeniería Industrial no dependa de la configuración del
    // periodo, que solo ve el superusuario.
    const [general, setGeneral] = useState("");
    const [prep, setPrep] = useState("");
    const [guardandoGeneral, setGuardandoGeneral] = useState(false);

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
        if (!datos) return;
        setGeneral(String(datos.porcentajeGeneral));
        setPrep(datos.porcentajePreparacion != null ? String(datos.porcentajePreparacion) : "");
    }, [datos]);

    const guardarGeneral = async () => {
        const g = Number(general);
        const p = prep.trim() === "" ? null : Number(prep);
        if (!(g > 0 && g <= 100) || (p != null && !(p > 0 && p <= 100))) {
            toast.error("Los porcentajes deben ser mayores a 0 y hasta 100");
            return;
        }
        setGuardandoGeneral(true);
        try {
            // Se releen periodo y años justo antes: el backend guarda la fila completa.
            const actual = await vacacionesService.getConfig();
            await vacacionesService.updateConfig({
                porcentajeAusenciaMaximo: g,
                periodoActual: actual.periodoActual,
                anioVigente: actual.anioVigente,
                anioProgramacionAnual: actual.anioProgramacionAnual ?? null,
                porcentajeAusenciaPreparacion: actual.anioProgramacionAnual == null ? null : p,
            });
            toast.success("Porcentaje general guardado");
            await cargar();
        } catch (e) {
            toast.error("No se pudo guardar", { description: (e as { message?: string })?.message, duration: 10000 });
        } finally {
            setGuardandoGeneral(false);
        }
    };

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
            if (periodo === "Anio") return `todo el año ${anioCapacidad}`;
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
    }, [periodo, mes, fecha, fechaFin, anioCapacidad]);

    // El % que rige ese año sin capacidad: lo que el nuevo reemplaza.
    const anioDelRango = periodo === "Anio" ? anioCapacidad : Number((periodo === "Mes" ? mes : fecha).slice(0, 4));

    // Primer día del periodo elegido: de ahí arranca la vista previa "por día".
    const inicioDelPeriodo = useMemo(() => {
        try {
            if (periodo === "Anio") return anioCapacidad === new Date().getFullYear() ? hoyIso() : `${anioCapacidad}-01-01`;
            if (periodo === "Mes") return mes ? `${mes}-01` : "";
            if (periodo === "Semana") return format(startOfWeek(parseISO(fecha), { weekStartsOn: 1 }), "yyyy-MM-dd");
            return fecha;
        } catch {
            return "";
        }
    }, [periodo, anioCapacidad, mes, fecha]);
    useEffect(() => {
        setDesdePrevia(inicioDelPeriodo);
    }, [inicioDelPeriodo]);

    useEffect(() => {
        if (!porDia || !areaId || !desdePrevia) {
            setPrevia(null);
            return;
        }
        let vigente = true;
        const pct = Number(porcentaje);
        capacidadPorcentajeService
            .personalDelDia(Number(areaId), desdePrevia, 7, pct > 0 && pct <= 100 ? pct : undefined)
            .then((r) => vigente && setPrevia(r))
            .catch(() => vigente && setPrevia(null));
        return () => {
            vigente = false;
        };
    }, [porDia, areaId, desdePrevia, porcentaje]);

    // Con la gente que más se repite en la semana: desde qué % entran 2 personas en el día.
    const pistaPorcentaje = useMemo(() => {
        const totales = (previa ?? []).map((d) => d.total).filter((t) => t > 0);
        if (totales.length === 0) return null;
        const conteo = new Map<number, number>();
        totales.forEach((t) => conteo.set(t, (conteo.get(t) ?? 0) + 1));
        const comun = [...conteo.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
        // Mismo redondeo que el backend (2 decimales).
        const desde = (k: number) => Math.round((k / comun) * 10000) / 100;
        return { personas: comun, para2: desde(2), para3: desde(3) };
    }, [previa]);

    const limpiarFormulario = () => {
        setEditandoId(null);
        setPorcentaje("");
        setMotivo("");
    };

    // Botón Editar de la tabla: sube los datos de esa capacidad al formulario.
    const editar = (c: CapacidadPorcentaje) => {
        setEditandoId(c.id);
        setAlcance(c.alcance);
        setAplicaA(c.aplicaA);
        setTurno((c.turno ?? "") as TurnoCapacidad);
        setMedicion(c.medicion === "Dia" ? "Dia" : "Grupo");
        const areaDelGrupo = c.grupoId ? areas.find((a) => a.grupos?.some((g) => g.grupoId === c.grupoId))?.areaId : undefined;
        setAreaId(c.areaId ?? areaDelGrupo ?? "");
        setGrupoId(c.grupoId ?? "");
        setPeriodo(c.periodo);
        const ini = c.fechaInicio.slice(0, 10);
        const fin = c.fechaFin.slice(0, 10);
        setFecha(ini);
        setFechaFin(c.periodo === "Dia" && fin !== ini ? fin : "");
        setMes(ini.slice(0, 7));
        setAnioCapacidad(Number(ini.slice(0, 4)));
        setPorcentaje(String(c.porcentaje));
        setMotivo(c.motivo ?? "");
        document.getElementById("seccion-capacidad")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    const baseDelAnio = datos
        ? datos.anioPreparacion === anioDelRango && datos.porcentajePreparacion
            ? datos.porcentajePreparacion
            : datos.porcentajeGeneral
        : null;

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
            const req = {
                alcance,
                aplicaA,
                turno: porDia ? undefined : turno || undefined,
                areaId: alcance === "Area" && areaId ? Number(areaId) : undefined,
                grupoId: alcance === "Grupo" && grupoId ? Number(grupoId) : undefined,
                periodo,
                medicion: porDia ? ("Dia" as const) : undefined,
                fechaInicio: periodo === "Anio" ? `${anioCapacidad}-01-01` : periodo === "Mes" ? `${mes}-01` : fecha,
                fechaFin: periodo === "Dia" && fechaFin ? fechaFin : undefined,
                porcentaje: pct,
                motivo: motivo.trim() || undefined,
            };
            if (editandoId != null) await capacidadPorcentajeService.actualizar(editandoId, req);
            else await capacidadPorcentajeService.crear(req);
            toast.success(editandoId != null ? "Cambios guardados" : "Capacidad guardada", {
                description: `${pct}% ${rangoElegido}${porDia ? ", por día" : ""}`,
            });
            limpiarFormulario();
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
                    un día, una semana (lunes a domingo) o un mes, para toda la planta, un área o un grupo. El % que
                    captures <strong>reemplaza</strong> al general en esas fechas (no se suma): si el general es 8% y aquí
                    pones 10%, esos días rige 10%. Al terminar el periodo vuelve el general. Se aplica en la captura, la
                    asignación de días por la empresa, la reprogramación, los calendarios y los dashboards.
                </p>
                <p className="text-sm text-continental-gray-1 mt-1">
                    Normalmente el % se mide <strong>por grupo</strong> (cada grupo contra su propia gente). Para un área se
                    puede medir <strong>por día</strong>: se suma todo el personal de los grupos del área que ese día trabajan
                    según su rol (los tres turnos; el grupo que descansa no cuenta) y el % se aplica a ese total, sin importar
                    de qué turno sea quien captura. Ej.: 13 personas en el día con 8% = 1 persona en el día; para 2 se necesita
                    al menos 15.38%. Con periodo <strong>Año</strong> la regla rige todo el año sin capturarla día por día.
                </p>
                {datos && (
                    <div className="mt-3 flex flex-wrap items-end gap-3 rounded-md border p-3 text-sm">
                        <span className="font-semibold self-center mr-2">General</span>
                        <label className="flex flex-col gap-1">
                            <span className="text-xs text-continental-gray-1">% de ausencia general</span>
                            <input
                                type="number" step="0.1" min="0.1" max="100"
                                className="h-9 w-28 rounded-md border px-2"
                                value={general}
                                onChange={(e) => setGeneral(e.target.value)}
                            />
                        </label>
                        {datos.anioPreparacion ? (
                            <label className="flex flex-col gap-1">
                                <span className="text-xs text-continental-gray-1">% del año {datos.anioPreparacion} (en preparación; vacío = el general)</span>
                                <input
                                    type="number" step="0.1" min="0.1" max="100"
                                    className="h-9 w-28 rounded-md border px-2"
                                    value={prep}
                                    onChange={(e) => setPrep(e.target.value)}
                                />
                            </label>
                        ) : null}
                        <Button variant="outline" onClick={guardarGeneral} disabled={guardandoGeneral}>
                            {guardandoGeneral ? "Guardando…" : "Guardar general"}
                        </Button>
                        <span className="text-xs text-continental-gray-1">Rige todo el año fuera de los periodos de abajo.</span>
                    </div>
                )}
                <p className="text-xs mt-2">
                    En esta pestaña:{" "}
                    <button type="button" className="underline text-blue-700" onClick={() => document.getElementById("seccion-capacidad")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                        capacidad (%)
                    </button>{" "}
                    ·{" "}
                    <button type="button" className="underline text-blue-700" onClick={() => document.getElementById("seccion-domingos")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                        reglas de trabajo (paros)
                    </button>
                </p>
                {onRegresarSecuencia && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                        <span>
                            Las dos cosas son opcionales. Si te quedas con el % general
                            {datos?.anioPreparacion ? ` y el del año ${datos.anioPreparacion}` : ""} y sin paros (se trabaja
                            según el rol), aquí no hay que guardar nada: regresa a la secuencia y sigue con el paso 4 (Asignar días
                            por empresa).
                        </span>
                        <Button variant="outline" size="sm" onClick={onRegresarSecuencia} className="flex items-center gap-1">
                            <ArrowLeft className="w-4 h-4" /> Regresar a la secuencia
                        </Button>
                    </div>
                )}
                <p className="text-xs text-continental-gray-1 mt-1">
                    Si en un mismo día aplican varias, manda la más específica: primero la de día, luego la de semana, luego
                    la de mes y al final la de año (así una de año sirve de base y se puede subir un mes o un día); con el mismo
                    periodo, la de grupo, luego la de área y luego la de planta; y la de un turno
                    antes que la de todo el día. Una de un turno solo aplica al grupo que ese día va en ese turno según su
                    rol; los demás grupos siguen con su porcentaje. Una excepción de un grupo para un día capturada en el
                    calendario del área manda sobre todas.
                </p>
            </div>

            {datos?.faltaScript && (
                <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                    Falta correr <code>{datos.faltaScript}</code> en la base de datos: mientras tanto todas se aplican por grupo y
                    no se puede guardar por día, por año ni editar.
                </div>
            )}

            {datos && !datos.tablaExiste && (
                <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                    Falta crear la tabla en la base: corre <code>Scripts/Migration_CapacidadesPorcentaje.sql</code>. Mientras
                    tanto rige solo el porcentaje general.
                </div>
            )}

            {/* Alta */}
            <section id="seccion-capacidad" className="rounded-lg border p-4 space-y-3 scroll-mt-4">
                <h3 className="font-semibold flex items-center gap-2">
                    {editandoId != null ? (
                        <>
                            <Pencil className="w-4 h-4" /> Editando capacidad #{editandoId}
                        </>
                    ) : (
                        <>
                            <Plus className="w-4 h-4" /> Nueva capacidad
                        </>
                    )}
                </h3>
                {editandoId != null && (
                    <p className="text-xs text-blue-800 bg-blue-50 border border-blue-200 rounded-md p-2">
                        Cambia lo que necesites y da Guardar cambios: se actualiza esa misma capacidad (no hay que desactivarla y
                        capturarla de nuevo). Queda registrado quién la editó.
                    </p>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                    <label className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-continental-gray-1">Aplica a</span>
                        <select className="h-9 rounded-md border px-2" value={alcance} onChange={(e) => setAlcance(e.target.value as AlcanceCapacidad)}>
                            <option value="Planta">Toda la planta</option>
                            <option value="Area">Un área (unidad organizativa)</option>
                            <option value="Grupo">Un grupo</option>
                        </select>
                    </label>
                    <label className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-continental-gray-1">Para qué días</span>
                        <select className="h-9 rounded-md border px-2" value={aplicaA} onChange={(e) => setAplicaA(e.target.value as AplicaCapacidad)}>
                            <option value="Ambos">Días por la empresa y de los operadores</option>
                            <option value="Empresa">Solo días asignados por la empresa</option>
                            <option value="Operador">Solo días que programan los operadores</option>
                        </select>
                        {aplicaA === "Empresa" && (
                            <span className="text-xs text-blue-700">
                                Estas fechas también se usan como prioridad al programar los días por la empresa de esa área o
                                grupo (igual que las fechas de arranque){turno ? "; las de un solo turno no" : ""}.
                            </span>
                        )}
                    </label>
                    <label className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-continental-gray-1">Turno</span>
                        <select
                            className="h-9 rounded-md border px-2 disabled:bg-slate-100"
                            value={porDia ? "" : turno}
                            disabled={porDia}
                            onChange={(e) => setTurno(e.target.value as TurnoCapacidad)}
                        >
                            <option value="">Todo el día</option>
                            <option value="1">Primer turno</option>
                            <option value="2">Segundo turno</option>
                            <option value="3">Tercer turno</option>
                        </select>
                        {turno && !porDia && (
                            <span className="text-xs text-blue-700">
                                Aplica solo al grupo que ese día va en {nombreTurnoCapacidad(turno).toLowerCase()} según su rol; los
                                demás siguen con su porcentaje.
                            </span>
                        )}
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
                    {alcance === "Area" && (
                        <label className="flex flex-col gap-1">
                            <span className="text-xs font-medium text-continental-gray-1">El % se mide</span>
                            <select
                                className="h-9 rounded-md border px-2"
                                value={medicion}
                                onChange={(e) => setMedicion(e.target.value as MedicionCapacidad)}
                            >
                                <option value="Grupo">Por grupo (cada grupo con su gente)</option>
                                <option value="Dia">Por día (todo el personal del área que trabaja ese día)</option>
                            </select>
                            {medicion === "Dia" && (
                                <span className="text-xs text-blue-700">
                                    Se suman los grupos del área que ese día trabajan según su rol; el que descansa no cuenta.
                                    Entra quien capture primero, del turno que sea.
                                </span>
                            )}
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
                            <option value="Anio">Año (todo el año)</option>
                            <option value="Mes">Mes</option>
                            <option value="Semana">Semana</option>
                            <option value="Dia">Día</option>
                        </select>
                    </label>
                    {periodo === "Anio" ? (
                        <label className="flex flex-col gap-1">
                            <span className="text-xs font-medium text-continental-gray-1">Año</span>
                            <select
                                className="h-9 rounded-md border px-2"
                                value={anioCapacidad}
                                onChange={(e) => setAnioCapacidad(Number(e.target.value))}
                            >
                                {[...new Set([...(anios.length ? anios : [anioElegido]), anioCapacidad])]
                                    .sort((a, b) => a - b)
                                    .map((a) => (
                                        <option key={a} value={a}>
                                            {a}
                                        </option>
                                    ))}
                            </select>
                        </label>
                    ) : periodo === "Mes" ? (
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
                        <span className="text-xs font-medium text-continental-gray-1">% de ausencia permitido (reemplaza al general)</span>
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
                        {guardando ? "Guardando…" : editandoId != null ? "Guardar cambios" : "Guardar capacidad"}
                    </Button>
                    {editandoId != null && (
                        <Button variant="outline" onClick={limpiarFormulario} disabled={guardando}>
                            Cancelar edición
                        </Button>
                    )}
                    {porcentaje && rangoElegido && (
                        <span className="text-sm text-continental-gray-1">
                            Se guardará: <strong>{porcentaje}%</strong>
                            {baseDelAnio != null ? ` en lugar del ${baseDelAnio}%` : ""}{" "}
                            {aplicaA === "Empresa" ? "solo para días por la empresa, " : aplicaA === "Operador" ? "solo para días de los operadores, " : ""}
                            {turno && !porDia ? `solo ${nombreTurnoCapacidad(turno).toLowerCase()} (el grupo que ese día va en ese turno según su rol), ` : ""}
                            {porDia ? "medido por día (todo el personal del área que trabaja ese día), " : ""}
                            {rangoElegido},{" "}
                            {alcance === "Planta"
                                ? "toda la planta"
                                : alcance === "Area"
                                  ? areas.find((a) => a.areaId === areaId)?.nombreGeneral ?? "área sin elegir"
                                  : gruposDelArea.find((g) => g.grupoId === grupoId)?.rol ?? "grupo sin elegir"}
                            .
                        </span>
                    )}
                </div>
                {porDia && areaId !== "" && (
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <Users className="w-4 h-4" />
                            <span className="font-medium">Personal que cuenta por día en {areas.find((a) => a.areaId === areaId)?.nombreGeneral}</span>
                            <span className="text-xs text-continental-gray-1">desde</span>
                            <input
                                type="date"
                                className="h-8 rounded-md border px-2 text-xs"
                                value={desdePrevia}
                                onChange={(e) => e.target.value && setDesdePrevia(e.target.value)}
                            />
                        </div>
                        {!desdePrevia ? (
                            <p className="text-xs text-continental-gray-1">Elige desde qué día ver.</p>
                        ) : !previa ? (
                            <p className="text-xs text-continental-gray-1">Cargando…</p>
                        ) : (
                            <>
                                <table className="text-xs">
                                    <tbody>
                                        {previa.map((d) => (
                                            <tr key={d.fecha}>
                                                <td className="pr-3 py-0.5 capitalize whitespace-nowrap">{d.dia}</td>
                                                <td className="pr-3 py-0.5 font-semibold tabular-nums">{d.total} personas</td>
                                                <td className="pr-3 py-0.5 text-continental-gray-1">
                                                    {d.grupos.map((g) => `${g.grupo} (T${g.turno}: ${g.personas})`).join(" · ") || "ningún grupo trabaja"}
                                                </td>
                                                {d.maximoAusentes != null && (
                                                    <td className="py-0.5 font-semibold text-blue-800 whitespace-nowrap">
                                                        con {porcentaje}%: {d.maximoAusentes} {d.maximoAusentes === 1 ? "persona" : "personas"} en el día
                                                    </td>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {pistaPorcentaje && (
                                    <p className="text-xs text-continental-gray-1">
                                        Con {pistaPorcentaje.personas} personas en el día: menos de {pistaPorcentaje.para2.toFixed(2)}% = 1
                                        persona; desde {pistaPorcentaje.para2.toFixed(2)}% = 2 personas; desde{" "}
                                        {pistaPorcentaje.para3.toFixed(2)}% = 3 personas. Los días con menos gente (p. ej. domingos) dejan
                                        menos.
                                    </p>
                                )}
                            </>
                        )}
                    </div>
                )}
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
                                    <th className="px-3 py-2 font-medium">Días</th>
                                    <th className="px-3 py-2 font-medium">Turno</th>
                                    <th className="px-3 py-2 font-medium">Se mide</th>
                                    <th className="px-3 py-2 font-medium text-right">%</th>
                                    <th className="px-3 py-2 font-medium">Motivo</th>
                                    <th className="px-3 py-2 font-medium">Registro</th>
                                    <th className="px-3 py-2" />
                                </tr>
                            </thead>
                            <tbody>
                                {datos.capacidades.map((c) => (
                                    <tr key={c.id} className={`border-t align-top ${c.activa ? "" : "text-continental-gray-1 bg-slate-50"}`}>
                                        <td className="px-3 py-1.5">{nombrePeriodoCapacidad(c.periodo)}</td>
                                        <td className="px-3 py-1.5 tabular-nums whitespace-nowrap">
                                            {c.fechaInicio === c.fechaFin
                                                ? fechaLarga(c.fechaInicio)
                                                : `${fechaLarga(c.fechaInicio)} – ${fechaLarga(c.fechaFin)}`}
                                        </td>
                                        <td className="px-3 py-1.5">{alcanceTexto(c)}</td>
                                        <td className="px-3 py-1.5">
                                            {c.aplicaA === "Empresa" ? "Por la empresa" : c.aplicaA === "Operador" ? "De los operadores" : "Ambos"}
                                        </td>
                                        <td className="px-3 py-1.5">{nombreTurnoCapacidad(c.turno)}</td>
                                        <td className="px-3 py-1.5">{c.medicion === "Dia" ? "Por día (toda el área)" : "Por grupo"}</td>
                                        <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{c.porcentaje}%</td>
                                        <td className="px-3 py-1.5">{c.motivo || "—"}</td>
                                        <td className="px-3 py-1.5 text-xs">
                                            Alta: {c.creadoPor ?? "—"} · {format(new Date(c.fechaCreacion), "dd/MM/yyyy HH:mm")}
                                            {c.fechaModificacion && (
                                                <div>
                                                    Editada: {c.modificadoPor ?? "—"} · {format(new Date(c.fechaModificacion), "dd/MM/yyyy HH:mm")}
                                                </div>
                                            )}
                                            {!c.activa && (
                                                <div>
                                                    Desactivada: {c.desactivadoPor ?? "—"}
                                                    {c.fechaDesactivacion ? ` · ${format(new Date(c.fechaDesactivacion), "dd/MM/yyyy HH:mm")}` : ""}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-3 py-1.5 text-right whitespace-nowrap space-x-1">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => editar(c)}
                                                disabled={!!datos.faltaScript}
                                                title={datos.faltaScript ? `Falta correr ${datos.faltaScript}` : "Editar esta capacidad"}
                                            >
                                                <Pencil className="w-4 h-4 mr-1" /> Editar
                                            </Button>
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

            {/* Domingos (nov-2026: antes en su propia pestaña) */}
            <section id="seccion-domingos" className="border-t-2 border-continental-gray-3 pt-6 scroll-mt-4">
                <ReglasDomingoPanel />
            </section>

            {onRegresarSecuencia && (
                <div className="flex justify-end">
                    <Button variant="outline" onClick={onRegresarSecuencia} className="flex items-center gap-1">
                        <ArrowLeft className="w-4 h-4" /> Regresar a la secuencia (paso 4: asignar días)
                    </Button>
                </div>
            )}
        </div>
    );
};
