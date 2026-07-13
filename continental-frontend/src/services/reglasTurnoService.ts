import { httpClient } from "@/services/httpClient";
import type {
    ApiResponse,
    ReglaTurno,
    ActualizarPatronReglaTurnoRequest,
    CrearReglaTurnoRequest,
    RotarReglasTurnoRequest,
    AsignarReglaAAreaRequest,
    AsignarReglaAAreaResponse,
    RotacionProgramada,
    CrearRotacionesProgramadasRequest,
    CrearRotacionesProgramadasResponse,
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

    async recargarCache(): Promise<void> {
        try {
            await httpClient.post<ApiResponse<unknown>>(`${BASE}/reload-cache`, {});
        } catch (error: any) {
            if (error.response?.status === 403) {
                throw new Error("No tienes permisos para recargar cache");
            }
            console.error("Error en reglasTurnoService.recargarCache:", error);
            throw error;
        }
    },

    async crear(request: CrearReglaTurnoRequest): Promise<ReglaTurno> {
        try {
            const response = await httpClient.post<ApiResponse<ReglaTurno>>(
                `${BASE}`,
                request
            );
            const data = response.data ?? response;
            if (!data) throw new Error("Respuesta vacía del servidor");
            return data as unknown as ReglaTurno;
        } catch (error: any) {
            if (error.response?.status === 400) {
                throw new Error(
                    error.response?.data?.errorMsg ?? "Datos inválidos al crear la regla"
                );
            }
            if (error.response?.status === 403) {
                throw new Error("Solo SuperUsuario puede crear reglas");
            }
            console.error("Error en reglasTurnoService.crear:", error);
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

    async asignarAArea(
        codigo: string,
        request: AsignarReglaAAreaRequest
    ): Promise<AsignarReglaAAreaResponse> {
        try {
            const response = await httpClient.post<ApiResponse<AsignarReglaAAreaResponse>>(
                `${BASE}/${encodeURIComponent(codigo)}/asignar-a-area`,
                request
            );
            const data = response.data ?? response;
            if (!data) throw new Error("Respuesta vacía del servidor");
            return data as unknown as AsignarReglaAAreaResponse;
        } catch (error: any) {
            if (error.response?.status === 400) {
                throw new Error(
                    error.response?.data?.errorMsg ?? "Datos inválidos al asignar la regla"
                );
            }
            if (error.response?.status === 403) {
                throw new Error("Solo SuperUsuario puede asignar reglas a áreas");
            }
            console.error("Error en reglasTurnoService.asignarAArea:", error);
            throw error;
        }
    },

    async listarRotacionesProgramadas(desde?: string, hasta?: string): Promise<RotacionProgramada[]> {
        try {
            const qs: string[] = [`_t=${Date.now()}`];
            if (desde) qs.push(`desde=${encodeURIComponent(desde)}`);
            if (hasta) qs.push(`hasta=${encodeURIComponent(hasta)}`);
            const url = `${BASE}/rotaciones-programadas?${qs.join("&")}`;
            const response = await httpClient.get<ApiResponse<RotacionProgramada[]>>(url);
            const data = response.data ?? response;
            return Array.isArray(data) ? (data as RotacionProgramada[]) : [];
        } catch (error: any) {
            if (error.response?.status === 403) return [];
            console.error("Error en reglasTurnoService.listarRotacionesProgramadas:", error);
            throw error;
        }
    },

    async agendarRotaciones(
        request: CrearRotacionesProgramadasRequest
    ): Promise<CrearRotacionesProgramadasResponse> {
        try {
            const response = await httpClient.post<ApiResponse<CrearRotacionesProgramadasResponse>>(
                `${BASE}/rotaciones-programadas`,
                request
            );
            const data = response.data ?? response;
            if (!data) throw new Error("Respuesta vacía del servidor");
            return data as unknown as CrearRotacionesProgramadasResponse;
        } catch (error: any) {
            if (error.response?.status === 400) {
                throw new Error(
                    error.response?.data?.errorMsg ?? "Datos inválidos al agendar la rotación"
                );
            }
            if (error.response?.status === 403) {
                throw new Error("Solo SuperUsuario puede agendar rotaciones");
            }
            console.error("Error en reglasTurnoService.agendarRotaciones:", error);
            throw error;
        }
    },

    async cancelarRotacionProgramada(id: number): Promise<void> {
        try {
            await httpClient.delete<ApiResponse<unknown>>(
                `${BASE}/rotaciones-programadas/${id}`
            );
        } catch (error: any) {
            if (error.response?.status === 400) {
                throw new Error(
                    error.response?.data?.errorMsg ?? "No se pudo cancelar la rotación"
                );
            }
            if (error.response?.status === 403) {
                throw new Error("Solo SuperUsuario puede cancelar rotaciones");
            }
            console.error("Error en reglasTurnoService.cancelarRotacionProgramada:", error);
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
