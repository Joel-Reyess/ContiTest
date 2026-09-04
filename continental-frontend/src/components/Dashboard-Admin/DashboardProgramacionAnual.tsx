import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, AlertTriangle, Filter, TrendingUp } from "lucide-react";
import { Label } from "@/components/ui/label";
import { getDashboardProgramacionAnual } from "@/services/vacacionesService";
import type { DashboardProgramacionAnual as Datos, DiaProgramacionAnual } from "@/interfaces/Api.interface";

/**
 * Cómo repartió la empresa los días de la programación anual.
 *
 * La pregunta que contesta es la que no se podía ver en ninguna pantalla: si la
 * asignación quedó pareja a lo largo del año o se apiló en un mes, y si respetó
 * la disponibilidad de cada grupo o repartió plano. Por eso cada mes se compara
 * contra el reparto perfectamente uniforme, y cada día trae el porcentaje de
 * ausencia que produce junto con los grupos que ese día se pasaron del máximo.
 *
 * El porcentaje sale del backend con la MISMA regla del candado de captura
 * (EvaluarRegla), para que el tablero no diga una cosa y la validación otra.
 */

const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const DIAS_SEMANA = ["L", "M", "M", "J", "V", "S", "D"];

const claseDeCarga = (dia: DiaProgramacionAnual, maximoGlobal: number): string => {
    if (dia.gruposEnRebase.length > 0) return "bg-red-500 text-white";
    if (dia.diasEmpresa === 0) return "bg-slate-50 text-slate-400";
    if (dia.porcentaje >= maximoGlobal) return "bg-amber-400 text-amber-950";
    if (dia.porcentaje >= maximoGlobal * 0.6) return "bg-amber-200 text-amber-900";
    return "bg-emerald-200 text-emerald-900";
};

interface Props {
    anio: number;
}

export const DashboardProgramacionAnual = ({ anio }: Props) => {
    const [datos, setDatos] = useState<Datos | null>(null);
    const [cargando, setCargando] = useState(true);
    const [grupoId, setGrupoId] = useState<number | null>(null);
    const [mesAbierto, setMesAbierto] = useState<number | null>(null);
    // Los grupos del selector salen de la consulta SIN filtro: así el filtro no
    // se queda sin opciones cuando ya hay un grupo seleccionado.
    const [catalogoGrupos, setCatalogoGrupos] = useState<Datos["grupos"]>([]);

    useEffect(() => {
        let vigente = true;
        setCargando(true);
        getDashboardProgramacionAnual(anio, { grupoId })
            .then((d) => {
                if (!vigente) return;
                setDatos(d);
                if (!grupoId) setCatalogoGrupos(d.grupos);
            })
            .catch((e: unknown) => {
                if (!vigente) return;
                setDatos(null);
                toast.error(e instanceof Error ? e.message : "No se pudo cargar el dashboard");
            })
            .finally(() => vigente && setCargando(false));
        return () => {
            vigente = false;
        };
    }, [anio, grupoId]);

    const diasPorMes = useMemo(() => {
        const mapa = new Map<number, DiaProgramacionAnual[]>();
        (datos?.dias ?? []).forEach((d) => {
            const mes = Number(d.fecha.slice(5, 7));
            if (!mapa.has(mes)) mapa.set(mes, []);
            mapa.get(mes)!.push(d);
        });
        return mapa;
    }, [datos]);

    // El mes más cargado: la respuesta directa a "¿se saturó febrero?".
    const mesPico = useMemo(() => {
        if (!datos || datos.meses.length === 0) return null;
        return datos.meses.reduce((a, b) => (b.diasEmpresaAsignados > a.diasEmpresaAsignados ? b : a));
    }, [datos]);

    // La escala la marca el mes más alto contando las DOS barras: si se
    // escalara solo con los días de empresa, en cuanto la captura del operador
    // creciera la barra se saldría del recuadro.
    const maxDiasMes = useMemo(
        () =>
            Math.max(
                1,
                ...(datos?.meses ?? []).map((m) => m.diasEmpresaAsignados + m.diasCapturadosPorOperador)
            ),
        [datos]
    );

    if (cargando) {
        return (
            <div className="flex items-center gap-2 text-sm text-continental-gray-1 py-10">
                <Loader2 className="size-4 animate-spin" /> Calculando la distribución del año…
            </div>
        );
    }

    if (!datos) {
        return (
            <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
                <div>
                    <p className="font-medium">No hay datos para {anio}.</p>
                    <p>Puede que la programación anual de ese año todavía no se haya generado.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
                    <TrendingUp className="size-5 text-continental-yellow" />
                    Días asignados por la empresa — {datos.anio}
                </h2>
                <p className="text-sm text-continental-gray-1 mt-1">
                    Distribución de toda la planta. El porcentaje de cada día es el mismo que usa el
                    candado de captura: ausentes entre plantilla activa del grupo.
                </p>
            </div>

            <div className="min-w-[240px] max-w-xs">
                <Label className="text-xs flex items-center gap-1">
                    <Filter className="size-3" /> Filtrar por grupo
                </Label>
                <select
                    value={grupoId ?? ""}
                    onChange={(e) => setGrupoId(e.target.value ? Number(e.target.value) : null)}
                    className="w-full border rounded px-2 py-1.5 text-sm mt-1"
                >
                    <option value="">Toda la planta</option>
                    {catalogoGrupos.map((g) => (
                        <option key={g.grupoId} value={g.grupoId}>
                            {g.nombre} — {g.area}
                        </option>
                    ))}
                </select>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                    { etiqueta: "Asignados por la empresa", valor: datos.diasEmpresaAsignados.toLocaleString("es-MX") },
                    {
                        etiqueta: "Capturados por el operador",
                        valor: datos.diasCapturadosPorOperador.toLocaleString("es-MX"),
                    },
                    { etiqueta: "Empleados con días", valor: `${datos.empleadosConDiasEmpresa} de ${datos.plantillaTotal}` },
                    { etiqueta: "Máximo permitido", valor: `${datos.porcentajeMaximoGlobal}%` },
                    {
                        etiqueta: "Días con rebase",
                        valor: String(datos.diasConRebase),
                        alerta: datos.diasConRebase > 0,
                    },
                    {
                        etiqueta: "Mes más cargado",
                        valor: mesPico ? `${mesPico.nombre} (${mesPico.diasEmpresaAsignados})` : "—",
                    },
                ].map((t) => (
                    <div
                        key={t.etiqueta}
                        className={`rounded-lg border p-3 ${t.alerta ? "border-red-300 bg-red-50" : "bg-white"}`}
                    >
                        <p className="text-xs text-continental-gray-1">{t.etiqueta}</p>
                        <p className={`text-lg font-semibold tabular-nums ${t.alerta ? "text-red-700" : ""}`}>
                            {t.valor}
                        </p>
                    </div>
                ))}
            </div>

            {/* Los doce meses. La línea punteada es el reparto parejo: lo que
                traería cada mes si la asignación no se hubiera apilado. */}
            <div>
                <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                    <h3 className="text-sm font-semibold">Los 12 meses</h3>
                    <div className="flex items-center gap-4 text-xs text-continental-gray-1">
                        <span className="flex items-center gap-1.5">
                            <span className="inline-block size-3 rounded-sm bg-continental-blue-dark/70" />
                            Asignados por la empresa
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="inline-block size-3 rounded-sm bg-continental-yellow" />
                            Capturados por el operador
                        </span>
                    </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    {datos.meses.map((m) => {
                        const altoEmpresa = Math.round((m.diasEmpresaAsignados / maxDiasMes) * 100);
                        const altoCaptura = Math.round((m.diasCapturadosPorOperador / maxDiasMes) * 100);
                        const parejo = Math.round((m.diasEsperadosSiFueraParejo / maxDiasMes) * 100);
                        const abierto = mesAbierto === m.mes;
                        return (
                            <button
                                key={m.mes}
                                type="button"
                                onClick={() => setMesAbierto(abierto ? null : m.mes)}
                                className={`text-left rounded-lg border p-3 transition hover:border-continental-yellow ${
                                    abierto ? "border-continental-yellow ring-1 ring-continental-yellow" : ""
                                }`}
                            >
                                <div className="flex items-baseline justify-between">
                                    <span className="font-semibold">{MESES_CORTOS[m.mes - 1]}</span>
                                    <span className="text-xs tabular-nums text-continental-gray-1">
                                        {m.diasEmpresaAsignados + m.diasCapturadosPorOperador} días
                                    </span>
                                </div>
                                {/* Barra apilada: abajo el piso que puso la
                                    empresa, encima lo que va capturando la
                                    gente. Así se ve de un vistazo cuánto del
                                    porcentaje del mes ya venía dado y cuánto se
                                    generó durante la captura. */}
                                <div className="relative h-16 mt-2 bg-slate-100 rounded overflow-hidden">
                                    <div
                                        className={`absolute bottom-0 left-0 right-0 ${
                                            m.diasConRebase > 0 ? "bg-red-400" : "bg-continental-blue-dark/70"
                                        }`}
                                        style={{ height: `${altoEmpresa}%` }}
                                        title={`Empresa: ${m.diasEmpresaAsignados} días (${m.porcentajeEmpresa}%)`}
                                    />
                                    <div
                                        className="absolute left-0 right-0 bg-continental-yellow"
                                        style={{ bottom: `${altoEmpresa}%`, height: `${altoCaptura}%` }}
                                        title={`Operador: ${m.diasCapturadosPorOperador} días (${m.porcentajeCapturado}%)`}
                                    />
                                    <div
                                        className="absolute left-0 right-0 border-t border-dashed border-slate-500"
                                        style={{ bottom: `${parejo}%` }}
                                        title={`Reparto parejo: ${m.diasEsperadosSiFueraParejo} días`}
                                    />
                                </div>
                                <p className="text-xs mt-2 tabular-nums">
                                    Empresa {m.porcentajeEmpresa}% · operador {m.porcentajeCapturado}%
                                </p>
                                <p className="text-xs tabular-nums text-continental-gray-1">
                                    Prom. {m.porcentajePromedio}% · máx. {m.porcentajeMaximo}%
                                </p>
                                {m.diasConRebase > 0 && (
                                    <p className="text-xs text-red-600 font-medium">
                                        {m.diasConRebase} día(s) con rebase
                                    </p>
                                )}
                            </button>
                        );
                    })}
                </div>
                <p className="text-xs text-continental-gray-1 mt-2">
                    La línea punteada marca lo que traería el mes si el año se hubiera repartido parejo
                    ({datos.meses[0]?.diasEsperadosSiFueraParejo ?? 0} días). Una barra muy por encima
                    significa que la asignación se apiló ahí.
                </p>
            </div>

            {/* Calendario del mes elegido */}
            {mesAbierto && (
                <div>
                    <h3 className="text-sm font-semibold mb-2">
                        {datos.meses.find((m) => m.mes === mesAbierto)?.nombre} {datos.anio} — día por día
                    </h3>
                    <div className="grid grid-cols-7 gap-1 max-w-2xl">
                        {DIAS_SEMANA.map((d, i) => (
                            <div key={i} className="text-center text-xs text-continental-gray-1 pb-1">
                                {d}
                            </div>
                        ))}
                        {(() => {
                            const dias = diasPorMes.get(mesAbierto) ?? [];
                            if (dias.length === 0) return null;
                            // Lunes = 0, para que la rejilla empiece en lunes.
                            const primero = new Date(`${dias[0].fecha}T00:00:00`);
                            const hueco = (primero.getDay() + 6) % 7;
                            return (
                                <>
                                    {Array.from({ length: hueco }).map((_, i) => (
                                        <div key={`h${i}`} />
                                    ))}
                                    {dias.map((d) => (
                                        <div
                                            key={d.fecha}
                                            className={`aspect-square rounded flex flex-col items-center justify-center text-xs ${claseDeCarga(
                                                d,
                                                datos.porcentajeMaximoGlobal
                                            )}`}
                                            title={
                                                `${d.fecha}\n` +
                                                `Días de empresa: ${d.diasEmpresa}\n` +
                                                `Capturados por el operador: ${d.diasCapturados}\n` +
                                                `Ausentes: ${d.ausentes} de ${d.plantilla} (${d.porcentaje}%)` +
                                                (d.gruposEnRebase.length > 0
                                                    ? `\nRebasan: ${d.gruposEnRebase.join(", ")}`
                                                    : "")
                                            }
                                        >
                                            <span className="font-semibold">{Number(d.fecha.slice(8, 10))}</span>
                                            <span className="tabular-nums opacity-80">{d.porcentaje}%</span>
                                        </div>
                                    ))}
                                </>
                            );
                        })()}
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs mt-3 text-continental-gray-1">
                        <span className="flex items-center gap-1">
                            <span className="inline-block size-3 rounded bg-slate-50 border" /> sin días de empresa
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="inline-block size-3 rounded bg-emerald-200" /> holgado
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="inline-block size-3 rounded bg-amber-400" /> cerca del máximo
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="inline-block size-3 rounded bg-red-500" /> algún grupo rebasa
                        </span>
                    </div>
                </div>
            )}

            {/* Reparto por grupo: si todos traen casi los mismos días por
                empleado, la asignación fue plana y no miró disponibilidad. */}
            <div>
                <h3 className="text-sm font-semibold mb-2">Reparto por grupo</h3>
                <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-left">
                            <tr>
                                <th className="px-3 py-2 font-medium">Grupo</th>
                                <th className="px-3 py-2 font-medium">Área</th>
                                <th className="px-3 py-2 font-medium text-right">Plantilla</th>
                                <th className="px-3 py-2 font-medium text-right">Días asignados</th>
                                <th className="px-3 py-2 font-medium text-right">Días por empleado</th>
                                <th className="px-3 py-2 font-medium text-right">Días con rebase</th>
                            </tr>
                        </thead>
                        <tbody>
                            {datos.grupos.map((g) => (
                                <tr key={g.grupoId} className="border-t">
                                    <td className="px-3 py-1.5">{g.nombre}</td>
                                    <td className="px-3 py-1.5 text-continental-gray-1">{g.area}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums">{g.plantilla}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums">{g.diasEmpresaAsignados}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums">{g.diasPorEmpleado}</td>
                                    <td
                                        className={`px-3 py-1.5 text-right tabular-nums ${
                                            g.diasConRebase > 0 ? "text-red-600 font-medium" : ""
                                        }`}
                                    >
                                        {g.diasConRebase}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default DashboardProgramacionAnual;
