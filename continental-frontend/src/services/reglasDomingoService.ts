import { httpClient } from './httpClient'
import type { ApiResponse } from '@/interfaces/Api.interface'

const BASE = '/api/reglas-domingo'

export type TipoReglaDomingo = 'SinDomingo' | 'RolNormal'

/** Regla dominical de una unidad organizativa (o un grupo) en un periodo. */
export interface ReglaDomingo {
    id: number
    areaId: number
    area: string
    grupoId?: number | null
    grupo?: string | null
    tipo: TipoReglaDomingo
    incluyeSabado: boolean
    fechaInicio: string
    fechaFin: string
    motivo?: string | null
    activa: boolean
    creadoPor?: string | null
    fechaCreacion: string
    desactivadoPor?: string | null
    fechaDesactivacion?: string | null
}

export interface ReglasDomingoResponse {
    tablaExiste: boolean
    reglas: ReglaDomingo[]
}

export interface CrearReglaDomingoRequest {
    areaIds: number[]
    grupoId?: number
    tipo: TipoReglaDomingo
    incluyeSabado: boolean
    fechaInicio: string
    fechaFin: string
    motivo?: string
}

export interface VacacionEnNoLaborable {
    vacacionId: number
    empleadoId: number
    nomina?: number | null
    nombre: string
    area: string
    grupo: string
    fecha: string
    tipoVacacion: string
    motivo: string
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

export const reglasDomingoService = {
    listar: (anio?: number, incluirInactivas = false) =>
        unwrap<ReglasDomingoResponse>(
            httpClient.get(`${BASE}?incluirInactivas=${incluirInactivas}${anio ? `&anio=${anio}` : ''}`)
        ),
    crear: (req: CrearReglaDomingoRequest) => unwrap<number>(httpClient.post(BASE, req)),
    desactivar: (id: number) => unwrap<unknown>(httpClient.post(`${BASE}/${id}/desactivar`, {})),
    reactivar: (id: number) => unwrap<unknown>(httpClient.post(`${BASE}/${id}/reactivar`, {})),
    delEmpleado: (empleadoId: number, anio: number) =>
        unwrap<ReglaDomingo[]>(httpClient.get(`${BASE}/empleado/${empleadoId}?anio=${anio}`)),
    vacacionesAfectadas: (anio: number) =>
        unwrap<VacacionEnNoLaborable[]>(httpClient.get(`${BASE}/vacaciones-afectadas?anio=${anio}`, undefined, { timeout: 60000 })),
}
