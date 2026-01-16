import { httpClient } from './httpClient';
import { logger } from '@/utils/logger';
import type { ApiResponse, ConsultarSolicitudesPermisosResponse } from '@/interfaces/Api.interface';
import type { TipoPermiso } from './permisosService';

export interface CrearSolicitudPermisoRequest {
    Nomina: number;  // ✅ Cambiar a PascalCase
    ClAbPre: string;  // ✅ Cambiar a PascalCase
    FechaInicio: string;  // ✅ Cambiar a PascalCase
    FechaFin: string;  // ✅ Cambiar a PascalCase
    Observaciones?: string;  // ✅ Cambiar a PascalCase
}
export interface CrearSolicitudPermisoResponse {
    exitoso: boolean;
    mensaje: string;
    solicitudId: number;
    estado: string;
    nombreEmpleado: string;
    tipoPermiso: string;
    fechaInicio: string;
    fechaFin: string;
}

export interface SolicitudPermisoDto {
    id: number;
    nominaEmpleado: number;
    nombreEmpleado: string;
    clAbPre: string;
    claveVisualizacion: string;
    descripcionPermiso: string;
    fechaInicio: string;
    fechaFin: string;
    observaciones?: string;
    estado: string; // Pendiente, Aprobada, Rechazada
    motivoRechazo?: string;
    fechaSolicitud: string;
    fechaRespuesta?: string;
    delegadoNombre: string;
    jefeAreaNombre?: string;
}

export interface ConsultarSolicitudesRequest {
    nominaEmpleado?: number;
    delegadoId?: number;
    areaId?: number;
    estado?: string;
    fechaInicio?: string;
    fechaFin?: string;
}

export interface ConsultarSolicitudesResponse {
    totalRegistros: number;
    solicitudes: SolicitudPermisoDto[];
}

export interface ResponderSolicitudRequest {
    solicitudId: number;
    aprobar: boolean;
    motivoRechazo?: string;
}

export interface CatalogoPermisosDelegadoResponse {
    tiposPermisosPermitidos: TipoPermiso[];
}

class SolicitudesPermisosService {
    /**
     * Obtiene el catálogo de permisos permitidos para delegados sindicales
     */
    async obtenerCatalogoDelegado(): Promise<TipoPermiso[]> {
        try {
            logger.apiRequest('GET', '/api/solicitudes-permisos/catalogo-delegado', null);

            const response: ApiResponse<CatalogoPermisosDelegadoResponse> =
                await httpClient.get('/api/solicitudes-permisos/catalogo-delegado');

            if (!response.success || !response.data) {
                throw new Error(response.errorMsg || 'Error al obtener catálogo de permisos');
            }

            logger.apiResponse('GET', '/api/solicitudes-permisos/catalogo-delegado', 200, response.data);
            return response.data.tiposPermisosPermitidos;
        } catch (error) {
            logger.error('Error fetching delegado catalog', error, 'SOLICITUDES_PERMISOS_SERVICE');
            throw error;
        }
    }

    /**
     * Crea una nueva solicitud de permiso
     */
    async crearSolicitud(request: CrearSolicitudPermisoRequest): Promise<CrearSolicitudPermisoResponse> {
        try {
            logger.apiRequest('POST', '/api/solicitudes-permisos/crear', request);

            const response: ApiResponse<CrearSolicitudPermisoResponse> =
                await httpClient.post('/api/solicitudes-permisos/crear', request);

            if (!response.success || !response.data) {
                throw new Error(response.errorMsg || 'Error al crear solicitud de permiso');
            }

            logger.apiResponse('POST', '/api/solicitudes-permisos/crear', 200, response.data);
            return response.data;
        } catch (error) {
            logger.error('Error creating solicitud permiso', error, 'SOLICITUDES_PERMISOS_SERVICE');
            throw error;
        }
    }

    /**
     * Consulta solicitudes de permisos con filtros
     */
    async consultarSolicitudes(request: ConsultarSolicitudesRequest): Promise<ConsultarSolicitudesResponse> {
        try {
            logger.apiRequest('POST', '/api/solicitudes-permisos/consultar', request);

            const response: ApiResponse<ConsultarSolicitudesResponse> =
                await httpClient.post('/api/solicitudes-permisos/consultar', request);

            if (!response.success || !response.data) {
                throw new Error(response.errorMsg || 'Error al consultar solicitudes');
            }

            logger.apiResponse('POST', '/api/solicitudes-permisos/consultar', 200, response.data);
            return response.data;
        } catch (error) {
            logger.error('Error fetching solicitudes', error, 'SOLICITUDES_PERMISOS_SERVICE');
            throw error;
        }
    }

    /**
     * Obtiene las solicitudes creadas por el delegado actual
     */
    async obtenerMisSolicitudes(estado?: string, nomina?: number): Promise<ConsultarSolicitudesResponse> {
        try {
            const params: Record<string, string> = {};
            if (estado) params.estado = estado;
            if (nomina) params.nomina = nomina.toString();

            logger.apiRequest('GET', '/api/solicitudes-permisos/mis-solicitudes', params);

            const response: ApiResponse<ConsultarSolicitudesResponse> =
                await httpClient.get('/api/solicitudes-permisos/mis-solicitudes', params);

            if (!response.success || !response.data) {
                throw new Error(response.errorMsg || 'Error al obtener solicitudes');
            }

            logger.apiResponse('GET', '/api/solicitudes-permisos/mis-solicitudes', 200, response.data);
            return response.data;
        } catch (error) {
            logger.error('Error fetching mis solicitudes', error, 'SOLICITUDES_PERMISOS_SERVICE');
            throw error;
        }
    }

    /**
     * Obtiene solicitudes pendientes para el jefe de área actual
     */
    async obtenerSolicitudesPendientes(): Promise<ConsultarSolicitudesResponse> {
        try {
            logger.apiRequest('GET', '/api/solicitudes-permisos/pendientes', null);

            const response: ApiResponse<ConsultarSolicitudesResponse> =
                await httpClient.get('/api/solicitudes-permisos/pendientes');

            if (!response.success || !response.data) {
                throw new Error(response.errorMsg || 'Error al obtener solicitudes pendientes');
            }

            logger.apiResponse('GET', '/api/solicitudes-permisos/pendientes', 200, response.data);
            return response.data;
        } catch (error) {
            logger.error('Error fetching solicitudes pendientes', error, 'SOLICITUDES_PERMISOS_SERVICE');
            throw error;
        }
    }

    /**
    * Obtiene una solicitud específica por ID
    */
    async obtenerSolicitudPorId(id: number): Promise<SolicitudPermisoDto> {
        try {
            logger.apiRequest('GET', `/api/solicitudes-permisos/${id}`, null);

            const response: ApiResponse<SolicitudPermisoDto> =
                await httpClient.get(`/api/solicitudes-permisos/${id}`);

            if (!response.success || !response.data) {
                throw new Error(response.errorMsg || 'Error al obtener solicitud');
            }

            logger.apiResponse('GET', `/api/solicitudes-permisos/${id}`, 200, response.data);
            return response.data;
        } catch (error) {
            logger.error('Error fetching solicitud by id', error, 'SOLICITUDES_PERMISOS_SERVICE');
            throw error;
        }
    }

    /**
     * Responde a una solicitud de permiso (aprobar o rechazar)
     */
    async responderSolicitud(request: ResponderSolicitudRequest): Promise<void> {
        try {
            const payload = {
                SolicitudId: request.solicitudId,
                Aprobar: request.aprobar,
                MotivoRechazo: request.motivoRechazo
            };

            logger.apiRequest('POST', '/api/solicitudes-permisos/responder', payload);

            const response: ApiResponse<null> =
                await httpClient.post('/api/solicitudes-permisos/responder', payload);

            if (!response.success) {
                throw new Error(response.errorMsg || 'Error al responder solicitud');
            }

            logger.apiResponse('POST', '/api/solicitudes-permisos/responder', 200, null);
        } catch (error) {
            logger.error('Error responding to solicitud', error, 'SOLICITUDES_PERMISOS_SERVICE');
            throw error;
        }
    }

    async obtenerHistorialPorNomina(nomina: number, anio?: number): Promise<ConsultarSolicitudesPermisosResponse> {
        try {
            const params: Record<string, string> = {};
            if (anio) params.anio = anio.toString();

            logger.apiRequest('GET', `/api/solicitudes-permisos/historial/${nomina}`, params);

            const response: ApiResponse<ConsultarSolicitudesPermisosResponse> =
                await httpClient.get(`/api/solicitudes-permisos/historial/${nomina}`, params);

            if (!response.success || !response.data) {
                throw new Error(response.errorMsg || 'Error al obtener historial');
            }

            logger.apiResponse('GET', `/api/solicitudes-permisos/historial/${nomina}`, 200, response.data);
            return response.data;
        } catch (error) {
            logger.error('Error fetching historial permisos', error, 'SOLICITUDES_PERMISOS_SERVICE');
            throw error;
        }
    }
}

export const solicitudesPermisosService = new SolicitudesPermisosService();
export default solicitudesPermisosService;