/**
 * Servicio para manejar bloques de reservación
 * Endpoints para generar bloques y obtener estadísticas
 */

import { httpClient } from '@/services/httpClient';
import type {
  ApiResponse,
  GenerarBloquesRequest,
  GenerarBloquesResponse,
  EstadisticasBloquesResponse,
  EliminarBloquesResponse,
  BloquesReservacionResponse,
  BloquesPorFechaResponse,
  CambiarEmpleadoRequest,
  CambiarEmpleadoResponse,
  EmpleadosNoRespondieronResponse
} from '@/interfaces/Api.interface';

export class BloquesReservacionService {
  /**
   * Genera bloques de reservación (simulación o real)
   * @param request - Datos para generar bloques
   * @returns Respuesta con detalles de la generación
   */
  static async generarBloques(request: GenerarBloquesRequest): Promise<GenerarBloquesResponse> {
    try {
      console.log('Generando bloques de reservación:', request);
      
      const response = await httpClient.post<ApiResponse<GenerarBloquesResponse>>(
        '/api/bloques-reservacion/generar',
        request,
        { timeout: 180000 } // 3 minutos para operaciones de generación
      );

      if (!response.success || !response.data) {
        throw new Error(response.errorMsg || 'Error al generar bloques de reservación');
      }

      const result = response.data as unknown as GenerarBloquesResponse;
      console.log('Bloques generados exitosamente:', result);
      return result;
    } catch (error) {
      console.error('Error en generarBloques:', error);
      
      let errorMessage = 'Error al generar bloques de reservación. Por favor intente nuevamente.';
      
      if (error instanceof Error) {
        if (error.message.includes('timeout') || error.message.includes('Request timeout')) {
          errorMessage = 'La generación de bloques tardó más de lo esperado. Por favor intente nuevamente o contacte al administrador.';
        } else if (error.message.includes('Network Error') || error.message.includes('Failed to fetch')) {
          errorMessage = 'Error de conexión. Verifique su conexión a internet e intente nuevamente.';
        } else if (error.message) {
          errorMessage = error.message;
        }
      }
      
      throw new Error(errorMessage);
    }
  }

  /**
   * Obtiene estadísticas de bloques para un año específico
   * @param anioObjetivo - Año para consultar estadísticas
   * @returns Estadísticas de bloques del año
   */
  static async obtenerEstadisticas(anioObjetivo: number): Promise<EstadisticasBloquesResponse> {
    try {
      console.log('Obteniendo estadísticas de bloques para año:', anioObjetivo);
      
      const response = await httpClient.get<ApiResponse<EstadisticasBloquesResponse>>(
        `/api/bloques-reservacion/estadisticas?anioObjetivo=${anioObjetivo}`,
        undefined,
        { timeout: 30000 }
      );

      if (!response.success || !response.data) {
        throw new Error(response.errorMsg || 'Error al obtener estadísticas de bloques');
      }

      const result = response.data as unknown as EstadisticasBloquesResponse;
      console.log('Estadísticas obtenidas exitosamente:', result);
      return result;
    } catch (error) {
      console.error('Error en obtenerEstadisticas:', error);
      
      let errorMessage = 'Error al obtener estadísticas de bloques. Por favor intente nuevamente.';
      
      if (error instanceof Error) {
        if (error.message.includes('Network Error') || error.message.includes('Failed to fetch')) {
          errorMessage = 'Error de conexión. Verifique su conexión a internet e intente nuevamente.';
        } else if (error.message) {
          errorMessage = error.message;
        }
      }
      
      throw new Error(errorMessage);
    }
  }

  /**
   * Obtiene todos los bloques de reservación para un año específico
   * @param anioObjetivo - Año para obtener bloques
   * @returns Lista de bloques con sus empleados asignados
   */
  static async obtenerBloques(anioObjetivo: number): Promise<BloquesReservacionResponse> {
    try {
      console.log('Obteniendo bloques de reservación para año:', anioObjetivo);

      const response = await httpClient.get<ApiResponse<BloquesReservacionResponse>>(
        `/api/bloques-reservacion?anioObjetivo=${anioObjetivo}`,
        undefined,
        { timeout: 60000 } // 1 minuto para obtener todos los bloques
      );

      if (!response.success || !response.data) {
        throw new Error(response.errorMsg || 'Error al obtener bloques de reservación');
      }

      const result = response.data as unknown as BloquesReservacionResponse;
      console.log('Bloques obtenidos exitosamente:', result);
      return result;
    } catch (error) {
      console.error('Error en obtenerBloques:', error);
      
      let errorMessage = 'Error al obtener bloques de reservación. Por favor intente nuevamente.';
      
      if (error instanceof Error) {
        if (error.message.includes('Network Error') || error.message.includes('Failed to fetch')) {
          errorMessage = 'Error de conexión. Verifique su conexión a internet e intente nuevamente.';
        } else if (error.message) {
          errorMessage = error.message;
        }
      }
      
      throw new Error(errorMessage);
    }
  }

  /**
   * Elimina todos los bloques de reservación para un año específico
   * @param anioObjetivo - Año para eliminar bloques
   * @returns Respuesta de la eliminación
   */
  static async eliminarBloques(anioObjetivo: number): Promise<EliminarBloquesResponse> {
    try {
      console.log('Eliminando bloques de reservación para año:', anioObjetivo);
      
      const response = await httpClient.delete<ApiResponse<EliminarBloquesResponse>>(
        `/api/bloques-reservacion/eliminar?anioObjetivo=${anioObjetivo}`,
        { timeout: 60000 } // 1 minuto para operaciones de eliminación
      );

      if (!response.success || !response.data) {
        throw new Error(response.errorMsg || 'Error al eliminar bloques de reservación');
      }

      const result = response.data as unknown as EliminarBloquesResponse;
      console.log('Bloques eliminados exitosamente:', result);
      return result;
    } catch (error) {
      console.error('Error en eliminarBloques:', error);
      
      let errorMessage = 'Error al eliminar bloques de reservación. Por favor intente nuevamente.';
      
      if (error instanceof Error) {
        if (error.message.includes('timeout') || error.message.includes('Request timeout')) {
          errorMessage = 'La eliminación de bloques tardó más de lo esperado. Por favor intente nuevamente o contacte al administrador.';
        } else if (error.message.includes('Network Error') || error.message.includes('Failed to fetch')) {
          errorMessage = 'Error de conexión. Verifique su conexión a internet e intente nuevamente.';
        } else if (error.message) {
          errorMessage = error.message;
        }
      }
      
      throw new Error(errorMessage);
    }
  }

  /**
   * Obtiene bloques por fecha y grupo o área
   * @param fecha - Fecha ISO para consultar (ej: 2025-10-07T10:00:00Z)
   * @param filters - Objeto con grupoId o areaId
   * @param anioObjetivo - Año objetivo
   * @returns Bloques del grupo/área en la fecha especificada
   */
  static async obtenerBloquesPorFecha(
    fecha: string,
    filters: { grupoId?: number; areaId?: number },
    anioObjetivo: number
  ): Promise<BloquesPorFechaResponse> {
    try {
      console.log('Obteniendo bloques por fecha:', { fecha, ...filters, anioObjetivo });

      let queryParams = `fecha=${encodeURIComponent(fecha)}&anioObjetivo=${anioObjetivo}`;

      if (filters.grupoId) {
        queryParams += `&grupoId=${filters.grupoId}`;
      } else if (filters.areaId) {
        queryParams += `&areaId=${filters.areaId}`;
      }

      const response = await httpClient.get<ApiResponse<BloquesPorFechaResponse>>(
        `/api/bloques-reservacion/por-fecha?${queryParams}`,
        undefined,
        { timeout: 30000 }
      );

      if (!response.success || !response.data) {
        throw new Error(response.errorMsg || 'Error al obtener bloques por fecha');
      }

      const result = response.data as unknown as BloquesPorFechaResponse;
      console.log('Bloques por fecha obtenidos exitosamente:', result);
      return result;
    } catch (error) {
      console.error('Error en obtenerBloquesPorFecha:', error);

      let errorMessage = 'Error al obtener bloques por fecha. Por favor intente nuevamente.';

      if (error instanceof Error) {
        if (error.message.includes('Network Error') || error.message.includes('Failed to fetch')) {
          errorMessage = 'Error de conexión. Verifique su conexión a internet e intente nuevamente.';
        } else if (error.message) {
          errorMessage = error.message;
        }
      }

      throw new Error(errorMessage);
    }
  }

  /**
   * Obtiene bloques asignados a un empleado específico
   * @param empleadoId - ID del empleado
   * @param anioObjetivo - Año objetivo
   * @returns Bloques donde está asignado el empleado
   */
  static async obtenerBloquesPorEmpleado(
    empleadoId: number,
    anioObjetivo: number
  ): Promise<BloquesReservacionResponse> {
    try {
      console.log('Obteniendo bloques por empleado:', { empleadoId, anioObjetivo });

      const response = await httpClient.get<ApiResponse<BloquesReservacionResponse>>(
        `/api/bloques-reservacion/empleado/${empleadoId}?anioObjetivo=${anioObjetivo}`,
        undefined,
        { timeout: 30000 }
      );

      if (!response.success || !response.data) {
        throw new Error(response.errorMsg || 'Error al obtener bloques del empleado');
      }

      const result = response.data as unknown as BloquesReservacionResponse;
      console.log('Bloques del empleado obtenidos exitosamente:', result);
      return result;
    } catch (error) {
      console.error('Error en obtenerBloquesPorEmpleado:', error);

      let errorMessage = 'Error al obtener bloques del empleado. Por favor intente nuevamente.';

      if (error instanceof Error) {
        if (error.message.includes('Network Error') || error.message.includes('Failed to fetch')) {
          errorMessage = 'Error de conexión. Verifique su conexión a internet e intente nuevamente.';
        } else if (error.message) {
          errorMessage = error.message;
        }
      }

      throw new Error(errorMessage);
    }
  }

  /**
   * Obtiene todos los bloques disponibles para un grupo en un año específico
   * @param anioObjetivo - Año objetivo
   * @param grupoId - ID del grupo
   * @returns Lista de bloques disponibles
   */
  static async obtenerBloquesPorGrupo(
    anioObjetivo: number,
    grupoId: number
  ): Promise<BloquesReservacionResponse> {
    try {
      console.log('Obteniendo bloques por grupo:', { anioObjetivo, grupoId });

      const queryParams = `anioObjetivo=${anioObjetivo}&grupoId=${grupoId}`;

      const response = await httpClient.get<ApiResponse<BloquesReservacionResponse>>(
        `/api/bloques-reservacion?${queryParams}`,
        undefined,
        { timeout: 30000 }
      );

      if (!response.success || !response.data) {
        throw new Error(response.errorMsg || 'Error al obtener bloques por grupo');
      }

      const result = response.data as unknown as BloquesReservacionResponse;
      console.log('Bloques por grupo obtenidos exitosamente:', result);
      return result;
    } catch (error) {
      console.error('Error en obtenerBloquesPorGrupo:', error);
      
      let errorMessage = 'Error al obtener bloques por grupo';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      throw new Error(errorMessage);
    }
  }

  /**
   * Cambia un empleado de un bloque a otro
   * @param request - Datos del cambio de empleado
   * @returns Respuesta del cambio
   */
  /**
   * Salta el turno de un empleado dentro de su bloque actual: desbloquea al
   * siguiente por antigüedad. El saltado puede capturar mientras el bloque
   * siga abierto; si no, al vencer pasa al bloque cola automáticamente.
   */
  static async saltarTurno(
    empleadoId: number,
    bloqueId: number,
    motivo?: string
  ): Promise<void> {
    try {
      const response = await httpClient.post<ApiResponse<boolean>>(
        '/api/bloques-reservacion/saltar-turno',
        { empleadoId, bloqueId, motivo },
        { timeout: 30000 }
      );

      if (!response.success) {
        throw new Error(response.errorMsg || 'Error al saltar el turno');
      }
    } catch (error) {
      console.error('Error en saltarTurno:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Error al saltar el turno'
      );
    }
  }

  static async cambiarEmpleado(
    request: CambiarEmpleadoRequest
  ): Promise<CambiarEmpleadoResponse> {
    try {
      console.log('Cambiando empleado de bloque:', request);

      const response = await httpClient.post<ApiResponse<CambiarEmpleadoResponse>>(
        '/api/bloques-reservacion/cambiar-empleado',
        request,
        { timeout: 30000 }
      );

      if (!response.success || !response.data) {
        throw new Error(response.errorMsg || 'Error al cambiar empleado de bloque');
      }

      const result = response.data as unknown as CambiarEmpleadoResponse;
      console.log('Empleado cambiado exitosamente:', result);
      return result;
    } catch (error) {
      console.error('Error en cambiarEmpleado:', error);
      
      let errorMessage = 'Error al cambiar empleado de bloque';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      throw new Error(errorMessage);
    }
  }

  /**
   * Obtiene empleados que no respondieron a la asignación de bloques
   * @param anioObjetivo - Año a consultar
   * @param areaId - ID del área para filtrar (opcional)
   * @param grupoId - ID del grupo para filtrar (opcional)
   * @returns Lista de empleados que no respondieron
   */
  static async obtenerEmpleadosNoRespondieron(
    anioObjetivo: number,
    areaId?: number,
    grupoId?: number
  ): Promise<EmpleadosNoRespondieronResponse> {
    try {
      console.log('Obteniendo empleados que no respondieron:', { anioObjetivo, areaId, grupoId });

      let queryParams = `anioObjetivo=${anioObjetivo}`;
      
      if (areaId) {
        queryParams += `&areaId=${areaId}`;
      }
      
      if (grupoId) {
        queryParams += `&grupoId=${grupoId}`;
      }

      const response = await httpClient.get<ApiResponse<EmpleadosNoRespondieronResponse>>(
        `/api/bloques-reservacion/empleados-no-respondieron?${queryParams}`,
        undefined,
        { timeout: 30000 }
      );

      if (!response.success || !response.data) {
        throw new Error(response.errorMsg || 'Error al obtener empleados que no respondieron');
      }

      const result = response.data as unknown as EmpleadosNoRespondieronResponse;
      console.log('Empleados que no respondieron obtenidos exitosamente:', {
        total: result.totalEmpleadosNoRespondio,
        regulares: result.empleadosEnBloquesRegulares,
        cola: result.empleadosEnBloqueCola
      });
      
      return result;
    } catch (error) {
      console.error('Error en obtenerEmpleadosNoRespondieron:', error);

      let errorMessage = 'Error al obtener empleados que no respondieron. Por favor intente nuevamente.';

      if (error instanceof Error) {
        if (error.message.includes('Network Error') || error.message.includes('Failed to fetch')) {
          errorMessage = 'Error de conexión. Verifique su conexión a internet e intente nuevamente.';
        } else if (error.message) {
          errorMessage = error.message;
        }
      }

      throw new Error(errorMessage);
    }
  }
}
