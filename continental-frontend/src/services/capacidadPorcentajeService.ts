import { httpClient } from './httpClient'
import type { ApiResponse } from '@/interfaces/Api.interface'

const BASE = '/api/capacidad-porcentaje'

export type AlcanceCapacidad = 'Planta' | 'Area' | 'Grupo'
export type PeriodoCapacidad = 'Dia' | 'Semana' | 'Mes' | 'Anio'
/**
 * Contra qué se mide el %: 'Grupo' = cada grupo contra su plantilla (lo de siempre);
 * 'Dia' = solo área: todo el personal de los grupos del área que ese día trabajan.
 */
export type MedicionCapacidad = 'Grupo' | 'Dia'

export const nombrePeriodoCapacidad = (p: string) =>
    p === 'Dia' ? 'Día' : p === 'Anio' ? 'Año' : p
/** A qué días aplica: solo los que asigna la empresa, solo los que programan los operadores, o ambos. */
export type AplicaCapacidad = 'Ambos' | 'Empresa' | 'Operador'
/** null o '' = todo el día; '1' | '2' | '3' = solo el grupo que ese día va en ese turno por su rol. */
export type TurnoCapacidad = '' | '1' | '2' | '3'

export const nombreTurnoCapacidad = (t?: string | null) =>
    t === '1' ? 'Primer turno' : t === '2' ? 'Segundo turno' : t === '3' ? 'Tercer turno' : 'Todo el día'

/** Porcentaje distinto al general durante un día, semana o mes (planta, área o grupo). */
export interface CapacidadPorcentaje {
    id: number
    alcance: AlcanceCapacidad
    aplicaA: AplicaCapacidad
    turno?: string | null
    areaId?: number | null
    area?: string | null
    grupoId?: number | null
    grupo?: string | null
    periodo: PeriodoCapacidad
    medicion?: MedicionCapacidad
    fechaInicio: string
    fechaFin: string
    /** De año y se repite cada año (sin fecha final). */
    cadaAnio?: boolean
    porcentaje: number
    motivo?: string | null
    activa: boolean
    creadoPor?: string | null
    fechaCreacion: string
    desactivadoPor?: string | null
    fechaDesactivacion?: string | null
    modificadoPor?: string | null
    fechaModificacion?: string | null
    descripcion: string
}

export interface CapacidadesPorcentajeResponse {
    tablaExiste: boolean
    porcentajeGeneral: number
    anioPreparacion?: number | null
    porcentajePreparacion?: number | null
    /** Falta correr ese script: no se puede guardar por día, por año ni editar. */
    faltaScript?: string | null
    capacidades: CapacidadPorcentaje[]
}

/** Vista previa "por día": grupos del área que trabajan ese día y cuántas personas suman. */
export interface PersonalDelDia {
    fecha: string
    dia: string
    total: number
    grupos: { grupoId: number; grupo: string; turno: string; personas: number }[]
    maximoAusentes?: number | null
}

export interface CrearCapacidadRequest {
    alcance: AlcanceCapacidad
    aplicaA: AplicaCapacidad
    /** Sin turno = todo el día. */
    turno?: '1' | '2' | '3'
    areaId?: number
    grupoId?: number
    periodo: PeriodoCapacidad
    /** Solo área y todo el día; sin valor = por grupo. */
    medicion?: MedicionCapacidad
    fechaInicio: string
    /** Día: último día (hasta 31). Semana: último día (hasta 7); sin ella, de lunes a domingo. */
    fechaFin?: string
    /** Año: se repite cada año desde el de fechaInicio, sin fecha final. */
    cadaAnio?: boolean
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
    /** Editar en su lugar (sin desactivar y volver a capturar). */
    actualizar: (id: number, req: CrearCapacidadRequest) => unwrap<unknown>(httpClient.put(`${BASE}/${id}`, req)),
    /** Grupos del área que trabajan cada día desde `desde` (yyyy-MM-dd) y cuántas personas suman. */
    personalDelDia: (areaId: number, desde: string, dias = 7, porcentaje?: number) =>
        unwrap<PersonalDelDia[]>(
            httpClient.get(
                `${BASE}/personal-dia?areaId=${areaId}&desde=${desde}&dias=${dias}${porcentaje ? `&porcentaje=${porcentaje}` : ''}`
            )
        ),
    desactivar: (id: number) => unwrap<unknown>(httpClient.post(`${BASE}/${id}/desactivar`, {})),
    reactivar: (id: number) => unwrap<unknown>(httpClient.post(`${BASE}/${id}/reactivar`, {})),
    /** Límite de un grupo día por día (yyyy-MM-dd). */
    limites: (grupoId: number, desde: string, hasta: string) =>
        unwrap<LimiteDia[]>(httpClient.get(`${BASE}/limites?grupoId=${grupoId}&desde=${desde}&hasta=${hasta}`)),
}
