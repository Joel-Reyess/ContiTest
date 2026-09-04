import  { PeriodOptions, type Period } from "@/interfaces/Calendar.interface"

/**
 * Los dos semáforos son independientes: durante la preparación del año
 * siguiente la captura anual y la reprogramación del año vigente están abiertas
 * al mismo tiempo. Antes se pintaban comparando un único `currenPeriod`, así
 * que abrir la programación anual apagaba la reprogramación en pantalla aunque
 * el backend la siguiera aceptando, y el operador leía "Inactivo" y ya no
 * intentaba. Los flags son opcionales para no romper a quien todavía pase sólo
 * el periodo.
 */
export const PeriodLight = ({
  currenPeriod,
  anualActiva,
  reprogramacionActiva,
}: {
  currenPeriod: Period
  anualActiva?: boolean
  reprogramacionActiva?: boolean
}) => {
  const anual = anualActiva ?? currenPeriod === PeriodOptions.annual
  const reprogramacion = reprogramacionActiva ?? currenPeriod === PeriodOptions.reprogramming
  return (
    <div className="">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Período de Solicitudes Anuales */}
        <div className={`relative overflow-hidden rounded-lg border p-3 transition-all duration-300 ${
          anual 
            ? 'border-green-300 bg-green-50 shadow-md' 
            : 'border-gray-200 bg-gray-50'
        }`}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <div className={`relative w-2.5 h-2.5 rounded-full ${
                anual ? 'bg-green-500' : 'bg-gray-400'
              }`}>
                {anual && (
                  <div className="absolute inset-0 rounded-full bg-green-500 animate-pulse"></div>
                )}
              </div>
              <h4 className="font-medium text-gray-800 text-sm">Solicitudes Anuales</h4>
            </div>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              anual 
                ? 'bg-green-100 text-green-800 border border-green-200' 
                : 'bg-gray-100 text-gray-600 border border-gray-200'
            }`}>
              {anual ? '🟢 Activo' : '🔴 Inactivo'}
            </span>
          </div>
          <p className="text-xs text-gray-600">
            {anual 
              ? 'Solicitar nuevas vacaciones'
              : 'No se pueden crear solicitudes'
            }
          </p>
          
          {/* Indicador visual de estado activo */}
          {anual && (
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-green-400 to-green-600"></div>
          )}
        </div>

        {/* Período de Reprogramación */}
        <div className={`relative overflow-hidden rounded-lg border p-3 transition-all duration-300 ${
          reprogramacion 
            ? 'border-green-300 bg-green-50 shadow-md' 
            : 'border-gray-200 bg-gray-50'
        }`}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <div className={`relative w-2.5 h-2.5 rounded-full ${
                reprogramacion ? 'bg-green-500' : 'bg-gray-400'
              }`}>
                {reprogramacion && (
                  <div className="absolute inset-0 rounded-full bg-green-500 animate-pulse"></div>
                )}
              </div>
              <h4 className="font-medium text-gray-800 text-sm">Reprogramación</h4>
            </div>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              reprogramacion 
                ? 'bg-green-100 text-green-800 border border-green-200' 
                : 'bg-gray-100 text-gray-600 border border-gray-200'
            }`}>
              {reprogramacion ? '🟢 Activo' : '🔴 Inactivo'}
            </span>
          </div>
          <p className="text-xs text-gray-600">
            {reprogramacion 
              ? 'Reprogramar vacaciones existentes'
              : 'No se pueden modificar vacaciones'
            }
          </p>
          
          {/* Indicador visual de estado activo */}
          {reprogramacion && (
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-green-500 to-green-600"></div>
          )}
        </div>
      </div>

    </div>
  )
}
