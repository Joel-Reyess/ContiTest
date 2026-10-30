import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { CalendarOff, Plus, RotateCcw, Search, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVacationConfig } from "@/hooks/useVacationConfig";
import { areasService } from "@/services/areasService";
import type { Area } from "@/interfaces/Areas.interface";
import {
    reglasDomingoService,
    type ReglasDomingoResponse,
    type TipoReglaDomingo,
    type VacacionEnNoLaborable,
} from "@/services/reglasDomingoService";

/**
 * Domingos por unidad organizativa (planeación 2027, punto 1). Por unidad
 * organizativa —no por el nombre "Producción" o "Mantenimiento"— y por un
 * periodo elegido en el calendario, se define si los domingos son laborables
 * (rol normal a siete días) o no. En los no laborables no se programan
 * vacaciones ni días por la empresa; el rol semanal y los calendarios los
 * muestran como descanso y la captura los sombrea con aviso.
 */
export const ReglasDomingoPanel = () => {
    const navigate = useNavigate();
    const { config } = useVacationConfig();
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
    const [busqueda, setBusqueda] = useState("");
    const [areaIds, setAreaIds] = useState<number[]>([]);
    const [grupoId, setGrupoId] = useState<number | "">("");
    const [tipo, setTipo] = useState<TipoReglaDomingo>("SinDomingo");
    const [incluyeSabado, setIncluyeSabado] = useState(false);
    const [desde, setDesde] = useState("");
    const [hasta, setHasta] = useState("");
    const [motivo, setMotivo] = useState("");
    const [guardando, setGuardando] = useState(false);

    const [afectadas, setAfectadas] = useState<VacacionEnNoLaborable[] | null>(null);
    const [buscandoAfectadas, setBuscandoAfectadas] = useState(false);

    const cargar = useCallback(async () => {
        setCargando(true);
        try {
            setDatos(await reglasDomingoService.listar(anioElegido, verDesactivadas));
        } catch (e) {
            toast.error("No se pudieron cargar las reglas", { description: (e as Error).message });
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
    const gruposDeLaUnica = areaIds.length === 1 ? areas.find((a) => a.areaId === areaIds[0])?.grupos ?? [] : [];

    const fecha = (iso: string) => format(parseISO(iso.slice(0, 10)), "dd/MM/yyyy", { locale: es });

    const guardar = async () => {
        if (areaIds.length === 0) {
            toast.error("Selecciona al menos una unidad organizativa");
            return;
        }
        if (!desde || !hasta || hasta < desde) {
            toast.error("Elige el periodo: la fecha final no puede ser antes de la inicial");
            return;
        }
        setGuardando(true);
        try {
            const creadas = await reglasDomingoService.crear({
                areaIds,
                grupoId: areaIds.length === 1 && grupoId ? Number(grupoId) : undefined,
                tipo,
                incluyeSabado: tipo === "SinDomingo" && incluyeSabado,
                fechaInicio: desde,
                fechaFin: hasta,
                motivo: motivo.trim() || undefined,
            });
            toast.success(`${creadas} regla(s) guardada(s)`, {
                description: "Revisa abajo si hay vacaciones ya programadas en esos días.",
            });
            setAreaIds([]);
            setGrupoId("");
            setMotivo("");
            setAfectadas(null);
            await cargar();
        } catch (e) {
            toast.error("No se pudo guardar", { description: (e as Error).message, duration: 10000 });
        } finally {
            setGuardando(false);
        }
    };

    const cambiarEstado = async (id: number, activar: boolean) => {
        try {
            if (activar) await reglasDomingoService.reactivar(id);
            else await reglasDomingoService.desactivar(id);
            toast.success(activar ? "Reactivada" : "Desactivada: en esas fechas vuelve el rol normal a siete días");
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

    return (
        <div className="p-4 bg-white border border-continental-gray-3 rounded-lg space-y-6">
            <div>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                    <CalendarOff className="w-5 h-5" /> Domingos por unidad organizativa
                </h2>
                <p className="text-sm text-continental-gray-1 mt-1">
                    Define por unidad organizativa y por periodo si los domingos son laborables. En un periodo "sin
                    domingos" ese día nadie trabaja: el rol semanal y los calendarios lo muestran como descanso, la captura
                    del operador lo ve rayado con aviso, y no se pueden programar vacaciones ni días por la empresa. Sin
                    regla, la unidad sigue con el rol normal a siete días.
                </p>
                <p className="text-xs text-continental-gray-1 mt-2">
                    Orden antes de asignar días por la empresa: 1) rol y arranques de las reglas de turno, 2) días festivos,
                    3) estas reglas de domingos, 4) asignar días por la empresa.
                </p>
            </div>

            {datos && !datos.tablaExiste && (
                <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                    Falta crear la tabla en la base: corre <code>Scripts/Migration_ReglasDomingo.sql</code>. Mientras tanto
                    todas las unidades siguen con el rol normal.
                </div>
            )}

            {/* Alta */}
            <section className="rounded-lg border p-4 space-y-3">
                <h3 className="font-semibold flex items-center gap-2">
                    <Plus className="w-4 h-4" /> Nueva regla
                </h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-sm">
                    <div className="space-y-2 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-continental-gray-1">
                                Unidades organizativas ({areaIds.length} elegidas)
                            </span>
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
                                        onChange={(e) => {
                                            setGrupoId("");
                                            setAreaIds((ids) => (e.target.checked ? [...ids, a.areaId] : ids.filter((x) => x !== a.areaId)));
                                        }}
                                    />
                                    <span>{a.nombreGeneral}</span>
                                    <span className="text-xs text-continental-gray-1 truncate">{a.unidadOrganizativaSap}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                    <div className="space-y-3">
                        <fieldset className="space-y-1">
                            <legend className="text-xs font-medium text-continental-gray-1">En ese periodo</legend>
                            <label className="flex items-center gap-2">
                                <input type="radio" name="tipoRegla" checked={tipo === "SinDomingo"} onChange={() => setTipo("SinDomingo")} />
                                Domingos no laborables
                            </label>
                            {tipo === "SinDomingo" && (
                                <label className="flex items-center gap-2 pl-6">
                                    <input type="checkbox" checked={incluyeSabado} onChange={(e) => setIncluyeSabado(e.target.checked)} />
                                    También sábados (se detiene el rol el sábado)
                                </label>
                            )}
                            <label className="flex items-center gap-2">
                                <input type="radio" name="tipoRegla" checked={tipo === "RolNormal"} onChange={() => setTipo("RolNormal")} />
                                Rol normal a siete días (excepción, p. ej. un grupo dentro de un área sin domingos)
                            </label>
                        </fieldset>
                        {areaIds.length === 1 && gruposDeLaUnica.length > 0 && (
                            <label className="flex flex-col gap-1">
                                <span className="text-xs font-medium text-continental-gray-1">Solo un grupo (opcional)</span>
                                <select className="h-9 rounded-md border px-2" value={grupoId} onChange={(e) => setGrupoId(e.target.value ? Number(e.target.value) : "")}>
                                    <option value="">Toda la unidad organizativa</option>
                                    {gruposDeLaUnica.map((g) => (
                                        <option key={g.grupoId} value={g.grupoId}>
                                            {g.rol}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                            <label className="flex flex-col gap-1">
                                <span className="text-xs font-medium text-continental-gray-1">Desde</span>
                                <input type="date" className="h-9 rounded-md border px-2" value={desde} onChange={(e) => setDesde(e.target.value)} />
                            </label>
                            <label className="flex flex-col gap-1">
                                <span className="text-xs font-medium text-continental-gray-1">Hasta</span>
                                <input type="date" className="h-9 rounded-md border px-2" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} />
                            </label>
                        </div>
                        <label className="flex flex-col gap-1">
                            <span className="text-xs font-medium text-continental-gray-1">Motivo (ej. Producción hasta el paro de Semana Santa)</span>
                            <input className="h-9 rounded-md border px-2" maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                        </label>
                        <Button variant="continental" onClick={guardar} disabled={guardando || (datos ? !datos.tablaExiste : false)}>
                            {guardando ? "Guardando…" : `Guardar ${areaIds.length > 1 ? `${areaIds.length} reglas` : "regla"}`}
                        </Button>
                    </div>
                </div>
            </section>

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
                ) : !datos || datos.reglas.length === 0 ? (
                    <p className="text-sm text-continental-gray-1">No hay reglas en {anioElegido}: todas las unidades trabajan con el rol normal a siete días.</p>
                ) : (
                    <div className="overflow-x-auto border rounded-lg">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-left">
                                <tr>
                                    <th className="px-3 py-2 font-medium">Unidad organizativa</th>
                                    <th className="px-3 py-2 font-medium">Regla</th>
                                    <th className="px-3 py-2 font-medium">Periodo</th>
                                    <th className="px-3 py-2 font-medium">Motivo</th>
                                    <th className="px-3 py-2 font-medium">Registro</th>
                                    <th className="px-3 py-2" />
                                </tr>
                            </thead>
                            <tbody>
                                {datos.reglas.map((r) => (
                                    <tr key={r.id} className={`border-t align-top ${r.activa ? "" : "text-continental-gray-1 bg-slate-50"}`}>
                                        <td className="px-3 py-1.5">
                                            {r.area}
                                            {r.grupo ? <span className="text-xs text-continental-gray-1"> · grupo {r.grupo}</span> : null}
                                        </td>
                                        <td className="px-3 py-1.5">
                                            {r.tipo === "SinDomingo" ? (r.incluyeSabado ? "Sin sábados ni domingos" : "Sin domingos") : "Rol normal (7 días)"}
                                        </td>
                                        <td className="px-3 py-1.5 tabular-nums whitespace-nowrap">
                                            {fecha(r.fechaInicio)} – {fecha(r.fechaFin)}
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
                                                        if (window.confirm(`¿Desactivar la regla de ${r.area}? En esas fechas vuelve el rol normal a siete días.`))
                                                            cambiarEstado(r.id, false);
                                                    }}
                                                >
                                                    <XCircle className="w-4 h-4 mr-1" /> Desactivar
                                                </Button>
                                            ) : (
                                                <Button size="sm" variant="outline" onClick={() => cambiarEstado(r.id, true)}>
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

            {/* Vacaciones que quedaron en días no laborables */}
            <section className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="mr-auto">
                        <h3 className="font-semibold">Vacaciones ya programadas en días no laborables</h3>
                        <p className="text-xs text-continental-gray-1">
                            Días que se programaron antes de la regla. No se mueven solos: se reprograman desde el calendario del
                            empleado.
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
                                            <td className="px-3 py-1.5 tabular-nums">
                                                {format(parseISO(v.fecha.slice(0, 10)), "EEE dd/MM/yyyy", { locale: es })}
                                            </td>
                                            <td className="px-3 py-1.5">{v.tipoVacacion}</td>
                                            <td className="px-3 py-1.5 text-right">
                                                <Button size="sm" variant="ghost" onClick={() => navigate(`/admin/plantilla/${v.empleadoId}`)}>
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
        </div>
    );
};
