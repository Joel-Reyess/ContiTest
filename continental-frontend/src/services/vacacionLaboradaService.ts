import { httpClient } from './httpClient'
import type { ApiResponse } from '../interfaces/Api.interface'

const BASE = '/api/vacacion-laborada'

export interface VacacionCandidataLaborada {
    vacacionId: number
    fechaVacacion: string // yyyy-MM-dd
    tipoVacacion: string
}

export interface SolicitarVacacionLaboradaRequest {
    empleadoId: number
    vacacionOriginalId: number
    fechaNueva: string // yyyy-MM-dd
    motivo?: string
}

export interface AprobarVacacionLaboradaRequest {
    solicitudId: number
    aprobada: boolean
    motivoRechazo?: string
}

export interface VacacionLaborada {
    id: number
    empleadoId: number
    nomina: number
    nombreEmpleado?: string | null
    areaEmpleado?: string | null
    grupoEmpleado?: string | null

    vacacionOriginalId: number
    fechaOriginal: string
    fechaNueva: string

    motivo?: string | null
    estadoSolicitud: string
    fechaSolicitud: string

    solicitadoPorId: number
    nombreSolicitadoPor?: string | null
    jefeAreaId?: number | null
    fechaRespuesta?: string | null
    aprobadoPorId?: number | null
    nombreAprobadoPor?: string | null
    motivoRechazo?: string | null

    vacacionCanceladaId?: number | null
    vacacionCreadaId?: number | null
}

// El backend envuelve todo en ApiResponse{success,data,...}; httpClient lo deserializa
// como ApiResponse<ApiResponse<X>>. Se hace cast al mismo estilo que el resto
// de services del sistema.
async function unwrap<T>(p: Promise<ApiResponse<unknown>>): Promise<T> {
    const r = (await p) as unknown as ApiResponse<T>
    if (!r.success) throw new Error(r.errorMsg || r.message || 'Error en la respuesta del servidor')
    return r.data as T
}

export const vacacionLaboradaService = {
    getVacacionesLaborables: (empleadoId: number) =>
        unwrap<VacacionCandidataLaborada[]>(
            httpClient.get(`${BASE}/vacaciones-laborables/${empleadoId}`)
        ),

    solicitar: (req: SolicitarVacacionLaboradaRequest) =>
        unwrap<VacacionLaborada>(
            httpClient.post(`${BASE}/solicitar`, req)
        ),

    aprobarRechazar: (req: AprobarVacacionLaboradaRequest) =>
        unwrap<VacacionLaborada>(
            httpClient.post(`${BASE}/aprobar`, req)
        ),

    getPorEmpleado: (empleadoId: number) =>
        unwrap<VacacionLaborada[]>(
            httpClient.get(`${BASE}/empleado/${empleadoId}`)
        ),

    getPendientes: () =>
        unwrap<VacacionLaborada[]>(
            httpClient.get(`${BASE}/pendientes`)
        ),

    getSolicitudesArea: (estado?: string) => {
        const qs = estado ? `?estado=${encodeURIComponent(estado)}` : ''
        return unwrap<VacacionLaborada[]>(
            httpClient.get(`${BASE}/solicitudes-area${qs}`)
        )
    },

    getCreadasPorMi: (anio?: number) => {
        const qs = anio ? `?anio=${anio}` : ''
        return unwrap<VacacionLaborada[]>(
            httpClient.get(`${BASE}/creadas-por-mi${qs}`)
        )
    },
}
