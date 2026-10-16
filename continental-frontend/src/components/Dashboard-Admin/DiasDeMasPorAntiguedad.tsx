import { Fragment, useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { AlertTriangle, Check, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVacationConfig } from "@/hooks/useVacationConfig";
import {
    vacacionesRetenidasService,
    type ExcesoAntiguedad,
    type VacacionRetenida,
} from "@/services/vacacionesRetenidasService";

/**
 * "Días de más por antigüedad" (solo superusuario, opción B acordada con el
 * cliente, oct-2026).
 *
 * El Excel de SAP se puede editar antes de cargarse. Cuando trae un día que
 * dejaría al empleado con más días de común acuerdo de los que le tocan, la
 * sincronización ya no lo da de alta: lo deja aquí. Mientras esté pendiente no
 * aparece en el rol, el calendario ni el porcentaje del día. El superusuario lo
 * acepta (se crea la vacación) o lo descarta (y RH lo corrige en SAP).
 *
 * Abajo, los empleados que HOY ya tienen días de más (casos de antes de la
 * retención, o lo que se aceptó).
 */
export const DiasDeMasPorAntiguedad = () => {
    const navigate = useNavigate();
    const { config } = useVacationConfig();
    const anios = [config?.anioVigente, config?.anioProgramacionAnual]
        .filter((a): a is number => typeof a === "number")
        .filter((a, i, arr) => arr.indexOf(a) === i)
        .sort((a, b) => a - b);

    const [estado, setEstado] = useState<"Pendiente" | "Todas">("Pendiente");
    const [retenidas, setRetenidas] = useState<VacacionRetenida[] | null>(null);
    const [tablaExiste, setTablaExiste] = useState(true);
    const [cargando, setCargando] = useState(false);
    const [resolviendo, setResolviendo] = useState<number | null>(null);

    const [anioExcesos, setAnioExcesos] = useState<number | null>(null);
    const anioElegido = anioExcesos ?? config?.anioVigente ?? new Date().getFullYear();
    const [excesos, setExcesos] = useState<ExcesoAntiguedad[] | null>(null);
    const [cargandoExcesos, setCargandoExcesos] = useState(false);
    const [abierto, setAbierto] = useState<number | null>(null);

    const fecha = (iso: string) => format(new Date(`${iso.slice(0, 10)}T00:00:00`), "EEE dd/MM/yyyy", { locale: es });
    const fechaHora = (iso: string) => format(new Date(iso), "dd/MM/yyyy HH:mm", { locale: es });

    const cargar = useCallback(async () => {
        setCargando(true);
        try {
            const r = await vacacionesRetenidasService.obtener(estado);
            setTablaExiste(r.tablaExiste);
            setRetenidas(r.retenidas);
        } catch (e) {
            toast.error("No se pudieron cargar los días retenidos", { description: (e as Error).message });
        } finally {
            setCargando(false);
        }
    }, [estado]);

    useEffect(() => {
        cargar();
    }, [cargar]);

    const resolver = async (r: VacacionRetenida, accion: "aceptar" | "descartar") => {
        const texto =
            accion === "aceptar"
                ? `¿Aceptar el ${fecha(r.fecha)} para ${r.nombre}?\n\nLe corresponden ${r.corresponden} días de común acuerdo y hoy tiene ${r.tieneHoy}: quedará con uno más de lo que le toca por antigüedad.`
                : `¿Descartar el ${fecha(r.fecha)} de ${r.nombre}?\n\nEl día no se le da. Hay que corregirlo en SAP (dejarlo en 0 días) para que el Excel deje de traerlo.`;
        const nota = window.prompt(`${texto}\n\nNota (opcional):`, "");
        if (nota === null) return;
        setResolviendo(r.id);
        try {
            if (accion === "aceptar") await vacacionesRetenidasService.aceptar(r.id, nota);
            else await vacacionesRetenidasService.descartar(r.id, nota);
            toast.success(accion === "aceptar" ? "Día aceptado" : "Día descartado", {
                description:
                    accion === "aceptar"
                        ? "Ya aparece como vacación del empleado."
                        : "Recuerda corregirlo en SAP (0 días).",
            });
            await cargar();
        } catch (e) {
            toast.error("No se pudo completar", { description: (e as Error).message, duration: 10000 });
        } finally {
            setResolviendo(null);
        }
    };

    const buscarExcesos = async () => {
        setCargandoExcesos(true);
        try {
            setExcesos(await vacacionesRetenidasService.excesos(anioElegido));
        } catch (e) {
            toast.error("No se pudo consultar", { description: (e as Error).message });
        } finally {
            setCargandoExcesos(false);
        }
    };

    return (
        <div className="p-4 bg-white border border-continental-gray-3 rounded-lg space-y-6">
            <div>
                <h2 className="text-lg font-semibold">Días de más por antigüedad</h2>
                <p className="text-sm text-continental-gray-1 mt-1">
                    Cuando el Excel de SAP trae un día que dejaría a un empleado con más días de común acuerdo de los
                    que le tocan por antigüedad, la carga ya no se lo da: lo deja aquí. Mientras esté pendiente no
                    aparece en el rol, el calendario ni el porcentaje del día. <strong>Aceptar</strong> se lo da;
                    <strong> Descartar</strong> no, y hay que corregirlo en SAP (dejarlo en 0 días).
                </p>
            </div>

            {!tablaExiste && (
                <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                    Falta crear la tabla en la base: corre <code>Scripts/Migration_VacacionesRetenidasSAP.sql</code>.
                    Mientras tanto la carga del Excel da de alta los días sin revisar la antigüedad.
                </div>
            )}

            {/* Días retenidos */}
            <section className="space-y-3">
                <div className="flex flex-wrap items-end gap-3">
                    <h3 className="font-semibold mr-auto">Días retenidos del Excel</h3>
                    <select
                        className="h-9 rounded-md border px-2 text-sm"
                        value={estado}
                        onChange={(e) => setEstado(e.target.value as "Pendiente" | "Todas")}
                    >
                        <option value="Pendiente">Pendientes</option>
                        <option value="Todas">Todas (incluye aceptadas y descartadas)</option>
                    </select>
                </div>
                {cargando ? (
                    <p className="text-sm text-continental-gray-1">Cargando…</p>
                ) : !retenidas || retenidas.length === 0 ? (
                    <p className="text-sm text-green-700">No hay días retenidos{estado === "Pendiente" ? " pendientes" : ""}.</p>
                ) : (
                    <div className="overflow-x-auto border rounded-lg">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-left">
                                <tr>
                                    <th className="px-3 py-2 font-medium">Nómina</th>
                                    <th className="px-3 py-2 font-medium">Nombre</th>
                                    <th className="px-3 py-2 font-medium">Área / grupo</th>
                                    <th className="px-3 py-2 font-medium">Día del Excel</th>
                                    <th className="px-3 py-2 font-medium text-right">Le tocan</th>
                                    <th className="px-3 py-2 font-medium text-right">Tiene hoy</th>
                                    <th className="px-3 py-2 font-medium">Llegó en la carga</th>
                                    <th className="px-3 py-2 font-medium">Estado</th>
                                    <th className="px-3 py-2" />
                                </tr>
                            </thead>
                            <tbody>
                                {retenidas.map((r) => (
                                    <tr key={r.id} className="border-t align-top">
                                        <td className="px-3 py-1.5 tabular-nums">{r.nomina}</td>
                                        <td className="px-3 py-1.5">{r.nombre}</td>
                                        <td className="px-3 py-1.5 text-continental-gray-1">
                                            {r.area} · {r.grupo}
                                        </td>
                                        <td className="px-3 py-1.5 tabular-nums">{fecha(r.fecha)}</td>
                                        <td className="px-3 py-1.5 text-right tabular-nums" title={`${r.antiguedad} años de antigüedad`}>
                                            {r.corresponden}
                                        </td>
                                        <td className="px-3 py-1.5 text-right tabular-nums">{r.tieneHoy}</td>
                                        <td className="px-3 py-1.5 tabular-nums text-continental-gray-1">{fechaHora(r.fechaCargaExcel)}</td>
                                        <td className="px-3 py-1.5">
                                            {r.estado === "Pendiente" ? (
                                                <span className="text-amber-700 font-medium">Pendiente</span>
                                            ) : (
                                                <span className={r.estado === "Aceptada" ? "text-green-700" : "text-continental-gray-1"}>
                                                    {r.estado}
                                                    {r.resueltoPor ? ` por ${r.resueltoPor}` : ""}
                                                    {r.nota ? ` — ${r.nota}` : ""}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-3 py-1.5 whitespace-nowrap text-right space-x-2">
                                            {r.estado === "Pendiente" && (
                                                <>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        disabled={resolviendo === r.id}
                                                        onClick={() => resolver(r, "aceptar")}
                                                        className="text-green-700 border-green-300"
                                                    >
                                                        <Check className="w-4 h-4 mr-1" /> Aceptar
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        disabled={resolviendo === r.id}
                                                        onClick={() => resolver(r, "descartar")}
                                                        className="text-red-700 border-red-300"
                                                    >
                                                        <X className="w-4 h-4 mr-1" /> Descartar
                                                    </Button>
                                                </>
                                            )}
                                            <Button size="sm" variant="ghost" onClick={() => navigate(`/admin/plantilla/${r.empleadoId}`)}>
                                                Ver empleado
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {/* Empleados que ya tienen días de más */}
            <section className="space-y-3">
                <div className="flex flex-wrap items-end gap-3">
                    <div className="mr-auto">
                        <h3 className="font-semibold">Empleados que hoy tienen días de más</h3>
                        <p className="text-xs text-continental-gray-1">
                            Vacaciones activas del año contra lo que les toca por antigüedad (empresa y común acuerdo).
                            Incluye casos de antes de la retención y lo que se haya aceptado.
                        </p>
                    </div>
                    <select
                        className="h-9 rounded-md border px-2 text-sm"
                        value={anioElegido}
                        onChange={(e) => {
                            setAnioExcesos(Number(e.target.value));
                            setExcesos(null);
                        }}
                    >
                        {(anios.length ? anios : [anioElegido]).map((a) => (
                            <option key={a} value={a}>
                                {a}
                            </option>
                        ))}
                    </select>
                    <Button variant="continental" onClick={buscarExcesos} disabled={cargandoExcesos} className="flex items-center gap-2">
                        <Search className="w-4 h-4" />
                        {cargandoExcesos ? "Revisando…" : "Buscar"}
                    </Button>
                </div>
                {excesos &&
                    (excesos.length === 0 ? (
                        <p className="text-sm text-green-700">Nadie tiene días de más en {anioElegido}.</p>
                    ) : (
                        <div className="space-y-2">
                            <p className="text-sm flex items-center gap-2 text-amber-800">
                                <AlertTriangle className="w-4 h-4" /> {excesos.length} empleado(s) con días de más en {anioElegido}.
                            </p>
                            <div className="overflow-x-auto border rounded-lg">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50 text-left">
                                        <tr>
                                            <th className="px-3 py-2 font-medium">Nómina</th>
                                            <th className="px-3 py-2 font-medium">Nombre</th>
                                            <th className="px-3 py-2 font-medium">Área / grupo</th>
                                            <th className="px-3 py-2 font-medium text-right">Empresa (tiene / le tocan)</th>
                                            <th className="px-3 py-2 font-medium text-right">Común acuerdo (tiene / le tocan)</th>
                                            <th className="px-3 py-2 font-medium text-right">De más</th>
                                            <th className="px-3 py-2" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {excesos.map((x) => (
                                            <Fragment key={x.empleadoId}>
                                                <tr className="border-t">
                                                    <td className="px-3 py-1.5 tabular-nums">{x.nomina ?? "—"}</td>
                                                    <td className="px-3 py-1.5">{x.nombre}</td>
                                                    <td className="px-3 py-1.5 text-continental-gray-1">
                                                        {x.area} · {x.grupo}
                                                    </td>
                                                    <td className="px-3 py-1.5 text-right tabular-nums">
                                                        {x.tieneEmpresa} / {x.correspondenEmpresa}
                                                    </td>
                                                    <td className="px-3 py-1.5 text-right tabular-nums">
                                                        {x.tieneComunAcuerdo} / {x.correspondenComunAcuerdo}
                                                    </td>
                                                    <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-red-700">{x.exceso}</td>
                                                    <td className="px-3 py-1.5 whitespace-nowrap text-right space-x-2">
                                                        <Button size="sm" variant="ghost" onClick={() => setAbierto(abierto === x.empleadoId ? null : x.empleadoId)}>
                                                            {abierto === x.empleadoId ? "Ocultar días" : "Ver días"}
                                                        </Button>
                                                        <Button size="sm" variant="ghost" onClick={() => navigate(`/admin/plantilla/${x.empleadoId}`)}>
                                                            Ver empleado
                                                        </Button>
                                                    </td>
                                                </tr>
                                                {abierto === x.empleadoId && (
                                                    <tr className="bg-slate-50">
                                                        <td colSpan={7} className="px-3 py-2">
                                                            <ul className="text-xs space-y-0.5">
                                                                {x.dias.map((d) => (
                                                                    <li key={`${d.fecha}-${d.tipoVacacion}`}>
                                                                        <span className="tabular-nums">{fecha(d.fecha)}</span> · {d.tipoVacacion}
                                                                        {d.vieneDelExcel && <span className="text-amber-700"> · del Excel</span>}
                                                                        {d.observaciones ? <span className="text-continental-gray-1"> — {d.observaciones}</span> : null}
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </td>
                                                    </tr>
                                                )}
                                            </Fragment>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ))}
            </section>
        </div>
    );
};
