import { useCallback, useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { ClipboardList, Download, History, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Area } from "@/interfaces/Areas.interface";
import {
    reglasDomingoService,
    type DiaEmpresaEnParo,
    type MovimientoDiaEmpresa,
} from "@/services/reglasDomingoService";
import { descargarMachoteDiasEmpresa } from "@/utils/machoteDiasEmpresaExcel";

type Situacion = DiaEmpresaEnParo["situacion"];

const nombreSituacion: Record<Situacion, string> = {
    EnParo: "En paro",
    SeTrabaja: "Ya se trabaja: mover",
    OtroParo: "Cambió a otro paro: mover",
};

const estiloSituacion: Record<Situacion, string> = {
    EnParo: "bg-slate-100 text-slate-700",
    SeTrabaja: "bg-amber-100 text-amber-800",
    OtroParo: "bg-amber-100 text-amber-800",
};

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const larga = (s: string) => format(parseISO(s.slice(0, 10)), "EEE dd/MM/yyyy", { locale: es });
const ddmmyyyy = (s: string) => format(parseISO(s.slice(0, 10)), "dd/MM/yyyy");
const nombreTurno = (t: string) => (t === "1" ? "Primero" : t === "2" ? "Segundo" : t === "3" ? "Tercero" : t || "—");

const guardarExcel = (hoja: XLSX.WorkSheet, nombreHoja: string, archivo: string) => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, hoja, nombreHoja);
    const buffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), archivo);
};

/**
 * Reporte por unidad organizativa de los días por la empresa que la asignación
 * puso en sábados/domingos de "paro con días por la empresa" (nov-2026, caso de
 * Román): quién, qué día, en qué turno le tocaba y si ese día sigue siendo paro o
 * ya se trabaja (se habilitó con Rol normal o se quitó la regla). De aquí sale el
 * machote con la fecha anterior ya llena para moverlos en lote (por ejemplo, si
 * se decide trabajar los fines de semana de febrero), y abajo la tabla de
 * movimientos hechos: fecha anterior, fecha nueva, motivo y quién, como la de
 * festivos. El operador ve el motivo entre paréntesis junto a su día.
 */
export const DiasEmpresaEnParoReporte = ({ anio, areas }: { anio: number; areas: Area[] }) => {
    const [areaId, setAreaId] = useState<number | "">("");
    const [mes, setMes] = useState<number | "">("");
    const [situacion, setSituacion] = useState<Situacion | "">("");
    const [buscar, setBuscar] = useState("");
    const [dias, setDias] = useState<DiaEmpresaEnParo[] | null>(null);
    const [movimientos, setMovimientos] = useState<MovimientoDiaEmpresa[] | null>(null);
    const [cargando, setCargando] = useState(false);

    const consultar = useCallback(async () => {
        setCargando(true);
        try {
            const area = areaId === "" ? undefined : Number(areaId);
            const [d, m] = await Promise.all([
                reglasDomingoService.diasEmpresaEnParo(anio, area),
                reglasDomingoService.movimientosDiasEmpresa(anio, area).catch(() => [] as MovimientoDiaEmpresa[]),
            ]);
            setDias(d);
            setMovimientos(m);
        } catch (e) {
            toast.error("No se pudo cargar el reporte", { description: (e as Error).message, duration: 10000 });
        } finally {
            setCargando(false);
        }
    }, [anio, areaId]);

    // Ya consultado: se refresca solo al cambiar de año o de unidad.
    const [consultado, setConsultado] = useState(false);
    useEffect(() => {
        if (consultado) consultar();
    }, [consultado, consultar]);

    const texto = buscar.trim().toLowerCase();
    const coincide = (nomina?: number | null, nombre?: string) =>
        !texto || `${nomina ?? ""} ${nombre ?? ""}`.toLowerCase().includes(texto);

    const filtrados = useMemo(
        () =>
            (dias ?? []).filter(
                (x) =>
                    (mes === "" || Number(x.fecha.slice(5, 7)) === mes) &&
                    (situacion === "" || x.situacion === situacion) &&
                    coincide(x.nomina, x.nombre)
            ),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [dias, mes, situacion, texto]
    );
    const movsFiltrados = useMemo(
        () => (movimientos ?? []).filter((m) => (mes === "" || Number(m.fechaAnterior.slice(5, 7)) === mes) && coincide(m.nomina, m.nombre)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [movimientos, mes, texto]
    );

    const cuenta = (s: Situacion) => (dias ?? []).filter((x) => x.situacion === s).length;
    const nombreArea = areaId === "" ? "todas" : areas.find((a) => a.areaId === areaId)?.nombreGeneral ?? String(areaId);
    const etiqueta = `${nombreArea}${mes === "" ? "" : `_${MESES[mes - 1]}`}_${anio}`.replace(/[^\wáéíóúñÁÉÍÓÚÑ-]+/g, "_");

    const descargarReporte = () => {
        const hoja = XLSX.utils.json_to_sheet(
            filtrados.map((x) => ({
                Nómina: x.nomina ?? "",
                Nombre: x.nombre,
                "Unidad organizativa": x.area,
                Grupo: x.grupo,
                Fecha: ddmmyyyy(x.fecha),
                Día: format(parseISO(x.fecha.slice(0, 10)), "EEEE", { locale: es }),
                Turno: nombreTurno(x.turno),
                Situación: nombreSituacion[x.situacion],
                Detalle: x.detalle,
            }))
        );
        hoja["!cols"] = [{ wch: 12 }, { wch: 34 }, { wch: 26 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 24 }, { wch: 90 }];
        guardarExcel(hoja, "Dias en paro", `DiasEmpresa_en_paro_${etiqueta}_${format(new Date(), "yyyyMMdd_HHmm")}.xlsx`);
    };

    const descargarMachote = () => {
        if (filtrados.length === 0) {
            toast.info("No hay días con esos filtros");
            return;
        }
        descargarMachoteDiasEmpresa(
            filtrados.map((x) => ({
                nomina: x.nomina,
                nombre: x.nombre,
                area: x.area,
                grupo: x.grupo,
                turno: x.turno,
                fechaActual: x.fecha.slice(0, 10),
                nota: x.detalle,
            })),
            `paro_${etiqueta}`
        );
        toast.success(`Machote con ${filtrados.length} día(s) por la empresa`, {
            description: "Llena Fecha nueva (y Motivo si cada quien lleva uno distinto) y súbelo en \"Mover días por la empresa con machote\".",
            duration: 8000,
        });
    };

    const descargarMovimientos = () => {
        const hoja = XLSX.utils.json_to_sheet(
            movsFiltrados.map((m) => ({
                Nómina: m.nomina ?? "",
                Nombre: m.nombre,
                "Unidad organizativa": m.area,
                Grupo: m.grupo,
                "Fecha anterior": ddmmyyyy(m.fechaAnterior),
                "Fecha nueva": ddmmyyyy(m.fechaNueva),
                Motivo: m.motivo,
                Cómo: m.como,
                Quién: m.quien ?? "",
                Cuándo: format(new Date(m.cuando), "dd/MM/yyyy HH:mm"),
            }))
        );
        hoja["!cols"] = [{ wch: 12 }, { wch: 34 }, { wch: 26 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 50 }, { wch: 16 }, { wch: 30 }, { wch: 18 }];
        guardarExcel(hoja, "Movimientos", `Movimientos_DiasEmpresa_${etiqueta}_${format(new Date(), "yyyyMMdd_HHmm")}.xlsx`);
    };

    return (
        <section className="rounded-lg border p-4 space-y-4 text-sm">
            <div>
                <h3 className="font-semibold flex items-center gap-2">
                    <ClipboardList className="w-4 h-4" /> Días por la empresa en días de paro, por unidad organizativa
                </h3>
                <p className="text-xs text-continental-gray-1 mt-1">
                    Los días por la empresa que "Programar días" puso en sábados o domingos de paro con días por la empresa: a
                    quién, qué día y en qué turno le tocaba. Si después se decide trabajar alguno de esos días (excepción Rol
                    normal o se quita la regla), sale como <strong>"Ya se trabaja: mover"</strong>. Para moverlos: filtra la
                    unidad (y el mes, por ejemplo febrero), descarga el machote —ya trae la fecha anterior—, llena la fecha
                    nueva y, si quieres, el motivo de cada renglón, y súbelo en "Mover días por la empresa con machote". El
                    operador ve el motivo entre paréntesis junto a su día por la empresa.
                </p>
            </div>

            <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-continental-gray-1">Unidad organizativa</span>
                    <select
                        className="h-9 rounded-md border px-2 min-w-[220px]"
                        value={areaId}
                        onChange={(e) => setAreaId(e.target.value === "" ? "" : Number(e.target.value))}
                    >
                        <option value="">Todas</option>
                        {areas.map((a) => (
                            <option key={a.areaId} value={a.areaId}>
                                {a.nombreGeneral}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-continental-gray-1">Mes</span>
                    <select className="h-9 rounded-md border px-2" value={mes} onChange={(e) => setMes(e.target.value === "" ? "" : Number(e.target.value))}>
                        <option value="">Todo el año</option>
                        {MESES.map((m, i) => (
                            <option key={m} value={i + 1}>
                                {m}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-continental-gray-1">Situación</span>
                    <select className="h-9 rounded-md border px-2" value={situacion} onChange={(e) => setSituacion(e.target.value as Situacion | "")}>
                        <option value="">Todas</option>
                        <option value="EnParo">En paro</option>
                        <option value="SeTrabaja">Ya se trabaja (mover)</option>
                        <option value="OtroParo">Cambió a otro paro (mover)</option>
                    </select>
                </label>
                <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-continental-gray-1">Nómina o nombre</span>
                    <input className="h-9 rounded-md border px-2" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar…" />
                </label>
                <Button
                    variant="continental"
                    onClick={() => (consultado ? consultar() : setConsultado(true))}
                    disabled={cargando}
                >
                    <RefreshCw className={`w-4 h-4 mr-1 ${cargando ? "animate-spin" : ""}`} />
                    {consultado ? "Actualizar" : "Ver reporte"}
                </Button>
            </div>

            {dias && (
                <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-700">{cuenta("EnParo")} en paro</span>
                        <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800">{cuenta("SeTrabaja")} ya se trabajan</span>
                        {cuenta("OtroParo") > 0 && (
                            <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800">{cuenta("OtroParo")} cambiaron a otro paro</span>
                        )}
                        <span className="text-xs text-continental-gray-1">
                            Mostrando {filtrados.length} de {dias.length}
                        </span>
                        <div className="ml-auto flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" onClick={descargarReporte} disabled={filtrados.length === 0}>
                                <Download className="w-4 h-4 mr-1" /> Descargar reporte
                            </Button>
                            <Button size="sm" variant="outline" onClick={descargarMachote} disabled={filtrados.length === 0}>
                                <Download className="w-4 h-4 mr-1" /> Machote con estos días
                            </Button>
                        </div>
                    </div>

                    {filtrados.length === 0 ? (
                        <p className="text-continental-gray-1">
                            {dias.length === 0
                                ? `No hay días por la empresa en días de paro en ${anio}${areaId === "" ? "" : ` para ${nombreArea}`}. Se llenan al dar "Programar días" con una regla de paro con días por la empresa.`
                                : "Ningún día con esos filtros."}
                        </p>
                    ) : (
                        <div className="max-h-96 overflow-auto border rounded-lg">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 text-left sticky top-0">
                                    <tr>
                                        <th className="px-3 py-2 font-medium">Nómina</th>
                                        <th className="px-3 py-2 font-medium">Nombre</th>
                                        <th className="px-3 py-2 font-medium">Unidad</th>
                                        <th className="px-3 py-2 font-medium">Grupo</th>
                                        <th className="px-3 py-2 font-medium">Día por la empresa</th>
                                        <th className="px-3 py-2 font-medium">Turno</th>
                                        <th className="px-3 py-2 font-medium">Situación</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtrados.map((x) => (
                                        <tr key={x.vacacionId} className="border-t align-top">
                                            <td className="px-3 py-1.5 tabular-nums">{x.nomina ?? "—"}</td>
                                            <td className="px-3 py-1.5">{x.nombre}</td>
                                            <td className="px-3 py-1.5">{x.area}</td>
                                            <td className="px-3 py-1.5 text-continental-gray-1">{x.grupo}</td>
                                            <td className="px-3 py-1.5 whitespace-nowrap tabular-nums">{larga(x.fecha)}</td>
                                            <td className="px-3 py-1.5">{nombreTurno(x.turno)}</td>
                                            <td className="px-3 py-1.5" title={x.detalle}>
                                                <span className={`rounded px-2 py-0.5 text-xs ${estiloSituacion[x.situacion]}`}>
                                                    {nombreSituacion[x.situacion]}
                                                </span>
                                                {x.situacion !== "EnParo" && <div className="text-xs text-continental-gray-1 mt-0.5">{x.detalle}</div>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {movimientos && (
                <div className="space-y-2 pt-2 border-t">
                    <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-semibold flex items-center gap-2 mr-auto">
                            <History className="w-4 h-4" /> Movimientos hechos ({movsFiltrados.length})
                        </h4>
                        <Button size="sm" variant="outline" onClick={descargarMovimientos} disabled={movsFiltrados.length === 0}>
                            <Download className="w-4 h-4 mr-1" /> Descargar movimientos
                        </Button>
                    </div>
                    <p className="text-xs text-continental-gray-1">
                        Días por la empresa ya movidos en {anio}{areaId === "" ? "" : ` en ${nombreArea}`}, con machote o por
                        reprogramación: fecha anterior, fecha nueva, motivo y quién lo hizo.
                    </p>
                    {movsFiltrados.length === 0 ? (
                        <p className="text-continental-gray-1">Todavía no hay movimientos.</p>
                    ) : (
                        <div className="max-h-80 overflow-auto border rounded-lg">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 text-left sticky top-0">
                                    <tr>
                                        <th className="px-3 py-2 font-medium">Nómina</th>
                                        <th className="px-3 py-2 font-medium">Nombre</th>
                                        <th className="px-3 py-2 font-medium">Grupo</th>
                                        <th className="px-3 py-2 font-medium">Fecha anterior</th>
                                        <th className="px-3 py-2 font-medium">Fecha nueva</th>
                                        <th className="px-3 py-2 font-medium">Motivo</th>
                                        <th className="px-3 py-2 font-medium">Quién</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {movsFiltrados.map((m) => (
                                        <tr key={m.id} className="border-t align-top">
                                            <td className="px-3 py-1.5 tabular-nums">{m.nomina ?? "—"}</td>
                                            <td className="px-3 py-1.5">{m.nombre}</td>
                                            <td className="px-3 py-1.5 text-continental-gray-1">{m.grupo}</td>
                                            <td className="px-3 py-1.5 whitespace-nowrap tabular-nums">{larga(m.fechaAnterior)}</td>
                                            <td className="px-3 py-1.5 whitespace-nowrap tabular-nums">{larga(m.fechaNueva)}</td>
                                            <td className="px-3 py-1.5">{m.motivo}</td>
                                            <td className="px-3 py-1.5 text-xs">
                                                {m.quien ?? "—"}
                                                <div className="text-continental-gray-1">
                                                    {m.como} · {format(new Date(m.cuando), "dd/MM/yyyy HH:mm")}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </section>
    );
};
