import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, XCircle, CheckCircle2, AlertTriangle } from "lucide-react";
import { EstadisticasBloques } from "./EstadisticasBloques";
import { EstadisticasEmpleados } from "./EstadisticasEmpleados";
import { BloquesReservacionService } from "@/services/bloquesReservacionService";
import { AsignacionAutomaticaService } from "@/services/asignacionAutomaticaService";
import { vacacionesService } from "@/services/vacacionesService";
import { ProgramacionAnualService } from "@/services/programacionAnualService";
import type { EstadisticasBloquesResponse } from "@/interfaces/Api.interface";
import type { VacacionesConfig } from "@/interfaces/Vacaciones.interface";
import { format, differenceInDays } from "date-fns";
import { es } from "date-fns/locale";
import { generarExcelEmpleadosSinAsignacion } from "@/utils/empleadosSinAsignacionExcel";

interface ProgramacionAnualContentProps {
  estadisticasBloques: EstadisticasBloquesResponse | null;
  /** Mensaje de error si la consulta de estadísticas falló (500, timeout, red).
   *  Permite distinguir "no hay bloques" de "no se pudo consultar". */
  errorEstadisticas?: string | null;
  loadingEstadisticas: boolean;
  anioVigente: number;
  onDescargarTurnos: () => void;
  onNotification: (
    type: "success" | "info" | "warning" | "error",
    title: string,
    message?: string
  ) => void;
  configVacaciones: VacacionesConfig | null;
  onConfigUpdate: (config: VacacionesConfig) => void;
  onEstadisticasUpdate: () => void;
}

export const ProgramacionAnualContent: React.FC<ProgramacionAnualContentProps> = ({
  estadisticasBloques,
  errorEstadisticas,
  loadingEstadisticas,
  anioVigente,
  onDescargarTurnos,
  onNotification,
  configVacaciones,
  onConfigUpdate,
  onEstadisticasUpdate,
}) => {
  const [isCancelling, setIsCancelling] = useState(false);
  const [isConcluding, setIsConcluding] = useState(false);
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);
  const [showConfirmConclude, setShowConfirmConclude] = useState(false);
  const [isDownloadingNoRespondieron, setIsDownloadingNoRespondieron] = useState(false);

  const handleCancelarProgramacion = async () => {
    if (!showConfirmCancel) {
      // Primera vez: mostrar resumen de lo que se va a eliminar
      try {
        onNotification("info", "Obteniendo información", "Consultando datos de la programación anual...");
        
        const resumen = await ProgramacionAnualService.obtenerResumenReversion(anioVigente);
        
        // Mostrar información detallada del resumen
        const advertenciasTexto = resumen.advertencias.length > 0 
          ? `\n\nADVERTENCIAS:\n${resumen.advertencias.join('\n')}`
          : '';
          
        const mensaje = `Se eliminarán los siguientes datos del año ${resumen.anio}:

📊 BLOQUES Y ASIGNACIONES:
• ${resumen.totalBloques} bloques generados
• ${resumen.bloquesAprobados} bloques aprobados
• ${resumen.totalAsignacionesBloque} asignaciones empleado-bloque

🏖️ VACACIONES:
• ${resumen.totalVacaciones} vacaciones programadas
• ${resumen.vacacionesAutomaticas} vacaciones automáticas
• ${resumen.vacacionesManuales} vacaciones manuales
• ${resumen.vacacionesTomadas} vacaciones ya disfrutadas

📋 SOLICITUDES:
• ${resumen.solicitudesReprogramacion} solicitudes de reprogramación
• ${resumen.solicitudesFestivos} solicitudes de festivos trabajados
• ${resumen.cambiosBloque} cambios entre bloques

👥 IMPACTO:
• ${resumen.empleadosAfectados} empleados afectados
• ${resumen.gruposAfectados} grupos afectados${advertenciasTexto}

¿Está seguro de que desea continuar?`;

        onNotification("warning", "Confirmar eliminación completa", mensaje);
        setShowConfirmCancel(true);
        
      } catch (error) {
        console.error("Error al obtener resumen:", error);
        onNotification("error", "Error", "No se pudo obtener el resumen de la programación. Intente nuevamente.");
      }
      return;
    }

    // Segunda vez: ejecutar la reversión completa
    setIsCancelling(true);

    try {
      onNotification("info", "Procesando", "Ejecutando reversión completa de la programación anual...");
      
      // Ejecutar reversión completa usando el nuevo endpoint
      const resultado = await ProgramacionAnualService.revertirCompleto(anioVigente, true);
      
      // Mostrar resultado detallado
      const mensajeDetallado = `${resultado.mensaje}

📊 ELEMENTOS ELIMINADOS:
• ${resultado.bloquesEliminados} bloques
• ${resultado.asignacionesBloqueEliminadas} asignaciones de bloque
• ${resultado.vacacionesEliminadas} vacaciones totales
• ${resultado.vacacionesAutomaticasEliminadas} vacaciones automáticas
• ${resultado.vacacionesManualesEliminadas} vacaciones manuales
• ${resultado.solicitudesReprogramacionEliminadas} solicitudes de reprogramación
• ${resultado.solicitudesFestivosEliminadas} solicitudes de festivos
• ${resultado.cambiosBloqueEliminados} cambios de bloque

👥 ${resultado.gruposAfectados} grupos afectados
📅 Ejecutado por: ${resultado.usuarioEjecuto}
🕐 Fecha: ${new Date(resultado.fechaEjecucion).toLocaleString('es-ES')}`;

      onNotification("success", "Reversión completada", mensajeDetallado);

      // Solo cambiar el periodo a Cerrado si la reversión fue exitosa
      if (resultado.operacionExitosa && configVacaciones) {
        try {
          const updatedConfig = await vacacionesService.updateConfig({
            porcentajeAusenciaMaximo: configVacaciones.porcentajeAusenciaMaximo,
            periodoActual: "Cerrado",
            anioVigente: configVacaciones.anioVigente,
          });
          onConfigUpdate(updatedConfig);

          onNotification("success", "Periodo cerrado", "El periodo de programación anual ha sido cerrado exitosamente.");
        } catch (configError) {
          console.error("Error al cambiar el periodo a cerrado:", configError);
          onNotification(
            "warning",
            "Reversión exitosa, error al cerrar periodo",
            "La programación se eliminó correctamente, pero no se pudo cambiar el periodo a 'Cerrado'. Cámbielo manualmente."
          );
        }
      }

      // Actualizar estadísticas
      onEstadisticasUpdate();
      
    } catch (error: any) {
      console.error("Error en reversión completa:", error);
      
      let errorMessage = "No se pudo completar la reversión de la programación anual.";
      
      if (error?.message?.includes("confirmar=true")) {
        errorMessage = "Error de confirmación. La operación requiere confirmación explícita.";
      } else if (error?.message) {
        errorMessage = error.message;
      }
      
      onNotification("error", "Error en reversión", errorMessage);
    } finally {
      setIsCancelling(false);
      setShowConfirmCancel(false);
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

  const handleDescargarNoRespondieron = async () => {
    if (!configVacaciones) {
      onNotification(
        "error",
        "Error",
        "No se pudo cargar la configuración de vacaciones"
      );
      return;
    }

    try {
      setIsDownloadingNoRespondieron(true);
      onNotification(
        "info",
        "Descargando",
        "Obteniendo empleados que no respondieron..."
      );

      // Obtener empleados que no respondieron
      const empleadosNoRespondieron = await BloquesReservacionService.obtenerEmpleadosNoRespondieron(
        configVacaciones.anioVigente
      );

      if (empleadosNoRespondieron.totalEmpleadosNoRespondio === 0) {
        onNotification(
          "info",
          "Sin empleados",
          "No hay empleados que no hayan respondido"
        );
        return;
      }

      // Generar y descargar el Excel
      const { generarExcelEmpleadosNoRespondieron } = await import("@/utils/empleadosNoRespondieronExcel");
      generarExcelEmpleadosNoRespondieron(empleadosNoRespondieron);

      // Mensaje detallado con estadísticas
      const mensaje = empleadosNoRespondieron.empleadosEnBloqueCola > 0 
        ? `Reporte descargado: ${empleadosNoRespondieron.totalEmpleadosNoRespondio} empleados (${empleadosNoRespondieron.empleadosEnBloqueCola} CRÍTICOS en bloque cola)`
        : `Reporte descargado: ${empleadosNoRespondieron.totalEmpleadosNoRespondio} empleados que no respondieron`;

      onNotification("success", "Descarga completa", mensaje);
    } catch (error) {
      console.error("Error al descargar empleados que no respondieron:", error);
      onNotification(
        "error",
        "Error al descargar",
        error instanceof Error ? error.message : "No se pudo descargar el reporte de empleados que no respondieron"
      );
    } finally {
      setIsDownloadingNoRespondieron(false);
    }
  };

  const handleConcluirProgramacion = async () => {
    if (!showConfirmConclude) {
      setShowConfirmConclude(true);
      return;
    }

    try {
      setIsConcluding(true);

      if (!configVacaciones) {
        throw new Error("No se pudo cargar la configuración");
      }

      // Cambiar el periodo a Reprogramacion
      const updatedConfig = await vacacionesService.updateConfig({
        porcentajeAusenciaMaximo: configVacaciones.porcentajeAusenciaMaximo,
        periodoActual: "Reprogramacion",
        anioVigente: configVacaciones.anioVigente,
      });

      onConfigUpdate(updatedConfig);

      onNotification(
        "success",
        "Programación concluida",
        "La programación anual se ha completado. El sistema ahora está en periodo de reprogramación."
      );
    } catch (error) {
      console.error("Error al concluir programación:", error);
      onNotification(
        "error",
        "Error al concluir",
        error instanceof Error ? error.message : "No se pudo concluir la programación anual"
      );
    } finally {
      setIsConcluding(false);
      setShowConfirmConclude(false);
    }
  };
  if (loadingEstadisticas) {
    return (
      <div className="flex items-center gap-2 text-gray-600">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-continental-blue"></div>
        <span>Cargando estadísticas de programación anual...</span>
      </div>
    );
  }

  if (!estadisticasBloques) {
    if (errorEstadisticas) {
      // La consulta falló: NO decir "no hay datos" — puede haberlos y el
      // backend estar caído/saturado. Antes este caso se disfrazaba del
      // mensaje amarillo y persistía incluso tras volver a iniciar sesión.
      return (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <p className="text-red-800 font-medium">
            No se pudo consultar el estado de la programación anual.
          </p>
          <p className="text-red-700 text-sm mt-1">
            {errorEstadisticas}. Los datos pueden existir aunque no se muestren;
            reintenta en unos minutos o avisa al administrador si el problema
            persiste.
          </p>
        </div>
      );
    }
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
        <p className="text-yellow-800">
          No hay datos de programación anual disponibles. Por favor, genera los
          bloques primero.
        </p>
      </div>
    );
  }

  const diasTotales =
    differenceInDays(
      new Date(estadisticasBloques.fechaUltimoBloque),
      new Date(estadisticasBloques.fechaPrimerBloque)
    ) + 1;

  return (
    <div className="space-y-6">
      {/* Sección de información general */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-continental-blue-light">
              Programación Anual Activa para {anioVigente}
            </h2>
            <div className="mt-3 space-y-2 text-continental-black">
              <p>
                <span className="font-medium">Días totales:</span> {diasTotales}{" "}
                días
              </p>
              <p>
                <span className="font-medium">Fecha de inicio:</span>{" "}
                {format(
                  new Date(estadisticasBloques.fechaPrimerBloque),
                  "d 'de' MMMM 'de' yyyy",
                  { locale: es }
                )}
              </p>
              <p>
                <span className="font-medium">Fecha de fin:</span>{" "}
                {format(
                  new Date(estadisticasBloques.fechaUltimoBloque),
                  "d 'de' MMMM 'de' yyyy",
                  { locale: es }
                )}
              </p>
            </div>
          </div>
          <Button
            onClick={onDescargarTurnos}
            variant="continental"
            className="flex items-center gap-2 h-12 px-6"
          >
            <Download size={18} />
            <span>Descargar turnos</span>
          </Button>
        </div>
      </div>

      {/* Botón para descargar empleados sin asignación */}
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

      {/* Gráficas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <EstadisticasBloques
          totalBloques={estadisticasBloques.totalBloques}
          bloquesCompletados={estadisticasBloques.bloquesCompletados}
        />
        <EstadisticasEmpleados
          estadisticas={estadisticasBloques.estadisticasEmpleados}
        />
      </div>

      {/* Estadísticas detalladas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <p className="text-sm text-gray-600">Total Empleados</p>
          <p className="text-2xl font-bold text-gray-900">
            {estadisticasBloques.estadisticasEmpleados.totalEmpleadosAsignados}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <p className="text-sm text-gray-600">Completados</p>
          <p className="text-2xl font-bold text-green-600">
            {estadisticasBloques.estadisticasEmpleados.empleadosConEstadoCompletado}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <p className="text-sm text-gray-600">Reservados</p>
          <p className="text-2xl font-bold text-yellow-600">
            {estadisticasBloques.estadisticasEmpleados.empleadosConEstadoReservado}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <p className="text-sm text-gray-600">No respondió</p>
          <p className="text-2xl font-bold text-red-600">
            {estadisticasBloques.estadisticasEmpleados.empleadosConEstadoNoRespondio}
          </p>
        </div>
      </div>

      {/* Reporte no reservaron */}
      {estadisticasBloques?.estadisticasEmpleados?.empleadosConEstadoNoRespondio > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0">
                <AlertTriangle className="h-8 w-8 text-red-600" />
              </div>
              <div>
                <h3 className="font-medium text-red-900 mb-1">
                  Empleados que No Respondieron
                </h3>
                <p className="text-sm text-red-700">
                  Hay {estadisticasBloques.estadisticasEmpleados.empleadosConEstadoNoRespondio} empleados que no respondieron a la asignación de bloques.
                  Descarga el reporte detallado para revisar casos críticos.
                </p>
              </div>
            </div>
            <Button
              onClick={handleDescargarNoRespondieron}
              disabled={isDownloadingNoRespondieron}
              variant="outline"
              className="flex items-center gap-2 border-red-300 text-red-900 hover:bg-red-100"
            >
              {isDownloadingNoRespondieron ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
              ) : (
                <Download size={16} />
              )}
              <span>{isDownloadingNoRespondieron ? "Descargando..." : "Descargar reporte"}</span>
            </Button>
          </div>
        </div>
      )}

      {/* Botones de acción */}
      <div className="flex justify-between items-center bg-gray-50 p-6 rounded-lg border border-gray-200">
        <div className="flex flex-col">
          <h3 className="font-medium text-gray-900 mb-2">Acciones de Programación</h3>
          <p className="text-sm text-gray-600">
            Puedes cancelar la programación anual para reiniciar el proceso o concluirla para pasar al periodo de reprogramación.
          </p>
        </div>

        <div className="flex gap-3">
          {/* Botón Cancelar Programación */}
          {showConfirmCancel ? (
            <div className="flex gap-2">
              <Button
                onClick={() => setShowConfirmCancel(false)}
                variant="outline"
                className="h-10"
                disabled={isCancelling}
              >
                No, mantener
              </Button>
              <Button
                onClick={handleCancelarProgramacion}
                variant="outline"
                className="h-10 border-red-300 text-red-600 hover:bg-red-50"
                disabled={isCancelling}
              >
                {isCancelling ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600 mr-2"></div>
                    Cancelando...
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4 mr-2" />
                    Sí, cancelar todo
                  </>
                )}
              </Button>
            </div>
          ) : (
            <Button
              onClick={handleCancelarProgramacion}
              variant="outline"
              className="flex items-center gap-2 h-10 px-4 border-red-300 text-red-600 hover:bg-red-50"
              disabled={isCancelling}
            >
              <XCircle className="w-4 h-4" />
              <span>Cancelar Programación</span>
            </Button>
          )}

          {/* Botón Concluir Programación */}
          {showConfirmConclude ? (
            <div className="flex gap-2">
              <Button
                onClick={() => setShowConfirmConclude(false)}
                variant="outline"
                className="h-10"
                disabled={isConcluding}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleConcluirProgramacion}
                variant="continental"
                className="h-10"
                disabled={isConcluding}
              >
                {isConcluding ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Concluyendo...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Sí, concluir
                  </>
                )}
              </Button>
            </div>
          ) : (
            <Button
              onClick={handleConcluirProgramacion}
              variant="continental"
              className="flex items-center gap-2 h-10 px-4"
              disabled={isConcluding}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Concluir Programación Anual</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};