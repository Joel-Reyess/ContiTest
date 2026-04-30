import { httpClient } from './httpClient'
import type { ApiResponse } from '../interfaces/Api.interface'

const BASE = '/api/reprogramacion-dia-empresa'

export type MotivoTipo = 'Incapacidad' | 'PermisoDefuncion' | 'Paternidad' | 'Maternidad'

export const MOTIVO_LABEL: Record<MotivoTipo, string> = {
    Incapacidad: 'Incapacidad',
    PermisoDefuncion: 'Permiso de defunción',
    Paternidad: 'Paternidad',
    Maternidad: 'Maternidad',
}

export interface SolicitarReprogramacionDiaEmpresaRequest {
    empleadoId: number
    vacacionOriginalId: number
    fechaNueva: string // yyyy-MM-dd
    motivoTipo: MotivoTipo
    justificacion?: string
}

export interface AprobarReprogramacionDiaEmpresaRequest {
    solicitudId: number
    aprobada: boolean
    motivoRechazo?: string
}

export interface SolicitudReprogramacionDiaEmpresa {
    id: number
    empleadoId: number
    nomina?: number | null
    nombreEmpleado?: string | null
    areaEmpleado?: string | null
    grupoEmpleado?: string | null

    vacacionOriginalId: number
    fechaOriginal: string
    fechaNueva: string

    motivoTipo: MotivoTipo
    justificacion?: string | null

    estadoSolicitud: string
    fechaSolicitud: string
    nombreSolicitadoPor?: string | null
    jefeAreaId?: number | null
    fechaRespuesta?: string | null
    nombreAprobadoPor?: string | null
    motivoRechazo?: string | null
}

async function unwrap<T>(p: Promise<ApiResponse<unknown>>): Promise<T> {
    const r = (await p) as unknown as ApiResponse<T>
    if (!r.success) throw new Error(r.errorMsg || r.message || 'Error en la respuesta del servidor')
    return r.data as T
}

export const reprogramacionDiaEmpresaService = {
    getMotivos: () =>
        unwrap<MotivoTipo[]>(httpClient.get(`${BASE}/motivos`)),

    solicitar: (req: SolicitarReprogramacionDiaEmpresaRequest) =>
        unwrap<SolicitudReprogramacionDiaEmpresa>(httpClient.post(`${BASE}/solicitar`, req)),

    aprobarRechazar: (req: AprobarReprogramacionDiaEmpresaRequest) =>
        unwrap<SolicitudReprogramacionDiaEmpresa>(httpClient.post(`${BASE}/aprobar`, req)),

    getPendientes: () =>
        unwrap<SolicitudReprogramacionDiaEmpresa[]>(httpClient.get(`${BASE}/pendientes`)),

    getSolicitudesArea: (estado?: string) => {
        const qs = estado ? `?estado=${encodeURIComponent(estado)}` : ''
        return unwrap<SolicitudReprogramacionDiaEmpresa[]>(httpClient.get(`${BASE}/solicitudes-area${qs}`))
    },

    getTodas: (estado?: string) => {
        const qs = estado ? `?estado=${encodeURIComponent(estado)}` : ''
        return unwrap<SolicitudReprogramacionDiaEmpresa[]>(httpClient.get(`${BASE}/todas${qs}`))
    },
}
