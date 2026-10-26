/**
 * Solicitudes que el jefe revisa con el formato de "Solicitudes de
 * Reprogramaciones" (oct-2026): misma tabla (nómina, nombre, área, grupo, fechas,
 * estado, % turno, % día) y "Ver solicitud" con el detalle y el calendario del
 * área. Cada tipo sigue usando sus propios endpoints para listar y aprobar; aquí
 * solo se traducen a una fila común.
 */
import { MOTIVO_LABEL, reprogramacionDiaEmpresaService, type MotivoTipo } from '@/services/reprogramacionDiaEmpresaService'
import { reprogramacionPostIncapacidadService } from '@/services/reprogramacionPostIncapacidadService'
import { vacacionLaboradaService } from '@/services/vacacionLaboradaService'
import { edicionDiasEmpresaService } from '@/services/edicionDiasEmpresaService'
import { solicitudesPermisosService } from '@/services/solicitudesPermisosService'
import { porcentajesSolicitudesService } from '@/services/porcentajesSolicitudesService'
import { format, parseISO } from 'date-fns'

export type TipoSolicitudOficial = 'permisos' | 'vacacion-laborada' | 'post-incapacidad' | 'dia-empresa' | 'edicion-dias'

export interface FilaSolicitudOficial {
    tipo: TipoSolicitudOficial
    id: number
    empleadoId: number
    nominaEmpleado: string
    nombreEmpleado: string
    areaEmpleado: string
    grupoEmpleado: string
    fechaSolicitud: string
    fechaOriginal: string
    fechaNueva: string
    estadoSolicitud: string
    motivo?: string | null
    solicitadoPor?: string | null
    fechaRespuesta?: string | null
    respondidoPor?: string | null
    motivoRechazo?: string | null
    /** Datos propios del tipo que se muestran en el detalle. */
    detalles: { etiqueta: string; valor: string }[]
    porcentajeCalculado?: number | null
    porcentajeDelDia?: number | null
    /** Límite que rige ese día para su grupo (para el semáforo). */
    porcentajeMaximoPermitido?: number | null
}

export interface DefinicionSolicitudOficial {
    titulo: string
    /** Encabezados de las dos fechas; por defecto "Fecha Original" / "Fecha Nueva". */
    etiquetas?: { fechaOriginal: string; fechaNueva: string }
    /** Día con el que se calculan % turno y % día: la fecha nueva, o en permisos el primer día. */
    fechaPorcentaje?: 'original' | 'nueva'
    /** Lo que dice el modal de aprobación ("Tipo: …"). */
    nombre: string
    cargar: () => Promise<FilaSolicitudOficial[]>
    aprobar: (id: number) => Promise<unknown>
    rechazar: (id: number, motivo: string) => Promise<unknown>
    mensajeAprobada: string
}

const fechaCorta = (iso?: string | null) => {
    if (!iso) return ''
    try {
        return format(parseISO(iso.slice(0, 10)), 'dd/MM/yyyy')
    } catch {
        return iso
    }
}

const texto = (v: unknown) => (v == null ? '' : String(v))

export const SOLICITUDES_OFICIALES: Record<TipoSolicitudOficial, DefinicionSolicitudOficial> = {
    permisos: {
        titulo: 'Solicitudes de Permisos',
        nombre: 'Permiso',
        etiquetas: { fechaOriginal: 'Desde', fechaNueva: 'Hasta' },
        fechaPorcentaje: 'original',
        mensajeAprobada: 'Solicitud aprobada exitosamente',
        cargar: async () =>
            ((await solicitudesPermisosService.consultarSolicitudes({})).solicitudes ?? []).map((s) => ({
                tipo: 'permisos' as const,
                id: s.id,
                // Este listado solo trae la nómina; área, grupo y % se completan por nómina.
                empleadoId: 0,
                nominaEmpleado: texto(s.nominaEmpleado),
                nombreEmpleado: texto(s.nombreEmpleado),
                areaEmpleado: '',
                grupoEmpleado: '',
                fechaSolicitud: s.fechaSolicitud,
                fechaOriginal: s.fechaInicio,
                fechaNueva: s.fechaFin,
                estadoSolicitud: s.estado,
                motivo: s.observaciones,
                solicitadoPor: s.delegadoNombre,
                fechaRespuesta: s.fechaRespuesta,
                respondidoPor: s.jefeAreaNombre,
                motivoRechazo: s.motivoRechazo,
                detalles: [
                    {
                        etiqueta: 'Tipo de permiso',
                        valor: [s.claveVisualizacion, s.descripcionPermiso].filter(Boolean).join(' · '),
                    },
                ],
            })),
        aprobar: (id) => solicitudesPermisosService.responderSolicitud({ solicitudId: id, aprobar: true }),
        rechazar: (id, motivo) =>
            solicitudesPermisosService.responderSolicitud({ solicitudId: id, aprobar: false, motivoRechazo: motivo }),
    },
    'vacacion-laborada': {
        titulo: 'Solicitudes de Vacación Laborada',
        nombre: 'Vacación laborada',
        mensajeAprobada: 'Solicitud aprobada y vacación reprogramada',
        cargar: async () =>
            (await vacacionLaboradaService.getSolicitudesArea()).map((s) => ({
                tipo: 'vacacion-laborada' as const,
                id: s.id,
                empleadoId: s.empleadoId,
                nominaEmpleado: texto(s.nomina),
                nombreEmpleado: texto(s.nombreEmpleado),
                areaEmpleado: texto(s.areaEmpleado),
                grupoEmpleado: texto(s.grupoEmpleado),
                fechaSolicitud: s.fechaSolicitud,
                fechaOriginal: s.fechaOriginal,
                fechaNueva: s.fechaNueva,
                estadoSolicitud: s.estadoSolicitud,
                motivo: s.motivo,
                solicitadoPor: s.nombreSolicitadoPor,
                fechaRespuesta: s.fechaRespuesta,
                respondidoPor: s.nombreAprobadoPor,
                motivoRechazo: s.motivoRechazo,
                detalles: [{ etiqueta: 'Día trabajado', valor: fechaCorta(s.fechaOriginal) }],
            })),
        aprobar: (id) => vacacionLaboradaService.aprobarRechazar({ solicitudId: id, aprobada: true }),
        rechazar: (id, motivo) =>
            vacacionLaboradaService.aprobarRechazar({ solicitudId: id, aprobada: false, motivoRechazo: motivo }),
    },
    'post-incapacidad': {
        titulo: 'Solicitudes de Reprogramación post-incapacidad',
        nombre: 'Reprogramación post-incapacidad',
        mensajeAprobada: 'Solicitud aprobada y vacación reprogramada',
        cargar: async () =>
            (await reprogramacionPostIncapacidadService.getSolicitudesArea()).map((s) => ({
                tipo: 'post-incapacidad' as const,
                id: s.id,
                empleadoId: s.empleadoId,
                nominaEmpleado: texto(s.nomina),
                nombreEmpleado: texto(s.nombreEmpleado),
                areaEmpleado: texto(s.areaEmpleado),
                grupoEmpleado: texto(s.grupoEmpleado),
                fechaSolicitud: s.fechaSolicitud,
                fechaOriginal: s.fechaOriginal,
                fechaNueva: s.fechaNueva,
                estadoSolicitud: s.estadoSolicitud,
                motivo: s.motivo,
                solicitadoPor: s.nombreSolicitadoPor,
                fechaRespuesta: s.fechaRespuesta,
                respondidoPor: s.nombreAprobadoPor,
                motivoRechazo: s.motivoRechazo,
                detalles: [
                    {
                        etiqueta: 'Incapacidad',
                        valor: `${fechaCorta(s.permisoDesde)} al ${fechaCorta(s.permisoHasta)}${s.permisoClase ? ` · ${s.permisoClase}` : ''}`,
                    },
                ],
            })),
        aprobar: (id) => reprogramacionPostIncapacidadService.aprobarRechazar({ solicitudId: id, aprobada: true }),
        rechazar: (id, motivo) =>
            reprogramacionPostIncapacidadService.aprobarRechazar({ solicitudId: id, aprobada: false, motivoRechazo: motivo }),
    },
    'dia-empresa': {
        titulo: 'Solicitudes de Reprogramación día empresa',
        nombre: 'Reprogramación día empresa',
        mensajeAprobada: 'Solicitud aprobada. Día empresa reprogramado y reflejado como "C".',
        cargar: async () =>
            (await reprogramacionDiaEmpresaService.getSolicitudesArea()).map((s) => ({
                tipo: 'dia-empresa' as const,
                id: s.id,
                empleadoId: s.empleadoId,
                nominaEmpleado: texto(s.nomina),
                nombreEmpleado: texto(s.nombreEmpleado),
                areaEmpleado: texto(s.areaEmpleado),
                grupoEmpleado: texto(s.grupoEmpleado),
                fechaSolicitud: s.fechaSolicitud,
                fechaOriginal: s.fechaOriginal,
                fechaNueva: s.fechaNueva,
                estadoSolicitud: s.estadoSolicitud,
                motivo: s.justificacion,
                solicitadoPor: s.nombreSolicitadoPor,
                fechaRespuesta: s.fechaRespuesta,
                respondidoPor: s.nombreAprobadoPor,
                motivoRechazo: s.motivoRechazo,
                detalles: [
                    { etiqueta: 'Tipo de motivo', valor: MOTIVO_LABEL[s.motivoTipo as MotivoTipo] ?? texto(s.motivoTipo) },
                ],
            })),
        aprobar: (id) => reprogramacionDiaEmpresaService.aprobarRechazar({ solicitudId: id, aprobada: true }),
        rechazar: (id, motivo) =>
            reprogramacionDiaEmpresaService.aprobarRechazar({ solicitudId: id, aprobada: false, motivoRechazo: motivo }),
    },
    'edicion-dias': {
        titulo: 'Solicitudes de Edición Días Empresa',
        nombre: 'Edición de día empresa',
        mensajeAprobada: 'Solicitud aprobada',
        cargar: async () =>
            (await edicionDiasEmpresaService.obtenerSolicitudesArea()).map((s) => ({
                tipo: 'edicion-dias' as const,
                id: s.id,
                empleadoId: s.empleadoId,
                nominaEmpleado: texto(s.nominaEmpleado),
                nombreEmpleado: texto(s.nombreEmpleado),
                // Este listado no trae área ni grupo: los completa el cálculo de porcentajes.
                areaEmpleado: '',
                grupoEmpleado: '',
                fechaSolicitud: s.fechaSolicitud,
                fechaOriginal: s.fechaOriginal,
                fechaNueva: s.fechaNueva,
                estadoSolicitud: s.estadoSolicitud,
                motivo: s.observacionesEmpleado,
                solicitadoPor: s.nombreSolicitadoPor,
                fechaRespuesta: s.fechaRespuesta,
                respondidoPor: s.nombreJefeArea,
                motivoRechazo: s.motivoRechazo,
                detalles: s.observacionesJefe ? [{ etiqueta: 'Observaciones del jefe', valor: s.observacionesJefe }] : [],
            })),
        aprobar: (id) => edicionDiasEmpresaService.responderSolicitud({ solicitudId: id, aprobar: true }),
        rechazar: (id, motivo) =>
            edicionDiasEmpresaService.responderSolicitud({ solicitudId: id, aprobar: false, motivoRechazo: motivo }),
    },
}

export const esTipoSolicitudOficial = (t: string | undefined): t is TipoSolicitudOficial =>
    !!t && t in SOLICITUDES_OFICIALES

/**
 * Agrega % Turno, % Día y, si faltan, área y grupo. Si el cálculo falla, las
 * filas se regresan igual (sin porcentajes): la lista nunca se queda vacía por esto.
 */
export async function completarPorcentajes(filas: FilaSolicitudOficial[]): Promise<FilaSolicitudOficial[]> {
    try {
        const resultado = await porcentajesSolicitudesService.calcular(
            filas.map((f) => ({
                clave: `${f.tipo}-${f.id}`,
                empleadoId: f.empleadoId,
                nomina: Number(f.nominaEmpleado) || undefined,
                fecha: (SOLICITUDES_OFICIALES[f.tipo].fechaPorcentaje === 'original' ? f.fechaOriginal : f.fechaNueva).slice(0, 10),
            }))
        )
        const porClave = new Map(resultado.map((r) => [r.clave, r]))
        return filas.map((f) => {
            const r = porClave.get(`${f.tipo}-${f.id}`)
            if (!r) return f
            return {
                ...f,
                areaEmpleado: f.areaEmpleado || r.area,
                grupoEmpleado: f.grupoEmpleado || r.grupo,
                porcentajeCalculado: r.porcentajeTurno ?? null,
                porcentajeDelDia: r.porcentajeDia ?? null,
                porcentajeMaximoPermitido: r.porcentajeMaximo ?? null,
            }
        })
    } catch (e) {
        console.error('No se pudieron calcular los porcentajes de las solicitudes', e)
        return filas
    }
}

/** Los errores de httpClient son objetos { message }, no Error. */
export const motivoDeError = (e: unknown, porDefecto: string) =>
    (e as { message?: string } | null)?.message || porDefecto
