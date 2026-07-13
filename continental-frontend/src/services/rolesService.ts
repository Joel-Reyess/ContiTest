import { httpClient } from './httpClient';
import type { ApiResponse } from '@/interfaces/Api.interface';

export interface WeeklyRoleEntry {
    fecha: string; // YYYY-MM-DD
    codigoTurno: 'D' | '1' | '2' | '3' | 'V'| 'F' | string;
    empleado: {
        id: number;
        nomina: string;
        fullName: string;
    };
}

export interface WeeklyRolesResponse {
    grupoId: number;
    grupoNombre?: string;
    semana: WeeklyRoleEntry[];
}

class RolesService {
    /**
     * Obtiene los roles/turnos semanales de un grupo (lunes a domingo)
     */
    async getWeeklyRoles(grupoId: number, fechaInicio: string): Promise<WeeklyRolesResponse> {
        // Cache-buster (task #87): tras un arranque programado el patrón cambia
        // y sin este parámetro el browser puede servir la semana vieja tras F5.
        const response = await httpClient.get<ApiResponse<WeeklyRolesResponse>>(
            `/api/roles/grupo/${grupoId}/semana`,
            { fechaInicio, _t: Date.now() }
        );

        // MEJORA: Manejo flexible de la respuesta del API (soporta data y Data)
        const payload = (response as any)?.data ?? (response as any)?.Data;

        if (!payload) {
            const errorMsg = (response as any)?.errorMsg ?? (response as any)?.ErrorMsg;
            throw new Error(errorMsg || 'No se pudo obtener roles semanales');
        }

        // MEJORA: Funci�n de normalizaci�n para manejar inconsistencias del backend
        const normalizeEntry = (entry: any): WeeklyRoleEntry => {
            // Extraer c�digo de turno con m�ltiples fallbacks
            const rawTurno =
                entry?.codigoTurno ??
                entry?.CodigoTurno ??
                entry?.codigo_turno ??
                entry?.turno ??
                entry?.Turno ??
                "";

            // Normalizar: trim, uppercase, y convertir "VA" a "V"
            const codigoTurno = (rawTurno?.toString() || "").trim().toUpperCase();
            const codigoTurnoNormalizado = codigoTurno === "VA" ? "V" : codigoTurno;

            return {
                fecha: entry?.fecha ?? entry?.Fecha ?? "",
                codigoTurno: codigoTurnoNormalizado,
                empleado: {
                    id:
                        entry?.empleado?.id ??
                        entry?.Empleado?.Id ??
                        entry?.Empleado?.id ??
                        0,
                    nomina:
                        entry?.empleado?.nomina ??
                        entry?.Empleado?.Nomina ??
                        entry?.Empleado?.nomina ??
                        entry?.empleado?.username ??
                        "",
                    fullName:
                        entry?.empleado?.fullName ??
                        entry?.Empleado?.FullName ??
                        entry?.Empleado?.fullName ??
                        "",
                },
            };
        };

        // MEJORA: Aplicar normalizaci�n a todos los entries
        return {
            grupoId: payload.grupoId ?? payload.GrupoId ?? grupoId,
            grupoNombre: payload.grupoNombre ?? payload.GrupoNombre ?? undefined,
            semana: (payload.semana ?? payload.Semana ?? []).map(normalizeEntry),
        };
    }
}

export const rolesService = new RolesService();
export default rolesService;