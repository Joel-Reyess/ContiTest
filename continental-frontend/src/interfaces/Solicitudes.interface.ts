export enum SolicitudStatus {
  Pendiente = 'Pendiente',
  Aprobada = 'Aprobada',
  Rechazada = 'Rechazada'
}

export enum SolicitudTipo {
  Reprogramacion = 'REPROGRAMACIÓN',
  FestivoTrabajado = 'FESTIVO TRABAJADO'
}

export interface Solicitud {
  id: number;
  empleadoId: number;
  nombreEmpleado: string;
  nominaEmpleado: string;
  areaEmpleado: string;
  grupoEmpleado: string;
  vacacionOriginalId: number;
  fechaOriginal: string;
  fechaNueva: string;
  motivo: string;
  estadoSolicitud: string;
  requiereAprobacion: boolean;
  porcentajeCalculado: number;
  porcentajeDelDia?: number | null;
  fechaSolicitud: string;
  solicitadoPor: string;
  fechaAprobacion?: string;
  puedeAprobar: boolean;
}

export interface SolicitudesListResponse {
  totalSolicitudes: number;
  pendientes: number;
  aprobadas: number;
  rechazadas: number;
  solicitudes: Solicitud[];
}

export interface CreateSolicitudRequest {
  empleadoId: number;
  tipo: SolicitudTipo;
  fechaEvento: string;
  motivo?: string;
}

export interface UpdateSolicitudRequest {
  status: SolicitudStatus;
  comentarios?: string;
}

export interface SolicitudFilters {
  estado?: string;
  empleadoId?: number;
  areaId?: number;
  fechaDesde?: string;
    fechaHasta?: string;
    estadoSolicitud?: string;
}

// ============================================================================
// FESTIVOS TRABAJADOS INTERFACES
// ============================================================================

export interface SolicitudFestivoTrabajado {
  id: number;
  empleadoId: number;
  nombreEmpleado: string;
  nominaEmpleado: string;
  areaEmpleado: string;
  grupoEmpleado: string;
  festivoOriginal: string;
  fechaNueva: string;
  motivo: string;
  estadoSolicitud: string;
  requiereAprobacion: boolean;
  porcentajeCalculado: number;
  fechaSolicitud: string;
  solicitadoPor: string;
  fechaAprobacion?: string;
  aprobadoPor?: string;
  puedeAprobar: boolean;
  tipo: 'FESTIVO_TRABAJADO';
}

// Tipo unión para todas las solicitudes
export type SolicitudUnificada = Solicitud | SolicitudFestivoTrabajado;
