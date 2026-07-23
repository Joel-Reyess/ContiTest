import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, ChevronLeft, ChevronRight, CalendarClock, Filter, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NomenclaturaLegend } from "@/components/Calendar/NomenclaturaLegend";
import { SAP_NOMENCLATURA, type SAPCodigo } from "@/utils/sapNomenclatura";
import { reglasTurnoService } from "@/services/reglasTurnoService";
import type { ReglaTurno, RotacionProgramada } from "@/interfaces/Api.interface";

const MESES = [
    "Ene", "Feb", "Mar", "Abr", "May", "Jun",
    "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

const DIAS_SEMANA_CORTO = ["D", "L", "M", "X", "J", "V", "S"];

function diasEnMes(anio: number, mes0: number): number {
    return new Date(anio, mes0 + 1, 0).getDate();
}

function toIsoDate(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function diffDias(desde: Date, hasta: Date): number {
    const MS_DIA = 86_400_000;
    const a = Date.UTC(desde.getFullYear(), desde.getMonth(), desde.getDate());
    const b = Date.UTC(hasta.getFullYear(), hasta.getMonth(), hasta.getDate());
    return Math.floor((b - a) / MS_DIA);
}

function nombreSubGrupo(codigoBase: string, gpoRef: number): string {
    return gpoRef === 1 ? codigoBase : `${codigoBase}_${String(gpoRef).padStart(2, "0")}`;
}

interface ArranqueVigenteInfo {
    patron: string[];
    fechaAncla: Date;
}

function arranqueVigenteEn(
    fecha: Date,
    regla: ReglaTurno,
    arranques: RotacionProgramada[],
): ArranqueVigenteInfo {
    const arranqueAplicable = arranques
        .filter(a => a.codigoRegla === regla.codigo && a.patronBaseline && a.patronBaseline.length > 0)
        .filter(a => {
            const ejec = new Date(a.fechaEjecucion);
            return diffDias(ejec, fecha) >= 0;
        })
        .sort((a, b) => (a.fechaEjecucion < b.fechaEjecucion ? 1 : -1))[0];

    if (arranqueAplicable) {
        return {
            patron: arranqueAplicable.patronBaseline as string[],
            fechaAncla: new Date(arranqueAplicable.fechaEjecucion),
        };
    }

    return {
        patron: regla.patron,
        fechaAncla: new Date(regla.fechaReferencia),
    };
}

function codigoParaFecha(
    fecha: Date,
    regla: ReglaTurno,
    arranques: RotacionProgramada[],
    subGrupo: number,
): string {
    const { patron, fechaAncla } = arranqueVigenteEn(fecha, regla, arranques);
    const n = patron.length;
    if (n === 0) return "";
    const dias = diffDias(fechaAncla, fecha);
    const offset = ((subGrupo - 1) * 7) % n;
    const idx = (((dias + offset) % n) + n) % n;
    return (patron[idx] ?? "").toUpperCase();
}

function esDiaArranque(
    fecha: Date,
    codigoRegla: string,
    arranques: RotacionProgramada[],
): boolean {
    const iso = toIsoDate(fecha);
    return arranques.some(
        a => a.codigoRegla === codigoRegla &&
             a.patronBaseline && a.patronBaseline.length > 0 &&
             a.fechaEjecucion.slice(0, 10) === iso
    );
}

interface FilaSubGrupo {
    regla: ReglaTurno;
    subGrupo: number;
    nombre: string;
}

export const CalendarioAnualReglas = () => {
    const [reglas, setReglas] = useState<ReglaTurno[]>([]);
    const [arranques, setArranques] = useState<RotacionProgramada[]>([]);
    const [loading, setLoading] = useState(true);
    const [anio, setAnio] = useState<number>(new Date().getFullYear());
    const [filtroRegla, setFiltroRegla] = useState<string>("__todas__");

    const cargar = async () => {
        setLoading(true);
        try {
            const [rs, ars] = await Promise.all([
                reglasTurnoService.getAll(),
                reglasTurnoService.listarRotacionesProgramadas(
                    `${anio}-01-01`,
                    `${anio}-12-31`,
                ).catch(() => [] as RotacionProgramada[]),
            ]);
            setReglas(rs.filter(r => r.patron.length > 0));
            setArranques(ars.filter(a => a.estado !== "Cancelada"));
        } catch (err: any) {
            toast.error(err?.message ?? "Error al cargar el calendario anual");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        cargar();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [anio]);

    const filas: FilaSubGrupo[] = useMemo(() => {
        const reglasFiltradas = filtroRegla === "__todas__"
            ? reglas
            : reglas.filter(r => r.codigo === filtroRegla);
        const out: FilaSubGrupo[] = [];
        for (const regla of reglasFiltradas) {
            const numGrupos = Math.max(1, Math.floor(regla.patron.length / 7));
            for (let g = 1; g <= numGrupos; g++) {
                out.push({
                    regla,
                    subGrupo: g,
                    nombre: nombreSubGrupo(regla.codigo, g),
                });
            }
        }
        return out;
    }, [reglas, filtroRegla]);

    const hoyIso = toIsoDate(new Date());

    const exportarCsv = () => {
        if (filas.length === 0) {
            toast.info("No hay reglas para exportar.");
            return;
        }
        // Formato largo: una fila por (sub-grupo, día) con etiqueta y flag de arranque.
        // Sirve tanto para abrir en Excel como para pasar a un pipeline de datos.
        const encabezados = ["Sub-grupo", "Regla base", "Fecha", "Dia semana", "Codigo", "Etiqueta", "Es arranque"];
        const escapar = (v: string) => {
            const s = v ?? "";
            return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const lineas: string[] = [encabezados.join(",")];
        for (let mes0 = 0; mes0 < 12; mes0++) {
            const dias = diasEnMes(anio, mes0);
            for (let d = 1; d <= dias; d++) {
                const fecha = new Date(anio, mes0, d);
                const fechaIso = toIsoDate(fecha);
                const diaSemana = DIAS_SEMANA_CORTO[fecha.getDay()];
                for (const fila of filas) {
                    const codigo = codigoParaFecha(fecha, fila.regla, arranques, fila.subGrupo);
                    const entry = codigo && (codigo in SAP_NOMENCLATURA)
                        ? SAP_NOMENCLATURA[codigo as SAPCodigo]
                        : null;
                    const esArranque = esDiaArranque(fecha, fila.regla.codigo, arranques);
                    lineas.push([
                        fila.nombre,
                        fila.regla.codigo,
                        fechaIso,
                        diaSemana,
                        codigo,
                        entry?.label ?? "",
                        esArranque ? "Si" : "",
                    ].map(escapar).join(","));
                }
            }
        }
        // BOM UTF-8 para que Excel abra los acentos correctamente.
        const csv = "﻿" + lineas.join("\r\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        const filtro = filtroRegla === "__todas__" ? "todas" : filtroRegla;
        link.download = `calendario-anual-reglas_${anio}_${filtro}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast.success(`CSV exportado (${lineas.length - 1} filas).`);
    };

    return (
        <div className="p-6 max-w-[1600px] mx-auto space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
                        <CalendarClock className="size-6 text-continental-yellow" />
                        Calendario anual de reglas
                    </h1>
                    <p className="text-sm text-continental-gray-1 mt-1">
                        Vista panorámica del año: cada fila es un sub-grupo y cada celda es el turno o
                        ausencia proyectada según el patrón vigente (incluyendo arranques programados).
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={exportarCsv}
                        disabled={loading || filas.length === 0}
                        title="Exportar el calendario visible a CSV (una fila por sub-grupo × día)"
                    >
                        <Download className="size-4 mr-1" />
                        Exportar CSV
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setAnio(a => a - 1)}>
                        <ChevronLeft className="size-4" />
                    </Button>
                    <span className="text-lg font-semibold tabular-nums px-2">{anio}</span>
                    <Button variant="outline" size="sm" onClick={() => setAnio(a => a + 1)}>
                        <ChevronRight className="size-4" />
                    </Button>
                </div>
            </div>

            <div className="flex items-end gap-3 flex-wrap">
                <div className="min-w-[200px]">
                    <Label className="text-xs flex items-center gap-1">
                        <Filter className="size-3" /> Filtrar por regla
                    </Label>
                    <select
                        value={filtroRegla}
                        onChange={(e) => setFiltroRegla(e.target.value)}
                        className="w-full border rounded px-2 py-1.5 text-sm mt-1"
                    >
                        <option value="__todas__">Todas las reglas</option>
                        {reglas.map(r => (
                            <option key={r.codigo} value={r.codigo}>{r.codigo}</option>
                        ))}
                    </select>
                </div>
                <div className="text-[11px] text-continental-gray-1 pb-1">
                    {filas.length} sub-grupo(s) · {arranques.length} arranque(s) programado(s) en {anio}
                </div>
            </div>

            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Nomenclatura</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-3">
                    <NomenclaturaLegend variant="grouped" />
                    <div className="pt-3 border-t flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-continental-gray-1">
                        <div className="flex items-center gap-2">
                            <span className="inline-block w-3 h-3 rounded-sm ring-2 ring-continental-yellow" />
                            <span>Arranque programado</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="inline-block w-3 h-3 rounded-sm ring-2 ring-blue-500" />
                            <span>Día de hoy</span>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="overflow-hidden">
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="size-6 animate-spin text-continental-gray-1" />
                        </div>
                    ) : filas.length === 0 ? (
                        <div className="py-20 text-center text-sm text-continental-gray-1">
                            No hay reglas configuradas para mostrar.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            {MESES.map((mesLabel, mes0) => (
                                <MesTabla
                                    key={mes0}
                                    anio={anio}
                                    mes0={mes0}
                                    mesLabel={mesLabel}
                                    filas={filas}
                                    arranques={arranques}
                                    hoyIso={hoyIso}
                                />
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

interface MesTablaProps {
    anio: number;
    mes0: number;
    mesLabel: string;
    filas: FilaSubGrupo[];
    arranques: RotacionProgramada[];
    hoyIso: string;
}

const MesTabla = ({ anio, mes0, mesLabel, filas, arranques, hoyIso }: MesTablaProps) => {
    const dias = diasEnMes(anio, mes0);
    const fechas = Array.from({ length: dias }, (_, i) => new Date(anio, mes0, i + 1));

    return (
        <div className="border-b last:border-b-0">
            <div className="px-3 py-2 bg-continental-gray-4/40 border-b flex items-center gap-2 sticky left-0 z-10">
                <span className="text-sm font-semibold">{mesLabel} {anio}</span>
                <span className="text-[11px] text-continental-gray-1">({dias} días)</span>
            </div>
            <table className="text-[11px] font-mono border-collapse">
                <thead>
                    <tr>
                        <th className="sticky left-0 bg-white z-20 border-r border-b px-2 py-1 text-left text-[11px] font-semibold w-[120px]">
                            Sub-grupo
                        </th>
                        {fechas.map((f, i) => (
                            <th
                                key={i}
                                className={`border-b border-r px-1 py-1 text-center w-[30px] min-w-[30px] ${f.getDay() === 0 || f.getDay() === 6 ? "bg-gray-50" : ""}`}
                            >
                                <div className="text-[9px] leading-none text-continental-gray-1 mb-0.5">
                                    {DIAS_SEMANA_CORTO[f.getDay()]}
                                </div>
                                <div className="text-[11px] leading-none font-semibold">{f.getDate()}</div>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {filas.map((fila) => (
                        <tr key={`${fila.regla.codigo}-${fila.subGrupo}`}>
                            <td className="sticky left-0 bg-white z-10 border-r border-b px-2 py-1 text-[11px] whitespace-nowrap">
                                {fila.nombre}
                            </td>
                            {fechas.map((f, i) => {
                                const codigo = codigoParaFecha(f, fila.regla, arranques, fila.subGrupo);
                                const entry = codigo && (codigo in SAP_NOMENCLATURA)
                                    ? SAP_NOMENCLATURA[codigo as SAPCodigo]
                                    : null;
                                const isHoy = toIsoDate(f) === hoyIso;
                                const isArranque = esDiaArranque(f, fila.regla.codigo, arranques);
                                const ring = isArranque
                                    ? "ring-2 ring-inset ring-continental-yellow"
                                    : isHoy
                                        ? "ring-2 ring-inset ring-blue-500"
                                        : "";
                                return (
                                    <td
                                        key={i}
                                        className={`border-r border-b text-center px-0 py-1 h-6 w-[30px] min-w-[30px] font-semibold ${ring}`}
                                        style={entry ? { backgroundColor: entry.bg, color: entry.fg } : undefined}
                                        title={`${fila.nombre} — ${toIsoDate(f)}: ${entry?.label ?? codigo ?? "(sin dato)"}${isArranque ? " · Día de arranque" : ""}`}
                                    >
                                        {codigo}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default CalendarioAnualReglas;
