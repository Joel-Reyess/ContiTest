/**
 * Empleados Service
 * Handles API operations for unionized employees (empleados sindicalizados)
 * Now with integrated global caching to prevent unnecessary API calls
 */

import { httpClient } from './httpClient';
import { logger } from '@/utils/logger';
import { globalEmpleadosCache } from '@/utils/globalEmpleadosCache';
import type { 
  ApiResponse, 
  EmpleadosSindicalizadosRequest, 
  PaginatedEmpleadosResponse 
} from '@/interfaces/Api.interface';

class EmpleadosService {
  /**
   * Get unionized employees with optional filtering and pagination
   * Now with integrated caching to prevent unnecessary API calls
   */
  async getEmpleadosSindicalizados(
    request: EmpleadosSindicalizadosRequest = {}
  ): Promise<PaginatedEmpleadosResponse> {
    try {
      // Check global cache first
      const cachedData = globalEmpleadosCache.get(request);
      if (cachedData) {
        logger.debug('Returning cached empleados data from service', request);
        return cachedData;
      }

      logger.apiRequest('POST', '/api/User/empleados-sindicalizados', request);

      const response: ApiResponse<PaginatedEmpleadosResponse> = await httpClient.post<PaginatedEmpleadosResponse>(
        '/api/User/empleados-sindicalizados',
        {
          AreaId: request.AreaId,
          GrupoId: request.GrupoId,
          Page: request.Page || 1,
          PageSize: request.PageSize || 25
        }
      );

      if (!response.success || !response.data) {
        throw new Error(response.errorMsg || 'Error al obtener empleados sindicalizados');
      }

      // Store in global cache
      globalEmpleadosCache.set(request, response.data);

      logger.apiResponse('POST', '/api/User/empleados-sindicalizados', 200, response.data);
      return response.data;
    } catch (error) {
      logger.error('Error fetching empleados sindicalizados', error, 'EMPLEADOS_SERVICE');
      throw error;
    }
  }

  /**
   * *
   * Sincronizar empleados sindicalizados
   */
    /**
   * Sincronizar empleados sindicalizados
   */
    async syncEmpleadosSindicalizados(): Promise<{ created: number }> {
        try {
            logger.apiRequest('POST', '/api/UsersGenerator/generate-users-from-empleados', null);

            const response: ApiResponse<{ created: number }> = await httpClient.post<{ created: number }>('/api/UsersGenerator/generate-users-from-empleados');

            if (!response.success || !response.data) {
                throw new Error(response.errorMsg || 'Error al sincronizar empleados sindicalizados');
            }

            // AGREGAR ESTO: Limpiar el caché global después de sincronizar
            globalEmpleadosCache.clear();
            logger.debug('Cache de empleados limpiado después de sincronización');

            logger.apiResponse('POST', '/api/UsersGenerator/generate-users-from-empleados', 200, response.data);
            return response.data;
        } catch (error) {
            logger.error('Error syncing empleados sindicalizados', error, 'EMPLEADOS_SERVICE');
            throw error;
        }
    }

  /**
   * Get empleado sindicalizado by nomina
   */
  async getEmpleadoByNomina(nomina: string): Promise<any> {
    try {
      logger.apiRequest('GET', `/api/User/empleado-sindicalizado/${nomina}`, null);

      // This endpoint might need to be implemented in the backend
      const response: ApiResponse<any> = await httpClient.get<any>(
        `/api/User/empleado-sindicalizado/${nomina}`
      );

      if (!response.success || !response.data) {
        throw new Error(response.errorMsg || 'Error al obtener empleado');
      }

      logger.apiResponse('GET', `/api/User/empleado-sindicalizado/${nomina}`, 200, response.data);
      return response.data;
    } catch (error) {
      logger.error('Error fetching empleado by nomina', error, 'EMPLEADOS_SERVICE');
      throw error;
    }
  }

  /**
   * Get vacation data for unionized employees for PDF generation
   */
  async getEmpleadosVacacionesData(request: {
    areaId: number;
    grupos: string[];
    fechaInicio: string;
    fechaFin: string;
  }): Promise<any[]> {
    try {
      logger.apiRequest('POST', '/api/User/empleados-vacaciones-constancia', request);

      // This endpoint will need to be implemented in the backend to return vacation data
      const response: ApiResponse<any[]> = await httpClient.post<any[]>(
        '/api/User/empleados-vacaciones-constancia',
        {
          AreaId: request.areaId,
          Grupos: request.grupos,
          FechaInicio: request.fechaInicio,
          FechaFin: request.fechaFin
        }
      );

      if (!response.success || !response.data) {
        throw new Error(response.errorMsg || 'Error al obtener datos de vacaciones');
      }

      logger.apiResponse('POST', '/api/User/empleados-vacaciones-constancia', 200, response.data);
      return response.data;
    } catch (error) {
      logger.error('Error fetching empleados vacaciones data', error, 'EMPLEADOS_SERVICE');
      throw error;
    }
  }

    // ✅ Esto es correcto:
    async deleteSindicalizado(id: number, adminPassword: string): Promise<void> {
        try {
            const response: ApiResponse<object> = await httpClient.post<object>(
                `/api/User/delete-sindicalizado/${id}`,
                { adminPassword }
            );
            if (!response.success) {
                throw new Error(response.errorMsg || 'Error al eliminar empleado');
            }
            globalEmpleadosCache.clear();
        } catch (error) {
            logger.error('Error deleting empleado sindicalizado', error, 'EMPLEADOS_SERVICE');
            throw error;
        }
    }
}

export const empleadosService = new EmpleadosService();
export default empleadosService;
