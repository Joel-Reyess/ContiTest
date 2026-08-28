import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  CalendarClock,
  CalendarOff,
  CheckCircle2,
  Circle,
  Loader2,
  RefreshCw,
  Briefcase,
  LayoutGrid,
} from "lucide-react";
import { reglasTurnoService } from "@/services/reglasTurnoService";
import { diasInhabilesService } from "@/services/diasInhabilesService";
import { AsignacionAutomaticaService } from "@/services/asignacionAutomaticaService";
import { BloquesReservacionService } from "@/services/bloquesReservacionService";

/**
 * Wizard de estado de la programación anual de un año.
 * Verifica y guía la secuencia acordada con el cliente:
 *   1. Cargar el rol (arranques de reglas del año, ej. enero y abril)
 *   2. Cargar festivos / días inhábiles del año
 *   3. Asignar los días por empresa (según tabla de antigüedades)
 *   4. Generar los bloques de captura
 * No bloquea nada por sí mismo: muestra qué pasos están completos y ofrece la
 * acción de cada uno. El orden importa (los bloques usan los días inhábiles y
 * la asignación usa el calendario de roles), por eso se numeran.
 */

interface PasoEstado {
  completado: boolean;
  detalle: string;
}

interface EstadoWizard {
  arranques: PasoEstado;
  festivos: PasoEstado;
  diasEmpresa: PasoEstado;
  bloques: PasoEstado;
}

interface ProgramacionAnualWizardProps {
  anio: number;
  onNotification: (
    type: "success" | "info" | "warning" | "error",
    title: string,
    message?: string
  ) => void;
  /** Abre el modal de asignación automática de días por empresa. */
  onAbrirProgramarDias: () => void;
  /** Abre el modal de generación de bloques (ya parametrizado con `anio`). */
  onAbrirGenerarBloques: () => void;
  /** Se invoca cuando el usuario pide ir a la pestaña Calendario (pasos 1 y 2). */
  onIrACalendario?: () => void;
  /** Cámbialo (ej. contador) para que el wizard vuelva a verificar los pasos tras una acción. */
  version?: number;
}

export const ProgramacionAnualWizard = ({
  anio,
  onNotification,
  onAbrirProgramarDias,
  onAbrirGenerarBloques,
  onIrACalendario,
  version = 0,
}: ProgramacionAnualWizardProps) => {
  const navigate = useNavigate();
  const [estado, setEstado] = useState<EstadoWizard | null>(null);
  const [cargando, setCargando] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const cargarEstado = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    const nuevo: EstadoWizard = {
      arranques: { completado: false, detalle: "Sin verificar" },
      festivos: { completado: false, detalle: "Sin verificar" },
      diasEmpresa: { completado: false, detalle: "Sin verificar" },
      bloques: { completado: false, detalle: "Sin verificar" },
    };
    let algunaFallo = false;

    // Cada verificación es independiente: si una falla, las demás siguen.
    try {
      const rotaciones = await reglasTurnoService.listarRotacionesProgramadas(
        `${anio}-01-01`,
        `${anio}-12-31`
      );
      const activas = rotaciones.filter((r) => r.estado !== "Cancelada");
      // Se listan fecha y regla porque el cliente arranca el año en dos momentos
      // (enero y ~abril) y necesita confirmar que ambos quedaron agendados.
      const resumen = activas
        .slice()
        .sort((a, b) => a.fechaEjecucion.localeCompare(b.fechaEjecucion))
        .map((r) => `${r.codigoRegla} ${r.fechaEjecucion.slice(0, 10)}`)
        .join(" · ");
      const reglasConArranque = new Set(activas.map((r) => r.codigoRegla)).size;
      nuevo.arranques = {
        completado: activas.length > 0,
        detalle:
          activas.length > 0
            ? `${activas.length} arranque(s) en ${anio} sobre ${reglasConArranque} regla(s): ${resumen}`
            : `Ningún arranque de reglas agendado para ${anio}`,
      };
    } catch (e) {
      algunaFallo = true;
      nuevo.arranques.detalle = "No se pudo verificar";
    }

    try {
      const resp = await diasInhabilesService.getDiasInhabiles({
        fechaInicio: `${anio}-01-01`,
        fechaFin: `${anio}-12-31`,
      });
      const total = resp.data?.length ?? 0;
      nuevo.festivos = {
        completado: total > 0,
        detalle:
          total > 0
            ? `${total} día(s) inhábil(es) cargado(s) para ${anio}`
            : `Sin días inhábiles cargados para ${anio}`,
      };
    } catch (e) {
      // El backend responde con error cuando no hay días para los parámetros;
      // eso cuenta como "0 cargados", no como fallo de verificación.
      nuevo.festivos = {
        completado: false,
        detalle: `Sin días inhábiles cargados para ${anio}`,
      };
    }

    try {
      const resumen = await AsignacionAutomaticaService.obtenerResumen(anio);
      nuevo.diasEmpresa = {
        completado: resumen.asignacionRealizada,
        detalle: resumen.asignacionRealizada
          ? `${resumen.totalVacacionesAsignadas} día(s) asignado(s) a ${resumen.empleadosConAsignacion} empleado(s)`
          : "Aún no se ejecuta la asignación de días por empresa",
      };
    } catch (e) {
      algunaFallo = true;
      nuevo.diasEmpresa.detalle = "No se pudo verificar";
    }

    try {
      const stats = await BloquesReservacionService.obtenerEstadisticas(anio);
      nuevo.bloques = {
        completado: stats.totalBloques > 0,
        detalle:
          stats.totalBloques > 0
            ? `${stats.totalBloques} bloque(s) generado(s)`
            : "Aún no se generan los bloques de captura",
      };
    } catch (e) {
      algunaFallo = true;
      nuevo.bloques.detalle = "No se pudo verificar";
    }

    setEstado(nuevo);
    if (algunaFallo) {
      setErrorCarga(
        "Algunas verificaciones fallaron; los pasos marcados 'No se pudo verificar' pueden estar completos aunque no se muestre."
      );
    }
    setCargando(false);
    // `version` no se usa dentro, pero forma parte de las dependencias para
    // volver a verificar cuando el padre completa un paso (asignación, bloques).
  }, [anio, version]);

  useEffect(() => {
    cargarEstado();
  }, [cargarEstado]);

  const pasos = estado
    ? [
        {
          numero: 1,
          titulo: `Cargar el rol (arranques ${anio})`,
          descripcion:
            `Define cómo inician los roles del año. En la pestaña Calendario, sección "Fechas de arranque por regla", elige el año ${anio}: verás una tarjeta por regla con su patrón y sus subreglas (R0144, R0144_02…). Pon la fecha de arranque en cada regla, o marca varias y agéndales la misma fecha (ej. enero y otra vez en Semana Santa). Desde esa fecha el calendario se calcula con ese patrón. Se puede agendar desde hoy mismo; en pruebas, "Aplicar vencidos" lo aplica sin esperar.`,
          estado: estado.arranques,
          acciones: [
            ...(onIrACalendario
              ? [{ etiqueta: "Ir a Calendario", onClick: onIrACalendario }]
              : []),
            {
              etiqueta: `Ver calendario ${anio}`,
              onClick: () => navigate(`/admin/calendario-anual?anio=${anio}`),
            },
          ],
        },
        {
          numero: 2,
          titulo: `Cargar festivos / días inhábiles ${anio}`,
          descripcion:
            `Captura los días inhábiles por ley y por Continental de ${anio}, también en la pestaña Calendario. Se pueden cargar aunque ya existan los del año anterior: si un día ya estaba con el mismo motivo se omite y los demás se guardan.`,
          estado: estado.festivos,
          acciones: onIrACalendario
            ? [{ etiqueta: "Ir a Calendario", onClick: onIrACalendario }]
            : [],
        },
        {
          numero: 3,
          titulo: "Asignar días por empresa",
          descripcion:
            "Ejecuta la asignación automática según la tabla de antigüedades (4 años → 3 días, 5 → 4, 6 o más → 5). Selecciona el año en el modal.",
          estado: estado.diasEmpresa,
          acciones: [{ etiqueta: "Programar días", onClick: onAbrirProgramarDias }],
        },
        {
          numero: 4,
          titulo: "Generar bloques de captura",
          descripcion:
            "Genera los bloques por grupo con los que los empleados capturarán sus días. Requiere los pasos anteriores.",
          estado: estado.bloques,
          acciones: [
            {
              etiqueta: "Generar bloques",
              onClick: () => {
                if (!estado.festivos.completado) {
                  onNotification(
                    "warning",
                    "Festivos sin cargar",
                    `Carga los días inhábiles de ${anio} antes de generar los bloques; de lo contrario los bloques pueden caer en festivos.`
                  );
                  return;
                }
                onAbrirGenerarBloques();
              },
            },
          ],
        },
      ]
    : [];

  const iconoPaso = (numero: number) => {
    switch (numero) {
      case 1:
        return <CalendarClock className="w-4 h-4" />;
      case 2:
        return <CalendarOff className="w-4 h-4" />;
      case 3:
        return <Briefcase className="w-4 h-4" />;
      default:
        return <LayoutGrid className="w-4 h-4" />;
    }
  };

  return (
    <div className="bg-white border border-continental-gray-3 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-continental-blue-light">
          Secuencia de programación anual {anio}
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={cargarEstado}
          disabled={cargando}
          className="flex items-center gap-1 text-xs"
        >
          {cargando ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <RefreshCw className="w-3 h-3" />
          )}
          Actualizar
        </Button>
      </div>

      {errorCarga && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
          {errorCarga}
        </p>
      )}

      {!estado && cargando ? (
        <div className="flex items-center gap-2 text-gray-600 text-sm py-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Verificando pasos…
        </div>
      ) : (
        <ol className="space-y-2">
          {pasos.map((paso) => (
            <li
              key={paso.numero}
              className={`border rounded-lg p-3 flex items-start gap-3 ${
                paso.estado.completado
                  ? "border-green-200 bg-green-50/50"
                  : "border-gray-200"
              }`}
            >
              <div className="mt-0.5">
                {paso.estado.completado ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                ) : (
                  <Circle className="w-5 h-5 text-gray-300" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-continental-black flex items-center gap-2">
                  <span className="text-continental-gray-1">{iconoPaso(paso.numero)}</span>
                  {paso.numero}. {paso.titulo}
                </p>
                <p className="text-xs text-gray-600 mt-0.5">{paso.descripcion}</p>
                <p
                  className={`text-xs mt-1 font-medium ${
                    paso.estado.completado ? "text-green-700" : "text-amber-700"
                  }`}
                >
                  {paso.estado.detalle}
                </p>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                {paso.acciones.map((accion) => (
                  <Button
                    key={accion.etiqueta}
                    variant="outline"
                    size="sm"
                    onClick={accion.onClick}
                  >
                    {accion.etiqueta}
                  </Button>
                ))}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};
