import { httpClient } from './httpClient'
import type { ApiResponse } from '../interfaces/Api.interface'
import {
    type Solicitud,
    type SolicitudesListResponse,
    type CreateSolicitudRequest,
    type UpdateSolicitudRequest,
    type SolicitudFilters,
    SolicitudStatus,
} from '../interfaces/Solicitudes.interface'

class SolicitudesService {
    private readonly baseUrl = '/api/reprogramacion'

    /**
     * Obtiene la lista de solicitudes de reprogramación con filtros
     */
    async getSolicitudesList(
        filters?: SolicitudFilters
    ): Promise<SolicitudesListResponse> {
        try {
            console.log('Fetching solicitudes list:', { filters })

            const params = new URLSearchParams()

            if (filters?.estado) params.append('estado', filters.estado)
            if (filters?.empleadoId) params.append('empleadoId', filters.empleadoId.toString())
            if (filters?.areaId) params.append('areaId', filters.areaId.toString())
            if (filters?.fechaDesde) params.append('fechaDesde', filters.fechaDesde)
            if (filters?.fechaHasta) params.append('fechaHasta', filters.fechaHasta)

            const url = `${this.baseUrl}/solicitudes${params.toString() ? `?${params.toString()}` : ''}`

            const response = await httpClient.get<ApiResponse<SolicitudesListResponse>>(url)

            console.log('Solicitudes API response:', response)

            if (response.success && response.data) {
                return response.data as unknown as SolicitudesListResponse
            }

            throw new Error('Invalid API response format')
        } catch (error) {
            console.error('Error fetching solicitudes list:', error)
            throw error
        }
    }

    /**
     * Obtiene una solicitud por ID
     */
    async getSolicitudById(id: number): Promise<Solicitud> {
        try {
            console.log('Fetching solicitud by ID:', id)

            const response = await httpClient.get<ApiResponse<Solicitud>>(
                `${this.baseUrl}/solicitud/${id}`
            )

            console.log('Solicitud detail API response:', response)

            if (response.success && response.data) {
                const solicitud = response.data as unknown as Solicitud

                // Si solicitadoPor viene vacío o es "Sistema", intenta obtenerlo de las notificaciones
                if (!solicitud.solicitadoPor || solicitud.solicitadoPor === 'Sistema') {
                    // El backend ya debería incluir esta info en ConsultarSolicitudesAsync
                    // pero si no viene, puedes hacer una llamada adicional
                }

                return solicitud
            }

            throw new Error('Solicitud not found')
        } catch (error) {
            console.error(`Error fetching solicitud ${id}:`, error)
            throw error
        }
    }

    /**
     * Crea una nueva solicitud
     */
    async createSolicitud(solicitudData: CreateSolicitudRequest): Promise<Solicitud> {
        try {
            console.log('Creating solicitud:', solicitudData)

            const response = await httpClient.post<ApiResponse<Solicitud>>(
                this.baseUrl,
                solicitudData
            )

            if (response.success && response.data) {
                return response.data as unknown as Solicitud
            }

            throw new Error('Failed to create solicitud')
        } catch (error) {
            console.error('Error creating solicitud:', error)
            throw error
        }
    }

    /**
     * Actualiza el estado de una solicitud
     */
    async updateSolicitud(id: number, updateData: UpdateSolicitudRequest): Promise<Solicitud> {
        try {
            console.log('Updating solicitud (decision):', { id, updateData })

            const payload = {
                solicitudId: id,
                aprobada: updateData.status === SolicitudStatus.Aprobada,
                motivoRechazo: updateData.comentarios
            }

            const response = await httpClient.post<ApiResponse<any>>(
                `${this.baseUrl}/aprobar`,
                payload
            )

            if (response.success && response.data) {
                const r = response.data as any
                return {
                    id: r.solicitudId ?? id,
                    empleadoId: r.empleadoId ?? 0,
                    nombreEmpleado: r.nombreEmpleado ?? '',
                    nominaEmpleado: '',
                    areaEmpleado: '',
                    grupoEmpleado: '',
                    vacacionOriginalId: r.vacacionOriginalId ?? 0,
                    fechaOriginal: r.fechaOriginal ?? '',
                    fechaNueva: r.fechaNueva ?? '',
                    motivo: r.motivoRechazo ?? '',
                    estadoSolicitud: r.estadoFinal ?? (payload.aprobada ? 'Aprobada' : 'Rechazada'),
                    requiereAprobacion: false,
                    porcentajeCalculado: 0,
                    fechaSolicitud: r.fechaSolicitud ?? r.fechaAprobacion ?? new Date().toISOString(),
                    solicitadoPor: r.aprobadoPor ?? '',
                    fechaAprobacion: r.fechaAprobacion ?? undefined,
                    puedeAprobar: false
                }
            }

            const errorMsg = response.errorMsg || 'Failed to update solicitud'
            throw new Error(errorMsg)
        } catch (error) {
            console.error(`Error updating solicitud ${id}:`, error)
            const msg =
                (error as any)?.message ||
                (error as any)?.errorMsg ||
                (error as any)?.details?.errorMsg ||
                'Error desconocido al actualizar solicitud'
            throw new Error(msg)
        }
    }

    /**
     * Aprueba una solicitud
     */
    async aprobarSolicitud(id: number, comentarios?: string): Promise<Solicitud> {
        return this.updateSolicitud(id, {
            status: SolicitudStatus.Aprobada,
            comentarios
        })
    }

    /**
     * Rechaza una solicitud
     */
    async rechazarSolicitud(id: number, comentarios?: string): Promise<Solicitud> {
        return this.updateSolicitud(id, {
            status: SolicitudStatus.Rechazada,
            comentarios
        })
    }
}

export const solicitudesService = new SolicitudesService()
export default solicitudesService
