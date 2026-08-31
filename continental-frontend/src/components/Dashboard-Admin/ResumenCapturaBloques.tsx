import { useEffect, useState } from "react";
import { BloquesReservacionService } from "@/services/bloquesReservacionService";
import type { EstadisticasBloquesResponse } from "@/interfaces/Api.interface";
import { EstadisticasBloques } from "./EstadisticasBloques";
import { EstadisticasEmpleados } from "./EstadisticasEmpleados";

/**
 * HU21: avance de la captura de un año (bloques y empleados).
 *
 * Vivía dentro de ProgramacionAnualContent, que solo se pinta con el periodo en
 * "ProgramacionAnual". Al concluir la anual —o al preparar el año siguiente
 * mientras la reprogramación del vigente sigue abierta, que es como se opera
 * desde 2026— el superusuario se quedaba sin gráfica aunque los bloques
 * siguieran capturándose. Por eso ahora es un componente aparte que se pide su
 * propio año.
 */
export const ResumenCapturaBloques = ({ anio }: { anio: number }) => {
  const [datos, setDatos] = useState<EstadisticasBloquesResponse | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);
    BloquesReservacionService.obtenerEstadisticas(anio)
      .then((r) => { if (!cancelado) setDatos(r); })
      .catch((e) => { if (!cancelado) setError(e instanceof Error ? e.message : "Error al cargar el avance"); })
      .finally(() => { if (!cancelado) setCargando(false); });
    return () => { cancelado = true; };
  }, [anio]);

  if (cargando) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6 text-center text-gray-600">
        Cargando avance de la captura {anio}...
      </div>
    );
  }

  if (error || !datos || datos.totalBloques === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6 text-center text-gray-600">
        {error
          ? `No se pudo cargar el avance de ${anio}: ${error}`
          : `Todavía no hay bloques generados para ${anio}.`}
      </div>
    );
  }

  const emp = datos.estadisticasEmpleados;

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
        <h3 className="text-base font-semibold text-continental-black">
          Avance de la captura {anio}
        </h3>
        <p className="text-sm text-gray-600 mt-1">
          {datos.totalBloques} bloque(s) generados y {emp.totalEmpleadosAsignados} empleado(s) con turno.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <EstadisticasBloques
          totalBloques={datos.totalBloques}
          bloquesCompletados={datos.bloquesCompletados}
        />
        <EstadisticasEmpleados estadisticas={emp} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <p className="text-sm text-gray-600">Total Empleados</p>
          <p className="text-2xl font-bold text-gray-900">{emp.totalEmpleadosAsignados}</p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <p className="text-sm text-gray-600">Completados</p>
          <p className="text-2xl font-bold text-green-600">
            {emp.empleadosCompletados ??
              emp.empleadosConEstadoCompletado + emp.empleadosConEstadoReservado}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <p className="text-sm text-gray-600">Pendientes</p>
          <p className="text-2xl font-bold text-gray-700">
            {emp.empleadosPendientes ?? emp.empleadosConEstadoAsignado}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <p className="text-sm text-gray-600">No contestó</p>
          <p className="text-2xl font-bold text-red-600">
            {emp.empleadosNoRespondieron ?? emp.empleadosConEstadoNoRespondio}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <p className="text-sm text-gray-600">Recalendarizados</p>
          <p className="text-2xl font-bold text-yellow-600">
            {emp.empleadosRecalendarizados ?? 0}
          </p>
        </div>
      </div>
    </div>
  );
};

export default ResumenCapturaBloques;
