import { env } from '@/config/env';
import { httpClient } from '@/services/httpClient';
import type {
    ApiResponse,
    EmpleadosEnVacacionesResponse,
    EmpleadosFaltantesCapturaResponse,
    VacacionesAsignadasEmpresaResponse
} from '@/interfaces/Api.interface';

export const reportesService = {
  /**
   * Descarga el reporte de vacaciones programadas agrupadas por área en formato Excel
   * @param year - Año opcional para filtrar las vacaciones
   */
    async exportarVacacionesPorArea(year?: number, areaId?: number): Promise<void> {
    // Obtener el token de autenticación
    const token = localStorage.getItem('auth_token') ||
      (() => {
        try {
          const user = localStorage.getItem('user');
          if (user) {
            const userData = JSON.parse(user);
            return userData.token || null;
          }
        } catch (e) {
          return null;
        }
      })();

    if (!token) {
      throw new Error('No se encontró token de autenticación');
    }

        const params = new URLSearchParams();
        if (year) params.append('year', year.toString());
        if (areaId) params.append('areaId', areaId.toString());

        const url = `${env.API_BASE_URL}/api/reportes/vacaciones-por-area?${params.toString()}`;


    try {
      // Realizar la petición con responseType blob para archivos
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        keepalive: true, // Prevents request from being cancelled
      });

      if (!response.ok) {
        throw new Error(`Error al descargar el reporte: ${response.statusText}`);
      }

      // Obtener el blob del archivo
      const blob = await response.blob();

      // Extraer el nombre del archivo desde el header Content-Disposition
      const contentDisposition = response.headers.get('Content-Disposition');
      let fileName = year
        ? `VacacionesProgramadas_${year}_${new Date().toISOString().split('T')[0]}.xlsx`
        : `VacacionesProgramadas_Todas_${new Date().toISOString().split('T')[0]}.xlsx`;

      if (contentDisposition) {
        const fileNameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (fileNameMatch && fileNameMatch[1]) {
          fileName = fileNameMatch[1].replace(/['"]/g, '');
        }
      }

      // Crear un enlace temporal y simular un click para descargar
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();

      // Limpiar después de un pequeño delay para evitar race conditions
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(downloadUrl);
      }, 100);
    } catch (error) {
      console.error('Error al exportar vacaciones por área:', error);
      throw error;
    }
  },


/**
   * Descarga el reporte SAP (archivo plano sin encabezados)
   * @param params - { year, areaId?, gruposRol? }
   */
  async exportarReporteSAP(params: { year: number; areaId?: number; gruposRol?: string[] }): Promise<void> {
    const token = localStorage.getItem("auth_token");
    if (!token) throw new Error("No se encontró token de autenticación");

    const qs = new URLSearchParams();
    qs.append("year", params.year.toString());
    if (params.areaId) qs.append("areaId", params.areaId.toString());
    params.gruposRol?.forEach((g) => qs.append("gruposRol", g));

const url = `${env.API_BASE_URL}/api/reportes/reporte-sap?${qs.toString()}`;

    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) throw new Error("Error al descargar el Reporte SAP");

    const blob = await response.blob();
    const fileName = `ReporteSAP_${params.year}_${new Date().toISOString().split("T")[0]}.csv`;

    const link = document.createElement("a");
    link.href = window.URL.createObjectURL(blob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  /**
   * Descarga el reporte SAP de reprogramaciones (eliminar o nuevos)
   * @param tipo - 'eliminar' | 'nuevos'
   * @param params - { year, areaId?, gruposRol? }
   */
    async exportarReporteSAPReprogramacion(
        tipo: 'eliminar' | 'nuevos',
        params: {
            year: number;
            areaId?: number;
            gruposRol?: string[];
            fechaResolucionDesde?: string;
            fechaResolucionHasta?: string;
            horaDesde?: string;
            horaHasta?: string;
        }
    ): Promise<void> {
        const token = localStorage.getItem("auth_token");
        if (!token) throw new Error("No se encontró token de autenticación");

        const qs = new URLSearchParams();
        qs.append("year", params.year.toString());
        if (params.areaId) qs.append("areaId", params.areaId.toString());
        params.gruposRol?.forEach((g) => qs.append("gruposRol", g));
        if (params.fechaResolucionDesde) qs.append("fechaResolucionDesde", params.fechaResolucionDesde);
        if (params.fechaResolucionHasta) qs.append("fechaResolucionHasta", params.fechaResolucionHasta);
        if (params.horaDesde) qs.append("horaDesde", params.horaDesde);
        if (params.horaHasta) qs.append("horaHasta", params.horaHasta);

        const endpoint = tipo === 'eliminar' ? 'reporte-sap-repro-eliminar' : 'reporte-sap-repro-nuevos';
        const url = `${env.API_BASE_URL}/api/reportes/${endpoint}?${qs.toString()}`;

        const response = await fetch(url, {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) throw new Error(`Error al descargar el Reporte SAP de reprogramación (${tipo})`);

        const blob = await response.blob();
        const fileName = `ReporteSAP_Reprog_${tipo === 'eliminar' ? 'Eliminar' : 'Nuevos'}_${params.year}_${new Date().toISOString().split("T")[0]}.csv`;

        const link = document.createElement("a");
        link.href = window.URL.createObjectURL(blob);
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

    async obtenerEmpleadosFaltantesCaptura(params: { anio: number; areaId?: number; grupoId?: number }): Promise<EmpleadosFaltantesCapturaResponse> {
        const response = await httpClient.get<ApiResponse<EmpleadosFaltantesCapturaResponse>>(
            '/api/reportes/empleados-faltantes-vacaciones',
            {
                anioObjetivo: params.anio,
                areaId: params.areaId,
                grupoId: params.grupoId,
            },
            { timeout: 120000 }
        );

        if (!response.success || !response.data) {
            throw new Error(response.errorMsg || 'No se pudo obtener el reporte de empleados faltantes de capturar vacaciones');
        }

        return response.data as unknown as EmpleadosFaltantesCapturaResponse;
    },

    async obtenerVacacionesEmpresa(params: { anio: number; areaId?: number; grupoId?: number }): Promise<VacacionesAsignadasEmpresaResponse> {
        const response = await httpClient.get<ApiResponse<VacacionesAsignadasEmpresaResponse>>(
            '/api/reportes/vacaciones-asignadas-empresa',
            {
                anioObjetivo: params.anio,
                areaId: params.areaId,
                grupoId: params.grupoId,
            },
            { timeout: 120000 }
        );

        if (!response.success || !response.data) {
            throw new Error(response.errorMsg || 'No se pudo obtener el listado de vacaciones asignadas por la empresa');
        }

        return response.data as unknown as VacacionesAsignadasEmpresaResponse;
    },

    async obtenerEmpleadosEnVacaciones(params: { fecha?: string; areaId?: number; grupoId?: number }): Promise<EmpleadosEnVacacionesResponse> {
        const response = await httpClient.get<ApiResponse<EmpleadosEnVacacionesResponse>>(
            '/api/reportes/empleados-en-vacaciones',
            {
                fecha: params.fecha || new Date().toISOString().slice(0, 10),
                areaId: params.areaId,
                grupoId: params.grupoId,
            }
        );

        if (!response.success || !response.data) {
            throw new Error(response.errorMsg || 'No se pudo obtener el reporte de empleados en vacaciones');
        }

        return response.data as unknown as EmpleadosEnVacacionesResponse;
    },

    /**
    * Descarga el reporte SAP de permutas aprobadas
    * @param params - { year, areaId?, gruposRol? }
    */
    async exportarReporteSAPPermutas(
        params: {
            year: number;
            areaId?: number;
            gruposRol?: string[];
            fechaResolucionDesde?: string;
            fechaResolucionHasta?: string;
            horaDesde?: string;
            horaHasta?: string;
        }
    ): Promise<void> {
        const token = localStorage.getItem("auth_token");
        if (!token) throw new Error("No se encontró token de autenticación");

        const qs = new URLSearchParams();
        qs.append("year", params.year.toString());
        if (params.areaId) qs.append("areaId", params.areaId.toString());
        params.gruposRol?.forEach((g) => qs.append("gruposRol", g));
        if (params.fechaResolucionDesde) qs.append("fechaResolucionDesde", params.fechaResolucionDesde);
        if (params.fechaResolucionHasta) qs.append("fechaResolucionHasta", params.fechaResolucionHasta);
        if (params.horaDesde) qs.append("horaDesde", params.horaDesde);
        if (params.horaHasta) qs.append("horaHasta", params.horaHasta);

        const url = `${env.API_BASE_URL}/api/reportes/reporte-sap-permutas?${qs.toString()}`;

        const response = await fetch(url, {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) throw new Error("Error al descargar el Reporte SAP de Permutas");

        const blob = await response.blob();
        const fileName = `ReporteSAP_Permutas_${params.year}_${new Date().toISOString().split("T")[0]}.csv`;

        const link = document.createElement("a");
        link.href = window.URL.createObjectURL(blob);
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },
};
