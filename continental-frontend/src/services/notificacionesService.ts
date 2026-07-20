import { httpClient } from './httpClient';
import type { ApiResponse } from '../interfaces/Api.interface';

// Enums
export enum TipoNotificacion {
  RegistroVacaciones = 1,
  SolicitudSuplente = 2,
  CambioDeManning = 3,
  SolicitudReprogramacion = 4,
  AprobacionReprogramacion = 5,
  RechazoReprogramacion = 6,
  SolicitudFestivoTrabajado = 7,
  SolicitudIntercambioDiaFestivo = 8, // legacy
  SistemaBloques = 9,
  SolicitudPermiso = 10,
  RespuestaSolicitud = 11,
  SolicitudEdicionDiaEmpresa = 12,
  RespuestaEdicionDiaEmpresa = 13,
  CambioAreaEmpleadoSAP = 14,
  NuevaReglaSAP = 15
}

export enum EstatusNotificacion {
  NoLeida = 0,
  Leida = 1,
  Archivada = 2
}

// Interfaces
export interface Area {
  areaId: number;
  nombreGeneral: string;
}

export interface Grupo {
  grupoId: number;
  rol: string;
}

export interface Notificacion {
  id: number;
  tipoDeNotificacion: number;
  tipoNotificacionTexto: string;
  titulo: string;
  mensaje: string;
  nombreEmisor: string;
  fechaAccion: string;
  estatus: number;
  estatusTexto: string;
  tipoMovimiento?: string;
  area?: Area;
  grupo?: Grupo;
  idSolicitud?: number;
  puedeMarcarLeida: boolean;
  puedeArchivar: boolean;
}

export interface EstadisticasPorTipo {
  RegistroVacaciones?: number;
  SolicitudReprogramacion?: number;
  SistemaBloques?: number;
  AprobacionReprogramacion?: number;
  RechazoReprogramacion?: number;
  SolicitudSuplente?: number;
  CambioDeManning?: number;
  SolicitudFestivoTrabajado?: number;
  SolicitudIntercambioDiaFestivo?: number;
}

export interface EstadisticasPorArea {
  [key: string]: number;
}

export interface EstadisticasPorGrupo {
  [key: string]: number;
}

export interface Estadisticas {
  totalNotificaciones: number;
  noLeidas: number;
  leidas: number;
  archivadas: number;
  porTipo: EstadisticasPorTipo;
  porArea: EstadisticasPorArea;
  porGrupo: EstadisticasPorGrupo;
  ultimaNotificacion?: Notificacion;
}

export interface ObtenerNotificacionesRequest {
  tipoNotificacion?: number;
  estatus?: number;
  areaId?: number;
  grupoId?: number;
  fechaInicio?: string;
  fechaFin?: string;
  pagina?: number;
  tamañoPagina?: number;
  ordenarPor?: string;
  direccionOrden?: 'ASC' | 'DESC';
}

export interface ObtenerNotificacionesResponse {
  notificaciones: Notificacion[];
  totalNotificaciones: number;
  paginaActual: number;
  tamañoPagina: number;
  totalPaginas: number;
  tienePaginaAnterior: boolean;
  tienePaginaSiguiente: boolean;
  estadisticas: Estadisticas;
  rolUsuario: string;
  areasAccesibles: number[];
  gruposAccesibles: number[];
}

export interface EstadisticasResponse {
  totalNotificaciones: number;
  noLeidas: number;
  leidas: number;
  archivadas: number;
  porTipo: EstadisticasPorTipo;
  porArea: EstadisticasPorArea;
  porGrupo: EstadisticasPorGrupo;
  ultimaNotificacion?: Notificacion;
}

// Service
class NotificacionesService {
  /**
   * Obtiene las notificaciones según el rol del usuario autenticado con filtros y paginación
   */
  async obtenerNotificaciones(params: ObtenerNotificacionesRequest = {}): Promise<ApiResponse<ObtenerNotificacionesResponse>> {
    try {
      const defaultParams = {
        pagina: 1,
        tamañoPagina: 20,
        ordenarPor: 'FechaAccion',
        direccionOrden: 'DESC' as const,
        ...params
      };

      const response: ApiResponse<ObtenerNotificacionesResponse> = await httpClient.post<ObtenerNotificacionesResponse>(
        '/api/notificaciones/obtener',
        defaultParams
      );
      return response;
    } catch (error: any) {
      console.error('Error obteniendo notificaciones:', error);
      return {
        success: false,
        data: undefined,
        errorMsg: error.response?.data?.errorMsg || 'Error al obtener las notificaciones'
      };
    }
  }

  /**
   * Marca una notificación como leída
   */
  async marcarComoLeida(notificacionId: number): Promise<ApiResponse<null>> {
    try {
      const response: ApiResponse<null> = await httpClient.patch<null>(
        `/api/notificaciones/marcar-leida/${notificacionId}`
      );
      return response;
    } catch (error: any) {
      console.error('Error marcando notificación como leída:', error);
      return {
        success: false,
        data: undefined,
        errorMsg: error.response?.data?.errorMsg || 'Error al marcar la notificación como leída'
      };
    }
  }

  /**
   * Archiva una notificación
   */
  async archivar(notificacionId: number): Promise<ApiResponse<null>> {
    try {
      const response: ApiResponse<null> = await httpClient.patch<null>(
        `/api/notificaciones/archivar/${notificacionId}`
      );
      return response;
    } catch (error: any) {
      console.error('Error archivando notificación:', error);
      return {
        success: false,
        data: undefined,
        errorMsg: error.response?.data?.errorMsg || 'Error al archivar la notificación'
      };
    }
  }

  /**
   * Obtiene estadísticas de notificaciones del usuario actual
   */
  async obtenerEstadisticas(): Promise<ApiResponse<EstadisticasResponse>> {
    try {
      const response: ApiResponse<EstadisticasResponse> = await httpClient.get<EstadisticasResponse>(
        '/api/notificaciones/estadisticas'
      );
      return response;
    } catch (error: any) {
      console.error('Error obteniendo estadísticas de notificaciones:', error);
      return {
        success: false,
        data: undefined,
        errorMsg: error?.response?.data?.errorMsg || 'Error al obtener las estadísticas'
      };
    }
  }

  /**
   * Obtiene el texto del tipo de notificación
{{ ... }}
  getTipoNotificacionTexto(tipo: TipoNotificacion): string {
    const tipos: { [key in TipoNotificacion]: string } = {
      [TipoNotificacion.RegistroVacaciones]: 'Registro de Vacaciones',
      [TipoNotificacion.SolicitudSuplente]: 'Solicitud de Suplente',
      [TipoNotificacion.CambioDeManning]: 'Cambio de Manning',
      [TipoNotificacion.SolicitudReprogramacion]: 'Solicitud de Reprogramación',
      [TipoNotificacion.AprobacionReprogramacion]: 'Aprobación de Reprogramación',
      [TipoNotificacion.RechazoReprogramacion]: 'Rechazo de Reprogramación',
      [TipoNotificacion.SolicitudFestivoTrabajado]: 'Solicitud de Festivo Trabajado',
      [TipoNotificacion.SolicitudIntercambioDiaFestivo]: 'Solicitud de Intercambio de Día Festivo',
      [TipoNotificacion.SistemaBloques]: 'Sistema de Bloques'
    };
    return tipos[tipo] || 'Desconocido';
  }

  /**
   * Obtiene el texto del estatus de notificación
   */
  getEstatusTexto(estatus: EstatusNotificacion): string {
    const estatusMap: { [key in EstatusNotificacion]: string } = {
      [EstatusNotificacion.NoLeida]: 'No Leída',
      [EstatusNotificacion.Leida]: 'Leída',
      [EstatusNotificacion.Archivada]: 'Archivada'
    };
    return estatusMap[estatus] || 'Desconocido';
  }

  /**
   * Obtiene el color del badge según el tipo de notificación
   */
  getTipoNotificacionColor(tipo: TipoNotificacion): string {
    const colores: { [key in TipoNotificacion]: string } = {
      [TipoNotificacion.RegistroVacaciones]: 'primary',
      [TipoNotificacion.SolicitudSuplente]: 'info',
      [TipoNotificacion.CambioDeManning]: 'warning',
      [TipoNotificacion.SolicitudReprogramacion]: 'secondary',
      [TipoNotificacion.AprobacionReprogramacion]: 'success',
      [TipoNotificacion.RechazoReprogramacion]: 'danger',
      [TipoNotificacion.SolicitudFestivoTrabajado]: 'primary',
      [TipoNotificacion.SolicitudIntercambioDiaFestivo]: 'info',
      [TipoNotificacion.SistemaBloques]: 'dark'
    };
    return colores[tipo] || 'secondary';
  }

  /**
   * Obtiene el ícono según el tipo de notificación
   */
  getTipoNotificacionIcon(tipo: TipoNotificacion): string {
    const iconos: { [key in TipoNotificacion]: string } = {
      [TipoNotificacion.RegistroVacaciones]: 'bi-calendar-check',
      [TipoNotificacion.SolicitudSuplente]: 'bi-person-plus',
      [TipoNotificacion.CambioDeManning]: 'bi-people-fill',
      [TipoNotificacion.SolicitudReprogramacion]: 'bi-calendar-week',
      [TipoNotificacion.AprobacionReprogramacion]: 'bi-check-circle',
      [TipoNotificacion.RechazoReprogramacion]: 'bi-x-circle',
      [TipoNotificacion.SolicitudFestivoTrabajado]: 'bi-calendar-event',
      [TipoNotificacion.SolicitudIntercambioDiaFestivo]: 'bi-arrow-left-right',
      [TipoNotificacion.SistemaBloques]: 'bi-grid-3x3-gap'
    };
    return iconos[tipo] || 'bi-bell';
  }
}

export default new NotificacionesService();