import { httpClient } from '@/services/httpClient';
import type { ApiResponse, VacacionesAsignadasResponse, VacacionesAsignadasCompleteResponse, EliminarVacacionesPorFechaRequest ,DisponibilidadVacacionesResponse, ReservaAnualRequest, ReservaAnualResponse, AsignacionManualRequest, AsignacionManualResponse } from '@/interfaces/Api.interface';
import type { VacacionesConfig, VacacionesConfigUpdateRequest ,} from '@/interfaces/Vacaciones.interface';

export const vacacionesService = {
 
  async getConfig(): Promise<VacacionesConfig> {
    const resp = await httpClient.get<ApiResponse<VacacionesConfig>>('/api/configuracion-vacaciones');
    if ((resp as any)?.data) {
      return (resp as any).data as VacacionesConfig;
    }
    return resp as unknown as VacacionesConfig; // fallback shape
  },
  async updateConfig(payload: VacacionesConfigUpdateRequest): Promise<VacacionesConfig> {
    const resp = await httpClient.put<ApiResponse<VacacionesConfig>>('/api/configuracion-vacaciones', payload);
    if ((resp as any)?.data) {
      return (resp as any).data as VacacionesConfig;
    }
    return resp as unknown as VacacionesConfig;
  },
  
  
  // Nuevo: obtener vacaciones asignadas con filtros flexibles
  async getVacacionesAsignadas(
    params: {
    empleadoId?: number;
    areaId?: number;
    grupoId?: number;
    anio?: number;
    tipoVacacion?: string;
    estadoVacacion?: string;
    incluirDetalleEmpleado?: boolean;
    incluirResumenPorArea?: boolean;
    incluirResumenPorGrupo?: boolean;
  },
    options?: { timeout?: number }
  ): Promise<VacacionesAsignadasCompleteResponse> {
    const queryParams = new URLSearchParams();
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, value.toString());
      }
    });
    
    const resp = await httpClient.get<ApiResponse<VacacionesAsignadasCompleteResponse>>(
      `/api/vacaciones/asignadas?${queryParams.toString()}`,
      undefined,
      { timeout: options?.timeout ?? 60000 }
    );
    
    if (resp?.data) {
      return resp.data as unknown as VacacionesAsignadasCompleteResponse;
    }
    throw new Error('No se pudieron obtener las vacaciones asignadas');
  }
};

// servicios/vacaciones.ts
export const eliminarVacacionPorFecha = async (
  empleadoId: number,
  fechas: string[]
): Promise<ApiResponse<boolean>> => {
  const response = await httpClient.post<ApiResponse<boolean>>(
    "/api/vacaciones/eliminar-por-fecha",
    {
      empleadoId,
      fechas,
    }
  );
  return response.data;
};


// Nuevo: obtener vacaciones asignadas por empleado
// `anio` acota las vacaciones listadas y el resumen (días programables,
// antigüedad) a ese año. Sin él, el backend lista TODOS los años y calcula el
// resumen con el año vigente: al capturar el año en preparación eso mezclaba
// las vacaciones de dos años y daba los días programables del año equivocado.
export const getVacacionesAsignadasPorEmpleado = async (empleadoId: number, anio?: number): Promise<VacacionesAsignadasResponse> => {
  const query = anio ? `?anio=${anio}` : '';
  const resp = await httpClient.get<ApiResponse<VacacionesAsignadasResponse>>(`/api/vacaciones/empleado/${empleadoId}/asignadas${query}`);
  if (resp?.data) {
    return resp.data as unknown as VacacionesAsignadasResponse;
  }
  throw new Error('No se pudieron obtener las vacaciones asignadas');
};

// Nuevo: obtener disponibilidad de vacaciones por grupo y año
export const getDisponibilidadVacaciones = async (anio: number, grupoId: number): Promise<DisponibilidadVacacionesResponse> => {
  const resp = await httpClient.get<ApiResponse<DisponibilidadVacacionesResponse>>(`/api/vacaciones/disponibilidad?anio=${anio}&grupoId=${grupoId}`);
  if (resp?.data) {
    return resp.data as unknown as DisponibilidadVacacionesResponse;
  }
  throw new Error('No se pudo obtener la disponibilidad de vacaciones');
};

// Agregar método al objeto principal para compatibilidad
Object.assign(vacacionesService, {
  getDisponibilidadVacaciones, eliminarVacacionPorFecha
});

// Nuevo: reservar vacaciones anuales
export const reservarVacacionesAnuales = async (request: ReservaAnualRequest): Promise<ReservaAnualResponse> => {
  const resp = await httpClient.post<ApiResponse<ReservaAnualResponse>>('/api/vacaciones/reservar-anual', request);
  if (resp?.data) {
    return resp.data as unknown as ReservaAnualResponse;
  }
  throw new Error('No se pudo procesar la reserva de vacaciones');
};

// Nuevo: asignación manual de vacaciones
export const asignarVacacionesManualmente = async (request: AsignacionManualRequest): Promise<AsignacionManualResponse> => {
  const resp = await httpClient.post<ApiResponse<AsignacionManualResponse>>('/api/vacaciones/asignacion-manual', request);
  if (resp?.data) {
    return resp.data as unknown as AsignacionManualResponse;
  }
  throw new Error('No se pudo procesar la asignación manual de vacaciones');
};

