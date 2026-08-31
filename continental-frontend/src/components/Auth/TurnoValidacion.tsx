import { Calendar, Clock, XCircle, CheckCircle, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { BloqueReservacion, EmpleadoBloque } from '@/interfaces/Api.interface';

interface TurnoValidacionProps {
  estado: 'cerrado' | 'turno-actual' | 'turno-siguiente' | 'sin-turno' | 'esperando-antiguedad';
  bloqueActual?: BloqueReservacion | null;
  bloqueSiguiente?: BloqueReservacion | null;
  bloqueAsignado?: BloqueReservacion | null;
  empleadosPendientes?: EmpleadoBloque[];
  onContinuar?: () => void;
}

export const TurnoValidacion: React.FC<TurnoValidacionProps> = ({
  estado,
  bloqueActual,
  bloqueSiguiente,
  bloqueAsignado,
  empleadosPendientes,
  onContinuar
}) => {
  const renderCerrado = () => (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-md w-full mx-4">
        <div className="bg-white rounded-lg shadow-xl p-8 text-center">
          <div className="mb-6 flex justify-center">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center">
              <XCircle className="w-10 h-10 text-gray-500" />
            </div>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-3">
            Periodo Cerrado
          </h2>

          <p className="text-gray-600 mb-4 leading-relaxed">
            El periodo de programación de vacaciones se encuentra cerrado actualmente.
            Por favor, regrese cuando sea su turno de agendar sus vacaciones anuales.
          </p>

          <p className="text-sm text-gray-500 mb-4">
            Para más información, contacte al departamento de Recursos Humanos.
          </p>

          <div className="mt-6 p-3 bg-gray-100 rounded-lg">
            <p className="text-sm text-gray-600">
              <Clock className="inline w-4 h-4 mr-1" />
              La sesión se cerrará automáticamente en unos segundos...
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderTurnoActual = () => (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-green-100">
      <div className="max-w-md w-full mx-4">
        <div className="bg-white rounded-lg shadow-xl p-8">
          <div className="mb-6 flex justify-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center animate-pulse">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-3 text-center">
            ¡Es tu turno!
          </h2>

          <div className="bg-green-50 rounded-lg p-4 mb-6">
            <p className="text-green-800 font-medium mb-2">
              Tu bloque de programación está activo
            </p>
            {bloqueActual && (
              <div className="space-y-1 text-sm text-green-700">
                <p>
                  <Calendar className="inline w-4 h-4 mr-1" />
                  Inicio: {format(new Date(bloqueActual.fechaHoraInicio), "d 'de' MMMM 'a las' HH:mm", { locale: es })}
                </p>
                <p>
                  <Clock className="inline w-4 h-4 mr-1" />
                  Fin: {format(new Date(bloqueActual.fechaHoraFin), "d 'de' MMMM 'a las' HH:mm", { locale: es })}
                </p>
              </div>
            )}
          </div>

          <button
            onClick={onContinuar}
            className="w-full bg-green-600 text-white rounded-lg py-3 px-4 font-medium hover:bg-green-700 transition-colors"
          >
            Continuar a programar vacaciones
          </button>
        </div>
      </div>
    </div>
  );

  const renderTurnoSiguiente = () => (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-yellow-50 to-orange-50">
      <div className="max-w-md w-full mx-4">
        <div className="bg-white rounded-lg shadow-xl p-8">
          <div className="mb-6 flex justify-center">
            <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center">
              <Clock className="w-10 h-10 text-yellow-600" />
            </div>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-3 text-center">
            Tu turno es próximamente
          </h2>

          <div className="bg-yellow-50 rounded-lg p-4 mb-6">
            <p className="text-yellow-800 font-medium mb-2">
              Tu bloque de programación comienza pronto
            </p>
            {bloqueSiguiente && (
              <div className="space-y-1 text-sm text-yellow-700">
                <p>
                  <Calendar className="inline w-4 h-4 mr-1" />
                  Inicio: {format(new Date(bloqueSiguiente.fechaHoraInicio), "d 'de' MMMM 'a las' HH:mm", { locale: es })}
                </p>
                <p>
                  <Clock className="inline w-4 h-4 mr-1" />
                  Fin: {format(new Date(bloqueSiguiente.fechaHoraFin), "d 'de' MMMM 'a las' HH:mm", { locale: es })}
                </p>
              </div>
            )}
          </div>

          <p className="text-center text-gray-600 mb-4">
            Por favor, regrese cuando comience su turno para programar sus vacaciones.
          </p>

          <div className="mt-4 p-3 bg-yellow-100 rounded-lg">
            <p className="text-sm text-yellow-700">
              <AlertCircle className="inline w-4 h-4 mr-1" />
              La sesión se cerrará automáticamente...
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderSinTurno = () => (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
      <div className="max-w-md w-full mx-4">
        <div className="bg-white rounded-lg shadow-xl p-8">
          <div className="mb-6 flex justify-center">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center">
              <AlertCircle className="w-10 h-10 text-blue-600" />
            </div>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-3 text-center">
            Aún no es tu turno
          </h2>

          <div className="bg-blue-50 rounded-lg p-4 mb-6">
            <p className="text-blue-800 font-medium mb-2">
              {bloqueAsignado
                ? 'Tu turno de programación está programado para:'
                : 'No pudimos leer los datos de tu turno. Consúltalo con tu jefe de área o con el comité sindical.'}
            </p>
            {bloqueAsignado && (
              <div className="space-y-1 text-sm text-blue-700">
                <p>
                  <Calendar className="inline w-4 h-4 mr-1" />
                  Fecha: {format(new Date(bloqueAsignado.fechaHoraInicio), "d 'de' MMMM 'de' yyyy", { locale: es })}
                </p>
                <p>
                  <Clock className="inline w-4 h-4 mr-1" />
                  Horario: {format(new Date(bloqueAsignado.fechaHoraInicio), "HH:mm", { locale: es })} -
                  {format(new Date(bloqueAsignado.fechaHoraFin), "HH:mm", { locale: es })}
                </p>
                <p className="mt-2">
                  <span className="font-medium">Área:</span> {bloqueAsignado.nombreArea}
                </p>
                <p>
                  <span className="font-medium">Grupo:</span> {bloqueAsignado.nombreGrupo}
                </p>
              </div>
            )}
          </div>

          <p className="text-center text-gray-600 mb-4">
            Por favor, regrese en la fecha indicada para programar sus vacaciones anuales.
          </p>

          <div className="mt-4 p-3 bg-blue-100 rounded-lg">
            <p className="text-sm text-blue-700">
              <Clock className="inline w-4 h-4 mr-1" />
              La sesión se cerrará automáticamente...
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderEsperandoAntiguedad = () => (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-red-50">
      <div className="max-w-md w-full mx-4">
        <div className="bg-white rounded-lg shadow-xl p-8">
          <div className="mb-6 flex justify-center">
            <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center">
              <AlertCircle className="w-10 h-10 text-orange-600" />
            </div>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-3 text-center">
            Esperando tu turno por antigüedad
          </h2>

          <div className="bg-orange-50 rounded-lg p-4 mb-6">
            <p className="text-orange-800 font-medium mb-2">
              Estás en tu bloque de programación, pero hay empleados con mayor antigüedad pendientes de reservar
            </p>
            {bloqueActual && (
              <div className="space-y-1 text-sm text-orange-700 mb-3">
                <p>
                  <Calendar className="inline w-4 h-4 mr-1" />
                  Bloque: {format(new Date(bloqueActual.fechaHoraInicio), "d 'de' MMMM 'a las' HH:mm", { locale: es })} -
                  {format(new Date(bloqueActual.fechaHoraFin), "HH:mm", { locale: es })}
                </p>
              </div>
            )}
            
            {empleadosPendientes && empleadosPendientes.length > 0 && (
              <div className="mt-3">
                <p className="text-sm font-medium text-orange-800 mb-2">
                  Empleados con mayor antigüedad pendientes:
                </p>
                <div className="space-y-1">
                  {empleadosPendientes.map((empleado, index) => (
                    <div key={empleado.empleadoId} className="text-xs text-orange-700 bg-orange-100 rounded px-2 py-1">
                      {index + 1}. {empleado.nombreCompleto} - {empleado.antiguedadAnios} años
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <p className="text-center text-gray-600 mb-4">
            Por favor, espere hasta que los empleados con mayor antigüedad completen su reservación.
          </p>

          <div className="mt-4 p-3 bg-orange-100 rounded-lg">
            <p className="text-sm text-orange-700">
              <Clock className="inline w-4 h-4 mr-1" />
              La sesión se cerrará automáticamente...
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  switch (estado) {
    case 'cerrado':
      return renderCerrado();
    case 'turno-actual':
      return renderTurnoActual();
    case 'turno-siguiente':
      return renderTurnoSiguiente();
    case 'sin-turno':
      return renderSinTurno();
    case 'esperando-antiguedad':
      return renderEsperandoAntiguedad();
    default:
      return null;
  }
};