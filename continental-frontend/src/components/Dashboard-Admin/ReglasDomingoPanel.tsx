import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { addDays, endOfMonth, format, parseISO, startOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { CalendarOff, Plus, RotateCcw, Search, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVacationConfig } from "@/hooks/useVacationConfig";
import { areasService } from "@/services/areasService";
import type { Area } from "@/interfaces/Areas.interface";
import { UserRole } from "@/interfaces/User.interface";
import useAuth from "@/hooks/useAuth";
import { MovimientoMasivoDiasEmpresa } from "./MovimientoMasivoDiasEmpresa";
import {
    reglasDomingoService,
    type ReglaDomingo,
    type ReglasDomingoResponse,
    type TipoReglaDomingo,
    type VacacionEnNoLaborable,
} from "@/services/reglasDomingoService";

type AlcanceDomingo = "Planta" | "Areas" | "Grupo";
type PeriodoDomingo = "Domingo" | "Mes" | "Rango";

/** Reglas que se guardaron juntas (p. ej. toda la planta): un renglón en la lista. */
interface Lote {
    clave: string
    reglas: ReglaDomingo[]
}

const iso = (d: Date) => format(d, "yyyy-MM-dd");

/**
 * Domingos por periodo (planeación 2027, punto 1; nov-2026 se pasó a "Capacidad
 * por periodo"). Por unidad organizativa —o toda la planta, o un grupo— y por un
 * periodo (un domingo, un mes o un rango), los domingos son "no laborables"
 * (nadie trabaja: no se programan vacaciones ni días por la empresa, el rol
 * semanal y los calendarios los muestran como descanso) o "en base a rol" (cada
 * quien según su rol). Las reglas se pueden encimar: manda la de periodo más
 * corto, así un domingo suelto (un paro por falta de luz, o habilitar a toda la
 * planta) se configura sin tocar el periodo largo.
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
    const [periodo, setPeriodo] = useState<PeriodoDomingo>("Domingo");
    const [dia, setDia] = useState("");
    const [mes, setMes] = useState("");
    const [desde, setDesde] = useState("");
    const [hasta, setHasta] = useState("");
    const [tipo, setTipo] = useState<TipoReglaDomingo>("RolNormal");
    const [conSabado, setConSabado] = useState(false);
    const [motivo, setMotivo] = useState("");
    const [guardando, setGuardando] = useState(false);

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
            if (periodo === "Domingo") {
                if (!dia) return null;
                // El domingo de esa semana (lunes a domingo); con sábado, desde el sábado.
                const domingo = addDays(startOfWeek(parseISO(dia), { weekStartsOn: 1 }), 6);
                const inicio = conSabado ? addDays(domingo, -1) : domingo;
                return {
                    inicio: iso(inicio),
                    fin: iso(domingo),
                    texto: conSabado
                        ? `el sábado ${format(inicio, "dd/MM")} y domingo ${format(domingo, "dd/MM/yyyy")}`
                        : `el domingo ${format(domingo, "dd/MM/yyyy")}`,
                };
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
    }, [periodo, dia, mes, desde, hasta, conSabado]);

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
                // En "un domingo" el sábado ya va en las fechas; en un periodo largo
                // "también sábados" solo aplica a no laborables.
                incluyeSabado: tipo === "SinDomingo" && conSabado,
                fechaInicio: rango.inicio,
                fechaFin: rango.fin,
                motivo: motivo.trim() || undefined,
            });
            const partes = [
                r.creadas ? `${r.creadas} guardada(s)` : "",
                r.reemplazadas ? `${r.reemplazadas} reemplazaron a una de las mismas fechas` : "",
                r.yaExistian ? `${r.yaExistian} ya estaban igual` : "",
            ].filter(Boolean);
            toast.success(`Domingos: ${tipo === "RolNormal" ? "en base a rol" : "no laborables"}`, {
                description: `${partes.join(", ")}.${tipo === "SinDomingo" ? " Revisa abajo si hay vacaciones ya programadas en esos días." : ""}`,
                duration: 8000,
            });
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
                : [r.tipo, r.incluyeSabado, r.fechaInicio, r.fechaFin, r.motivo ?? "", r.creadoPor ?? "", r.fechaCreacion.slice(0, 19), r.activa].join("|");
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

    const reglaTexto = (r: ReglaDomingo) =>
        r.tipo === "RolNormal" ? "En base a rol" : r.incluyeSabado ? "No laborable (sábado y domingo)" : "No laborable (domingo)";

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                    <CalendarOff className="w-5 h-5" /> Domingos por periodo
                </h2>
                <p className="text-sm text-continental-gray-1 mt-1">
                    Define, para toda la planta, unas unidades organizativas o un grupo, si los domingos de un periodo son{" "}
                    <strong>en base a rol</strong> (cada quien trabaja o descansa según su rol, como siempre) o{" "}
                    <strong>no laborables</strong> (nadie trabaja: el rol semanal y los calendarios lo muestran como descanso,
                    la captura del operador lo ve rayado con aviso y no se programan vacaciones ni días por la empresa). Sin
                    regla, los domingos van en base a rol.
                </p>
                <p className="text-xs text-continental-gray-1 mt-2">
                    Se pueden encimar: manda la de periodo más corto, igual que en la capacidad. Ejemplo: Producción sin
                    domingos de enero a marzo y, para un domingo en que hay que habilitar a toda la planta, "Toda la planta ·
                    un domingo · en base a rol". Si duran lo mismo, manda la del grupo sobre la del área, y luego la más
                    reciente.
                </p>
                <p className="text-xs text-continental-gray-1 mt-1">
                    Orden antes de asignar días por la empresa: 1) rol y arranques de las reglas de turno, 2) días festivos,
                    3) estos domingos y la capacidad, 4) asignar días por la empresa.
                </p>
            </div>

            {datos && !datos.tablaExiste && (
                <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                    Falta crear la tabla en la base: corre <code>Scripts/Migration_ReglasDomingo.sql</code>. Mientras tanto
                    todos los domingos van en base a rol.
                </div>
            )}

            {/* Alta */}
            <section className="rounded-lg border p-4 space-y-4 text-sm">
                <h3 className="font-semibold flex items-center gap-2">
                    <Plus className="w-4 h-4" /> Nueva regla de domingos
                </h3>

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
                            <option value="Domingo">Un domingo</option>
                            <option value="Mes">Un mes</option>
                            <option value="Rango">Rango de fechas</option>
                        </select>
                    </label>
                    {periodo === "Domingo" && (
                        <label className="flex flex-col gap-1">
                            <span className="text-xs font-medium text-continental-gray-1">Domingo (o cualquier día de esa semana)</span>
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

                <fieldset className="space-y-1">
                    <legend className="text-xs font-medium text-continental-gray-1">Esos domingos</legend>
                    <label className="flex items-center gap-2">
                        <input type="radio" name="tipoRegla" checked={tipo === "RolNormal"} onChange={() => setTipo("RolNormal")} />
                        En base a rol (rol regular: trabaja o descansa cada quien según su rol)
                    </label>
                    <label className="flex items-center gap-2">
                        <input type="radio" name="tipoRegla" checked={tipo === "SinDomingo"} onChange={() => setTipo("SinDomingo")} />
                        No laborables (nadie trabaja; no se programan vacaciones ni días por la empresa)
                    </label>
                    {(tipo === "SinDomingo" || periodo === "Domingo") && (
                        <label className="flex items-center gap-2 pl-6">
                            <input type="checkbox" checked={conSabado} onChange={(e) => setConSabado(e.target.checked)} />
                            {periodo === "Domingo" ? "También el sábado de esa semana" : "También sábados (se detiene el rol el sábado)"}
                        </label>
                    )}
                </fieldset>

                <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-continental-gray-1">Motivo (ej. paro por falta de luz, se habilita la planta…)</span>
                    <input className="h-9 rounded-md border px-2" maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                </label>

                <div className="flex flex-wrap items-center gap-3">
                    <Button variant="continental" onClick={guardar} disabled={guardando || (datos ? !datos.tablaExiste : false)}>
                        {guardando ? "Guardando…" : "Guardar regla de domingos"}
                    </Button>
                    {rango && (
                        <span className="text-continental-gray-1">
                            Se guardará: <strong>{tipo === "RolNormal" ? "en base a rol" : "no laborable"}</strong>{" "}
                            {periodo === "Domingo"
                                ? rango.texto
                                : `los ${tipo === "RolNormal" ? "fines de semana" : conSabado ? "sábados y domingos" : "domingos"} de ${rango.texto}`}
                            , {destinoTexto}.
                        </span>
                    )}
                </div>
            </section>

            {/* Lista */}
            <section className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                    <h3 className="font-semibold mr-auto">Reglas de domingos del año</h3>
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
                    <p className="text-sm text-continental-gray-1">No hay reglas en {anioElegido}: todos los domingos van en base a rol.</p>
                ) : (
                    <div className="overflow-x-auto border rounded-lg">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-left">
                                <tr>
                                    <th className="px-3 py-2 font-medium">Aplica a</th>
                                    <th className="px-3 py-2 font-medium">Domingos</th>
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
                        <h3 className="font-semibold">Vacaciones ya programadas en días no laborables</h3>
                        <p className="text-xs text-continental-gray-1">
                            Días que se programaron antes de la regla (p. ej. días por la empresa en un domingo que después se
                            declaró no laborable). No se mueven solos: se reprograman desde el calendario del empleado o,
                            si son muchos, con el machote de abajo.
                        </p>
                    </div>
                    <Button variant="outline" onClick={revisarAfectadas} disabled={buscandoAfectadas}>
                        {buscandoAfectadas ? "Revisando…" : `Revisar ${anioElegido}`}
                    </Button>
                </div>
                {afectadas &&
                    (afectadas.length === 0 ? (
                        <p className="text-sm text-green-700">Ninguna vacación cae en un día no laborable en {anioElegido}.</p>
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

            {esSuperUsuario && (
                <MovimientoMasivoDiasEmpresa anio={anioElegido} onAplicado={() => afectadas && revisarAfectadas()} />
            )}
        </div>
    );
};
