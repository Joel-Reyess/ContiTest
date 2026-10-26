import { httpClient } from './httpClient'
import type { ApiResponse } from '@/interfaces/Api.interface'

const BASE = '/api/capacidad-porcentaje'

export type AlcanceCapacidad = 'Planta' | 'Area' | 'Grupo'
export type PeriodoCapacidad = 'Dia' | 'Semana' | 'Mes'

/** Porcentaje distinto al general durante un día, semana o mes (planta, área o grupo). */
export interface CapacidadPorcentaje {
    id: number
    alcance: AlcanceCapacidad
    areaId?: number | null
    area?: string | null
    grupoId?: number | null
    grupo?: string | null
    periodo: PeriodoCapacidad
    fechaInicio: string
    fechaFin: string
    porcentaje: number
    motivo?: string | null
    activa: boolean
    creadoPor?: string | null
    fechaCreacion: string
    desactivadoPor?: string | null
    fechaDesactivacion?: string | null
    descripcion: string
}

export interface CapacidadesPorcentajeResponse {
    tablaExiste: boolean
    porcentajeGeneral: number
    anioPreparacion?: number | null
    porcentajePreparacion?: number | null
    capacidades: CapacidadPorcentaje[]
}

export interface CrearCapacidadRequest {
    alcance: AlcanceCapacidad
    areaId?: number
    grupoId?: number
    periodo: PeriodoCapacidad
    fechaInicio: string
    fechaFin?: string
    porcentaje: number
    motivo?: string
}

export interface LimiteDia {
    fecha: string
    grupoId: number
    porcentaje: number
    origen: string
}

async function unwrap<T>(p: Promise<ApiResponse<unknown>>): Promise<T> {
    let r: ApiResponse<T>
    try {
        r = (await p) as unknown as ApiResponse<T>
    } catch (e) {
        // httpClient lanza { message }, no Error: se pasa a Error para mostrar el motivo.
        throw new Error((e as { message?: string } | null)?.message || 'No se pudo completar la operación')
    }
    if (!r.success) throw new Error(r.errorMsg || 'Error en la respuesta del servidor')
    return r.data as T
}

export const capacidadPorcentajeService = {
    listar: (anio?: number, incluirInactivas = false) =>
        unwrap<CapacidadesPorcentajeResponse>(
            httpClient.get(`${BASE}?incluirInactivas=${incluirInactivas}${anio ? `&anio=${anio}` : ''}`)
        ),
    crear: (req: CrearCapacidadRequest) => unwrap<number>(httpClient.post(BASE, req)),
    desactivar: (id: number) => unwrap<unknown>(httpClient.post(`${BASE}/${id}/desactivar`, {})),
    reactivar: (id: number) => unwrap<unknown>(httpClient.post(`${BASE}/${id}/reactivar`, {})),
    /** Límite de un grupo día por día (yyyy-MM-dd). */
    limites: (grupoId: number, desde: string, hasta: string) =>
        unwrap<LimiteDia[]>(httpClient.get(`${BASE}/limites?grupoId=${grupoId}&desde=${desde}&hasta=${hasta}`)),
}
