import { httpClient } from './httpClient'
import type { ApiResponse } from '@/interfaces/Api.interface'

const BASE = '/api/reglas-domingo'

/**
 * SinDomingo = paro sin asignaciones (descanso para todos); RolNormal = excepción,
 * se trabaja según el rol; ParoEmpresa = paro con días por la empresa (la
 * asignación los pone ahí a quien lo trabajaba por rol); ParoOperador = paro, el
 * operador elige (no se asignan días por la empresa, el operador puede programar).
 */
export type TipoReglaDomingo = 'SinDomingo' | 'RolNormal' | 'ParoEmpresa' | 'ParoOperador'
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
    /** Solo activas: en cuántos de sus sábados/domingos manda (otra más corta o de grupo le gana los demás). */
    diasQueManda?: number | null
    diasDelPeriodo?: number | null
    /** Las reglas que le ganan los otros días, con cuántos. */
    ganadaPor?: string[]
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
    t === 'SinDomingo'
        ? 'Paro sin asignaciones'
        : t === 'ParoEmpresa'
          ? 'Paro con días por la empresa'
          : t === 'ParoOperador'
            ? 'Paro, el operador elige sus días'
            : 'Rol normal (excepción)'

/** Los tres paros: ese día no se trabaja. */
export const esTipoParo = (t: TipoReglaDomingo) => t === 'SinDomingo' || t === 'ParoEmpresa' || t === 'ParoOperador'

export const nombreDiaAplicacion = (d: DiaAplicacion) =>
    d === 'Sabado' ? 'Sábado' : d === 'Ambos' ? 'Sábado y domingo' : 'Domingo'

export interface ResultadoReglasDomingo {
    creadas: number
    /** Había una de la misma unidad y mismas fechas con otro tipo: quedó desactivada. */
    reemplazadas: number
    /** Ya había una igual: no se duplicó. */
    yaExistian: number
    /** Unidades donde la regla nueva no manda en todos sus días porque otra regla le gana. */
    avisos?: string[]
}

/** Día por la empresa en un sábado/domingo de paro (reporte por unidad organizativa). */
export interface DiaEmpresaEnParo {
    vacacionId: number
    empleadoId: number
    nomina?: number | null
    nombre: string
    areaId: number
    area: string
    grupo: string
    fecha: string
    /** Turno que le tocaba ese día por su rol. */
    turno: string
    /** EnParo = sigue siendo paro; SeTrabaja = se habilitó ese día (hay que moverlo); OtroParo = ahora es otro paro. */
    situacion: 'EnParo' | 'SeTrabaja' | 'OtroParo'
    detalle: string
}

/** Día por la empresa ya movido (machote o reprogramación). */
export interface MovimientoDiaEmpresa {
    id: number
    empleadoId: number
    nomina?: number | null
    nombre: string
    areaId?: number | null
    area: string
    grupo: string
    fechaAnterior: string
    fechaNueva: string
    motivo: string
    como: 'Machote' | 'Reprogramación' | string
    quien?: string | null
    cuando: string
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
    /** Reporte por unidad: días por la empresa en sábados/domingos de paro y si ese día ya se trabaja. */
    diasEmpresaEnParo: (anio: number, areaId?: number) =>
        unwrap<DiaEmpresaEnParo[]>(
            httpClient.get(`${BASE}/dias-empresa-en-paro?anio=${anio}${areaId ? `&areaId=${areaId}` : ''}`, undefined, { timeout: 60000 })
        ),
    /** Días por la empresa ya movidos en el año: fecha anterior, fecha nueva, motivo y quién. */
    movimientosDiasEmpresa: (anio: number, areaId?: number) =>
        unwrap<MovimientoDiaEmpresa[]>(
            httpClient.get(`${BASE}/movimientos-dias-empresa?anio=${anio}${areaId ? `&areaId=${areaId}` : ''}`, undefined, { timeout: 60000 })
        ),
}
