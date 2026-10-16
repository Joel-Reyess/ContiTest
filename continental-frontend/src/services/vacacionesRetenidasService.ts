import { httpClient } from './httpClient'
import type { ApiResponse } from '@/interfaces/Api.interface'

const BASE = '/api/vacaciones-retenidas'

/** Día del Excel de SAP que la sincronización retuvo por pasarse de la antigüedad. */
export interface VacacionRetenida {
    id: number
    empleadoId: number
    nomina: number
    nombre: string
    area: string
    grupo: string
    fecha: string
    antiguedad: number
    corresponden: number
    yaTenia: number
    tieneHoy: number
    estado: 'Pendiente' | 'Aceptada' | 'Descartada'
    fechaCargaExcel: string
    resueltoPor?: string | null
    fechaResolucion?: string | null
    nota?: string | null
}

export interface VacacionesRetenidasResponse {
    tablaExiste: boolean
    retenidas: VacacionRetenida[]
}

export interface ExcesoAntiguedad {
    empleadoId: number
    nomina?: number | null
    nombre: string
    area: string
    grupo: string
    antiguedad: number
    correspondenEmpresa: number
    correspondenComunAcuerdo: number
    tieneEmpresa: number
    tieneComunAcuerdo: number
    exceso: number
    dias: { fecha: string; tipoVacacion: string; observaciones?: string | null; vieneDelExcel: boolean }[]
}

async function unwrap<T>(p: Promise<ApiResponse<unknown>>): Promise<T> {
    const r = (await p) as unknown as ApiResponse<T>
    if (!r.success) throw new Error(r.errorMsg || 'Error en la respuesta del servidor')
    return r.data as T
}

// Los errores de httpClient son objetos { message }, no Error: se pasan a Error
// para que la pantalla siempre pueda mostrar el motivo.
async function conMotivo<T>(p: Promise<T>): Promise<T> {
    try {
        return await p
    } catch (e) {
        const msg = (e as { message?: string } | null)?.message
        throw new Error(msg || 'No se pudo completar la operación')
    }
}

export const vacacionesRetenidasService = {
    obtener: (estado: string, anio?: number) =>
        conMotivo(unwrap<VacacionesRetenidasResponse>(
            httpClient.get(`${BASE}?estado=${encodeURIComponent(estado)}${anio ? `&anio=${anio}` : ''}`)
        )),
    aceptar: (id: number, nota?: string) =>
        conMotivo(httpClient.post<ApiResponse<unknown>>(`${BASE}/${id}/aceptar`, { nota: nota || null })),
    descartar: (id: number, nota?: string) =>
        conMotivo(httpClient.post<ApiResponse<unknown>>(`${BASE}/${id}/descartar`, { nota: nota || null })),
    excesos: (anio: number) =>
        conMotivo(unwrap<ExcesoAntiguedad[]>(httpClient.get(`${BASE}/excesos?anio=${anio}`, undefined, { timeout: 60000 }))),
}
