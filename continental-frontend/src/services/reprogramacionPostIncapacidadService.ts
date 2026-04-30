import { httpClient } from './httpClient'
import type { ApiResponse } from '../interfaces/Api.interface'

const BASE = '/api/reprogramacion-post-incapacidad'

export interface IncapacidadConsumida {
    id: number
    nomina: number
    desde: string
    hasta: string
    claseAbsentismo?: string | null
    clAbPre?: number | null
    observaciones?: string | null
}

export interface VacacionNoCanjeada {
    id: number
    fecha: string
    tipoVacacion: string
    estadoVacacion: string
}

export interface SolicitarReprogramacionPostIncapacidadRequest {
    empleadoId: number
    permisoIncapacidadId: number
    vacacionOriginalId: number
    fechaNueva: string // yyyy-MM-dd
    motivo: string
}

export interface AprobarReprogramacionPostIncapacidadRequest {
    solicitudId: number
    aprobada: boolean
    motivoRechazo?: string
}

export interface SolicitudReprogramacionPostIncapacidad {
    id: number
    empleadoId: number
    nomina: number
    nombreEmpleado?: string | null
    areaEmpleado?: string | null
    grupoEmpleado?: string | null

    permisoIncapacidadId: number
    permisoDesde: string
    permisoHasta: string
    permisoClase?: string | null

    vacacionOriginalId: number
    fechaOriginal: string
    fechaNueva: string

    motivo: string
    estadoSolicitud: string

    fechaSolicitud: string
    nombreSolicitadoPor?: string | null
    jefeAreaId?: number | null
    fechaRespuesta?: string | null
    nombreAprobadoPor?: string | null
    motivoRechazo?: string | null
}

// El backend envuelve todo en ApiResponse{success,data,...}; httpClient lo deserializa
// como ApiResponse<ApiResponse<X>>. El runtime contiene un solo nivel, por lo que se
// hace cast.
async function unwrap<T>(p: Promise<ApiResponse<unknown>>): Promise<T> {
    const r = (await p) as unknown as ApiResponse<T>
    if (!r.success) throw new Error(r.errorMsg || r.message || 'Error en la respuesta del servidor')
    return r.data as T
}

export const reprogramacionPostIncapacidadService = {
    getIncapacidadesConsumidas: (empleadoId: number) =>
        unwrap<IncapacidadConsumida[]>(
            httpClient.get(`${BASE}/incapacidades-consumidas/${empleadoId}`)
        ),

    getVacacionesNoCanjeadas: (empleadoId: number) =>
        unwrap<VacacionNoCanjeada[]>(
            httpClient.get(`${BASE}/vacaciones-no-canjeadas/${empleadoId}`)
        ),

    solicitar: (req: SolicitarReprogramacionPostIncapacidadRequest) =>
        unwrap<SolicitudReprogramacionPostIncapacidad>(
            httpClient.post(`${BASE}/solicitar`, req)
        ),

    aprobarRechazar: (req: AprobarReprogramacionPostIncapacidadRequest) =>
        unwrap<SolicitudReprogramacionPostIncapacidad>(
            httpClient.post(`${BASE}/aprobar`, req)
        ),

    getPorEmpleado: (empleadoId: number) =>
        unwrap<SolicitudReprogramacionPostIncapacidad[]>(
            httpClient.get(`${BASE}/empleado/${empleadoId}`)
        ),

    getPendientes: () =>
        unwrap<SolicitudReprogramacionPostIncapacidad[]>(
            httpClient.get(`${BASE}/pendientes`)
        ),

    getSolicitudesArea: (estado?: string) => {
        const qs = estado ? `?estado=${encodeURIComponent(estado)}` : ''
        return unwrap<SolicitudReprogramacionPostIncapacidad[]>(
            httpClient.get(`${BASE}/solicitudes-area${qs}`)
        )
    },
}
