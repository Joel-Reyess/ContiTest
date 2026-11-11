import { httpClient } from './httpClient'
import type { ApiResponse } from '@/interfaces/Api.interface'

const BASE = '/api/movimiento-dias-empresa'

/** Un renglón del machote: a quién, qué día por la empresa tenía y a qué día pasa. */
export interface RenglonMovimientoDiaEmpresa {
    renglon: number
    nomina?: number | null
    fechaActual?: string | null
    fechaNueva?: string | null
}

export type EstadoRenglonMovimiento = 'Listo' | 'Advertencia' | 'Error' | 'Aplicado' | 'Omitido'

export interface ResultadoRenglonMovimiento {
    renglon: number
    nomina?: number | null
    nombre?: string | null
    area?: string | null
    grupo?: string | null
    fechaActual?: string | null
    fechaNueva?: string | null
    estado: EstadoRenglonMovimiento
    mensaje?: string | null
}

export interface ResultadoMovimientoMasivo {
    renglones: ResultadoRenglonMovimiento[]
    listos: number
    advertencias: number
    errores: number
    aplicados: number
}

export interface MovimientoMasivoRequest {
    renglones: RenglonMovimientoDiaEmpresa[]
    motivo?: string
    incluirAdvertencias?: boolean
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

export const movimientoDiasEmpresaService = {
    validar: (req: MovimientoMasivoRequest) =>
        unwrap<ResultadoMovimientoMasivo>(httpClient.post(`${BASE}/validar`, req, { timeout: 120000 })),
    aplicar: (req: MovimientoMasivoRequest) =>
        unwrap<ResultadoMovimientoMasivo>(httpClient.post(`${BASE}/aplicar`, req, { timeout: 120000 })),
}
