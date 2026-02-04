import { httpClient } from '@/services/httpClient';

export interface PermutaListItem {
    id: number;
    empleadoOrigenNombre: string;
    empleadoDestinoNombre: string;
    fechaPermuta: string;
    turnoEmpleadoOrigen: string;
    turnoEmpleadoDestino: string;
    motivo: string;
    solicitadoPorNombre: string;
    fechaSolicitud: string;
    estadoSolicitud: 'Pendiente' | 'Aprobada' | 'Rechazada';
    jefeAprobadorNombre?: string;
    fechaRespuesta?: string;
    motivoRechazo?: string;
}

export interface ResponderPermutaRequest {
    aprobar: boolean;
    motivoRechazo?: string;
}

export interface PermutasListResponse {
    permutas: PermutaListItem[];
    total: number;
}

export interface PermutasFilters {
    anio?: number;
    areaId?: number;
    estadoSolicitud?: string;
}

export const permutasListService = {
    async obtenerPermutas(filters?: PermutasFilters): Promise<PermutasListResponse> {
        const params = new URLSearchParams();

        if (filters?.anio) params.append('anio', filters.anio.toString());
        if (filters?.areaId) params.append('areaId', filters.areaId.toString());
        if (filters?.estadoSolicitud) params.append('estado', filters.estadoSolicitud);

        const url = `/api/permutas/listado${params.toString() ? `?${params.toString()}` : ''}`;

        const resp = await httpClient.get<PermutasListResponse>(url);

        if (!resp.success || !resp.data) {
            throw new Error(resp.errorMsg || 'Error al obtener permutas');
        }

        return resp.data;
    },

    async exportarExcel(anio: number): Promise<Blob> {
        const response = await fetch(
            `${import.meta.env.VITE_API_URL}/api/permutas/exportar-excel?anio=${anio}`,
            {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            }
        );
        if (!response.ok) {
            throw new Error('Error al exportar Excel');
        }
        return await response.blob();
    },

    async responderPermuta(permutaId: number, aprobar: boolean, motivoRechazo?: string): Promise<void> {
        const resp = await httpClient.post<void>(
            `/api/permutas/responder/${permutaId}`,
            { aprobar, motivoRechazo }
        );
        if (!resp.success) {
            throw new Error(resp.errorMsg || 'Error al responder permuta');
        }
    }
};