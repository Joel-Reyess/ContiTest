import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Sun,
  Settings,
  CheckCircle,
  Users,
  Calendar,
  Trash2,
  CalendarSync,
  ArrowLeft,
  XCircle,
  Download,
} from "lucide-react";
import { GroupConfigValidator } from "./GroupConfigValidator";
import { ProgramacionAutomaticaModal } from "./ProgramacionAutomaticaModal";
import { RevertirAsignacionModal } from "./RevertirAsignacionModal";
import { GenerarBloquesModal } from "./GenerarBloquesModal";
import { ProgramacionAnualContent } from "./ProgramacionAnualContent";
import { ProgramacionAnualWizard } from "./ProgramacionAnualWizard";
import { AsignacionAutomaticaService } from "@/services/asignacionAutomaticaService";
import { BloquesReservacionService } from "@/services/bloquesReservacionService";
import { vacacionesService } from "@/services/vacacionesService";
import { generarExcelBloques } from "@/utils/excelGenerator";
import type {
  ResumenAsignacionAutomaticaResponse,
  EstadisticasBloquesResponse,
} from "@/interfaces/Api.interface";
import type { VacacionesConfig } from "@/interfaces/Vacaciones.interface";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface VacacionesGeneralProps {
  onNotification: (
    type: "success" | "info" | "warning" | "error",
    title: string,
    message?: string
  ) => void;
  anioVigente: number;
  onConfigUpdate?: (config: VacacionesConfig) => void;
  /** Cambia a la pestaña Calendario (pasos 1-2 del wizard). */
  onIrACalendario?: () => void;
}

export const VacacionesGeneral = ({
  onNotification,
  anioVigente,
  onConfigUpdate,
  onIrACalendario,
}: VacacionesGeneralProps) => {
  const [fechaInicio, setFechaInicio] = useState<string>("");
  const [configVacaciones, setConfigVacaciones] =
    useState<VacacionesConfig | null>(null);
  const [showProgramacionModal, setShowProgramacionModal] = useState(false);
  const [resumenAsignacion, setResumenAsignacion] =
    useState<ResumenAsignacionAutomaticaResponse | null>(null);
  const [loadingResumen, setLoadingResumen] = useState(false);
  const [showRevertirModal, setShowRevertirModal] = useState(false);
  const [isReverting, setIsReverting] = useState(false);
  const [showGenerarBloquesModal, setShowGenerarBloquesModal] = useState(false);
  const [estadisticasBloques, setEstadisticasBloques] =
    useState<EstadisticasBloquesResponse | null>(null);
  // null = la consulta funcionó (haya o no bloques); string = la consulta falló.
  // Sin esta distinción, un 500/timeout del backend se mostraba como
  // "No hay datos de programación anual", indistinguible de la BD vacía.
  const [errorEstadisticas, setErrorEstadisticas] = useState<string | null>(
    null
  );
  const [loadingEstadisticas, setLoadingEstadisticas] = useState(false);
  const [isEliminandoBloques, setIsEliminandoBloques] = useState(false);
  // Coexistencia: cuando la preparación del siguiente año está activa, los
  // modales de días/bloques deben operar sobre ese año, no sobre el vigente.
  const [prepFechaInicioBloques, setPrepFechaInicioBloques] = useState<string>("");
  const [modalesEnPreparacion, setModalesEnPreparacion] = useState(false);
  const [cambiandoPreparacion, setCambiandoPreparacion] = useState(false);

  const anioPreparacion = configVacaciones?.anioProgramacionAnual ?? null;

  // Cargar configuración de vacaciones al iniciar
  useEffect(() => {
    const cargarConfiguracion = async () => {
      try {
        const config = await vacacionesService.getConfig();
        setConfigVacaciones(config);
      } catch (error) {
        console.error("Error al cargar configuración de vacaciones:", error);
        onNotification(
          "error",
          "Error",
          "No se pudo cargar la configuración de vacaciones"
        );
      }
    };

    cargarConfiguracion();
  }, [onNotification]);

  // Verificar si ya existe una asignación automática para el año vigente
  useEffect(() => {
    const verificarAsignacionExistente = async () => {
      try {
        setLoadingResumen(true);
        const resumen = await AsignacionAutomaticaService.obtenerResumen(
          anioVigente
        );
        setResumenAsignacion(resumen);
      } catch (error) {
        console.log(
          "No hay asignación automática existente para el año",
          anioVigente
        );
        setResumenAsignacion(null);
      } finally {
        setLoadingResumen(false);
      }
    };

    verificarAsignacionExistente();
  }, [anioVigente]);

  // Verificar estadísticas de bloques existentes
  useEffect(() => {
    const verificarEstadisticasBloques = async () => {
      try {
        setLoadingEstadisticas(true);
        const estadisticas =
          await BloquesReservacionService.obtenerEstadisticas(anioVigente);
        if (estadisticas.totalBloques > 0) {
          setEstadisticasBloques(estadisticas);
        } else {
          setEstadisticasBloques(null);
        }
        setErrorEstadisticas(null);
      } catch (error) {
        console.error(
          "Error al consultar estadísticas de bloques para el año",
          anioVigente,
          error
        );
        setEstadisticasBloques(null);
        setErrorEstadisticas(
          error instanceof Error && error.message
            ? error.message
            : "No se pudo consultar el estado de los bloques"
        );
      } finally {
        setLoadingEstadisticas(false);
      }
    };

    verificarEstadisticasBloques();
  }, [anioVigente]);

  const handleCancel = async () => {
    setFechaInicio("");
    // Si el periodo está en ProgramacionAnual, cambiarlo a Cerrado
    if (configVacaciones?.periodoActual === "ProgramacionAnual") {
      try {
        const updatedConfig = await vacacionesService.updateConfig({
          porcentajeAusenciaMaximo: configVacaciones.porcentajeAusenciaMaximo,
          periodoActual: "Cerrado",
          anioVigente: configVacaciones.anioVigente,
          anioProgramacionAnual: configVacaciones.anioProgramacionAnual ?? null,
        });
        setConfigVacaciones(updatedConfig);
        onConfigUpdate?.(updatedConfig);
      } catch (error) {
        console.error("Error al actualizar configuración:", error);
      }
    }
  };

  const handleSave = async () => {
    if (!configVacaciones) {
      onNotification("error", "Error", "No se pudo cargar la configuración");
      return;
    }

    try {
      // Actualizar periodoActual a ProgramacionAnual
      const updatedConfig = await vacacionesService.updateConfig({
        porcentajeAusenciaMaximo: configVacaciones.porcentajeAusenciaMaximo,
        periodoActual: "ProgramacionAnual",
        anioVigente: configVacaciones.anioVigente,
        anioProgramacionAnual: configVacaciones.anioProgramacionAnual ?? null,
      });

      setConfigVacaciones(updatedConfig);
      onConfigUpdate?.(updatedConfig);
      console.log("Saving vacation data:", { fechaInicio });
      onNotification(
        "success",
        "Datos guardados exitosamente",
        "La configuración general ha sido guardada correctamente y el período cambió a Programación Anual."
      );
    } catch (error) {
      console.error("Error al guardar configuración:", error);
      onNotification("error", "Error", "No se pudo guardar la configuración");
    }
  };

  const handleProgramarDiasSuccess = () => {
    setModalesEnPreparacion(false);
    setShowProgramacionModal(true);
  };

  // ---- Coexistencia: preparación de la programación anual del siguiente año ----

  const actualizarAnioPreparacion = async (
    nuevoAnio: number | null,
    mensajeOk: string
  ) => {
    if (!configVacaciones) return;
    try {
      setCambiandoPreparacion(true);
      const updatedConfig = await vacacionesService.updateConfig({
        porcentajeAusenciaMaximo: configVacaciones.porcentajeAusenciaMaximo,
        periodoActual: configVacaciones.periodoActual,
        anioVigente: configVacaciones.anioVigente,
        anioProgramacionAnual: nuevoAnio,
      });
      setConfigVacaciones(updatedConfig);
      onConfigUpdate?.(updatedConfig);
      onNotification("success", "Configuración actualizada", mensajeOk);
    } catch (error) {
      console.error("Error al actualizar año de preparación:", error);
      onNotification(
        "error",
        "Error",
        error instanceof Error
          ? error.message
          : "No se pudo actualizar la configuración"
      );
    } finally {
      setCambiandoPreparacion(false);
    }
  };

  // HU20 "Activar nuevo periodo anual": el año preparado pasa a ser el vigente
  // y su reprogramación queda activa; la preparación se limpia.
  const handleActivarAnioPreparado = async () => {
    if (!configVacaciones?.anioProgramacionAnual) return;
    const anioNuevo = configVacaciones.anioProgramacionAnual;
    try {
      setCambiandoPreparacion(true);
      const updatedConfig = await vacacionesService.updateConfig({
        porcentajeAusenciaMaximo: configVacaciones.porcentajeAusenciaMaximo,
        periodoActual: "Reprogramacion",
        anioVigente: anioNuevo,
        anioProgramacionAnual: null,
      });
      setConfigVacaciones(updatedConfig);
      onConfigUpdate?.(updatedConfig);
      onNotification(
        "success",
        `Año ${anioNuevo} activado`,
        `El año vigente ahora es ${anioNuevo}. La reprogramación de ${anioNuevo} queda activa.`
      );
    } catch (error) {
      console.error("Error al activar el año preparado:", error);
      onNotification(
        "error",
        "Error",
        error instanceof Error ? error.message : "No se pudo activar el año"
      );
    } finally {
      setCambiandoPreparacion(false);
    }
  };

  const handleProgramacionCompleta = async () => {
    // Actualizar el resumen después de completar la programación
    try {
      const resumen = await AsignacionAutomaticaService.obtenerResumen(
        anioVigente
      );
      setResumenAsignacion(resumen);
      setShowProgramacionModal(false);
    } catch (error) {
      console.error("Error al actualizar resumen:", error);
    }
  };

  const handleRevertirAsignacion = () => {
    setShowRevertirModal(true);
  };

  const handleConfirmarReversion = async () => {
    try {
      setIsReverting(true);

      const response = await AsignacionAutomaticaService.revertirAsignacion(
        anioVigente
      );

      onNotification(
        "success",
        "Asignación Revertida",
        `Se eliminaron ${response.totalVacacionesEliminadas} vacaciones de ${response.empleadosAfectados} empleados.`
      );

      // Actualizar el estado para mostrar que no hay asignación
      setResumenAsignacion(null);
      setShowRevertirModal(false);
    } catch (error) {
      console.error("Error al revertir asignación:", error);

      let errorMessage =
        "Ocurrió un error al revertir la asignación. Por favor intente nuevamente.";

      if (error instanceof Error) {
        if (
          error.message.includes("timeout") ||
          error.message.includes("Request timeout")
        ) {
          errorMessage =
            "La operación de reversión tardó más de lo esperado. Por favor intente nuevamente o contacte al administrador.";
        } else if (
          error.message.includes("Network Error") ||
          error.message.includes("Failed to fetch")
        ) {
          errorMessage =
            "Error de conexión. Verifique su conexión a internet e intente nuevamente.";
        } else if (error.message) {
          errorMessage = error.message;
        }
      }

      onNotification("error", "Error al Revertir", errorMessage);
    } finally {
      setIsReverting(false);
    }
  };

  const handleCancelarReversion = () => {
    setShowRevertirModal(false);
  };

  const handleGenerarTurnosSuccess = () => {
    setModalesEnPreparacion(false);
    setShowGenerarBloquesModal(true);
  };

  const handleBloquesGeneradosSuccess = async () => {
    // Actualizar estadísticas después de generar bloques
    try {
      const estadisticas = await BloquesReservacionService.obtenerEstadisticas(
        anioVigente
      );
      if (estadisticas.totalBloques > 0) {
        setEstadisticasBloques(estadisticas);
      }
      setShowGenerarBloquesModal(false);
    } catch (error) {
      console.error("Error al actualizar estadísticas de bloques:", error);
    }
  };

  const handleEliminarBloques = async () => {
    try {
      setIsEliminandoBloques(true);

      const response = await BloquesReservacionService.eliminarBloques(
        anioVigente
      );

      onNotification(
        "success",
        "Bloques Eliminados",
        `Se eliminaron ${response.totalBloquesEliminados} bloques de ${response.gruposAfectados} grupos.`
      );

      // Actualizar estadísticas (debería quedar en 0)
      setEstadisticasBloques(null);
    } catch (error) {
      console.error("Error al eliminar bloques:", error);

      let errorMessage =
        "Ocurrió un error al eliminar los bloques. Por favor intente nuevamente.";
      if (error instanceof Error && error.message) {
        errorMessage = error.message;
      }

      onNotification("error", "Error al Eliminar Bloques", errorMessage);
    } finally {
      setIsEliminandoBloques(false);
    }
  };

  const handleDescargarTurnos = async () => {
    try {
      console.log("Descargando turnos para el año:", anioVigente);

      // Mostrar notificación de descarga en progreso
      onNotification(
        "info",
        "Descargando turnos",
        "Obteniendo información de bloques de reservación..."
      );

      // Obtener los bloques del servidor
      const bloquesData = await BloquesReservacionService.obtenerBloques(anioVigente);

      if (!bloquesData.bloques || bloquesData.bloques.length === 0) {
        onNotification(
          "warning",
          "Sin datos",
          "No hay bloques de reservación disponibles para descargar."
        );
        return;
      }

      // Generar y descargar el archivo Excel
      generarExcelBloques(bloquesData.bloques, anioVigente);

      onNotification(
        "success",
        "Descarga completada",
        `Se descargó el archivo con ${bloquesData.totalBloques} bloques de reservación.`
      );
    } catch (error) {
      console.error("Error al descargar turnos:", error);

      let errorMessage = "No se pudo descargar el archivo de turnos.";
      if (error instanceof Error && error.message) {
        errorMessage = error.message;
      }

      onNotification(
        "error",
        "Error al descargar",
        errorMessage
      );
    }
  };

  const onDescargarNoAsignados = async () => {
    if (!configVacaciones) {
      onNotification(
        "error",
        "Error",
        "No se pudo cargar la configuración de vacaciones"
      );
      return;
    }

    try {
      onNotification(
        "info",
        "Descargando",
        "Obteniendo información de empleados sin asignación..."
      );

      // Obtener empleados sin asignación
      const empleadosSinAsignacion = await AsignacionAutomaticaService.getEmpleadosSinAsignacion(
        configVacaciones.anioVigente
      );

      if (empleadosSinAsignacion.totalEmpleadosSinAsignacion === 0) {
        onNotification(
          "info",
          "Sin empleados",
          "No hay empleados sin asignación automática"
        );
        return;
      }

      // Generar y descargar el Excel
      const { generarExcelEmpleadosSinAsignacion } = await import("@/utils/empleadosSinAsignacionExcel");
      generarExcelEmpleadosSinAsignacion(empleadosSinAsignacion);

      onNotification(
        "success",
        "Descarga completa",
        `Se descargó el reporte con ${empleadosSinAsignacion.totalEmpleadosSinAsignacion} empleados sin asignación`
      );
    } catch (error) {
      console.error("Error al descargar empleados sin asignación:", error);
      onNotification(
        "error",
        "Error al descargar",
        error instanceof Error ? error.message : "No se pudo descargar el reporte de empleados sin asignación"
      );
    }
  };

  // Determinar si mostrar el contenido de programación anual basado en periodoActual
  const mostrarContenidoProgramacionAnual =
    configVacaciones?.periodoActual === "ProgramacionAnual";

  return (
    <div className="space-y-6">
      {configVacaciones?.periodoActual === "Reprogramacion" ? (
        <>
          {/* Sección de Reprogramación */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <CalendarSync className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-medium text-continental-blue-light">
                  Periodo de Reprogramación Activo
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  Los delegados sindicales pueden realizar cambios en las vacaciones programadas
                </p>
              </div>
            </div>

            <div className="bg-white rounded-lg p-4 border border-blue-100">
              <h3 className="font-medium text-gray-900 mb-2">
                Información del periodo
              </h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex items-start gap-2">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span>Los delegados sindicales pueden acceder al sistema para aplicar reprogramaciones</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span>Los empleados pueden solicitar cambios a través de sus delegados</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span>Las modificaciones realizadas quedarán registradas en el sistema</span>
                </li>
              </ul>
            </div>

            <div className="flex justify-between items-center bg-gray-50 p-4 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-700">Acciones disponibles</p>
                <p className="text-xs text-gray-500 mt-1">
                  Puedes regresar a la programación anual o concluir el periodo de reprogramación
                </p>
              </div>
              <div className="flex gap-3">
                <Button
                  onClick={async () => {
                    try {
                      if (!configVacaciones) return;

                      onNotification(
                        "info",
                        "Regresando a Programación Anual",
                        "Actualizando el periodo..."
                      );

                      const updatedConfig = await vacacionesService.updateConfig({
                        porcentajeAusenciaMaximo: configVacaciones.porcentajeAusenciaMaximo,
                        periodoActual: "ProgramacionAnual",
                        anioVigente: configVacaciones.anioVigente,
                        anioProgramacionAnual: configVacaciones.anioProgramacionAnual ?? null,
                      });

                      setConfigVacaciones(updatedConfig);
                      onConfigUpdate?.(updatedConfig);
                      onNotification(
                        "success",
                        "Periodo actualizado",
                        "Se ha regresado al periodo de Programación Anual"
                      );
                    } catch (error) {
                      console.error("Error al cambiar periodo:", error);
                      onNotification(
                        "error",
                        "Error",
                        "No se pudo cambiar el periodo. Intente nuevamente."
                      );
                    }
                  }}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Regresar a Programación Anual
                </Button>

                <Button
                  onClick={async () => {
                    try {
                      if (!configVacaciones) return;

                      onNotification(
                        "info",
                        "Concluyendo Reprogramación",
                        "Cerrando el periodo de vacaciones..."
                      );

                      const updatedConfig = await vacacionesService.updateConfig({
                        porcentajeAusenciaMaximo: configVacaciones.porcentajeAusenciaMaximo,
                        periodoActual: "Cerrado",
                        anioVigente: configVacaciones.anioVigente,
                        anioProgramacionAnual: configVacaciones.anioProgramacionAnual ?? null,
                      });

                      setConfigVacaciones(updatedConfig);
                      onConfigUpdate?.(updatedConfig);
                      onNotification(
                        "success",
                        "Reprogramación concluida",
                        "El periodo de vacaciones ha sido cerrado exitosamente"
                      );
                    } catch (error) {
                      console.error("Error al cerrar periodo:", error);
                      onNotification(
                        "error",
                        "Error",
                        "No se pudo cerrar el periodo. Intente nuevamente."
                      );
                    }
                  }}
                  variant="continental"
                  className="flex items-center gap-2"
                >
                  <XCircle className="w-4 h-4" />
                  Concluir Reprogramación
                </Button>
              </div>
            </div>
          </div>

          {/* Coexistencia: preparar la programación anual del siguiente año sin
              cerrar la reprogramación del año vigente. */}
          <div className="bg-white border border-continental-yellow/70 rounded-lg p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-continental-yellow/20 rounded-full flex items-center justify-center">
                <Sun className="w-6 h-6 text-continental-yellow" />
              </div>
              <div>
                <h2 className="text-lg font-medium text-continental-blue-light">
                  {anioPreparacion
                    ? `Programación anual ${anioPreparacion} en preparación`
                    : "Preparar la programación anual del siguiente año"}
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  {anioPreparacion
                    ? `La reprogramación de ${anioVigente} sigue activa; los pasos de abajo operan sobre ${anioPreparacion} sin afectarla.`
                    : `Puedes ir preparando el siguiente año (roles, festivos, días por empresa y bloques) mientras la reprogramación de ${anioVigente} sigue activa.`}
                </p>
              </div>
            </div>

            {!anioPreparacion ? (
              <Button
                variant="continental"
                disabled={cambiandoPreparacion}
                onClick={() =>
                  actualizarAnioPreparacion(
                    anioVigente + 1,
                    `Preparación de la programación anual ${anioVigente + 1} iniciada`
                  )
                }
                className="flex items-center gap-2"
              >
                <Sun className="w-4 h-4" />
                Preparar programación anual {anioVigente + 1}
              </Button>
            ) : (
              <>
                <ProgramacionAnualWizard
                  anio={anioPreparacion}
                  onNotification={onNotification}
                  onIrACalendario={onIrACalendario}
                  onAbrirProgramarDias={() => {
                    setModalesEnPreparacion(true);
                    setShowProgramacionModal(true);
                  }}
                  onAbrirGenerarBloques={() => {
                    if (!prepFechaInicioBloques) {
                      onNotification(
                        "warning",
                        "Falta la fecha de inicio",
                        "Indica la fecha de inicio de generación de bloques (campo de abajo) antes de generarlos."
                      );
                      return;
                    }
                    setModalesEnPreparacion(true);
                    setShowGenerarBloquesModal(true);
                  }}
                />

                <div className="w-full max-w-sm">
                  <Label
                    htmlFor="prepFechaInicioBloques"
                    className="text-sm font-medium text-continental-gray-1"
                  >
                    Fecha de inicio de generación de bloques ({anioPreparacion})
                  </Label>
                  <Input
                    id="prepFechaInicioBloques"
                    type="date"
                    value={prepFechaInicioBloques}
                    onChange={(e) => setPrepFechaInicioBloques(e.target.value)}
                  />
                </div>

                <div className="flex flex-wrap gap-3 pt-2 border-t">
                  <Button
                    variant="continental"
                    disabled={cambiandoPreparacion}
                    onClick={handleActivarAnioPreparado}
                    className="flex items-center gap-2"
                    title={`El año vigente pasa a ser ${anioPreparacion} y su reprogramación queda activa`}
                  >
                    <CheckCircle className="w-4 h-4" />
                    Activar {anioPreparacion} como año vigente
                  </Button>
                  <Button
                    variant="outline"
                    disabled={cambiandoPreparacion}
                    onClick={() =>
                      actualizarAnioPreparacion(
                        null,
                        "Preparación cancelada. Los datos ya capturados del año no se borran."
                      )
                    }
                    className="border-red-300 text-red-600 hover:bg-red-50"
                  >
                    Cancelar preparación
                  </Button>
                </div>
              </>
            )}
          </div>
        </>
      ) : !mostrarContenidoProgramacionAnual ? (
        <>
          {/* Estado de la secuencia (rol → festivos → días empresa → bloques) */}
          <ProgramacionAnualWizard
            anio={anioVigente}
            onNotification={onNotification}
            onIrACalendario={onIrACalendario}
            onAbrirProgramarDias={() => {
              setModalesEnPreparacion(false);
              setShowProgramacionModal(true);
            }}
            onAbrirGenerarBloques={() => {
              if (!fechaInicio) {
                onNotification(
                  "warning",
                  "Falta la fecha de inicio",
                  "Indica la fecha de inicio de la programación anual (sección 1) antes de generar los bloques."
                );
                return;
              }
              setModalesEnPreparacion(false);
              setShowGenerarBloquesModal(true);
            }}
          />

          {/* Section 1: Iniciar periodo */}
          <div className="space-y-4">
            <h2 className="text-lg font-medium text-continental-blue-light text-left">
              Iniciar periodo de solicitud anual
            </h2>

            <p className="text-continental-black text-left leading-relaxed max-w-4xl">
              Asegúrate de cargar todos los días inhábiles y periodos de
              vacaciones antes de comenzar el proceso en la pestaña de
              calendario.
              <br />
              Indica la fecha de inicio para la programación anual. Considera
              que la programación será a partir de esta fecha y no se podrá
              modificar.
            </p>

            {/* Date Input */}
            <div className="w-full max-w-sm">
              <Label
                htmlFor="fechaInicio"
                className="text-sm font-medium text-continental-gray-1"
              >
                Fecha de inicio de la programación anual
              </Label>
              <Input
                id="fechaInicio"
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className="w-full mt-2"
              />
            </div>
          </div>

          {/* Section 2: Programar días */}
          <div className="space-y-4">
            <p className="text-continental-black text-left max-w-4xl">
              <span className="font-medium">2.</span> Programar días asignados
              por jefe a empleados.
            </p>

            {loadingResumen ? (
              <div className="flex items-center gap-2 text-gray-600">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-continental-blue"></div>
                <span>Verificando asignación automática...</span>
              </div>
            ) : resumenAsignacion?.asignacionRealizada ? (
              // Mostrar estado de asignación existente
              <div className="bg-green-50 border border-green-200 rounded-lg p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                  <div>
                    <h3 className="font-medium text-green-800">
                      Asignación Automática Completada para {anioVigente}
                    </h3>
                    <p className="text-sm text-green-700">
                      Última asignación:{" "}
                      {format(
                        new Date(resumenAsignacion.fechaUltimaAsignacion),
                        "d 'de' MMMM 'de' yyyy 'a las' HH:mm",
                        { locale: es }
                      )}
                    </p>
                  </div>
                </div>

                {/* Estadísticas principales */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white p-4 rounded-lg border border-green-200">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="w-5 h-5 text-blue-600" />
                      <span className="text-sm font-medium text-gray-700">
                        Empleados Asignados
                      </span>
                    </div>
                    <p className="text-2xl font-bold text-blue-900">
                      {resumenAsignacion.estadisticas.empleadosConAsignacion}
                    </p>
                    <p className="text-xs text-gray-500">
                      de{" "}
                      {
                        resumenAsignacion.estadisticas
                          .totalEmpleadosSindicalizados
                      }{" "}
                      total
                    </p>
                  </div>

                  <div className="bg-white p-4 rounded-lg border border-green-200">
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar className="w-5 h-5 text-purple-600" />
                      <span className="text-sm font-medium text-gray-700">
                        Días Asignados
                      </span>
                    </div>
                    <p className="text-2xl font-bold text-purple-900">
                      {resumenAsignacion.totalVacacionesAsignadas}
                    </p>
                    <p className="text-xs text-gray-500">
                      Promedio:{" "}
                      {resumenAsignacion.estadisticas.promedioDisPorEmpleado}{" "}
                      días/empleado
                    </p>
                  </div>

                  <div className="bg-white p-4 rounded-lg border border-green-200">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      <span className="text-sm font-medium text-gray-700">
                        Cobertura
                      </span>
                    </div>
                    <p className="text-2xl font-bold text-green-900">
                      {resumenAsignacion.estadisticas.porcentajeCobertura.toFixed(
                        1
                      )}
                      %
                    </p>
                    <p className="text-xs text-gray-500">
                      {resumenAsignacion.estadisticas.empleadosSinAsignacion}{" "}
                      sin asignar
                    </p>
                  </div>
                </div>

                {/* reporte no asignados */}
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-medium text-amber-900">
                        Empleados sin asignación automática
                      </h3>
                      <p className="text-xs text-amber-700 mt-1">
                        Descarga el reporte de empleados que no tienen asignación automática de vacaciones
                      </p>
                    </div>
                    <Button
                      onClick={onDescargarNoAsignados}
                      variant="outline"
                      className="flex items-center gap-2 border-amber-300 text-amber-900 hover:bg-amber-100"
                    >
                      <Download size={16} />
                      <span>Descargar reporte</span>
                    </Button>
                  </div>
                </div>

                {/* Botón para revertir */}
                <Button
                  variant="outline"
                  className="flex items-center gap-2 h-12 px-6 border-red-300 text-red-600 hover:bg-red-50"
                  onClick={handleRevertirAsignacion}
                  disabled={isReverting}
                >
                  <Trash2 size={18} />
                  <span>Revertir asignación</span>
                </Button>
              </div>
            ) : (
              // Mostrar botón para programar días (estado original)
              <GroupConfigValidator
                onValidationSuccess={handleProgramarDiasSuccess}
                onNotification={onNotification}
              >
                <Button
                  variant="continental"
                  className="flex items-center gap-2 h-12 px-6"
                >
                  <Sun size={18} />
                  <span>Programar días</span>
                </Button>
              </GroupConfigValidator>
            )}
          </div>

          {/* Section 3: Generar bloques */}
          <div className="space-y-4">
            <p className="text-continental-black text-left max-w-4xl">
              <span className="font-medium">3.</span> Genera los bloques para la
              programación anual de todas las áreas y grupos. Para modificar el
              número de personas por bloque y la duración del bloque, modifica
              la tabla de grupos en la sección de áreas.
            </p>

            {loadingEstadisticas ? (
              <div className="flex items-center gap-2 text-gray-600">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-continental-blue"></div>
                <span>Verificando bloques existentes...</span>
              </div>
            ) : errorEstadisticas ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-800 font-medium">
                  No se pudo consultar el estado de los bloques de reservación.
                </p>
                <p className="text-red-700 text-sm mt-1">
                  {errorEstadisticas}. Es posible que ya existan bloques
                  generados; reintenta antes de volver a generarlos.
                </p>
              </div>
            ) : estadisticasBloques ? (
              // Mostrar estadísticas de bloques existentes
              <div className="bg-blue-50/20 border border-blue-200 rounded-lg p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-6 h-6 text-blue-600" />
                  <div>
                    <h3 className="font-medium text-blue-800">
                      Bloques de Reservación Generados para {anioVigente}
                    </h3>
                    <p className="text-sm text-blue-700">
                      Última consulta:{" "}
                      {format(
                        new Date(estadisticasBloques.fechaConsulta),
                        "d 'de' MMMM 'de' yyyy 'a las' HH:mm",
                        { locale: es }
                      )}
                    </p>
                  </div>
                </div>

                {/* Estadísticas de bloques */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white p-4 rounded-lg border border-blue-200">
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar className="w-5 h-5 text-continental-gray-1" />
                      <span className="text-sm font-medium text-continental-gray-1">
                        Total Bloques
                      </span>
                    </div>
                    <p className="text-2xl font-bold text-continental-gray-1">
                      {estadisticasBloques.totalBloques}
                    </p>
                  </div>

                  <div className="bg-white p-4 rounded-lg border border-blue-200">
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar className="w-5 h-5 text-blue-600" />
                      <span className="text-sm font-medium text-gray-700">
                        Período de Programación
                      </span>
                    </div>
                    <div className="text-sm text-blue-900">
                      <p className="font-medium">
                        {format(
                          new Date(estadisticasBloques.fechaPrimerBloque),
                          "d 'de' MMMM 'de' yyyy",
                          { locale: es }
                        )}
                      </p>
                      <p className="text-gray-600">hasta</p>
                      <p className="font-medium">
                        {format(
                          new Date(estadisticasBloques.fechaUltimoBloque),
                          "d 'de' MMMM 'de' yyyy",
                          { locale: es }
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Botón para descargar turnos */}
                <Button
                  onClick={handleDescargarTurnos}
                  variant="continental"
                  className="flex items-center gap-2 h-12 px-6"
                >
                  <Download size={18} />
                  <span>Descargar turnos</span>
                </Button>

                {/* Botón para borrar bloques */}
                <Button
                  onClick={handleEliminarBloques}
                  variant="outline"
                  disabled={isEliminandoBloques}
                  className="flex items-center gap-2 border-red-300 text-red-600 hover:bg-red-50"
                >
                  {isEliminandoBloques ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                      Eliminando...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Borrar bloques
                    </>
                  )}
                </Button>
              </div>
            ) : (
              // Mostrar botón para generar bloques (estado original)
              <GroupConfigValidator
                onValidationSuccess={handleGenerarTurnosSuccess}
                onNotification={onNotification}
              >
                <Button
                  variant="continental"
                  className="flex items-center gap-2 h-12 px-6"
                >
                  <Settings size={18} />
                  <span>Generar bloques</span>
                </Button>
              </GroupConfigValidator>
            )}
          </div>
          {/* Action Buttons */}
          <div className="flex justify-center gap-4 pt-6">
            <Button
              onClick={handleCancel}
              variant="outline"
              className="w-28 h-10 border-continental-black text-continental-black hover:bg-continental-gray-4"
            >
              Cancelar
            </Button>

            <Button
              onClick={handleSave}
              variant="continental"
              className="w-28 h-10"
            >
              Guardar
            </Button>
          </div>
        </>
      ) : (
        /* Contenido que aparece cuando el periodo es ProgramacionAnual */
        <ProgramacionAnualContent
          estadisticasBloques={estadisticasBloques}
          errorEstadisticas={errorEstadisticas}
          loadingEstadisticas={loadingEstadisticas}
          anioVigente={anioVigente}
          onDescargarTurnos={handleDescargarTurnos}
          onNotification={onNotification}
          configVacaciones={configVacaciones}
          onConfigUpdate={(updatedConfig) => {
            setConfigVacaciones(updatedConfig);
            onConfigUpdate?.(updatedConfig);
          }}
          onEstadisticasUpdate={async () => {
            // Actualizar estadísticas de bloques
            try {
              const estadisticas = await BloquesReservacionService.obtenerEstadisticas(anioVigente);
              setEstadisticasBloques(estadisticas.totalBloques > 0 ? estadisticas : null);
              setErrorEstadisticas(null);
            } catch (error) {
              console.error("Error al consultar estadísticas de bloques", error);
              setEstadisticasBloques(null);
              setErrorEstadisticas(
                error instanceof Error && error.message
                  ? error.message
                  : "No se pudo consultar el estado de los bloques"
              );
            }
            // Actualizar resumen de asignación
            try {
              const resumen = await AsignacionAutomaticaService.obtenerResumen(anioVigente);
              setResumenAsignacion(resumen);
            } catch (error) {
              setResumenAsignacion(null);
            }
          }}
        />
      )}

      {/* Modal de Programación Automática */}
      <ProgramacionAutomaticaModal
        isOpen={showProgramacionModal}
        onClose={() => setShowProgramacionModal(false)}
        onNotification={onNotification}
        onSuccess={handleProgramacionCompleta}
      />

      {/* Modal de Confirmación para Revertir */}
      <RevertirAsignacionModal
        isOpen={showRevertirModal}
        isReverting={isReverting}
        anioVigente={anioVigente}
        resumenAsignacion={resumenAsignacion}
        onConfirmar={handleConfirmarReversion}
        onCancelar={handleCancelarReversion}
      />

      {/* Modal de Generar Bloques */}
      <GenerarBloquesModal
        isOpen={showGenerarBloquesModal}
        onClose={() => setShowGenerarBloquesModal(false)}
        onNotification={onNotification}
        onSuccess={handleBloquesGeneradosSuccess}
        fechaInicio={modalesEnPreparacion ? prepFechaInicioBloques : fechaInicio}
        anioVigente={
          modalesEnPreparacion && anioPreparacion ? anioPreparacion : anioVigente
        }
      />
    </div>
  );
};
