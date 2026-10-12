import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { AlertTriangle, Download, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVacationConfig } from "@/hooks/useVacationConfig";
import {
    reprogramacionDiaEmpresaService,
    type DiasEmpresaEnDescansoResponse,
} from "@/services/reprogramacionDiaEmpresaService";

/**
 * Días asignados por la empresa que caen en descanso según el rol ACTUAL del
 * grupo de cada empleado. Pasa sobre todo tras un cambio de grupo: los días se
 * asignaron con el rol anterior (32812995, oct-2026). Antes solo se encontraban
 * viendo el calendario de cada persona; aquí salen todos, y desde "Ver empleado"
 * el superusuario los reprograma en su calendario (Reprogramación día empresa).
 */
export const DiasEmpresaEnDescanso = () => {
    const navigate = useNavigate();
    const { config } = useVacationConfig();
    const anios = [config?.anioVigente, config?.anioProgramacionAnual]
        .filter((a): a is number => typeof a === "number")
        .filter((a, i, arr) => arr.indexOf(a) === i)
        .sort((a, b) => a - b);

    const [anio, setAnio] = useState<number | null>(null);
    const anioElegido = anio ?? config?.anioVigente ?? new Date().getFullYear();
    const [area, setArea] = useState<string>("");
    const [datos, setDatos] = useState<DiasEmpresaEnDescansoResponse | null>(null);
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const buscar = async () => {
        setCargando(true);
        setError(null);
        try {
            setDatos(await reprogramacionDiaEmpresaService.getDiasEnDescanso(anioElegido));
        } catch (e) {
            setError(e instanceof Error ? e.message : "No se pudo consultar la lista");
            setDatos(null);
        } finally {
            setCargando(false);
        }
    };

    const areas = useMemo(
        () => Array.from(new Set((datos?.dias ?? []).map((d) => d.area).filter(Boolean))).sort((a, b) => a.localeCompare(b, "es")),
        [datos]
    );
    const filas = useMemo(() => (datos?.dias ?? []).filter((d) => !area || d.area === area), [datos, area]);
    const empleadosEnFiltro = useMemo(() => new Set(filas.map((f) => f.empleadoId)).size, [filas]);

    const fechaLarga = (iso: string) => format(new Date(`${iso}T00:00:00`), "EEE dd/MM/yyyy", { locale: es });

    const descargar = () => {
        const encabezado = ["Nomina", "Nombre", "Area", "Grupo", "Fecha", "Tipo", "Turno en el rol", "Estado"];
        const lineas = filas.map((f) => [
            f.nomina ?? "",
            f.nombre,
            f.area,
            f.grupo,
            f.fecha,
            f.tipoVacacion,
            f.turno,
            f.tieneSolicitudPendiente ? "Reprogramacion pendiente" : f.yaPaso ? "Ya paso" : "Por reprogramar",
        ]);
        const csv = [encabezado, ...lineas]
            .map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
            .join("\n");
        const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `dias_empresa_en_descanso_${anioElegido}${area ? "_" + area.replace(/\s+/g, "_") : ""}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="p-4 bg-white border border-continental-gray-3 rounded-lg space-y-4">
            <div>
                <h2 className="text-lg font-semibold">Días de empresa que caen en descanso</h2>
                <p className="text-sm text-continental-gray-1 mt-1">
                    Días asignados por la empresa que, con el rol actual del grupo de cada empleado, caen en su
                    descanso. Pasa sobre todo cuando alguien cambió de grupo: sus días se asignaron con el rol
                    anterior. Desde «Ver empleado» se reprograman en su calendario (Reprogramación día empresa). No
                    considera permutas individuales.
                </p>
            </div>

            <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col">
                    <label className="text-xs font-medium text-continental-gray-1">Año</label>
                    <select
                        className="mt-1 h-9 rounded-md border px-2 text-sm"
                        value={anioElegido}
                        onChange={(e) => {
                            setAnio(Number(e.target.value));
                            setDatos(null);
                        }}
                    >
                        {(anios.length ? anios : [anioElegido]).map((a) => (
                            <option key={a} value={a}>
                                {a}
                            </option>
                        ))}
                    </select>
                </div>
                <Button variant="continental" onClick={buscar} disabled={cargando} className="flex items-center gap-2">
                    <Search className="w-4 h-4" />
                    {cargando ? "Revisando toda la planta…" : "Buscar"}
                </Button>
                {datos && (
                    <>
                        <div className="flex flex-col">
                            <label className="text-xs font-medium text-continental-gray-1">Área</label>
                            <select
                                className="mt-1 h-9 rounded-md border px-2 text-sm"
                                value={area}
                                onChange={(e) => setArea(e.target.value)}
                            >
                                <option value="">Todas</option>
                                {areas.map((a) => (
                                    <option key={a} value={a}>
                                        {a}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <Button variant="outline" onClick={descargar} disabled={filas.length === 0} className="flex items-center gap-2">
                            <Download className="w-4 h-4" />
                            Descargar
                        </Button>
                    </>
                )}
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            {datos && (
                <>
                    <p className="text-sm">
                        {filas.length === 0 ? (
                            <span className="text-green-700">Ningún día de empresa cae en descanso{area ? ` en ${area}` : ""}.</span>
                        ) : (
                            <span className="flex items-center gap-2 text-amber-800">
                                <AlertTriangle className="w-4 h-4" />
                                {filas.length} día(s) de {empleadosEnFiltro} empleado(s){area ? ` en ${area}` : ""} caen en descanso en {datos.anio}.
                            </span>
                        )}
                    </p>
                    {filas.length > 0 && (
                        <div className="overflow-x-auto border rounded-lg">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 text-left">
                                    <tr>
                                        <th className="px-3 py-2 font-medium">Nómina</th>
                                        <th className="px-3 py-2 font-medium">Nombre</th>
                                        <th className="px-3 py-2 font-medium">Área</th>
                                        <th className="px-3 py-2 font-medium">Grupo</th>
                                        <th className="px-3 py-2 font-medium">Día de empresa</th>
                                        <th className="px-3 py-2 font-medium">Estado</th>
                                        <th className="px-3 py-2" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {filas.map((f) => (
                                        <tr key={f.vacacionId} className="border-t">
                                            <td className="px-3 py-1.5 tabular-nums">{f.nomina ?? "—"}</td>
                                            <td className="px-3 py-1.5">{f.nombre}</td>
                                            <td className="px-3 py-1.5 text-continental-gray-1">{f.area}</td>
                                            <td className="px-3 py-1.5">{f.grupo}</td>
                                            <td className="px-3 py-1.5 tabular-nums">{fechaLarga(f.fecha)}</td>
                                            <td className="px-3 py-1.5">
                                                {f.tieneSolicitudPendiente ? (
                                                    <span className="text-blue-700">Reprogramación pendiente</span>
                                                ) : f.yaPaso ? (
                                                    <span className="text-continental-gray-1">Ya pasó</span>
                                                ) : (
                                                    <span className="text-amber-700 font-medium">Por reprogramar</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-1.5 text-right">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => navigate(`/admin/plantilla/${f.empleadoId}`)}
                                                >
                                                    Ver empleado
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};
