/**
 * Asignación Automática Service
 * Handles automatic vacation assignment operations
 */

import { httpClient } from '@/services/httpClient';
import type {
  ApiResponse,
  AsignacionAutomaticaRequest,
  AsignacionAutomaticaResponse,
  RevertirAsignacionResponse,
  ResumenAsignacionAutomaticaResponse,
  VentanaAsignacion
} from '@/interfaces/Api.interface';

export interface EmpleadoSinAsignacion {
  empleadoId: number;
  nombreCompleto: string;
  nomina: string;
  grupoId: number;
  nombreGrupo: string;
  areaId: number;
  nombreArea: string;
  diasCorrespondientes: number;
  diasAsignadosAutomaticamente: number;
  diasProgramablesAnual: number;
  diasYaAsignados: number;
  motivoNoAsignacion: string;
  tieneTurnosDisponibles: boolean;
  fechaIngreso: string;
  antiguedadAnios: number;
}

export interface ResumenMotivos {
  sinTurnosDisponibles: number;
  diasInsuficientes: number;
  errorProcesamiento: number;
  otrosMotivos: number;
}

export interface EmpleadosSinAsignacionResponse {
  anio: number;
  totalEmpleadosSinAsignacion: number;
  empleados: EmpleadoSinAsignacion[];
  resumenMotivos: ResumenMotivos;
  fechaReporte: string;
}

export class AsignacionAutomaticaService {
  /**
   * Ejecuta la asignación automática de vacaciones
   * @param anio - Año para el cual se ejecutará la asignación
   * @param semanasExcluidas - Array de números de semana a excluir de la asignación
   * @returns Promise<AsignacionAutomaticaResponse>
   */
  static async ejecutarAsignacion(anio: number, semanasExcluidas?: number[], ventanasPreferentes?: VentanaAsignacion[]): Promise<AsignacionAutomaticaResponse> {
    try {
      console.log('🔄 Ejecutando asignación automática para año:', anio, 'con semanas excluidas:', semanasExcluidas);
      
      // Usar timeout de 6 minutos (360000ms) para esta operación que puede tardar hasta 5 minutos
      const response = await httpClient.post<ApiResponse<AsignacionAutomaticaResponse>>(
        '/api/asignacion-automatica/ejecutar',
        { anio, semanasExcluidas, ventanasPreferentes } as AsignacionAutomaticaRequest,
        { timeout: 1200000 } // 20 minutos
      );

      console.log('🔍 Raw API Response:', response);

      if (!response.success) {
        console.log('❌ Validation failed - success is falsy');
        throw new Error(response.errorMsg || 'Error al ejecutar la asignación automática');
      }

      // La respuesta viene con los datos directamente en response.data
      // según el log: {success: true, data: {...}, errorMsg: '...'}
      // Pero necesitamos extraer solo los datos de AsignacionAutomaticaResponse
      const result = response.data as unknown as AsignacionAutomaticaResponse;
      console.log('✅ Asignación automática completada:', result);
      return result;
    } catch (error) {
      console.error('❌ Error en ejecutarAsignacion:', error);
      throw error;
    }
  }

  /**
   * Revierte la asignación automática de vacaciones
   * @param anio - Año para el cual se revertirá la asignación
   * @returns Promise<RevertirAsignacionResponse>
   */
  static async revertirAsignacion(anio: number): Promise<RevertirAsignacionResponse> {
    try {
      console.log('🔄 Revirtiendo asignación automática para año:', anio);
      
      // Usar timeout de 2 minutos para la operación de revertir
      const response = await httpClient.delete<ApiResponse<RevertirAsignacionResponse>>(
        `/api/asignacion-automatica/revertir?anio=${anio}`,
        { timeout: 120000 } // 2 minutos
      );

      if (!response.success) {
        throw new Error(response.errorMsg || 'Error al revertir la asignación automática');
      }

      const result = response.data as unknown as RevertirAsignacionResponse;
      console.log('✅ Asignación automática revertida:', result);
      return result;
    } catch (error) {
      console.error('❌ Error en revertirAsignacion:', error);
      throw error;
    }
  }

  /**
   * Obtiene el resumen de la asignación automática para un año específico
   * @param anio - Año para el cual se obtendrá el resumen
   * @returns Promise<ResumenAsignacionAutomaticaResponse>
   */
  static async obtenerResumen(anio: number): Promise<ResumenAsignacionAutomaticaResponse> {
    try {
      console.log('🔄 Obteniendo resumen de asignación automática para año:', anio);

      const response = await httpClient.get<ApiResponse<ResumenAsignacionAutomaticaResponse>>(
        `/api/asignacion-automatica/resumen/${anio}`
      );

      console.log('🔍 Raw Resumen Response:', response);

      if (!response.success) {
        throw new Error(response.errorMsg || 'Error al obtener el resumen de asignación automática');
      }

      const result = response.data as unknown as ResumenAsignacionAutomaticaResponse;
      console.log('✅ Resumen obtenido:', result);
      return result;
    } catch (error) {
      console.error('❌ Error en obtenerResumen:', error);
      throw error;
    }
  }

  /**
   * Obtiene la lista de empleados sin asignación automática para un año específico
   * @param anio - Año para consultar empleados sin asignación
   * @returns Promise<EmpleadosSinAsignacionResponse>
   */
  static async getEmpleadosSinAsignacion(anio: number): Promise<EmpleadosSinAsignacionResponse> {
    try {
      console.log('🔄 Obteniendo empleados sin asignación para año:', anio);

      const response = await httpClient.get<ApiResponse<EmpleadosSinAsignacionResponse>>(
        `/api/asignacion-automatica/empleados-sin-asignacion?anio=${anio}`,
        undefined,
        { timeout: 30000 }
      );

      console.log('🔍 Raw Empleados Sin Asignación Response:', response);

      // El endpoint puede devolver success: true con empleados sin asignación
      // o success: false si hay empleados sin asignar, pero siempre con data
      if (!response.data) {
        throw new Error(response.errorMsg || 'Error al obtener empleados sin asignación');
      }

      const result = response.data as unknown as EmpleadosSinAsignacionResponse;
      console.log(`✅ Empleados sin asignación obtenidos: ${result.totalEmpleadosSinAsignacion} empleados`);

      return result;
    } catch (error) {
      console.error('❌ Error en getEmpleadosSinAsignacion:', error);

      let errorMessage = 'Error al obtener empleados sin asignación. Por favor intente nuevamente.';

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
