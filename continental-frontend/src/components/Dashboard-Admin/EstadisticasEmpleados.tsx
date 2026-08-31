import React from "react";
import { PieChart } from "@/components/ui/PieChart";
import type { EstadisticasEmpleados as EstadisticasEmpleadosType } from "@/interfaces/Api.interface";

interface EstadisticasEmpleadosProps {
  estadisticas: EstadisticasEmpleadosType;
}

export const EstadisticasEmpleados: React.FC<EstadisticasEmpleadosProps> = ({
  estadisticas,
}) => {
  // HU21: categorías por empleado — Completado / Pendiente / No contestó /
  // Recalendarizado. Si el backend aún no manda los conteos por empleado se
  // arma con los porcentajes por asignación de antes (Reservado cuenta como
  // Completado: ya capturó, solo falta que cierre el bloque).
  const tieneConteoPorEmpleado = estadisticas.porcentajeEmpleadosCompletados !== undefined;
  const completado = tieneConteoPorEmpleado
    ? estadisticas.porcentajeEmpleadosCompletados ?? 0
    : estadisticas.porcentajeCompletado + estadisticas.porcentajeReservado;
  const noRespondio = tieneConteoPorEmpleado
    ? estadisticas.porcentajeEmpleadosNoRespondieron ?? 0
    : estadisticas.porcentajeNoRespondio;
  const recalendarizado = tieneConteoPorEmpleado
    ? estadisticas.porcentajeEmpleadosRecalendarizados ?? 0
    : 0;
  const pendiente = tieneConteoPorEmpleado
    ? estadisticas.porcentajeEmpleadosPendientes ?? 0
    : Math.max(0, 100 - completado - noRespondio);

  const categorias = [
    { value: completado, color: "#10b981", label: "Completado" },
    { value: pendiente, color: "#6b7280", label: "Pendiente" },
    { value: noRespondio, color: "#ef4444", label: "No contestó" },
    { value: recalendarizado, color: "#fbbf24", label: "Recalendarizado" },
  ];

  const segments = categorias.filter((segment) => segment.value > 0);

  return (
    <div className="bg-white p-6 rounded-lg border border-gray-200">
      <h3 className="text-md font-medium text-gray-700 mb-4">
        Estado de Empleados
      </h3>

      <div className="flex flex-col items-center">
        <div className="mb-4">
          <PieChart
            segments={segments}
            size={192}
            centerContent={
              <span className="text-xs font-bold text-center">
                {estadisticas.totalEmpleadosAsignados}
                <br />
                total
              </span>
            }
            showLegend={false}
          />
        </div>

        <div className="w-full space-y-2">
          {categorias.map((categoria) => (
            <div key={categoria.label} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded"
                  style={{ backgroundColor: categoria.color }}
                />
                <span className="text-sm">{categoria.label}</span>
              </div>
              <span className="text-sm font-medium">
                {categoria.value.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
