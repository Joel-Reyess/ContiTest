import { httpClient } from './httpClient'
import type { ApiResponse } from '../interfaces/Api.interface'

const BASE = '/api/reprogramacion-dia-empresa'

export type MotivoTipo =
    | 'Incapacidad'
    | 'PermisoDefuncion'
    | 'Paternidad'
    | 'Maternidad'
    | 'PermisoConGoce'
    | 'PermisoSinGoce'
    | 'PermisoSinGoceSueldo'
    | 'AccidenteTrabajo'
    | 'RiesgoTrabajo'
    | 'Suspension'
    | 'Vacacion'
    | 'Otro'

export const MOTIVO_LABEL: Record<MotivoTipo, string> = {
    Incapacidad: 'Inc. Enfermedad General',
    PermisoDefuncion: 'Permiso Defunción',
    Paternidad: 'PCG por Paternidad',
    Maternidad: 'Inc. por Maternidad',
    PermisoConGoce: 'Permiso con Goce',
    PermisoSinGoce: 'Permiso sin Goce',
    PermisoSinGoceSueldo: 'Perm. sin goce de sueldo',
    AccidenteTrabajo: 'Inc. Accidente de Trabajo',
    RiesgoTrabajo: 'Inc. Pble. Riesgo Trabajo',
    Suspension: 'Suspensión',
    Vacacion: 'Vacación',
    Otro: 'Otro (especifica en la justificación)',
}

// Nomenclatura SAP que aparece en el rol semanal cuando se aplica el motivo.
// Misma convención que CatalogoPermisosResponse / PermisosIncapacidadesService.
// El motivo es documental: el día reprogramado se pinta siempre como "C".
export const MOTIVO_NOMENCLATURA: Record<MotivoTipo, string> = {
    Incapacidad: 'E',
    PermisoDefuncion: 'P',
    Paternidad: 'O',
    Maternidad: 'M',
    PermisoConGoce: 'P',
    PermisoSinGoce: 'G',
    PermisoSinGoceSueldo: 'H',
    AccidenteTrabajo: 'A',
    RiesgoTrabajo: 'R',
    Suspension: 'S',
    Vacacion: 'V',
    Otro: '—',
}

// Orden en que se muestran en el selector.
export const MOTIVOS_ORDEN: MotivoTipo[] = [
    'Incapacidad',
    'AccidenteTrabajo',
    'RiesgoTrabajo',
    'Maternidad',
    'Paternidad',
    'PermisoConGoce',
    'PermisoDefuncion',
    'PermisoSinGoce',
    'PermisoSinGoceSueldo',
    'Suspension',
    'Vacacion',
    'Otro',
]

export interface VacacionAsignada {
    id: number
    fecha: string
    tipoVacacion: string
    estadoVacacion: string
    /** El día ya cambió de fecha por edición de días empresa: no se puede volver a mover. */
    yaModificado?: boolean
    /** "Edición empresa" o "Superusuario". */
    origenModificacion?: string
    /** Fecha que tenía antes del último cambio. */
    fechaAntesDelCambio?: string
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

    // Incluye los días ya transcurridos del año en curso: el SuperUsuario sí
    // puede reprogramarlos (el motivo se conoce después de que el día pasó).
    getVacacionesAsignadasReprogramables: (empleadoId: number) =>
        unwrap<VacacionAsignada[]>(httpClient.get(`${BASE}/vacaciones-asignadas/${empleadoId}`)),

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
