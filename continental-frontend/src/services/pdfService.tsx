import { pdf } from "@react-pdf/renderer";
import { ConstanciaAntiguedadPDF } from "../components/PDF/ConstanciaAntiguedadPDF";

export interface EmpleadoVacacionData {
    nomina: string;
    nombre: string;
    fechaIngreso: string;
    antiguedadAnios: number;
    diasVacacionesCorresponden: number;
    diasAdicionales: number;
    diasProgramados: Array<{
        de: string;
        al: string;
        dias: number;
        tipoVacacion?: string;
    }>;
    diasGozados: Array<{
        de: string;
        al: string;
        dias: number;
    }>;
    diasOtorgadosEmpresa?: Array<{
        de: string;
        al: string;
        dias: number;
    }>;
    diasAdicionalesEmpresa?: Array<{
        de: string;
        al: string;
        dias: number;
    }>;
    totalProgramados: number;
    porProgramar: number;
    totalGozados: number;
    porGozar: number;
}

export interface ConstanciaAntiguedadData {
    empleados: EmpleadoVacacionData[];
    area: string;
    grupos: string[];
    periodo: {
        inicio: string;
        fin: string;
    };
    targetYear: number;
}

const parseDate = (dateStr: string): Date => {
    const [month, day, year] = dateStr.split("/").map(Number);
    return new Date(year, month - 1, day);
};

// Verifica si una fecha ya pasó (está consumida)
const isDateConsumed = (dateStr: string): boolean => {
    const date = parseDate(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date <= today;
};

// Formatea fechas a MM/DD/YYYY
const formatToMMDDYYYY = (dateStr: string): string => {
    const date = new Date(`${dateStr}T00:00:00`);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
};

// Convierte días individuales sin agrupar (cada día es una fila)
const convertDaysToIndividualEntries = (
    days: Array<{ date: string }>,
    tipoVacacion: string
): Array<{ de: string; al: string; dias: number; tipoVacacion: string }> => {
    if (!days || days.length === 0) return [];

    const sortedDays = [...days].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return sortedDays.map((day) => ({
        de: formatToMMDDYYYY(day.date),
        al: formatToMMDDYYYY(day.date),
        dias: 1,
        tipoVacacion
    }));
};

export const generateConstanciaAntiguedadPDF = async (data: ConstanciaAntiguedadData): Promise<Blob> => {
    try {
        const empleadosConVacacionesCompletas = data.empleados.map((empleado) => {
            const diasProgramados = empleado.diasProgramados || [];
            const diasSeleccionados = (empleado as any).diasSeleccionados || [];
            const diasCompletos = [...diasProgramados, ...diasSeleccionados];

            const diasOtorgadosEmpresa = diasCompletos.filter((d) => d.tipoVacacion?.toLowerCase() === "automatica");
            const diasAdicionalesEmpresa = diasCompletos.filter((d) => d.tipoVacacion?.toLowerCase() === "anual");

            const diasOtorgadosPendientes: typeof diasOtorgadosEmpresa = [];
            const diasAdicionalesPendientes: typeof diasAdicionalesEmpresa = [];
            const diasGozadosNuevos: Array<{ de: string; al: string; dias: number }> = [];

            diasOtorgadosEmpresa.forEach((dia) => {
                if (isDateConsumed(dia.al)) {
                    diasGozadosNuevos.push({
                        de: dia.de,
                        al: dia.al,
                        dias: dia.dias
                    });
                } else {
                    diasOtorgadosPendientes.push(dia);
                }
            });

            diasAdicionalesEmpresa.forEach((dia) => {
                if (isDateConsumed(dia.al)) {
                    diasGozadosNuevos.push({
                        de: dia.de,
                        al: dia.al,
                        dias: dia.dias
                    });
                } else {
                    diasAdicionalesPendientes.push(dia);
                }
            });

            const diasGozadosExistentes = empleado.diasGozados || [];
            const diasGozadosCompletos = [...diasGozadosExistentes, ...diasGozadosNuevos];

            const totalOtorgadosEmpresa = diasOtorgadosPendientes.reduce((acc, d) => acc + (d.dias || 0), 0);
            const totalAdicionalesEmpresa = diasAdicionalesPendientes.reduce((acc, d) => acc + (d.dias || 0), 0);
            const totalProgramados = totalOtorgadosEmpresa + totalAdicionalesEmpresa;
            const totalGozados = diasGozadosCompletos.reduce((acc, d) => acc + (d.dias || 0), 0);
            const porGozar = totalOtorgadosEmpresa + totalAdicionalesEmpresa;

            return {
                ...empleado,
                diasOtorgadosEmpresa: diasOtorgadosPendientes,
                diasAdicionalesEmpresa: diasAdicionalesPendientes,
                diasGozados: diasGozadosCompletos,
                totalOtorgadosEmpresa,
                totalAdicionalesEmpresa,
                totalProgramados,
                totalGozados,
                porGozar
            };
        });

        const dataConVacacionesCompletas: ConstanciaAntiguedadData = {
            ...data,
            empleados: empleadosConVacacionesCompletas
        };

        const blob = await pdf(<ConstanciaAntiguedadPDF data={dataConVacacionesCompletas} />).toBlob();
        return blob;
    } catch (error) {
        console.error("Error generating PDF:", error);
        throw new Error("Error al generar el PDF de Constancia de Antigüedad");
    }
};

export const downloadConstanciaAntiguedadPDF = async (data: ConstanciaAntiguedadData): Promise<void> => {
    try {
        const blob = await generateConstanciaAntiguedadPDF(data);
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `Constancia_Antiguedad_${data.area}_${new Date().toISOString().split("T")[0]}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error("Error downloading PDF:", error);
        throw error;
    }
};

export const downloadConstanciaEmpleadoActualPDF = async (
    empleadoData: {
        nomina: string;
        nombre: string;
        fechaIngreso: string;
        area?: string;
        grupo?: string;
    },
    vacacionesData: {
        diasSeleccionados: Array<{ date: string }>;
        diasAsignados: Array<{ date: string }>;
        vacaciones: Array<{
            fechaVacacion: string;
            tipoVacacion: string;
        }>;
    },
    anioVigente: number
): Promise<void> => {
    try {
        const fechaIngreso = new Date(empleadoData.fechaIngreso);
        const referenciaDate = new Date(anioVigente, 11, 31);
        let antiguedadAnios = referenciaDate.getFullYear() - fechaIngreso.getFullYear();
        const monthDiff = referenciaDate.getMonth() - fechaIngreso.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && referenciaDate.getDate() < fechaIngreso.getDate())) {
            antiguedadAnios -= 1;
        }

        const automaticas = vacacionesData.vacaciones
            .filter((v) => v.tipoVacacion === "Automatica")
            .map((v) => ({ date: v.fechaVacacion }));

        const anuales = vacacionesData.vacaciones
            .filter((v) => v.tipoVacacion === "Anual")
            .map((v) => ({ date: v.fechaVacacion }));

        const diasOtorgadosEmpresa = convertDaysToIndividualEntries(automaticas, "Automatica");
        const diasAdicionalesEmpresa = convertDaysToIndividualEntries(anuales, "Anual");

        const totalOtorgados = diasOtorgadosEmpresa.reduce((sum, p) => sum + p.dias, 0);
        const totalAdicionales = diasAdicionalesEmpresa.reduce((sum, p) => sum + p.dias, 0);
        const totalProgramados = totalOtorgados + totalAdicionales;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const diasGozados: Array<{ de: string; al: string; dias: number }> = [];
        [...diasOtorgadosEmpresa, ...diasAdicionalesEmpresa].forEach((periodo) => {
            const [month, day, year] = periodo.al.split("/").map(Number);
            const fechaFin = new Date(year, month - 1, day);
            if (fechaFin < today) {
                diasGozados.push({
                    de: periodo.de,
                    al: periodo.al,
                    dias: periodo.dias
                });
            }
        });

        const totalGozados = diasGozados.reduce((sum, p) => sum + p.dias, 0);
        const porGozar = totalProgramados - totalGozados;

        const fechaIngresoFormatted = formatToMMDDYYYY(empleadoData.fechaIngreso);

        const empleadoPDF: EmpleadoVacacionData = {
            nomina: empleadoData.nomina,
            nombre: empleadoData.nombre,
            fechaIngreso: fechaIngresoFormatted,
            antiguedadAnios,
            diasVacacionesCorresponden: totalOtorgados,
            diasAdicionales: totalAdicionales,
            diasProgramados: [...diasOtorgadosEmpresa, ...diasAdicionalesEmpresa],
            diasGozados,
            diasOtorgadosEmpresa,
            diasAdicionalesEmpresa,
            totalProgramados,
            porProgramar: 0,
            totalGozados,
            porGozar
        };

        const data: ConstanciaAntiguedadData = {
            empleados: [empleadoPDF],
            area: empleadoData.area || "N/A",
            grupos: [empleadoData.grupo || "N/A"],
            periodo: {
                inicio: `01/01/${anioVigente}`,
                fin: `12/31/${anioVigente}`
            },
            targetYear: anioVigente
        };

        await downloadConstanciaAntiguedadPDF(data);
    } catch (error) {
        console.error("Error generating employee PDF:", error);
        throw new Error("Error al generar el PDF de constancia del empleado");
    }
};

export const generateConstanciaPDFForEmployee = async (params: {
    empleadoData: {
        nomina: string;
        nombre: string;
        fechaIngreso: string;
        area?: string;
        grupo?: string;
    };
    vacacionesData: {
        diasSeleccionados: Array<{ date: string }>;
        diasAsignados: Array<{ date: string }>;
        vacaciones: Array<{
            fechaVacacion: string;
            tipoVacacion: string;
        }>;
    };
    anioVigente: number;
}): Promise<void> => {
    await downloadConstanciaEmpleadoActualPDF(params.empleadoData, params.vacacionesData, params.anioVigente);
};

// Genera el PDF como Blob (para vista previa en modal)
export const generateConstanciaAntiguedadPDFBlob = async (
    empleadoData: {
        nomina: string;
        nombre: string;
        fechaIngreso: string;
        area?: string;
        grupo?: string;
    },
    vacacionesData: {
        diasSeleccionados: Array<{ date: string }>;
        diasAsignados: Array<{ date: string }>;
        vacaciones: Array<{
            fechaVacacion: string;
            tipoVacacion: string;
        }>;
    },
    anioVigente: number
): Promise<Blob> => {
    try {
        const fechaIngreso = new Date(empleadoData.fechaIngreso);
        const referenciaDate = new Date(anioVigente, 11, 31);
        let antiguedadAnios = referenciaDate.getFullYear() - fechaIngreso.getFullYear();
        const monthDiff = referenciaDate.getMonth() - fechaIngreso.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && referenciaDate.getDate() < fechaIngreso.getDate())) {
            antiguedadAnios -= 1;
        }

        const automaticas = vacacionesData.vacaciones
            .filter((v) => v.tipoVacacion === "Automatica")
            .map((v) => ({ date: v.fechaVacacion }));

        const anuales = vacacionesData.vacaciones
            .filter((v) => v.tipoVacacion === "Anual")
            .map((v) => ({ date: v.fechaVacacion }));

        const diasOtorgadosEmpresa = convertDaysToIndividualEntries(automaticas, "Automatica");
        const diasAdicionalesEmpresa = convertDaysToIndividualEntries(anuales, "Anual");

        const totalOtorgados = diasOtorgadosEmpresa.reduce((sum, p) => sum + p.dias, 0);
        const totalAdicionales = diasAdicionalesEmpresa.reduce((sum, p) => sum + p.dias, 0);
        const totalProgramados = totalOtorgados + totalAdicionales;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const diasGozados: Array<{ de: string; al: string; dias: number }> = [];
        [...diasOtorgadosEmpresa, ...diasAdicionalesEmpresa].forEach((periodo) => {
            const [month, day, year] = periodo.al.split("/").map(Number);
            const fechaFin = new Date(year, month - 1, day);
            if (fechaFin < today) {
                diasGozados.push({
                    de: periodo.de,
                    al: periodo.al,
                    dias: periodo.dias
                });
            }
        });

        const totalGozados = diasGozados.reduce((sum, p) => sum + p.dias, 0);
        const porGozar = totalProgramados - totalGozados;

        const fechaIngresoFormatted = formatToMMDDYYYY(empleadoData.fechaIngreso);

        const empleadoPDF: EmpleadoVacacionData = {
            nomina: empleadoData.nomina,
            nombre: empleadoData.nombre,
            fechaIngreso: fechaIngresoFormatted,
            antiguedadAnios,
            diasVacacionesCorresponden: totalOtorgados,
            diasAdicionales: totalAdicionales,
            diasProgramados: [...diasOtorgadosEmpresa, ...diasAdicionalesEmpresa],
            diasGozados,
            diasOtorgadosEmpresa,
            diasAdicionalesEmpresa,
            totalProgramados,
            porProgramar: 0,
            totalGozados,
            porGozar
        };

        const data: ConstanciaAntiguedadData = {
            empleados: [empleadoPDF],
            area: empleadoData.area || "N/A",
            grupos: [empleadoData.grupo || "N/A"],
            periodo: {
                inicio: `01/01/${anioVigente}`,
                fin: `12/31/${anioVigente}`
            },
            targetYear: anioVigente
        };

        return await generateConstanciaAntiguedadPDF(data);
    } catch (error) {
        console.error("Error generating PDF blob:", error);
        throw new Error("Error al generar el PDF de constancia");
    }
};