import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { addDays, endOfMonth, format, parseISO, startOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { AlertTriangle, CalendarOff, Plus, RotateCcw, Search, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVacationConfig } from "@/hooks/useVacationConfig";
import { areasService } from "@/services/areasService";
import type { Area } from "@/interfaces/Areas.interface";
import { UserRole } from "@/interfaces/User.interface";
import useAuth from "@/hooks/useAuth";
import { MovimientoMasivoDiasEmpresa } from "./MovimientoMasivoDiasEmpresa";
import { DiasEmpresaEnParoReporte } from "./DiasEmpresaEnParoReporte";
import {
    diaDeRegla,
    nombreDiaAplicacion,
    nombreTipoRegla,
    reglasDomingoService,
    type DiaAplicacion,
    type ReglaDomingo,
    type ReglasDomingoResponse,
    type TipoReglaDomingo,
    type VacacionEnNoLaborable,
} from "@/services/reglasDomingoService";

type AlcanceDomingo = "Planta" | "Areas" | "Grupo";
/** "Dia" = un sábado, un domingo o un fin de semana (según el día de aplicación). */
type PeriodoDomingo = "Dia" | "Mes" | "Rango";

/** Reglas que se guardaron juntas (p. ej. toda la planta): un renglón en la lista. */
interface Lote {
    clave: string
    reglas: ReglaDomingo[]
}

const iso = (d: Date) => format(d, "yyyy-MM-dd");

/**
 * Reglas de trabajo y asignación de días (antes "Domingos por periodo"; nombre,
 * textos y orden de los pasos propuestos por planeación, nov-2026). Por unidad
 * organizativa —o toda la planta, o un grupo— y por un periodo, el sábado, el
 * domingo o ambos son:
 *  - Paro sin asignaciones (SinDomingo): descanso para todos; no se programan
 *    vacaciones ni días por la empresa, el rol semanal y los calendarios lo
 *    muestran como descanso.
 *  - Paro con días por la empresa (ParoEmpresa): tampoco se programan vacaciones,
 *    y la asignación pone ahí los días por la empresa de quien trabajaba ese día
 *    según su rol (en orden de fecha, sin %); lo que no alcanza queda descanso y
 *    los días que sobran se asignan normal (pendiente de que planeación confirme
 *    esos dos casos, nov-2026).
 *  - Paro, el operador elige (ParoOperador, 20-nov-2026): no se trabaja ni se
 *    asignan días por la empresa ahí, pero el operador que lo trabajaba por rol
 *    puede programar ese día como vacación si quiere.
 *  - Rol normal (RolNormal), como excepción: se trabaja según el rol, p. ej.
 *    para habilitar un domingo dentro de un paro.
 * Las reglas se pueden encimar: manda la de periodo más corto. Cada regla dice en
 * cuántos de sus días manda y cuál le gana los otros (nov-2026: en TEST un paro de
 * fin de semana solo puso sábados porque en los domingos mandaba una regla vieja
 * de "Rol normal" más corta).
 */
export const ReglasDomingoPanel = () => {
    const navigate = useNavigate();
    const location = useLocation();
    // Ingeniería Industrial lo ve en /area/capacidad; el superusuario en /admin.
    const baseEmpleado = location.pathname.startsWith("/area") ? "/area/plantilla" : "/admin/plantilla";
    const { config } = useVacationConfig();
    const { hasRole } = useAuth();
    const esSuperUsuario = hasRole(UserRole.SUPER_ADMIN);
    const anios = [config?.anioVigente, config?.anioProgramacionAnual]
        .filter((a): a is number => typeof a === "number")
        .filter((a, i, arr) => arr.indexOf(a) === i)
        .sort((a, b) => a - b);
    const [anio, setAnio] = useState<number | null>(null);
    const anioElegido = anio ?? config?.anioProgramacionAnual ?? config?.anioVigente ?? new Date().getFullYear();

    const [areas, setAreas] = useState<Area[]>([]);
    const [datos, setDatos] = useState<ReglasDomingoResponse | null>(null);
    const [cargando, setCargando] = useState(false);
    const [verDesactivadas, setVerDesactivadas] = useState(false);

    // Formulario
    const [alcance, setAlcance] = useState<AlcanceDomingo>("Planta");
    const [busqueda, setBusqueda] = useState("");
    const [areaIds, setAreaIds] = useState<number[]>([]);
    const [areaGrupo, setAreaGrupo] = useState<number | "">("");
    const [grupoId, setGrupoId] = useState<number | "">("");
    const [periodo, setPeriodo] = useState<PeriodoDomingo>("Dia");
    const [dia, setDia] = useState("");
    const [mes, setMes] = useState("");
    const [desde, setDesde] = useState("");
    const [hasta, setHasta] = useState("");
    // Sin opción marcada a propósito: antes venía "en base a rol" y se guardaba sin
    // querer (validación nov-2026).
    const [tipo, setTipo] = useState<TipoReglaDomingo | "">("");
    const [diaAplicacion, setDiaAplicacion] = useState<DiaAplicacion>("Domingo");
    const [motivo, setMotivo] = useState("");
    const [guardando, setGuardando] = useState(false);
    /** Al guardar: unidades donde la regla nueva no manda en todos sus días (otra le gana). */
    const [avisosGuardado, setAvisosGuardado] = useState<string[]>([]);

    const [afectadas, setAfectadas] = useState<VacacionEnNoLaborable[] | null>(null);
    const [buscandoAfectadas, setBuscandoAfectadas] = useState(false);

    const cargar = useCallback(async () => {
        setCargando(true);
        try {
            setDatos(await reglasDomingoService.listar(anioElegido, verDesactivadas));
        } catch (e) {
            toast.error("No se pudieron cargar las reglas de domingos", { description: (e as Error).message });
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

    const areasFiltradas = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        return q ? areas.filter((a) => `${a.nombreGeneral} ${a.unidadOrganizativaSap}`.toLowerCase().includes(q)) : areas;
    }, [areas, busqueda]);
    const gruposDelArea = useMemo(() => areas.find((a) => a.areaId === areaGrupo)?.grupos ?? [], [areas, areaGrupo]);

    // Fechas que se van a guardar, según el periodo elegido.
    const rango = useMemo((): { inicio: string; fin: string; texto: string } | null => {
        try {
            if (periodo === "Dia") {
                if (!dia) return null;
                // El sábado o domingo de esa semana (lunes a domingo); con ambos, los dos.
                const domingo = addDays(startOfWeek(parseISO(dia), { weekStartsOn: 1 }), 6);
                const sabado = addDays(domingo, -1);
                if (diaAplicacion === "Sabado")
                    return { inicio: iso(sabado), fin: iso(sabado), texto: `el sábado ${format(sabado, "dd/MM/yyyy")}` };
                if (diaAplicacion === "Ambos")
                    return {
                        inicio: iso(sabado),
                        fin: iso(domingo),
                        texto: `el sábado ${format(sabado, "dd/MM")} y domingo ${format(domingo, "dd/MM/yyyy")}`,
                    };
                return { inicio: iso(domingo), fin: iso(domingo), texto: `el domingo ${format(domingo, "dd/MM/yyyy")}` };
            }
            if (periodo === "Mes") {
                if (!mes) return null;
                const ini = parseISO(`${mes}-01`);
                return { inicio: iso(ini), fin: iso(endOfMonth(ini)), texto: `todo ${format(ini, "MMMM yyyy", { locale: es })}` };
            }
            if (!desde || !hasta || hasta < desde) return null;
            return {
                inicio: desde,
                fin: hasta,
                texto: `del ${format(parseISO(desde), "dd/MM/yyyy")} al ${format(parseISO(hasta), "dd/MM/yyyy")}`,
            };
        } catch {
            return null;
        }
    }, [periodo, dia, mes, desde, hasta, diaAplicacion]);

    const destinoTexto =
        alcance === "Planta"
            ? "toda la planta"
            : alcance === "Areas"
              ? areaIds.length === 1
                  ? areas.find((a) => a.areaId === areaIds[0])?.nombreGeneral ?? "1 unidad"
                  : `${areaIds.length} unidades organizativas`
              : gruposDelArea.find((g) => g.grupoId === grupoId)?.rol ?? "grupo sin elegir";

    const fecha = (s: string) => format(parseISO(s.slice(0, 10)), "dd/MM/yyyy", { locale: es });
    const fechaLarga = (s: string) => format(parseISO(s.slice(0, 10)), "EEE dd/MM/yyyy", { locale: es });

    const guardar = async () => {
        if (!tipo) {
            toast.error("Elige qué pasa esos días: paro sin asignaciones, paro con días por la empresa o rol normal");
            return;
        }
        if (alcance === "Areas" && areaIds.length === 0) {
            toast.error("Selecciona al menos una unidad organizativa");
            return;
        }
        if (alcance === "Grupo" && (!areaGrupo || !grupoId)) {
            toast.error("Selecciona el área y el grupo");
            return;
        }
        if (!rango) {
            toast.error(periodo === "Rango" ? "Elige el periodo: la fecha final no puede ser antes de la inicial" : "Elige la fecha");
            return;
        }
        setGuardando(true);
        try {
            const r = await reglasDomingoService.crear({
                todaLaPlanta: alcance === "Planta",
                areaIds: alcance === "Areas" ? areaIds : alcance === "Grupo" && areaGrupo ? [Number(areaGrupo)] : [],
                grupoId: alcance === "Grupo" && grupoId ? Number(grupoId) : undefined,
                tipo,
                diaAplicacion,
                incluyeSabado: diaAplicacion !== "Domingo",
                fechaInicio: rango.inicio,
                fechaFin: rango.fin,
                motivo: motivo.trim() || undefined,
            });
            const partes = [
                r.creadas ? `${r.creadas} guardada(s)` : "",
                r.reemplazadas ? `${r.reemplazadas} reemplazaron a una de las mismas fechas` : "",
                r.yaExistian ? `${r.yaExistian} ya estaban igual` : "",
            ].filter(Boolean);
            toast.success(`${nombreTipoRegla(tipo)} · ${nombreDiaAplicacion(diaAplicacion)}`, {
                description: `${partes.join(", ")}.${tipo === "SinDomingo" || tipo === "ParoEmpresa" ? " Revisa abajo si hay vacaciones ya programadas en esos días." : ""}${tipo === "ParoEmpresa" ? " Los días por la empresa se ponen ahí al dar \"Programar días\" (paso 4)." : ""}${tipo === "ParoOperador" ? " Los operadores pueden programar ahí; la asignación no pone días por la empresa esos días." : ""}`,
                duration: 8000,
            });
            setAvisosGuardado(r.avisos ?? []);
            setMotivo("");
            setAfectadas(null);
            await cargar();
        } catch (e) {
            toast.error("No se pudo guardar", { description: (e as Error).message, duration: 10000 });
        } finally {
            setGuardando(false);
        }
    };

    // Las que se guardaron juntas (mismo momento, mismas fechas y tipo) van en un renglón.
    const lotes = useMemo((): Lote[] => {
        const mapa = new Map<string, ReglaDomingo[]>();
        for (const r of datos?.reglas ?? []) {
            const clave = r.grupoId
                ? `g${r.id}`
                : [r.tipo, diaDeRegla(r), r.fechaInicio, r.fechaFin, r.motivo ?? "", r.creadoPor ?? "", r.fechaCreacion.slice(0, 19), r.activa].join("|");
            mapa.set(clave, [...(mapa.get(clave) ?? []), r]);
        }
        return Array.from(mapa.entries())
            .map(([clave, reglas]) => ({ clave, reglas }))
            .sort(
                (a, b) =>
                    Number(b.reglas[0].activa) - Number(a.reglas[0].activa) ||
                    a.reglas[0].fechaInicio.localeCompare(b.reglas[0].fechaInicio) ||
                    b.reglas[0].fechaCreacion.localeCompare(a.reglas[0].fechaCreacion)
            );
    }, [datos]);

    const cambiarEstado = async (lote: Lote, activar: boolean) => {
        try {
            await reglasDomingoService.cambiarEstado(lote.reglas.map((r) => r.id), activar);
            toast.success(activar ? "Reactivada" : "Desactivada: en esas fechas vuelve a mandar la regla que siga (o el rol normal)");
            setAfectadas(null);
            await cargar();
        } catch (e) {
            toast.error("No se pudo completar", { description: (e as Error).message, duration: 10000 });
        }
    };

    const revisarAfectadas = async () => {
        setBuscandoAfectadas(true);
        try {
            setAfectadas(await reglasDomingoService.vacacionesAfectadas(anioElegido));
        } catch (e) {
            toast.error("No se pudo revisar", { description: (e as Error).message });
        } finally {
            setBuscandoAfectadas(false);
        }
    };

    const destinoLote = (lote: Lote) => {
        const r = lote.reglas[0];
        if (r.grupoId) return <>{r.area} <span className="text-xs text-continental-gray-1">· grupo {r.grupo}</span></>;
        if (lote.reglas.length === 1) return r.area;
        const nombres = lote.reglas.map((x) => x.area).sort((a, b) => a.localeCompare(b, "es"));
        return (
            <details>
                <summary className="cursor-pointer">
                    {areas.length > 0 && lote.reglas.length >= areas.length ? "Toda la planta" : `${lote.reglas.length} unidades organizativas`}
                </summary>
                <span className="text-xs text-continental-gray-1">{nombres.join(", ")}</span>
            </details>
        );
    };

    const reglaTexto = (r: ReglaDomingo) => `${nombreTipoRegla(r.tipo)} · ${nombreDiaAplicacion(diaDeRegla(r))}`;
    /** Reglas del renglón que no mandan en todos sus días (otra regla más corta o de grupo les gana). */
    const coberturaParcial = (lote: Lote) =>
        lote.reglas.filter((x) => x.activa && x.diasDelPeriodo != null && x.diasQueManda != null && x.diasQueManda < x.diasDelPeriodo);
    const diasTexto = diaAplicacion === "Sabado" ? "sábados" : diaAplicacion === "Ambos" ? "sábados y domingos" : "domingos";
    const diaSingular = diaAplicacion === "Sabado" ? "sábado" : diaAplicacion === "Ambos" ? "sábado o domingo" : "domingo";

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                    <CalendarOff className="w-5 h-5" /> Reglas de trabajo y asignación de días
                </h2>
                <p className="text-sm text-continental-gray-1 mt-1">
                    Configura la jornada y las asignaciones para un periodo. Puedes aplicar la regla a toda la planta, a una
                    unidad organizativa o a un grupo. En los días de paro se bloquea la programación de vacaciones del
                    personal. Esta opción permite decidir si el paro se registra como descanso o si se pueden asignar días
                    por la empresa según el rol del personal. Sin regla, se trabaja según el rol de cada quien.
                </p>
                <p className="text-xs text-continental-gray-1 mt-2">
                    Se pueden encimar: manda la de periodo más corto, igual que en la capacidad. Ejemplo: Producción con
                    paro los domingos de enero a marzo y, para un domingo en que hay que habilitar a toda la planta, "Rol
                    normal · toda la planta · un domingo". Si duran lo mismo, manda la del grupo sobre la del área, y luego la
                    más reciente.
                </p>
                <p className="text-xs text-continental-gray-1 mt-1">
                    Orden antes de asignar días por la empresa: 1) rol y arranques de las reglas de turno, 2) días festivos,
                    3) estas reglas y la capacidad, 4) asignar días por la empresa.
                </p>
            </div>

            {datos && !datos.tablaExiste && (
                <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                    Falta crear la tabla en la base: corre <code>Scripts/Migration_ReglasDomingo.sql</code>. Mientras tanto
                    se trabaja según el rol de cada quien.
                </div>
            )}

            {/* Alta: primero el día y qué pasa ese día, luego a quién y cuándo (orden propuesto por planeación) */}
            <section className="rounded-lg border p-4 space-y-4 text-sm">
                <h3 className="font-semibold flex items-center gap-2">
                    <Plus className="w-4 h-4" /> Nueva regla
                </h3>

                <fieldset className="space-y-1">
                    <legend className="text-xs font-medium text-continental-gray-1">Día de aplicación (paro de actividades)</legend>
                    <div className="flex flex-wrap gap-4">
                        {(["Sabado", "Domingo", "Ambos"] as DiaAplicacion[]).map((d) => (
                            <label key={d} className="flex items-center gap-2">
                                <input type="radio" name="diaAplicacion" checked={diaAplicacion === d} onChange={() => setDiaAplicacion(d)} />
                                {d === "Sabado" ? "Sábado" : d === "Ambos" ? "Ambos (sábado y domingo)" : "Domingo"}
                            </label>
                        ))}
                    </div>
                </fieldset>

                <fieldset className="space-y-2">
                    <legend className="text-xs font-medium text-continental-gray-1">Opción para programación de días por la empresa</legend>
                    <label className="flex items-start gap-2">
                        <input type="radio" className="mt-1" name="tipoRegla" checked={tipo === "SinDomingo"} onChange={() => setTipo("SinDomingo")} />
                        <span>
                            <strong>Paro sin asignaciones</strong> — el día se registra como descanso para todo el personal
                            incluido en la regla; no se programan vacaciones ni días por la empresa.
                        </span>
                    </label>
                    <label className="flex items-start gap-2">
                        <input type="radio" className="mt-1" name="tipoRegla" checked={tipo === "ParoEmpresa"} onChange={() => setTipo("ParoEmpresa")} />
                        <span>
                            <strong>Paro con días por la empresa</strong> — se pueden asignar días por la empresa en base a su
                            rol. Nadie programa vacaciones esos días. Al dar "Programar días", a quien según su rol le tocaba
                            trabajar ese día (primero, segundo o tercero) se le pone ahí uno de sus días por la empresa, en
                            orden de fecha (el primer {diaSingular} del periodo que le
                            toca trabajar, luego el siguiente…) y sin % de ausencia, hasta completar sus días. Si por rol
                            descansaba, o ya no le alcanzan los días, ese día queda como descanso. Si le sobran días, se le
                            asignan de forma normal.
                        </span>
                    </label>
                    <label className="flex items-start gap-2">
                        <input type="radio" className="mt-1" name="tipoRegla" checked={tipo === "ParoOperador"} onChange={() => setTipo("ParoOperador")} />
                        <span>
                            <strong>Paro, el operador elige sus días</strong> — ese día no se trabaja y la asignación no pone ahí
                            días por la empresa. En lugar de eso, el operador que según su rol lo trabajaba puede programar ese
                            día como vacación si quiere (con el % normal de su grupo). Si no lo programa, queda como descanso.
                        </span>
                    </label>
                    <div className="pt-1 border-t">
                        <span className="text-xs text-continental-gray-1">Excepción</span>
                        <label className="flex items-start gap-2">
                            <input type="radio" className="mt-1" name="tipoRegla" checked={tipo === "RolNormal"} onChange={() => setTipo("RolNormal")} />
                            <span>
                                <strong>Rol normal</strong> — se trabaja según el rol de cada quien. Sirve para habilitar un día
                                dentro de un paro (por ejemplo, un domingo en que hay que trabajar).
                            </span>
                        </label>
                    </div>
                </fieldset>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    <label className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-continental-gray-1">Aplica a</span>
                        <select className="h-9 rounded-md border px-2" value={alcance} onChange={(e) => setAlcance(e.target.value as AlcanceDomingo)}>
                            <option value="Planta">Toda la planta</option>
                            <option value="Areas">Unidades organizativas</option>
                            <option value="Grupo">Un grupo</option>
                        </select>
                    </label>
                    {alcance === "Grupo" && (
                        <>
                            <label className="flex flex-col gap-1">
                                <span className="text-xs font-medium text-continental-gray-1">Área</span>
                                <select
                                    className="h-9 rounded-md border px-2"
                                    value={areaGrupo}
                                    onChange={(e) => {
                                        setAreaGrupo(e.target.value ? Number(e.target.value) : "");
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
                            <label className="flex flex-col gap-1">
                                <span className="text-xs font-medium text-continental-gray-1">Grupo</span>
                                <select
                                    className="h-9 rounded-md border px-2"
                                    value={grupoId}
                                    disabled={!areaGrupo}
                                    onChange={(e) => setGrupoId(e.target.value ? Number(e.target.value) : "")}
                                >
                                    <option value="">{areaGrupo ? "Selecciona…" : "Primero el área"}</option>
                                    {gruposDelArea.map((g) => (
                                        <option key={g.grupoId} value={g.grupoId}>
                                            {g.rol}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </>
                    )}
                </div>

                {alcance === "Areas" && (
                    <div className="space-y-2 min-w-0 lg:max-w-[50%]">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-continental-gray-1">Unidades organizativas ({areaIds.length} elegidas)</span>
                            <div className="flex gap-2 text-xs">
                                <button
                                    type="button"
                                    className="underline"
                                    onClick={() => setAreaIds((ids) => Array.from(new Set([...ids, ...areasFiltradas.map((a) => a.areaId)])))}
                                >
                                    Elegir las filtradas
                                </button>
                                <button type="button" className="underline" onClick={() => setAreaIds([])}>
                                    Quitar todas
                                </button>
                            </div>
                        </div>
                        <div className="relative">
                            <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                className="h-9 w-full rounded-md border pl-8 pr-2"
                                placeholder="Buscar por nombre o unidad organizativa SAP…"
                                value={busqueda}
                                onChange={(e) => setBusqueda(e.target.value)}
                            />
                        </div>
                        <div className="max-h-56 overflow-y-auto rounded-md border p-2 space-y-1">
                            {areasFiltradas.map((a) => (
                                <label key={a.areaId} className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={areaIds.includes(a.areaId)}
                                        onChange={(e) =>
                                            setAreaIds((ids) => (e.target.checked ? [...ids, a.areaId] : ids.filter((x) => x !== a.areaId)))
                                        }
                                    />
                                    <span>{a.nombreGeneral}</span>
                                    <span className="text-xs text-continental-gray-1 truncate">{a.unidadOrganizativaSap}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    <label className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-continental-gray-1">Periodo</span>
                        <select className="h-9 rounded-md border px-2" value={periodo} onChange={(e) => setPeriodo(e.target.value as PeriodoDomingo)}>
                            <option value="Dia">{diaAplicacion === "Sabado" ? "Un sábado" : diaAplicacion === "Ambos" ? "Un fin de semana" : "Un domingo"}</option>
                            <option value="Mes">Un mes</option>
                            <option value="Rango">Rango de fechas</option>
                        </select>
                    </label>
                    {periodo === "Dia" && (
                        <label className="flex flex-col gap-1">
                            <span className="text-xs font-medium text-continental-gray-1">Cualquier día de esa semana</span>
                            <input type="date" className="h-9 rounded-md border px-2" value={dia} onChange={(e) => setDia(e.target.value)} />
                        </label>
                    )}
                    {periodo === "Mes" && (
                        <label className="flex flex-col gap-1">
                            <span className="text-xs font-medium text-continental-gray-1">Mes</span>
                            <input type="month" className="h-9 rounded-md border px-2" value={mes} onChange={(e) => setMes(e.target.value)} />
                        </label>
                    )}
                    {periodo === "Rango" && (
                        <>
                            <label className="flex flex-col gap-1">
                                <span className="text-xs font-medium text-continental-gray-1">Desde</span>
                                <input type="date" className="h-9 rounded-md border px-2" value={desde} onChange={(e) => setDesde(e.target.value)} />
                            </label>
                            <label className="flex flex-col gap-1">
                                <span className="text-xs font-medium text-continental-gray-1">Hasta</span>
                                <input type="date" className="h-9 rounded-md border px-2" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} />
                            </label>
                        </>
                    )}
                </div>

                <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-continental-gray-1">Motivo (ej. paro por baja producción, se habilita la planta…)</span>
                    <input className="h-9 rounded-md border px-2" maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                </label>

                <div className="flex flex-wrap items-center gap-3">
                    <Button variant="continental" onClick={guardar} disabled={guardando || (datos ? !datos.tablaExiste : false)}>
                        {guardando ? "Guardando…" : "Guardar regla"}
                    </Button>
                    {rango && tipo && (
                        <span className="text-continental-gray-1">
                            Se guardará: <strong>{nombreTipoRegla(tipo)}</strong>{" "}
                            {periodo === "Dia" ? rango.texto : `los ${diasTexto} de ${rango.texto}`}, {destinoTexto}.
                        </span>
                    )}
                </div>
            </section>

            {avisosGuardado.length > 0 && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 space-y-1">
                    <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                        <strong className="mr-auto">La regla que guardaste no manda en todos sus días</strong>
                        <button type="button" onClick={() => setAvisosGuardado([])} title="Cerrar">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    {avisosGuardado.map((a) => (
                        <p key={a} className="pl-6">
                            {a}
                        </p>
                    ))}
                    <p className="pl-6 text-xs">
                        Cuando dos reglas tocan el mismo día, manda la de periodo más corto (luego la de grupo y luego la más
                        reciente). Desactiva en la lista de abajo la regla que ya no aplique.
                    </p>
                </div>
            )}

            {/* Lista */}
            <section className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                    <h3 className="font-semibold mr-auto">Reglas del año</h3>
                    <select className="h-9 rounded-md border px-2 text-sm" value={anioElegido} onChange={(e) => setAnio(Number(e.target.value))}>
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
                ) : lotes.length === 0 ? (
                    <p className="text-sm text-continental-gray-1">No hay reglas en {anioElegido}: se trabaja según el rol de cada quien.</p>
                ) : (
                    <div className="overflow-x-auto border rounded-lg">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-left">
                                <tr>
                                    <th className="px-3 py-2 font-medium">Aplica a</th>
                                    <th className="px-3 py-2 font-medium">Regla</th>
                                    <th className="px-3 py-2 font-medium">Periodo</th>
                                    <th className="px-3 py-2 font-medium">Motivo</th>
                                    <th className="px-3 py-2 font-medium">Registro</th>
                                    <th className="px-3 py-2" />
                                </tr>
                            </thead>
                            <tbody>
                                {lotes.map((lote) => {
                                    const r = lote.reglas[0];
                                    return (
                                        <tr key={lote.clave} className={`border-t align-top ${r.activa ? "" : "text-continental-gray-1 bg-slate-50"}`}>
                                            <td className="px-3 py-1.5">{destinoLote(lote)}</td>
                                            <td className="px-3 py-1.5">
                                                <span className={r.tipo === "RolNormal" ? "text-green-700" : "text-slate-700 font-medium"}>{reglaTexto(r)}</span>
                                                {r.activa && coberturaParcial(lote).length > 0 && (
                                                    <div className="mt-1 rounded bg-amber-50 border border-amber-200 px-2 py-1 text-xs text-amber-900 max-w-md">
                                                        {coberturaParcial(lote).map((x) => (
                                                            <div key={x.id}>
                                                                <AlertTriangle className="inline w-3 h-3 mr-1" />
                                                                {lote.reglas.length > 1 ? `${x.area}: ` : ""}manda en {x.diasQueManda} de {x.diasDelPeriodo} días. Le gana:{" "}
                                                                {(x.ganadaPor ?? []).join("; ")}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-3 py-1.5 tabular-nums whitespace-nowrap">
                                                {r.fechaInicio.slice(0, 10) === r.fechaFin.slice(0, 10)
                                                    ? fechaLarga(r.fechaInicio)
                                                    : `${fecha(r.fechaInicio)} – ${fecha(r.fechaFin)}`}
                                            </td>
                                            <td className="px-3 py-1.5">{r.motivo || "—"}</td>
                                            <td className="px-3 py-1.5 text-xs">
                                                Alta: {r.creadoPor ?? "—"} · {format(new Date(r.fechaCreacion), "dd/MM/yyyy HH:mm")}
                                                {!r.activa && (
                                                    <div>
                                                        Desactivada: {r.desactivadoPor ?? "—"}
                                                        {r.fechaDesactivacion ? ` · ${format(new Date(r.fechaDesactivacion), "dd/MM/yyyy HH:mm")}` : ""}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-3 py-1.5 text-right whitespace-nowrap">
                                                {r.activa ? (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="text-red-700 border-red-300"
                                                        onClick={() => {
                                                            if (
                                                                window.confirm(
                                                                    `¿Desactivar "${reglaTexto(r)}" (${lote.reglas.length > 1 ? `${lote.reglas.length} unidades` : r.area})? En esas fechas vuelve a mandar la regla que siga, o el rol normal.`
                                                                )
                                                            )
                                                                cambiarEstado(lote, false);
                                                        }}
                                                    >
                                                        <XCircle className="w-4 h-4 mr-1" /> Desactivar
                                                    </Button>
                                                ) : (
                                                    <Button size="sm" variant="outline" onClick={() => cambiarEstado(lote, true)}>
                                                        <RotateCcw className="w-4 h-4 mr-1" /> Reactivar
                                                    </Button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {/* Vacaciones que quedaron en días no laborables */}
            <section className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="mr-auto">
                        <h3 className="font-semibold">Vacaciones ya programadas en días de paro</h3>
                        <p className="text-xs text-continental-gray-1">
                            Días que se programaron antes de la regla (p. ej. días por la empresa en un domingo que después se
                            declaró paro sin asignaciones). No se mueven solos: se reprograman desde el calendario del empleado o,
                            si son muchos, con el machote de abajo.
                        </p>
                    </div>
                    <Button variant="outline" onClick={revisarAfectadas} disabled={buscandoAfectadas}>
                        {buscandoAfectadas ? "Revisando…" : `Revisar ${anioElegido}`}
                    </Button>
                </div>
                {afectadas &&
                    (afectadas.length === 0 ? (
                        <p className="text-sm text-green-700">Ninguna vacación cae en un día de paro en {anioElegido}.</p>
                    ) : (
                        <div className="overflow-x-auto border rounded-lg">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 text-left">
                                    <tr>
                                        <th className="px-3 py-2 font-medium">Nómina</th>
                                        <th className="px-3 py-2 font-medium">Nombre</th>
                                        <th className="px-3 py-2 font-medium">Área / grupo</th>
                                        <th className="px-3 py-2 font-medium">Día</th>
                                        <th className="px-3 py-2 font-medium">Tipo</th>
                                        <th className="px-3 py-2" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {afectadas.map((v) => (
                                        <tr key={v.vacacionId} className="border-t">
                                            <td className="px-3 py-1.5 tabular-nums">{v.nomina ?? "—"}</td>
                                            <td className="px-3 py-1.5">{v.nombre}</td>
                                            <td className="px-3 py-1.5 text-continental-gray-1">
                                                {v.area} · {v.grupo}
                                            </td>
                                            <td className="px-3 py-1.5 tabular-nums">{fechaLarga(v.fecha)}</td>
                                            <td className="px-3 py-1.5">{v.tipoVacacion}</td>
                                            <td className="px-3 py-1.5 text-right">
                                                <Button size="sm" variant="ghost" onClick={() => navigate(`${baseEmpleado}/${v.empleadoId}`)}>
                                                    Ver empleado
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ))}
            </section>

            <DiasEmpresaEnParoReporte anio={anioElegido} areas={areas} />

            {esSuperUsuario && (
                <MovimientoMasivoDiasEmpresa anio={anioElegido} onAplicado={() => afectadas && revisarAfectadas()} />
            )}
        </div>
    );
};
