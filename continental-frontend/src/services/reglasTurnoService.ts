import { httpClient } from "@/services/httpClient";
import type {
    ApiResponse,
    ReglaTurno,
    ActualizarPatronReglaTurnoRequest,
    RotarReglasTurnoRequest,
} from "@/interfaces/Api.interface";

const BASE = "/api/reglas-turno";

export const reglasTurnoService = {
    async getAll(): Promise<ReglaTurno[]> {
        try {
            // Cache-buster: el GET se cachea en el browser y tras una rotación
            // veríamos el patrón viejo con un F5 normal.
            const url = `${BASE}?_t=${Date.now()}`;
            const response = await httpClient.get<ApiResponse<ReglaTurno[]>>(url);
            const data = response.data ?? response;
            return Array.isArray(data) ? (data as ReglaTurno[]) : [];
        } catch (error: any) {
            if (error.response?.status === 403) return [];
            console.error("Error en reglasTurnoService.getAll:", error);
            throw error;
        }
    },

    async getByCodigo(codigo: string): Promise<ReglaTurno | null> {
        try {
            const response = await httpClient.get<ApiResponse<ReglaTurno>>(
                `${BASE}/${encodeURIComponent(codigo)}?_t=${Date.now()}`
            );
            return (response.data ?? null) as unknown as ReglaTurno | null;
        } catch (error: any) {
            if (error.response?.status === 404) return null;
            console.error("Error en reglasTurnoService.getByCodigo:", error);
            throw error;
        }
    },

    async actualizarPatron(
        codigo: string,
        request: ActualizarPatronReglaTurnoRequest
    ): Promise<ReglaTurno> {
        try {
            const response = await httpClient.put<ApiResponse<ReglaTurno>>(
                `${BASE}/${encodeURIComponent(codigo)}`,
                request
            );
            const data = response.data ?? response;
            if (!data) throw new Error("Respuesta vacía del servidor");
            return data as unknown as ReglaTurno;
        } catch (error: any) {
            if (error.response?.status === 400) {
                throw new Error(
                    error.response?.data?.errorMsg ?? "Datos inválidos al actualizar la regla"
                );
            }
            if (error.response?.status === 403) {
                throw new Error("No tienes permisos para editar reglas de turno");
            }
            if (error.response?.status === 404) {
                throw new Error(`No existe la regla ${codigo}`);
            }
            console.error("Error en reglasTurnoService.actualizarPatron:", error);
            throw error;
        }
    },

    async rotar(request: RotarReglasTurnoRequest): Promise<ReglaTurno[]> {
        try {
            const response = await httpClient.post<ApiResponse<ReglaTurno[]>>(
                `${BASE}/rotar`,
                request
            );
            const data = response.data ?? response;
            return Array.isArray(data) ? (data as ReglaTurno[]) : [];
        } catch (error: any) {
            if (error.response?.status === 400) {
                throw new Error(
                    error.response?.data?.errorMsg ?? "Datos inválidos al rotar reglas"
                );
            }
            if (error.response?.status === 403) {
                throw new Error("No tienes permisos para rotar reglas de turno");
            }
            console.error("Error en reglasTurnoService.rotar:", error);
            throw error;
        }
    },
};
