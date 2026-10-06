import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, AlertTriangle, Filter, TrendingUp } from "lucide-react";
import { Label } from "@/components/ui/label";
import useAuth from "@/hooks/useAuth";
import { UserRole } from "@/interfaces/User.interface";
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
    const { user } = useAuth();
    // El backend ya recorta los datos al alcance de quien pregunta; aquí sólo se
    // usa el rol para no rotular como "toda la planta" lo que para un jefe de
    // área son nada más sus áreas.
    const veTodaLaPlanta = (user?.roles || []).some((rol) => {
        const nombre = typeof rol === "string" ? rol : (rol as { name?: string })?.name;
        return nombre === UserRole.SUPER_ADMIN || nombre === "Super Usuario" || nombre === UserRole.INDUSTRIAL;
    });
    const alcance = veTodaLaPlanta ? "toda la planta" : "tus áreas";
    const [datos, setDatos] = useState<Datos | null>(null);
    const [cargando, setCargando] = useState(true);
    const [areaId, setAreaId] = useState<number | null>(null);
    const [mesAbierto, setMesAbierto] = useState<number | null>(null);
    // Los grupos del selector salen de la consulta SIN filtro: así el filtro no
    // se queda sin opciones cuando ya hay un grupo seleccionado.
    const [catalogoGrupos, setCatalogoGrupos] = useState<Datos["grupos"]>([]);

    useEffect(() => {
        let vigente = true;
        setCargando(true);
        getDashboardProgramacionAnual(anio, { areaId })
            .then((d) => {
                if (!vigente) return;
                setDatos(d);
                if (!areaId) setCatalogoGrupos(d.grupos);
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
    }, [anio, areaId]);

    const diasPorMes = useMemo(() => {
        const mapa = new Map<number, DiaProgramacionAnual[]>();
        (datos?.dias ?? []).forEach((d) => {
            const mes = Number(d.fecha.slice(5, 7));
            if (!mapa.has(mes)) mapa.set(mes, []);
            mapa.get(mes)!.push(d);
        });
        return mapa;
    }, [datos]);

    // Las áreas salen del catálogo de grupos: un área aparece una sola vez
    // aunque tenga cuatro grupos.
    const catalogoAreas = useMemo(() => {
        const mapa = new Map<number, string>();
        catalogoGrupos.forEach((g) => {
            if (g.areaId) mapa.set(g.areaId, g.area);
        });
        return [...mapa.entries()]
            .map(([id, nombre]) => ({ id, nombre }))
            .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    }, [catalogoGrupos]);

    // Cómo va repartido el porcentaje del año entre lo que puso la empresa y lo
    // que llevan capturado los operadores. Misma base que el porcentaje diario
    // (ausentes entre plantilla), pero promediada sobre todo el año: sirve para
    // ver el reparto, no para juzgar un día suelto.
    const porcentajesDelAnio = useMemo(() => {
        if (!datos || datos.plantillaTotal === 0 || datos.dias.length === 0) return null;
        const base = datos.plantillaTotal * datos.dias.length;
        const empresa = (datos.diasEmpresaAsignados / base) * 100;
        const operador = (datos.diasCapturadosPorOperador / base) * 100;
        return { empresa, operador, total: empresa + operador };
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
                    Datos de {alcance}. Cada día, cada grupo puede tener fuera como máximo el{" "}
                    <span className="font-medium">{datos.porcentajeMaximoGlobal}%</span> de su gente: es
                    el porcentaje de tiempo extra que se configura en Vacaciones (el «cupo» del día).
                    Aquí se ve cuánto de ese cupo se va llenando: en azul lo que puso la empresa y en
                    amarillo lo que van capturando los operadores. Los días en{" "}
                    <span className="text-red-600 font-medium">rojo</span> son los que de verdad pasan
                    el cupo en algún grupo.
                </p>
            </div>

            <div className="min-w-[240px] max-w-xs">
                <Label className="text-xs flex items-center gap-1">
                    <Filter className="size-3" /> Filtrar por área
                </Label>
                <select
                    value={areaId ?? ""}
                    onChange={(e) => setAreaId(e.target.value ? Number(e.target.value) : null)}
                    className="w-full border rounded px-2 py-1.5 text-sm mt-1"
                >
                    <option value="">{veTodaLaPlanta ? "Toda la planta" : "Todas mis áreas"}</option>
                    {catalogoAreas.map((a) => (
                        <option key={a.id} value={a.id}>
                            {a.nombre}
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
                    {
                        // La etiqueta la pidió el cliente; es el % de ausencia
                        // por día y por grupo que se configura en Vacaciones.
                        etiqueta: "Porcentaje de tiempo extra máximo permitido (cupo por día y grupo)",
                        valor: `${datos.porcentajeMaximoGlobal}%`,
                    },
                    {
                        etiqueta: "Días con rebase",
                        valor: String(datos.diasConRebase),
                        alerta: datos.diasConRebase > 0,
                    },
                    {
                        etiqueta: "Mes con mayor carga de vacaciones",
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


            {/* Avance de captura. El % del año (abajo) es un promedio de días por
                persona y casi no cambia entre la planta y un área; este sí: de
                los operadores que tienen días que elegir, cuántos ya lo hicieron. */}
            {(() => {
                const deben = datos.operadoresDebenCapturar ?? 0;
                const ya = datos.operadoresYaCapturaron ?? 0;
                const pct = deben > 0 ? (ya / deben) * 100 : 0;
                const areaElegida = areaId ? catalogoAreas.find((a) => a.id === areaId)?.nombre : null;
                const de = areaElegida ? `el área ${areaElegida}` : alcance;
                return (
                    <div className="rounded-lg border bg-white p-4 space-y-2">
                        <div className="flex items-baseline justify-between gap-4 flex-wrap">
                            <h3 className="text-sm font-semibold">Avance de captura {datos.anio}</h3>
                            <p className="text-sm tabular-nums">
                                <span className="text-lg font-semibold">{pct.toFixed(1)}%</span>{" "}
                                <span className="text-continental-gray-1">
                                    — {ya.toLocaleString("es-MX")} de {deben.toLocaleString("es-MX")} operadores ya capturaron
                                </span>
                            </p>
                        </div>
                        <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden">
                            <div
                                className="h-full rounded-full bg-continental-blue-light"
                                style={{ width: `${Math.min(100, pct)}%` }}
                            />
                        </div>
                        <p className="text-xs text-continental-gray-1">
                            De {de}. Cuentan los operadores con días de común acuerdo en {datos.anio}
                            {" "}(2 años o más de antigüedad); «ya capturó» = tiene sus días anuales
                            registrados, los haya capturado él o su jefe. Cambia al filtrar por área.
                        </p>
                    </div>
                );
            })()}

            {/* Cómo va repartido el porcentaje del año. Los recuadros de arriba
                dan días sueltos; esto dice qué parte del cupo se la llevó la
                empresa y qué parte va poniendo la gente al capturar. */}
            {porcentajesDelAnio && (
                <div className="rounded-lg border bg-white p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="text-sm font-semibold">Llenado del cupo en un día promedio del año</h3>
                        <span className="text-xs text-continental-gray-1">
                            Cupo: {datos.porcentajeMaximoGlobal}%
                        </span>
                    </div>

                    <div className="grid grid-cols-3 gap-3 mt-3">
                        <div>
                            <p className="text-xs text-continental-gray-1">Días de empresa</p>
                            <p className="text-lg font-semibold tabular-nums text-continental-blue-dark">
                                {porcentajesDelAnio.empresa.toFixed(2)}%
                            </p>
                            <p className="text-xs text-continental-gray-1 tabular-nums">
                                {datos.diasEmpresaAsignados.toLocaleString("es-MX")} días
                            </p>
                        </div>
                        <div>
                            <p className="text-xs text-continental-gray-1">Capturados por operadores</p>
                            <p className="text-lg font-semibold tabular-nums text-amber-600">
                                {porcentajesDelAnio.operador.toFixed(2)}%
                            </p>
                            <p className="text-xs text-continental-gray-1 tabular-nums">
                                {datos.diasCapturadosPorOperador.toLocaleString("es-MX")} días
                            </p>
                        </div>
                        <div>
                            <p className="text-xs text-continental-gray-1">Los dos juntos</p>
                            <p
                                className={`text-lg font-semibold tabular-nums ${
                                    porcentajesDelAnio.total > datos.porcentajeMaximoGlobal ? "text-red-700" : ""
                                }`}
                            >
                                {porcentajesDelAnio.total.toFixed(2)}%
                            </p>
                            <p className="text-xs text-continental-gray-1 tabular-nums">
                                de {datos.porcentajeMaximoGlobal}% permitido
                            </p>
                        </div>
                    </div>

                    {/* La barra se escala contra el máximo permitido, no contra
                        100%: así se ve de inmediato cuánto del cupo queda. */}
                    <div className="relative h-4 mt-3 bg-slate-100 rounded overflow-hidden">
                        <div
                            className="absolute inset-y-0 left-0 bg-continental-blue-dark/70"
                            style={{
                                width: `${Math.min(100, (porcentajesDelAnio.empresa / datos.porcentajeMaximoGlobal) * 100)}%`,
                            }}
                            title={`Empresa: ${porcentajesDelAnio.empresa.toFixed(2)}%`}
                        />
                        <div
                            className="absolute inset-y-0 bg-continental-yellow"
                            style={{
                                left: `${Math.min(100, (porcentajesDelAnio.empresa / datos.porcentajeMaximoGlobal) * 100)}%`,
                                width: `${Math.min(
                                    100,
                                    (porcentajesDelAnio.operador / datos.porcentajeMaximoGlobal) * 100
                                )}%`,
                            }}
                            title={`Operadores: ${porcentajesDelAnio.operador.toFixed(2)}%`}
                        />
                    </div>
                    <p className="text-xs text-continental-gray-1 mt-2">
                        En un día cualquiera del año, en promedio, el{" "}
                        {porcentajesDelAnio.total.toFixed(2)}% de la plantilla está de vacaciones
                        ({porcentajesDelAnio.empresa.toFixed(2)}% por días de la empresa y{" "}
                        {porcentajesDelAnio.operador.toFixed(2)}% por lo que capturaron los operadores), de
                        un cupo de {datos.porcentajeMaximoGlobal}%. La barra está a escala del cupo: llena
                        = cupo completo. Es un promedio de todo el año y solo de vacaciones; no dice si
                        algún día se pasó — eso lo marcan en rojo el calendario y los meses de abajo.
                    </p>
                </div>
            )}

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
                        <span className="flex items-center gap-1.5">
                            <span className="inline-block w-3 border-t border-dashed border-slate-500" />
                            Reparto parejo
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
                                    Día promedio: {(Number(m.porcentajeEmpresa) + Number(m.porcentajeCapturado)).toFixed(2)}%
                                    <span className="text-continental-gray-1">
                                        {" "}(empresa {m.porcentajeEmpresa}% + operador {m.porcentajeCapturado}%)
                                    </span>
                                </p>
                                <p className="text-xs tabular-nums text-continental-gray-1">
                                    Día más lleno: {m.porcentajeMaximo}% de {datos.porcentajeMaximoGlobal}%
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
                <div className="text-xs text-continental-gray-1 mt-2 space-y-1">
                    <p>
                        <span className="font-medium">Línea punteada (reparto parejo):</span> si la empresa
                        hubiera repartido sus días del año igual en los 12 meses, a cada mes le tocarían{" "}
                        {Math.round(datos.meses[0]?.diasEsperadosSiFueraParejo ?? 0).toLocaleString("es-MX")} días.
                        No es un límite. Compárala solo con lo <span className="font-medium">azul</span>: si
                        lo azul queda muy arriba de la línea, la empresa amontonó días en ese mes. Lo amarillo
                        (lo que capturan los operadores) no cuenta para esta línea.
                    </p>
                    <p>
                        <span className="font-medium">Día promedio:</span> qué porcentaje de la plantilla
                        está de vacaciones un día cualquiera del mes, y cuánto de eso puso la empresa y cuánto
                        capturaron los operadores. Mientras más se acerque al {datos.porcentajeMaximoGlobal}%,
                        más lleno viene el mes.
                    </p>
                    <p>
                        <span className="font-medium">Día más lleno:</span> el día del mes con más gente fuera
                        (vacaciones, permisos e incapacidades), juntando{" "}
                        {areaId ? "toda el área elegida" : alcance}. Es una referencia: el cupo de{" "}
                        {datos.porcentajeMaximoGlobal}% se revisa grupo por grupo, así que un grupo puede
                        pasarse aunque este número salga abajo (o al revés). Lo que de verdad cuenta son los
                        días en <span className="text-red-600 font-medium">rojo</span>.
                    </p>
                </div>
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
                            <span className="inline-block size-3 rounded bg-emerald-200" /> menos del 60% del cupo
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="inline-block size-3 rounded bg-amber-200" /> 60% del cupo o más
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="inline-block size-3 rounded bg-amber-400" /> cupo lleno (sumando todo)
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="inline-block size-3 rounded bg-red-500" /> algún grupo pasó su cupo
                        </span>
                        <span className="w-full">
                            El número de cada día es el % de gente fuera sumando {areaId ? "el área" : alcance}; el
                            cupo de {datos.porcentajeMaximoGlobal}% se revisa por grupo, por eso solo el rojo dice
                            que alguien se pasó.
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
                                <th className="px-3 py-2 font-medium text-right">Ya capturaron</th>
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
                                    <td className="px-3 py-1.5 text-right tabular-nums">
                                        {(g.operadoresDebenCapturar ?? 0) > 0
                                            ? `${g.operadoresYaCapturaron ?? 0} de ${g.operadoresDebenCapturar} (${Math.round(((g.operadoresYaCapturaron ?? 0) / g.operadoresDebenCapturar) * 100)}%)`
                                            : "—"}
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
