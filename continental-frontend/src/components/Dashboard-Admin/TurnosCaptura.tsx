import { useVacationConfig } from "@/hooks/useVacationConfig";
import { TurnosActuales } from "../Dashboard-Area/TurnosActuales";

/**
 * Avance de la captura por área para el superusuario (Validaciones 7 y 8 del
 * punchlist). Es la misma vista de "Turnos actuales" que ve el jefe de área
 * en Solicitudes, pero con todas las áreas de la planta y con los botones de
 * saltar / reasignar turno habilitados.
 */
export const TurnosCaptura = () => {
  const { config, loading, error } = useVacationConfig();

  // Mismo criterio que SolicitudesComponent: manda el año en preparación
  // cuando existe; si no, el vigente.
  const anio =
    config?.anioProgramacionAnual ?? config?.anioVigente ?? new Date().getFullYear() + 1;
  const hayCaptura =
    config?.periodoActual === "ProgramacionAnual" || config?.anioProgramacionAnual != null;

  if (loading) {
    return (
      <div className="p-6 bg-gray-50 min-h-screen">
        <div className="flex items-center justify-center h-64 text-gray-600">
          Cargando configuración...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-gray-50 min-h-screen">
        <div className="flex items-center justify-center h-64 text-red-600">{error}</div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-[1400px] mx-auto space-y-4">
        <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
          <h1 className="text-lg font-semibold text-continental-black">
            Turnos de captura {anio}
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Avance de la captura de vacaciones por área y grupo. Desde aquí puedes saltar el
            turno de quien no ha capturado (desbloquea al siguiente por antigüedad) o
            reasignarlo a otro bloque.
          </p>
        </div>

        {hayCaptura ? (
          <TurnosActuales anioVigente={anio} />
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              No hay programación anual en curso
            </h2>
            <p className="text-gray-600">
              Los turnos aparecen cuando se activa la programación anual o se prepara el año
              siguiente desde Vacaciones.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TurnosCaptura;
