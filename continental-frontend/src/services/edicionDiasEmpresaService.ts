import { httpClient } from '@/services/httpClient';
import type {
    ApiResponse,
    ConfiguracionEdicionDiasEmpresa,
    SolicitudEdicionDiaEmpresa,
    ReporteDiasReprogramadosEmpresa,
    SolicitarEdicionDiaEmpresaRequest,
    ResponderEdicionDiaEmpresaRequest,
    CrearConfiguracionEdicionRequest,
} from '@/interfaces/Api.interface';

const BASE = '/api/edicion-dias-empresa';

export const edicionDiasEmpresaService = {
    async obtenerConfiguracion(): Promise<ConfiguracionEdicionDiasEmpresa | null> {
        const resp = await httpClient.get<ApiResponse<ConfiguracionEdicionDiasEmpresa>>(`${BASE}/configuracion`);
        return (resp as any)?.data ?? null;
    },

    async crearConfiguracion(request: CrearConfiguracionEdicionRequest): Promise<ConfiguracionEdicionDiasEmpresa> {
        const resp = await httpClient.post<ApiResponse<ConfiguracionEdicionDiasEmpresa>>(
            `${BASE}/configuracion`, request);
        if (!(resp as any)?.success) throw new Error((resp as any)?.errorMsg || 'Error al crear configuración');
        return (resp as any).data;
    },

    async toggleHabilitado(): Promise<ConfiguracionEdicionDiasEmpresa> {
        const resp = await httpClient.put<ApiResponse<ConfiguracionEdicionDiasEmpresa>>(
            `${BASE}/configuracion/toggle`, {});
        if (!(resp as any)?.success) throw new Error((resp as any)?.errorMsg || 'Error al cambiar estado');
        return (resp as any).data;
    },

    async solicitarEdicion(request: SolicitarEdicionDiaEmpresaRequest): Promise<SolicitudEdicionDiaEmpresa> {
        const resp = await httpClient.post<ApiResponse<SolicitudEdicionDiaEmpresa>>(
            `${BASE}/solicitar`, request);
        if (!(resp as any)?.success) throw new Error((resp as any)?.errorMsg || 'Error al enviar solicitud');
        return (resp as any).data;
    },

    async obtenerMisSolicitudes(empleadoId: number): Promise<SolicitudEdicionDiaEmpresa[]> {
        const resp = await httpClient.get<ApiResponse<SolicitudEdicionDiaEmpresa[]>>(
            `${BASE}/mis-solicitudes/${empleadoId}`);
        return (resp as any)?.data ?? [];
    },

    /** Historial completo (delegado sindical / superusuario / jefe). */
    async obtenerTodas(anio?: number): Promise<SolicitudEdicionDiaEmpresa[]> {
        const params: Record<string, string> = {};
        if (anio) params['anio'] = String(anio);
        const resp = await httpClient.get<ApiResponse<SolicitudEdicionDiaEmpresa[]>>(`${BASE}/todas`, params);
        return (resp as any)?.data ?? [];
    },

    async obtenerPendientes(): Promise<SolicitudEdicionDiaEmpresa[]> {
        const resp = await httpClient.get<ApiResponse<SolicitudEdicionDiaEmpresa[]>>(`${BASE}/pendientes`);
        return (resp as any)?.data ?? [];
    },

    async obtenerSolicitudesArea(): Promise<SolicitudEdicionDiaEmpresa[]> {
        const resp = await httpClient.get<ApiResponse<SolicitudEdicionDiaEmpresa[]>>(`${BASE}/solicitudes-area`);
        return (resp as any)?.data ?? [];
    },

    async responderSolicitud(request: ResponderEdicionDiaEmpresaRequest): Promise<SolicitudEdicionDiaEmpresa> {
        const resp = await httpClient.post<ApiResponse<SolicitudEdicionDiaEmpresa>>(
            `${BASE}/responder`, request);
        if (!(resp as any)?.success) throw new Error((resp as any)?.errorMsg || 'Error al responder solicitud');
        return (resp as any).data;
    },

    async obtenerReporte(
        anio?: number,
        areaId?: number,
        // Rango opcional sobre la FECHA DE SOLICITUD. La pantalla de Reportes ya
        // dejaba capturarlo, pero nunca se enviaba: el reporte salía siempre con
        // el año completo aunque el filtro dijera "esta semana".
        filtros?: { fechaDesde?: string; fechaHasta?: string; horaDesde?: string; horaHasta?: string },
    ): Promise<ReporteDiasReprogramadosEmpresa[]> {
        const params: Record<string, string> = {};
        if (anio) params['anio'] = String(anio);
        if (areaId) params['areaId'] = String(areaId);
        if (filtros?.fechaDesde) params['fechaDesde'] = filtros.fechaDesde;
        if (filtros?.fechaHasta) params['fechaHasta'] = filtros.fechaHasta;
        if (filtros?.horaDesde) params['horaDesde'] = filtros.horaDesde;
        if (filtros?.horaHasta) params['horaHasta'] = filtros.horaHasta;
        const resp = await httpClient.get<ApiResponse<ReporteDiasReprogramadosEmpresa[]>>(
            '/api/reportes/dias-reprogramados-empresa', params);
        return (resp as any)?.data ?? [];
    },
};
