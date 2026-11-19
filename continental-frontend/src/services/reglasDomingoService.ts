import { httpClient } from './httpClient'
import type { ApiResponse } from '@/interfaces/Api.interface'

const BASE = '/api/reglas-domingo'

/**
 * SinDomingo = paro sin asignaciones (descanso para todos); RolNormal = excepción,
 * se trabaja según el rol; ParoEmpresa = paro con días por la empresa (todavía no
 * se puede guardar).
 */
export type TipoReglaDomingo = 'SinDomingo' | 'RolNormal' | 'ParoEmpresa'
/** A qué días de la semana aplica la regla. */
export type DiaAplicacion = 'Domingo' | 'Sabado' | 'Ambos'

/** Regla dominical de una unidad organizativa (o un grupo) en un periodo. */
export interface ReglaDomingo {
    id: number
    areaId: number
    area: string
    grupoId?: number | null
    grupo?: string | null
    tipo: TipoReglaDomingo
    incluyeSabado: boolean
    /** Backends anteriores no lo mandan: se toma de incluyeSabado. */
    diaAplicacion?: DiaAplicacion
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
    /** Todas las unidades organizativas (se ignoran areaIds y grupoId). */
    todaLaPlanta?: boolean
    grupoId?: number
    tipo: TipoReglaDomingo
    incluyeSabado: boolean
    diaAplicacion: DiaAplicacion
    fechaInicio: string
    fechaFin: string
    motivo?: string
}

/** Día de aplicación de una regla (las de antes: domingo, y sábado si incluyeSabado). */
export const diaDeRegla = (r: Pick<ReglaDomingo, 'diaAplicacion' | 'incluyeSabado'>): DiaAplicacion =>
    r.diaAplicacion ?? (r.incluyeSabado ? 'Ambos' : 'Domingo')

/** Nombres en pantalla ("Reglas de trabajo y asignación de días", nov-2026). */
export const nombreTipoRegla = (t: TipoReglaDomingo) =>
    t === 'SinDomingo' ? 'Paro sin asignaciones' : t === 'ParoEmpresa' ? 'Paro con días por la empresa' : 'Rol normal (excepción)'

export const nombreDiaAplicacion = (d: DiaAplicacion) =>
    d === 'Sabado' ? 'Sábado' : d === 'Ambos' ? 'Sábado y domingo' : 'Domingo'

export interface ResultadoReglasDomingo {
    creadas: number
    /** Había una de la misma unidad y mismas fechas con otro tipo: quedó desactivada. */
    reemplazadas: number
    /** Ya había una igual: no se duplicó. */
    yaExistian: number
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
    crear: (req: CrearReglaDomingoRequest) => unwrap<ResultadoReglasDomingo>(httpClient.post(BASE, req)),
    /** Desactiva o reactiva de una vez las reglas que se guardaron juntas. */
    cambiarEstado: (ids: number[], activa: boolean) => unwrap<number>(httpClient.post(`${BASE}/estado`, { ids, activa })),
    desactivar: (id: number) => unwrap<unknown>(httpClient.post(`${BASE}/${id}/desactivar`, {})),
    reactivar: (id: number) => unwrap<unknown>(httpClient.post(`${BASE}/${id}/reactivar`, {})),
    delEmpleado: (empleadoId: number, anio: number) =>
        unwrap<ReglaDomingo[]>(httpClient.get(`${BASE}/empleado/${empleadoId}?anio=${anio}`)),
    vacacionesAfectadas: (anio: number) =>
        unwrap<VacacionEnNoLaborable[]>(httpClient.get(`${BASE}/vacaciones-afectadas?anio=${anio}`, undefined, { timeout: 60000 })),
}
