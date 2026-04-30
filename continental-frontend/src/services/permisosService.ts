import { httpClient } from './httpClient';
import { logger } from '@/utils/logger';
import type { ApiResponse } from '@/interfaces/Api.interface';

export interface TipoPermiso {
    clAbPre: string;
    claveVisualizacion: string;
    concepto: string;
    descripcion: string;
    requiereAprobacion: boolean;
    aplicaDescuento: boolean;
}

export interface CrearPermisoRequest {
    nomina: number;
    clAbPre: string;
    fechaInicio: string; // YYYY-MM-DD
    fechaFin: string; // YYYY-MM-DD
    observaciones?: string;
    dias?: number;
}

export interface CrearPermisoResponse {
    exitoso: boolean;
    mensaje: string;
    nomina: number;
    nombreEmpleado: string;
    tipoPermiso: string;
    descripcionPermiso: string;
    fechaInicio: string;
    fechaFin: string;
    diasAfectados: number;
    fechasRegistradas: string[];
}

export interface ConsultarPermisosRequest {
    nomina?: number;
    empleadoId?: number;
    fechaInicio?: string;
    fechaFin?: string;
    clAbPre?: string;
}

export interface PermisoIncapacidad {
    id: number;
    nomina: number;
    nombre: string;
    posicion: string;
    desde: string;
    hasta: string;
    clAbPre: string;
    claveVisualizacion: string;
    claseAbsentismo: string;
    dias: number;
    diaNat: number;
    observaciones?: string;
    esRegistroManual: boolean;
    fechaRegistro: string;
}

export interface ConsultarPermisosResponse {
    totalRegistros: number;
    permisos: PermisoIncapacidad[];
}

export interface EliminarPermisoRequest {
    nomina: number;
    desde: string;
    hasta: string;
    clAbPre: string;
}

class PermisosIncapacidadesService {
    /**
     * Obtiene el catálogo de tipos de permisos e incapacidades
     */
    async obtenerCatalogo(): Promise<TipoPermiso[]> {
        try {
            logger.apiRequest('GET', '/api/permisos-incapacidades/catalogo', null);

            const response: ApiResponse<{ tiposPermisos: TipoPermiso[] }> =
                await httpClient.get('/api/permisos-incapacidades/catalogo');

            if (!response.success || !response.data) {
                throw new Error(response.errorMsg || 'Error al obtener catálogo de permisos');
            }

            logger.apiResponse('GET', '/api/permisos-incapacidades/catalogo', 200, response.data);
            return response.data.tiposPermisos;
        } catch (error) {
            logger.error('Error fetching permisos catalog', error, 'PERMISOS_SERVICE');
            throw error;
        }
    }

    /**
     * Extiende la fecha "Hasta" de un permiso/incapacidad existente.
     */
    async extenderPermiso(request: {
        permisoId: number;
        nuevaFechaHasta: string;
        observaciones?: string;
    }): Promise<{
        permisoId: number;
        nomina: number;
        desde: string;
        hastaAnterior: string;
        hastaNuevo: string;
        diasHabiles: number;
        diasNaturales: number;
    }> {
        try {
            const response: ApiResponse<any> =
                await httpClient.post('/api/permisos-incapacidades/extender', request);
            if (!response.success || !response.data) {
                throw new Error(response.errorMsg || response.message || 'Error al extender permiso/incapacidad');
            }
            return response.data;
        } catch (error) {
            logger.error('Error extending permiso', error, 'PERMISOS_SERVICE');
            throw error;
        }
    }

    /**
     * Crea un nuevo permiso o incapacidad
     */
    async crearPermiso(request: CrearPermisoRequest): Promise<CrearPermisoResponse> {
        try {
            logger.apiRequest('POST', '/api/permisos-incapacidades/crear', request);

            const response: ApiResponse<CrearPermisoResponse> =
                await httpClient.post('/api/permisos-incapacidades/crear', request);

            if (!response.success || !response.data) {
                throw new Error(response.errorMsg || 'Error al crear permiso/incapacidad');
            }

            logger.apiResponse('POST', '/api/permisos-incapacidades/crear', 200, response.data);
            return response.data;
        } catch (error) {
            logger.error('Error creating permiso', error, 'PERMISOS_SERVICE');
            throw error;
        }
    }

    /**
     * Consulta permisos e incapacidades con filtros
     */
    async consultarPermisos(request: ConsultarPermisosRequest): Promise<ConsultarPermisosResponse> {
        try {
            logger.apiRequest('POST', '/api/permisos-incapacidades/consultar', request);

            const response: ApiResponse<ConsultarPermisosResponse> =
                await httpClient.post('/api/permisos-incapacidades/consultar', request);

            if (!response.success || !response.data) {
                throw new Error(response.errorMsg || 'Error al consultar permisos');
            }

            logger.apiResponse('POST', '/api/permisos-incapacidades/consultar', 200, response.data);
            return response.data;
        } catch (error) {
            logger.error('Error fetching permisos', error, 'PERMISOS_SERVICE');
            throw error;
        }
    }

    /**
     * Obtiene permisos de un empleado por nómina
     */
    async obtenerPermisosPorNomina(
        nomina: number,
        fechaInicio?: string,
        fechaFin?: string
    ): Promise<ConsultarPermisosResponse> {
        try {
            const params: Record<string, string> = {};
            if (fechaInicio) params.fechaInicio = fechaInicio;
            if (fechaFin) params.fechaFin = fechaFin;

            logger.apiRequest('GET', `/api/permisos-incapacidades/empleado/${nomina}`, params);

            const response: ApiResponse<ConsultarPermisosResponse> =
                await httpClient.get(`/api/permisos-incapacidades/empleado/${nomina}`, params);

            if (!response.success || !response.data) {
                throw new Error(response.errorMsg || 'Error al obtener permisos');
            }

            logger.apiResponse('GET', `/api/permisos-incapacidades/empleado/${nomina}`, 200, response.data);
            return response.data;
        } catch (error) {
            logger.error('Error fetching permisos by nomina', error, 'PERMISOS_SERVICE');
            throw error;
        }
    }

    /**
     * Elimina un permiso o incapacidad (solo registros manuales)
     */
    //async eliminarPermiso(request: EliminarPermisoRequest): Promise<void> {
    //    try {
    //        logger.apiRequest('DELETE', '/api/permisos-incapacidades/eliminar', request);

    //        // ✅ FIX: Pasar los datos en el body usando config
    //        const response: ApiResponse<null> =
    //            await httpClient.delete('/api/permisos-incapacidades/eliminar', {
    //                body: request
    //            });

    //        if (!response.success) {
    //            throw new Error(response.errorMsg || 'Error al eliminar permiso');
    //        }

    //        logger.apiResponse('DELETE', '/api/permisos-incapacidades/eliminar', 200, null);
    //    } catch (error) {
    //        logger.error('Error deleting permiso', error, 'PERMISOS_SERVICE');
    //        throw error;
    //    }
    //}
}

export const permisosService = new PermisosIncapacidadesService();
export default permisosService;