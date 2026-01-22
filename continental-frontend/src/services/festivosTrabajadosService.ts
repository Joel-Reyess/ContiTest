/**
 * =============================================================================
 * FESTIVOS TRABAJADOS SERVICE
 * =============================================================================
 * 
 * @description
 * Servicio para manejar todas las operaciones relacionadas con festivos trabajados:
 * - Consultar festivos disponibles para intercambiar
 * - Solicitar intercambio de festivos por vacaciones
 * - Obtener historial de intercambios
 * - Aprobar/rechazar solicitudes (jefes de área)
 * 
 * @author Vulcanics Dev Team
 * @created 2025-09-28
 * =============================================================================
 */

import { httpClient } from './httpClient'
import type { ApiResponse } from '../interfaces/Api.interface'

// ============================================================================
// INTERFACES
// ============================================================================

export interface FestivoTrabajado {
  id: number
  nomina: number
  nombreEmpleado: string
  festivoTrabajado: string
  diaSemana: string
  yaIntercambiado: boolean
  vacacionAsignadaId?: number
  fechaIntercambio?: string
}

export interface FestivosDisponiblesResponse {
  totalFestivos: number
  festivosDisponibles: number
  festivosIntercambiados: number
  festivos: FestivoTrabajado[]
}

export interface IntercambiarFestivoRequest {
  empleadoId: number
  festivoTrabajadoId: number
  fechaNueva: string
  motivo: string
}

export interface IntercambiarFestivoResponse {
  solicitudId: number
  empleadoId: number
  nombreEmpleado: string
  nominaEmpleado: string
  festivoOriginal: string
  fechaNueva: string
  motivo: string
  estadoSolicitud: string
  requiereAprobacion: boolean
  porcentajeCalculado: number
  mensajeValidacion?: string
  fechaSolicitud: string
  solicitadoPor: string
  jefeAreaId: number
  nombreJefeArea: string
  vacacionId?: number
}

export interface SolicitudFestivoTrabajado {
  id: number
  empleadoId: number
  nombreEmpleado: string
  nominaEmpleado: string
  areaEmpleado: string
  grupoEmpleado: string 
  festivoOriginal: string
  fechaNueva: string
  motivo: string
  estadoSolicitud: string
  porcentajeCalculado: number
  fechaSolicitud: string
  fechaAprobacion?: string
  aprobadoPor?: string
}

export interface HistorialFestivosResponse {
  totalSolicitudes: number
  pendientes: number
  aprobadas: number
  rechazadas: number
  solicitudes: SolicitudFestivoTrabajado[]
}

export interface AprobarFestivoRequest {
  solicitudId: number
  aprobada: boolean
  motivoRechazo?: string
}

export interface AprobarFestivoResponse {
  solicitudId: number
  aprobada: boolean
  estadoFinal: string
  empleadoId: number
  nombreEmpleado: string
  festivoOriginal: string
  fechaNueva: string
  motivoRechazo?: string
  fechaAprobacion: string
  aprobadoPor: string
  vacacionCreada: boolean
}

export interface FestivoTrabajadoDto {
    id: number
    nomina: number
    nombreEmpleado: string
    festivoTrabajado: string
    diaSemana: string
    yaIntercambiado: boolean
    vacacionAsignadaId?: number
    fechaIntercambio?: string
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

class FestivosTrabajadosService {
  private readonly baseUrl = '/api/festivos-trabajados'

  /**
   * Obtiene festivos trabajados disponibles para intercambiar
   */
  async getFestivosDisponibles(
    empleadoId?: number,
    nomina?: number,
    anio?: number,
    soloDisponibles: boolean = true
  ): Promise<FestivosDisponiblesResponse> {
    try {
      const params = new URLSearchParams()
      
      if (empleadoId) params.append('empleadoId', empleadoId.toString())
      if (nomina) params.append('nomina', nomina.toString())
      if (anio) params.append('anio', anio.toString())
      params.append('soloDisponibles', soloDisponibles.toString())

      const response = await httpClient.get<ApiResponse<FestivosDisponiblesResponse>>(
        `${this.baseUrl}/disponibles?${params.toString()}`
      )

      if (response.success && response.data) {
        return response.data as unknown as FestivosDisponiblesResponse
      }

      throw new Error(response.errorMsg || 'Error al obtener festivos disponibles')
    } catch (error) {
      console.error('Error fetching festivos disponibles:', error)
      throw error
    }
  }

  /**
   * Solicita el intercambio de un festivo trabajado por un día de vacaciones
   */
  async intercambiarFestivo(request: IntercambiarFestivoRequest): Promise<IntercambiarFestivoResponse> {
    try {
      console.log('Solicitando intercambio de festivo:', request)

      const response = await httpClient.post<ApiResponse<IntercambiarFestivoResponse>>(
        `${this.baseUrl}/intercambiar`,
        request
      )

      console.log('Respuesta de intercambio:', response)

      if (response.success && response.data) {
        return response.data as unknown as IntercambiarFestivoResponse
      }

      throw new Error(response.errorMsg || 'Error al solicitar intercambio')
    } catch (error) {
      console.error('Error intercambiando festivo:', error)
      throw error
    }
  }

  /**
   * Obtiene el historial de festivos intercambiados de un empleado
   */
  async getHistorialFestivos(empleadoId: number, anio?: number): Promise<HistorialFestivosResponse> {
    try {
      const params = anio ? `?anio=${anio}` : ''
      
      const response = await httpClient.get<ApiResponse<HistorialFestivosResponse>>(
        `${this.baseUrl}/historial/${empleadoId}${params}`
      )

      if (response.success && response.data) {
        return response.data as unknown as HistorialFestivosResponse
      }

      throw new Error(response.errorMsg || 'Error al obtener historial')
    } catch (error) {
      console.error('Error fetching historial festivos:', error)
      throw error
    }
  }

  /**
   * Obtiene festivos trabajados por número de nómina
   */
  async getFestivosPorNomina(nomina: number, anio?: number): Promise<FestivosDisponiblesResponse> {
    try {
      const params = anio ? `?anio=${anio}` : ''
      
      const response = await httpClient.get<ApiResponse<FestivosDisponiblesResponse>>(
        `${this.baseUrl}/por-nomina/${nomina}${params}`
      )

      if (response.success && response.data) {
        return response.data as unknown as FestivosDisponiblesResponse
      }

      throw new Error(response.errorMsg || 'Error al obtener festivos por nómina')
    } catch (error) {
      console.error('Error fetching festivos por nomina:', error)
      throw error
    }
  }

  /**
   * Aprueba o rechaza una solicitud de intercambio (solo jefes de área)
   */
  async aprobarSolicitud(request: AprobarFestivoRequest): Promise<AprobarFestivoResponse> {
    try {
      console.log('Aprobando/rechazando solicitud festivo:', request)

      const response = await httpClient.post<ApiResponse<AprobarFestivoResponse>>(
        `${this.baseUrl}/aprobar`,
        request
      )

      console.log('Respuesta de aprobación:', response)

      if (response.success && response.data) {
        return response.data as unknown as AprobarFestivoResponse
      }

      throw new Error(response.errorMsg || 'Error al procesar solicitud')
    } catch (error) {
      console.error('Error aprobando solicitud festivo:', error)
      throw error
    }
  }

  /**
   * Obtiene solicitudes de intercambio con filtros
   */
  async getSolicitudes(filters?: {
    estado?: string
    empleadoId?: number
    areaId?: number
    fechaDesde?: string
    fechaHasta?: string
  }): Promise<SolicitudFestivoTrabajado[]> {
    try {
      const params = new URLSearchParams()
      
      if (filters?.estado) params.append('estado', filters.estado)
      if (filters?.empleadoId) params.append('empleadoId', filters.empleadoId.toString())
      if (filters?.areaId) params.append('areaId', filters.areaId.toString())
      if (filters?.fechaDesde) params.append('fechaDesde', filters.fechaDesde)
      if (filters?.fechaHasta) params.append('fechaHasta', filters.fechaHasta)

      const response = await httpClient.get<ApiResponse<SolicitudFestivoTrabajado[]>>(
        `${this.baseUrl}/solicitudes?${params.toString()}`
      )

      if (response.success && response.data) {
        return response.data as unknown as SolicitudFestivoTrabajado[]
      }

      return []
    } catch (error) {
      console.error('Error fetching solicitudes festivos:', error)
      return []
    }
  }

  /**
   * Obtiene solicitudes pendientes del área del jefe actual
   */
  async getSolicitudesPendientes(): Promise<SolicitudFestivoTrabajado[]> {
    try {
      const response = await httpClient.get<ApiResponse<SolicitudFestivoTrabajado[]>>(
        `${this.baseUrl}/pendientes`
      )

      if (response.success && response.data) {
        return response.data as unknown as SolicitudFestivoTrabajado[]  
      }

      return []
    } catch (error) {
      console.error('Error fetching solicitudes pendientes:', error)
      return []
    }
  }
}

// ============================================================================
// EXPORT SINGLETON
// ============================================================================

export const festivosTrabajadosService = new FestivosTrabajadosService()
