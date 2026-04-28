import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useAreas } from "@/hooks/useAreas";
import { useLeaderCache } from "@/hooks/useLeaderCache";
import { useVacationConfig } from "@/hooks/useVacationConfig";
import { downloadConstanciaAntiguedadPDF } from "@/services/pdfService";
import { AsignacionAutomaticaService } from "@/services/asignacionAutomaticaService";
import { vacacionesService } from "@/services/vacacionesService";
import { BloquesReservacionService } from "@/services/bloquesReservacionService";
import { reportesService } from "@/services/reportesService";
import { empleadosService } from "@/services/empleadosService";
import { generarExcelEmpleadosFaltantesCaptura } from "@/utils/empleadosFaltantesCapturaExcel";
import { generarExcelVacacionesAsignadasEmpresa } from "@/utils/vacacionesAsignadasEmpresaExcel";
import { toast } from "sonner";
import { Loader2, RefreshCw, X } from "lucide-react";
import { Download, Palmtree, FileText, Award, AlertTriangle, FileSpreadsheet, UserMinus } from "lucide-react";
import type { EmpleadoDetalle } from "@/interfaces/Api.interface";
import { PeriodOptions } from "@/interfaces/Calendar.interface";
import { exportarReprogramacionesExcel } from "@/utils/reprogramacionesExcel";
import { solicitudesService } from "@/services/solicitudesService";
import { festivosTrabajadosService } from "@/services/festivosTrabajadosService";
import { edicionDiasEmpresaService } from "@/services/edicionDiasEmpresaService";

const transformGroupRole = (role: string) => {
    if (!role) return "";
    return role;
};

const formatFechaMMDDYYYY = (fecha: string | null | undefined): string => {
    if (!fecha) return "";
    const normalized = fecha.includes("T") ? fecha : `${fecha}T00:00:00`;
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return "";
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
};

const calculateAntiguedadAlCierre = (fechaIngreso: string | null | undefined, targetYear: number): number => {
    if (!fechaIngreso) return 0;
    const normalized = fechaIngreso.includes("T") ? fechaIngreso : `${fechaIngreso}T00:00:00`;
    const ingreso = new Date(normalized);
    if (Number.isNaN(ingreso.getTime())) return 0;
    const referenceDate = new Date(targetYear, 11, 31);
    let years = referenceDate.getFullYear() - ingreso.getFullYear();
    const monthDiff = referenceDate.getMonth() - ingreso.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && referenceDate.getDate() < ingreso.getDate())) {
        years -= 1;
    }
    return Math.max(years, 0);
};

const formatTime12Hour = (time24: string): string => {
    if (!time24) return "";
    const [hours, minutes] = time24.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
};

// Formatea una fecha ISO (YYYY-MM-DD) a formato legible DD/MM/YYYY
const formatDateDisplay = (dateStr: string): string => {
    if (!dateStr) return "";
    const [year, month, day] = dateStr.split("-");
    return `${day}/${month}/${year}`;
};

// Combina una fecha YYYY-MM-DD con una hora HH:mm en un Date exacto
const buildTimestamp = (dateStr: string, time: string): Date => {
    const [year, month, day] = dateStr.split("-").map(Number);
    const [hours, minutes] = time.split(":").map(Number);
    return new Date(year, month - 1, day, hours, minutes, 0, 0);
};
// Convierte una fecha YYYY-MM-DD al inicio del día (00:00:00.000)
const toStartOfDay = (dateStr: string): Date => {
    const [year, month, day] = dateStr.split("-").map(Number);
    return new Date(year, month - 1, day, 0, 0, 0, 0);
};

// Convierte una fecha YYYY-MM-DD al fin del día (23:59:59.999)
const toEndOfDay = (dateStr: string): Date => {
    const [year, month, day] = dateStr.split("-").map(Number);
    return new Date(year, month - 1, day, 23, 59, 59, 999);
};

type DateFilterMode = 'single' | 'range';
type ReportCategory = 'programacion-anual' | 'reprogramacion';

interface ReportCard {
    id: number;
    icon: any;
    title: string;
    subtitle: string;
    category: ReportCategory;
    requiresReprogramming?: boolean;
}

export const Reportes = () => {
    const [selectedArea, setSelectedArea] = useState<string>("");
    const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
    const [selectedYear, setSelectedYear] = useState<string>("");
    const [loadingGeneral, setLoadingGeneral] = useState(false);

    const [timeFrom, setTimeFrom] = useState<string>("");
    const [timeTo, setTimeTo] = useState<string>("");

    // 🆕 Estados para filtro de fecha
    const [dateFilterMode, setDateFilterMode] = useState<DateFilterMode>('single');
    const [singleDate, setSingleDate] = useState<string>("");
    const [dateRangeFrom, setDateRangeFrom] = useState<string>("");
    const [dateRangeTo, setDateRangeTo] = useState<string>("");

    const [selectedCategory, setSelectedCategory] = useState<ReportCategory | 'all'>('all');

    interface GroupOption {
        value: string;
        label: string;
        liderId?: number;
        grupoId?: number;
    }

    const [availableGroups, setAvailableGroups] = useState<GroupOption[]>([]);

    const { areas, getAreaById, loading: areasLoading } = useAreas();
    const { getLeadersBatch, formatLeaderName } = useLeaderCache();
    const { config, currentPeriod } = useVacationConfig();
    const isReprogramming = currentPeriod === PeriodOptions.reprogramming;

    useEffect(() => {
        if (config?.anioVigente && !selectedYear) {
            setSelectedYear(config.anioVigente.toString());
        }
    }, [config, selectedYear]);

    useEffect(() => {
        const loadGroupsForArea = async () => {
            if (!selectedArea) {
                setAvailableGroups([]);
                return;
            }

            try {
                const areaDetails = await getAreaById(parseInt(selectedArea));
                if (areaDetails.grupos && areaDetails.grupos.length > 0) {
                    const leaderIds = areaDetails.grupos
                        .map((grupo) => grupo.liderId)
                        .filter((id): id is number => id !== undefined && id !== null);

                    const leadersMap = leaderIds.length > 0 ? await getLeadersBatch(leaderIds) : new Map();

                    const groupOptions = areaDetails.grupos.map((grupo) => {
                        const groupCode = transformGroupRole(grupo.rol);
                        let displayLabel = groupCode;

                        if (grupo.liderId && leadersMap.has(grupo.liderId)) {
                            const leader = leadersMap.get(grupo.liderId)!;
                            const leaderName = formatLeaderName(leader.fullName);
                            displayLabel = `${groupCode} - ${leaderName}`;
                        }

                        return {
                            value: grupo.rol,
                            label: displayLabel,
                            liderId: grupo.liderId,
                            grupoId: grupo.grupoId
                        };
                    });
                    setAvailableGroups(groupOptions);
                } else {
                    setAvailableGroups([]);
                }
            } catch (error) {
                console.error("Error loading groups for area:", error);
                setAvailableGroups([]);
            }
        };

        loadGroupsForArea();
    }, [selectedArea, getAreaById, getLeadersBatch, formatLeaderName]);

    const ensureReprogramming = (): boolean => {
        if (!isReprogramming) {
            toast.error("Disponible solo durante el periodo de reprogramación.");
            return false;
        }
        return true;
    };

    // 🆕 Helpers para verificar si hay filtros de fecha activos
    const hasDateFilter = (): boolean => {
        if (dateFilterMode === 'single') return !!singleDate;
        return !!(dateRangeFrom || dateRangeTo);
    };

    const clearDateFilters = () => {
        setSingleDate("");
        setDateRangeFrom("");
        setDateRangeTo("");
    };

    const clearAllTemporalFilters = () => {
        setTimeFrom("");
        setTimeTo("");
        clearDateFilters();
    };

    // 🆕 Función que devuelve el resumen del filtro de fecha activo
    const getActiveDateLabel = (): string => {
        if (dateFilterMode === 'single' && singleDate) {
            return formatDateDisplay(singleDate);
        }
        if (dateFilterMode === 'range') {
            if (dateRangeFrom && dateRangeTo) return `${formatDateDisplay(dateRangeFrom)} — ${formatDateDisplay(dateRangeTo)}`;
            if (dateRangeFrom) return `Desde ${formatDateDisplay(dateRangeFrom)}`;
            if (dateRangeTo) return `Hasta ${formatDateDisplay(dateRangeTo)}`;
        }
        return "";
    };

    const handleReprogGeneral = async () => {
        if (!ensureReprogramming()) return;
        setLoadingGeneral(true);
        try {
            const areaId = selectedArea ? parseInt(selectedArea) : undefined;
            const areaName = selectedArea
                ? areas.find(a => a.areaId.toString() === selectedArea)?.nombreGeneral || "Sin área"
                : "Todas";

            const response = await solicitudesService.getSolicitudesList({
                areaId: areaId,
                fechaDesde: undefined,
                fechaHasta: undefined
            });

            let solicitudes = response?.solicitudes || [];

            // 🆕 Filtro de fecha primero
            // Filtro por fecha de aprobación con lógica de timestamps exactos
            if (hasDateFilter() || timeFrom || timeTo) {
                solicitudes = solicitudes.filter((solicitud) => {
                    const fechaResolucion = solicitud.fechaAprobacion
                        ? new Date(solicitud.fechaAprobacion)
                        : null;
                    if (!fechaResolucion) return false;

                    if (dateFilterMode === 'single' && singleDate) {
                        // Día específico: hora-desde y hora-hasta acotan dentro de ese día
                        const start = buildTimestamp(singleDate, timeFrom || "00:00");
                        const end = buildTimestamp(singleDate, timeTo || "23:59");
                        return fechaResolucion >= start && fechaResolucion <= end;
                    }

                    if (dateFilterMode === 'range') {
                        // Rango: cada fecha tiene su propia hora
                        let cumple = true;
                        if (dateRangeFrom) {
                            const start = buildTimestamp(dateRangeFrom, timeFrom || "00:00");
                            cumple = cumple && fechaResolucion >= start;
                        }
                        if (dateRangeTo) {
                            const end = buildTimestamp(dateRangeTo, timeTo || "23:59");
                            cumple = cumple && fechaResolucion <= end;
                        }
                        return cumple;
                    }

                    return true;
                });
            }

            // Filtro de hora
            //if (timeFrom || timeTo) {
            //    solicitudes = solicitudes.filter((solicitud) => {
            //        const fechaSolicitud = new Date(solicitud.fechaSolicitud);
            //        const hora = fechaSolicitud.getHours();
            //        const minutos = fechaSolicitud.getMinutes();
            //        const tiempoSolicitud = hora * 60 + minutos;

            //        let cumpleFiltro = true;

            //        if (timeFrom) {
            //            const [horaDesde, minutosDesde] = timeFrom.split(':').map(Number);
            //            const tiempoDesde = horaDesde * 60 + minutosDesde;
            //            cumpleFiltro = cumpleFiltro && tiempoSolicitud >= tiempoDesde;
            //        }

            //        if (timeTo) {
            //            const [horaHasta, minutosHasta] = timeTo.split(':').map(Number);
            //            const tiempoHasta = horaHasta * 60 + minutosHasta;
            //            cumpleFiltro = cumpleFiltro && tiempoSolicitud <= tiempoHasta;
            //        }

            //        return cumpleFiltro;
            //    });
            //}

            if (solicitudes.length === 0) {
                toast.info("No hay reprogramaciones con los filtros seleccionados.");
                return;
            }

            exportarReprogramacionesExcel(solicitudes, {
                titulo: "Reporte general de reprogramaciones",
                tipo: "general",
                area: areaName,
                fechaDesde: dateFilterMode === 'single' ? singleDate : dateRangeFrom,
                fechaHasta: dateFilterMode === 'single' ? singleDate : dateRangeTo
            });

            toast.success(`Reporte general descargado (${solicitudes.length} registros).`);
        } catch (error: any) {
            console.error("Error al descargar reprogramaciones generales", error);
            toast.error(error?.message || "No se pudo generar el reporte general de reprogramaciones.");
        } finally {
            setLoadingGeneral(false);
        }
    };

    const reportCards: ReportCard[] = [
        {
            id: 1,
            icon: Palmtree,
            title: "Reporte de Vacaciones Asignadas por la Empresa",
            subtitle: "Reporte con los empleados en vacaciones.",
            category: 'programacion-anual'
        },
        {
            id: 5,
            icon: Award,
            title: "Constancia de Antiguedad",
            subtitle: "Constancia de antiguedad y vacaciones adicionales para empleados sindicalizados.",
            category: 'programacion-anual'
        },
        {
            id: 7,
            icon: AlertTriangle,
            title: "Empleados que No Respondieron",
            subtitle: "Reporte de empleados que no respondieron a la asignación de bloques de vacaciones.",
            category: 'programacion-anual'
        },
        {
            id: 9,
            icon: FileSpreadsheet,
            title: "Reporte SAP Vacaciones Anuales",
            subtitle: "Genera archivo plano (Nómina, fecha dos veces y 1100, sin encabezados).",
            category: 'programacion-anual'
        },
        {
            id: 10,
            icon: UserMinus,
            title: "Empleados faltantes de capturar vacaciones",
            subtitle: "Asignados en bloque cola sin vacaciones manuales activas.",
            category: 'programacion-anual'
        },
        {
            id: 6,
            icon: FileText,
            title: "Empleados sin Asignación Automática",
            subtitle: "Reporte de empleados que no tienen asignación automática de vacaciones.",
            category: 'programacion-anual'
        },
        {
            id: 8,
            icon: FileSpreadsheet,
            title: "Vacaciones Programadas por Área",
            subtitle: "Exporta todas las vacaciones programadas agrupadas por área en formato Excel.",
            category: 'programacion-anual'
        },
        {
            id: 12,
            icon: FileText,
            title: "Reporte SAP Reprogramación (Eliminar)",
            subtitle: "Días que se quitarán de la programación original.",
            category: 'reprogramacion'
        },
        {
            id: 11,
            icon: RefreshCw,
            title: "General de Reprogramaciones",
            subtitle: "Todas las reprogramaciones (solo en periodo de reprogramación).",
            category: 'reprogramacion',
            requiresReprogramming: true
        },
        {
            id: 13,
            icon: FileText,
            title: "Reporte SAP Reprogramación (Nuevos)",
            subtitle: "Días que se agregarán a la nueva programación.",
            category: 'reprogramacion'
        },
        {
            id: 14,
            icon: FileText,
            title: "Reporte SAP Permutas",
            subtitle: "Días permutados con nueva regla de turno asignada.",
            category: 'reprogramacion'
        },
        {
            id: 15,
            icon: FileSpreadsheet,
            title: "Reporte de Festivos Trabajados",
            subtitle: "Nómina, nombre, fecha trabajada y fecha de intercambio aprobada.",
            category: 'reprogramacion'
        },
        {
            id: 16,
            icon: FileText,
            title: "Reporte SAP Permutas (Eliminar)",
            subtitle: "Días de permuta que se quitarán de la programación original.",
            category: 'reprogramacion'
        },
        {
            id: 17,
            icon: FileSpreadsheet,
            title: "Reporte SAP Festivos Trabajados (Nuevos)",
            subtitle: "Días de festivos trabajados aprobados que se agregarán.",
            category: 'reprogramacion'
        },
        {
            id: 18,
            icon: FileSpreadsheet,
            title: "Reporte SAP Festivos Trabajados (Eliminar)",
            subtitle: "Días de festivos trabajados que se quitarán.",
            category: 'reprogramacion'
        },
        {
            id: 19,
            icon: RefreshCw,
            title: "Reprogramación de días asignados por la empresa",
            subtitle: "Días que los sindicalizados solicitaron cambiar (día original y nuevo día). Incluye estado, solicitado por y jefe que respondió.",
            category: 'reprogramacion'
        },
    ];

    const filteredReports = selectedCategory === 'all'
        ? reportCards
        : reportCards.filter(r => r.category === selectedCategory);

    const categoriaTitulos = {
        'programacion-anual': 'Programación Anual',
        'reprogramacion': 'Reprogramación',
        'all': 'Todos los reportes'
    };

    const handleDownload = async (reportId: number) => {
        const areaId = selectedArea ? parseInt(selectedArea) : undefined;
        const grupoId =
            selectedGroups.length === 1 ? availableGroups.find((g) => g.value === selectedGroups[0])?.grupoId : undefined;

        const runWithTimeout = async <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> =>
            new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error(`Tiempo de espera agotado (${label})`)), ms);
                promise
                    .then((res) => {
                        clearTimeout(timer);
                        resolve(res);
                    })
                    .catch((err) => {
                        clearTimeout(timer);
                        reject(err);
                    });
            });

        if (reportId === 1) {
            try {
                if (!selectedYear) {
                    toast.error("Selecciona el año para generar el reporte");
                    return;
                }

                const loadingToast = toast.loading("Generando listado de vacaciones asignadas por la empresa...");

                const data = await reportesService.obtenerVacacionesEmpresa({
                    anio: parseInt(selectedYear),
                    areaId,
                    grupoId
                });

                toast.dismiss(loadingToast);

                if (!data.vacaciones.length) {
                    toast.info("No hay vacaciones asignadas por la empresa con los filtros seleccionados");
                    return;
                }

                generarExcelVacacionesAsignadasEmpresa(data);
                toast.success(`Reporte descargado con ${data.totalVacaciones} vacaciones asignadas por la empresa`);
            } catch (error) {
                console.error("Error al descargar vacaciones asignadas por la empresa:", error);
                toast.dismiss();
                toast.error(
                    error instanceof Error
                        ? error.message
                        : "No se pudo generar el reporte de vacaciones asignadas por la empresa"
                );
            }
        } else if (reportId === 10) {
            try {
                const anio = selectedYear ? parseInt(selectedYear) : config?.anioVigente;
                if (!anio) {
                    toast.error("Selecciona el año para generar el reporte");
                    return;
                }

                const loadingToast = toast.loading("Generando reporte de empleados faltantes...");

                const data = await reportesService.obtenerEmpleadosFaltantesCaptura({
                    anio,
                    areaId,
                    grupoId
                });

                toast.dismiss(loadingToast);

                if (!data.empleados.length) {
                    toast.info("No hay empleados pendientes de capturar vacaciones con los filtros seleccionados");
                    return;
                }

                generarExcelEmpleadosFaltantesCaptura(data);
                toast.success(`Reporte descargado con ${data.totalEmpleados} empleado(s) pendiente(s)`);
            } catch (error) {
                console.error("Error al descargar empleados faltantes de capturar vacaciones:", error);
                toast.dismiss();
                toast.error(
                    error instanceof Error
                        ? error.message
                        : "No se pudo generar el reporte de faltantes de capturar vacaciones"
                );
            }
        }
        else if (reportId === 16) {
            // Permutas Eliminar
            try {
                if (!selectedYear) { toast.error("Selecciona el año"); return; }
                const loadingToast = toast.loading("Generando Reporte SAP Permutas (Eliminar)...");
                await reportesService.exportarReporteSAPPermutasEliminar({
                    year: parseInt(selectedYear),
                    areaId: selectedArea ? parseInt(selectedArea) : undefined,
                    gruposRol: selectedGroups.length > 0 ? selectedGroups : undefined,
                    fechaResolucionDesde: dateRangeFrom || singleDate || undefined,
                    fechaResolucionHasta: dateRangeTo || singleDate || undefined,
                    horaDesde: timeFrom || undefined,
                    horaHasta: timeTo || undefined,
                });
                toast.dismiss(loadingToast);
                toast.success("Reporte SAP Permutas (Eliminar) descargado");
            } catch (error) {
                toast.dismiss();
                toast.error(error instanceof Error ? error.message : "No se pudo generar el reporte");
            }
        } else if (reportId === 17) {
            // Festivos Nuevos
            try {
                if (!selectedYear) { toast.error("Selecciona el año"); return; }
                const loadingToast = toast.loading("Generando Reporte SAP Festivos (Nuevos)...");
                await reportesService.exportarReporteSAPFestivosNuevos({
                    year: parseInt(selectedYear),
                    areaId: selectedArea ? parseInt(selectedArea) : undefined,
                    gruposRol: selectedGroups.length > 0 ? selectedGroups : undefined,
                    fechaResolucionDesde: dateRangeFrom || singleDate || undefined,
                    fechaResolucionHasta: dateRangeTo || singleDate || undefined,
                    horaDesde: timeFrom || undefined,
                    horaHasta: timeTo || undefined,
                });
                toast.dismiss(loadingToast);
                toast.success("Reporte SAP Festivos (Nuevos) descargado");
            } catch (error) {
                toast.dismiss();
                toast.error(error instanceof Error ? error.message : "No se pudo generar el reporte");
            }
        } else if (reportId === 18) {
            // Festivos Eliminar
            try {
                if (!selectedYear) { toast.error("Selecciona el año"); return; }
                const loadingToast = toast.loading("Generando Reporte SAP Festivos (Eliminar)...");
                await reportesService.exportarReporteSAPFestivosEliminar({
                    year: parseInt(selectedYear),
                    areaId: selectedArea ? parseInt(selectedArea) : undefined,
                    gruposRol: selectedGroups.length > 0 ? selectedGroups : undefined,
                    fechaResolucionDesde: dateRangeFrom || singleDate || undefined,
                    fechaResolucionHasta: dateRangeTo || singleDate || undefined,
                    horaDesde: timeFrom || undefined,
                    horaHasta: timeTo || undefined,
                });
                toast.dismiss(loadingToast);
                toast.success("Reporte SAP Festivos (Eliminar) descargado");
            } catch (error) {
                toast.dismiss();
                toast.error(error instanceof Error ? error.message : "No se pudo generar el reporte");
            }
        }
        else if (reportId === 14) {
            try {
                if (!selectedYear) {
                    toast.error("Selecciona el año para generar el reporte");
                    return;
                }

                const loadingToast = toast.loading("Generando Reporte SAP Permutas...");

                const areaIdFilter = selectedArea ? parseInt(selectedArea) : undefined;
                const gruposRol = selectedGroups.length > 0 ? selectedGroups : undefined;

                await reportesService.exportarReporteSAPPermutas({
                    year: parseInt(selectedYear),
                    areaId: areaIdFilter,
                    gruposRol,
                    fechaResolucionDesde: dateRangeFrom || singleDate || undefined,
                    fechaResolucionHasta: dateRangeTo || singleDate || undefined,
                    horaDesde: timeFrom || undefined,
                    horaHasta: timeTo || undefined,
                });

                toast.dismiss(loadingToast);
                toast.success("Reporte SAP Permutas descargado exitosamente");
            } catch (error) {
                console.error("Error al descargar Reporte SAP Permutas:", error);
                toast.dismiss();
                toast.error(error instanceof Error ? error.message : "No se pudo generar el reporte");
            }
        }
        else if (reportId === 15) {
            try {
                const loadingToast = toast.loading("Generando Reporte de Festivos Trabajados...");

                const areaIdFilter = selectedArea ? parseInt(selectedArea) : undefined;

                let solicitudes = await festivosTrabajadosService.getSolicitudes({
                    estado: 'Aprobada',
                    areaId: areaIdFilter,
                });

                // Filtro de fecha y hora (client-side, igual que General de Reprogramaciones)
                if (hasDateFilter() || timeFrom || timeTo) {
                    solicitudes = solicitudes.filter((solicitud) => {
                        const fechaResolucion = solicitud.fechaAprobacion
                            ? new Date(solicitud.fechaAprobacion)
                            : null;
                        if (!fechaResolucion) return false;

                        if (dateFilterMode === 'single' && singleDate) {
                            const start = buildTimestamp(singleDate, timeFrom || "00:00");
                            const end = buildTimestamp(singleDate, timeTo || "23:59");
                            return fechaResolucion >= start && fechaResolucion <= end;
                        }

                        if (dateFilterMode === 'range') {
                            let cumple = true;
                            if (dateRangeFrom) {
                                const start = buildTimestamp(dateRangeFrom, timeFrom || "00:00");
                                cumple = cumple && fechaResolucion >= start;
                            }
                            if (dateRangeTo) {
                                const end = buildTimestamp(dateRangeTo, timeTo || "23:59");
                                cumple = cumple && fechaResolucion <= end;
                            }
                            return cumple;
                        }

                        return true;
                    });
                }

                toast.dismiss(loadingToast);

                if (!solicitudes.length) {
                    toast.info("No hay festivos trabajados aprobados con los filtros seleccionados.");
                    return;
                }

                const { exportarExcelFestivosTrabajados } = await import("@/utils/festivosTrabajadosExcel");
                const areaName = selectedArea
                    ? areas.find(a => a.areaId.toString() === selectedArea)?.nombreGeneral ?? "Sin área"
                    : "Todas";

                exportarExcelFestivosTrabajados(solicitudes, { area: areaName });
                toast.success(`Reporte descargado con ${solicitudes.length} registro(s).`);
            } catch (error) {
                console.error("Error al descargar Reporte de Festivos Trabajados:", error);
                toast.dismiss();
                toast.error(error instanceof Error ? error.message : "No se pudo generar el reporte.");
            }
        }
        else if (reportId === 5) {
            if (!selectedArea || selectedGroups.length === 0 || !selectedYear) {
                toast.error("Por favor selecciona área, grupos y año para generar la constancia de antiguedad");
                return;
            }

            let loadingToast: string | number | undefined;
            try {
                loadingToast = toast.loading("Generando PDF de Constancia de Antiguedad...");

                const areaDetails = await getAreaById(parseInt(selectedArea));
                const areaName = areaDetails?.nombreGeneral || "Sin área";
                const empleadosSindicalizados = await runWithTimeout(
                    empleadosService.getEmpleadosSindicalizados({
                        AreaId: parseInt(selectedArea),
                        Page: 1,
                        PageSize: 1000
                    }),
                    60000,
                    "empleados sindicalizados"
                );
                const empleadosLista = empleadosSindicalizados.usuarios || [];
                const empleadosPorNomina = new Map(empleadosLista.map((emp) => [String(emp.nomina), emp]));
                const nominasFiltradas = new Set(
                    empleadosLista
                        .filter((emp) => emp.grupo?.rol && selectedGroups.includes(emp.grupo.rol))
                        .map((emp) => String(emp.nomina))
                );
                if (selectedGroups.length > 0 && nominasFiltradas.size === 0) {
                    toast.error("No hay empleados en los grupos seleccionados para generar la constancia");
                    return;
                }

                const vacacionesAsignadas = await runWithTimeout(
                    vacacionesService.getVacacionesAsignadas(
                        {
                            areaId: parseInt(selectedArea),
                            anio: parseInt(selectedYear),
                            incluirDetalleEmpleado: true,
                            incluirResumenPorGrupo: false,
                            incluirResumenPorArea: false
                        },
                        { timeout: 120000 }
                    ),
                    120000,
                    "vacaciones asignadas"
                );

                const detalleFiltrado = (vacacionesAsignadas.empleadosDetalle || []).filter((empleado) =>
                    nominasFiltradas.size > 0 ? nominasFiltradas.has(String(empleado.nomina)) : true
                );

                if (!detalleFiltrado || detalleFiltrado.length === 0) {
                    toast.error("No se encontraron empleados con vacaciones asignadas para los criterios seleccionados");
                    return;
                }

                const empleadosData = detalleFiltrado.map((empleado: EmpleadoDetalle) => {
                    const resumen = empleado.resumen;
                    const vacaciones = empleado.vacaciones || [];

                    const diasVacacionesCorresponden =
                        (resumen?.diasAsignadosAutomaticamente || 0) + (resumen?.diasProgramables || 0);
                    const diasAdicionales = resumen?.diasProgramables || 0;

                    const diasProgramados = vacaciones
                        .filter((v: any) => v.estadoVacacion === "Activa")
                        .map((v: any) => {
                            const [year, month, day] = v.fechaVacacion.split("-");
                            const fechaFormateada = `${month}/${day}/${year}`;
                            return {
                                de: fechaFormateada,
                                al: fechaFormateada,
                                dias: 1,
                                tipoVacacion: v.tipoVacacion
                            };
                        });

                    const totalVacacionesAsignadas = vacaciones.filter((v: any) => v.estadoVacacion === "Activa").length;
                    const totalAutomaticas = vacaciones.filter(
                        (v: any) => v.tipoVacacion === "Automatica" && v.estadoVacacion === "Activa"
                    ).length;
                    const totalAnuales = vacaciones.filter(
                        (v: any) => v.tipoVacacion === "Anual" && v.estadoVacacion === "Activa"
                    ).length;

                    const totalProgramados = totalVacacionesAsignadas;
                    const porProgramar = (empleado.totalVacaciones || 0) - totalAutomaticas - totalAnuales;
                    const totalGozados = 0;
                    const porGozar = empleado.totalVacaciones || 0;
                    const empleadoInfo = empleado.nomina ? empleadosPorNomina.get(String(empleado.nomina)) : undefined;
                    const fechaIngresoRaw = empleadoInfo?.fechaIngreso || (empleado as any).fechaIngreso || null;
                    const fechaIngreso = fechaIngresoRaw ? formatFechaMMDDYYYY(fechaIngresoRaw) : "";
                    const antiguedadAnios = calculateAntiguedadAlCierre(fechaIngresoRaw, parseInt(selectedYear));

                    return {
                        nomina: empleado.nomina || "N/A",
                        nombre: empleado.nombreCompleto || "N/A",
                        fechaIngreso: fechaIngreso || "",
                        antiguedadAnios,
                        diasVacacionesCorresponden,
                        diasAdicionales,
                        diasProgramados,
                        diasGozados: [],
                        totalProgramados,
                        porProgramar: Math.max(0, porProgramar),
                        totalGozados,
                        porGozar
                    };
                });

                const pdfData = {
                    empleados: empleadosData,
                    area: areaName,
                    grupos: selectedGroups,
                    targetYear: parseInt(selectedYear),
                    periodo: {
                        inicio: `01/01/${selectedYear}`,
                        fin: `12/31/${selectedYear}`
                    }
                };

                await downloadConstanciaAntiguedadPDF(pdfData);
                toast.success(`PDF de Constancia de Antiguedad generado para ${empleadosData.length} empleado(s)`);
            } catch (error) {
                console.error("Error generating constancia PDF:", error);
                toast.error(error instanceof Error ? error.message : "Error al generar el PDF de Constancia de Antiguedad");
            } finally {
                if (loadingToast !== undefined) {
                    toast.dismiss(loadingToast);
                } else {
                    toast.dismiss();
                }
            }
        } else if (reportId === 6) {
            try {
                const loadingToast = toast.loading("Generando reporte de empleados sin asignación automática...");

                const config = await vacacionesService.getConfig();

                const empleadosSinAsignacion = await AsignacionAutomaticaService.getEmpleadosSinAsignacion(
                    config.anioVigente
                );

                if (empleadosSinAsignacion.totalEmpleadosSinAsignacion === 0) {
                    toast.dismiss(loadingToast);
                    toast.info("No hay empleados sin asignación automática");
                    return;
                }

                const { generarExcelEmpleadosSinAsignacion } = await import("@/utils/empleadosSinAsignacionExcel");
                generarExcelEmpleadosSinAsignacion(empleadosSinAsignacion);

                toast.dismiss(loadingToast);
                toast.success(
                    `Reporte descargado exitosamente con ${empleadosSinAsignacion.totalEmpleadosSinAsignacion} empleados sin asignación`
                );
            } catch (error) {
                console.error("Error al descargar empleados sin asignación:", error);
                toast.dismiss();
                toast.error(
                    error instanceof Error ? error.message : "No se pudo descargar el reporte de empleados sin asignación"
                );
            }
        } else if (reportId === 7) {
            try {
                const loadingToast = toast.loading("Generando reporte de empleados que no respondieron...");

                const config = await vacacionesService.getConfig();

                const areaIdFilter = selectedArea ? parseInt(selectedArea) : undefined;
                const grupoIdFilter =
                    selectedGroups.length === 1 ? availableGroups.find((g) => g.value === selectedGroups[0])?.liderId : undefined;

                const empleadosNoRespondieron = await BloquesReservacionService.obtenerEmpleadosNoRespondieron(
                    config.anioVigente,
                    areaIdFilter,
                    grupoIdFilter
                );

                if (empleadosNoRespondieron.totalEmpleadosNoRespondio === 0) {
                    toast.dismiss(loadingToast);
                    toast.info("No hay empleados que no hayan respondido");
                    return;
                }

                const { generarExcelEmpleadosNoRespondieron } = await import("@/utils/empleadosNoRespondieronExcel");
                generarExcelEmpleadosNoRespondieron(empleadosNoRespondieron);

                toast.dismiss(loadingToast);

                const mensaje =
                    empleadosNoRespondieron.empleadosEnBloqueCola > 0
                        ? `Reporte descargado: ${empleadosNoRespondieron.totalEmpleadosNoRespondio} empleados (${empleadosNoRespondieron.empleadosEnBloqueCola} CRÍTICOS en bloque cola)`
                        : `Reporte descargado: ${empleadosNoRespondieron.totalEmpleadosNoRespondio} empleados que no respondieron`;

                toast.success(mensaje);
            } catch (error) {
                console.error("Error al descargar empleados que no respondieron:", error);
                toast.dismiss();
                toast.error(
                    error instanceof Error ? error.message : "No se pudo descargar el reporte de empleados que no respondieron"
                );
            }
        } else if (reportId === 8) {
            try {
                const loadingToast = toast.loading("Generando reporte de vacaciones por área...");

                const yearToExport = selectedYear ? parseInt(selectedYear) : undefined;

                await reportesService.exportarVacacionesPorArea(yearToExport);

                toast.dismiss(loadingToast);
                toast.success("Reporte de vacaciones por área descargado exitosamente");
            } catch (error) {
                console.error("Error al descargar reporte de vacaciones por área:", error);
                toast.dismiss();
                toast.error(error instanceof Error ? error.message : "No se pudo descargar el reporte de vacaciones por área");
            }
        } else if (reportId === 9) {
            try {
                if (!selectedYear) {
                    toast.error("Selecciona el año para generar el Reporte SAP");
                    return;
                }

                const loadingToast = toast.loading("Generando Reporte SAP...");

                const areaIdFilter = selectedArea ? parseInt(selectedArea) : undefined;
                const gruposRol = selectedGroups.length > 0 ? selectedGroups : undefined;

                await reportesService.exportarReporteSAP({
                    year: parseInt(selectedYear),
                    areaId: areaIdFilter,
                    gruposRol
                });

                toast.dismiss(loadingToast);
                toast.success("Reporte SAP descargado exitosamente");
            } catch (error) {
                console.error("Error al descargar Reporte SAP:", error);
                toast.dismiss();
                toast.error(error instanceof Error ? error.message : "No se pudo generar el Reporte SAP");
            }
        } else if (reportId === 11) {
            await handleReprogGeneral();
        } else if (reportId === 12 || reportId === 13) {
            try {
                if (!selectedYear) {
                    toast.error("Selecciona el año para generar el reporte");
                    return;
                }

                const tipo = reportId === 12 ? 'eliminar' : 'nuevos';
                const loadingToast = toast.loading(`Generando Reporte SAP Reprogramación (${tipo})...`);

                const areaIdFilter = selectedArea ? parseInt(selectedArea) : undefined;
                const gruposRol = selectedGroups.length > 0 ? selectedGroups : undefined;

                await reportesService.exportarReporteSAPReprogramacion(tipo, {
                    year: parseInt(selectedYear),
                    areaId: areaIdFilter,
                    gruposRol,
                    fechaResolucionDesde: dateRangeFrom || singleDate || undefined,
                    fechaResolucionHasta: dateRangeTo || singleDate || undefined,
                    horaDesde: timeFrom || undefined,
                    horaHasta: timeTo || undefined,
                });

                toast.dismiss(loadingToast);
                toast.success(`Reporte SAP Reprogramación (${tipo}) descargado exitosamente`);
            } catch (error) {
                console.error("Error al descargar Reporte SAP Reprogramación:", error);
                toast.dismiss();
                toast.error(error instanceof Error ? error.message : "No se pudo generar el reporte");
            }
        }
        else if (reportId === 19) {
            try {
                const anio = selectedYear ? parseInt(selectedYear) : undefined;
                const areaIdFilter = selectedArea ? parseInt(selectedArea) : undefined;
                const areaName = selectedArea
                    ? areas.find(a => a.areaId.toString() === selectedArea)?.nombreGeneral ?? 'Sin área'
                    : 'Todas';

                const loadingToast = toast.loading("Generando reporte de reprogramación de días asignados por la empresa...");
                const datos = await edicionDiasEmpresaService.obtenerReporte(anio, areaIdFilter);
                toast.dismiss(loadingToast);

                if (!datos.length) {
                    toast.info("No hay registros con los filtros seleccionados.");
                    return;
                }

                const { exportarEdicionDiasEmpresaExcel } = await import("@/utils/edicionDiasEmpresaExcel");
                exportarEdicionDiasEmpresaExcel(datos, { area: areaName, anio });
                toast.success(`Reporte descargado (${datos.length} registro(s)).`);
            } catch (error) {
                toast.dismiss();
                toast.error(error instanceof Error ? error.message : 'No se pudo generar el reporte');
            }
        }
        else {
            console.log(`Descargando reporte ${reportId}`);
            toast.info("Funcionalidad en desarrollo para este tipo de reporte");
        }
    };

    const hasAnyTemporalFilter = hasDateFilter() || !!(timeFrom || timeTo);

    return (
        <div className="space-y-6 p-6 max-w-7xl mx-auto">
            <div className="space-y-6">
                <div className="space-y-2">
                    <div className="text-[25px] font-bold text-continental-black text-left">Descargar Reportes</div>
                    <p className="text-[16px] font-medium text-continental-black text-left">
                        Accede y descarga los reportes más relevantes
                    </p>
                </div>

                <div className="space-y-2">
                    <Label className="text-base font-medium text-continental-black">Área (opcional)</Label>
                    <Select
                        value={selectedArea || "0"}
                        onValueChange={(value) => {
                            setSelectedArea(value === "0" ? "" : value);
                            setSelectedGroups([]);
                            setAvailableGroups([]);
                        }}
                        disabled={areasLoading}
                    >
                        <SelectTrigger className="w-full max-w-sm">
                            {areasLoading ? (
                                <div className="flex items-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Cargando áreas...
                                </div>
                            ) : (
                                <SelectValue placeholder="Todas las áreas" />
                            )}
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="0">Todas las áreas</SelectItem>
                            {areas.map((area) => (
                                <SelectItem key={area.areaId} value={area.areaId.toString()}>
                                    {area.nombreGeneral}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label className="text-base font-medium text-continental-black">Grupo (opcional)</Label>
                    {areasLoading || !selectedArea ? (
                        <div className="flex gap-2">
                            <div className="flex flex-wrap gap-2">
                                <Button variant="outline" disabled className="opacity-50">
                                    {areasLoading ? "Cargando grupos..." : "Selecciona un área primero"}
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            <div className="flex flex-wrap gap-2">
                                {availableGroups.map((group) => (
                                    <Button
                                        key={group.value}
                                        variant={selectedGroups.includes(group.value) ? "default" : "outline"}
                                        type="button"
                                        onClick={() => {
                                            setSelectedGroups((prev) =>
                                                prev.includes(group.value) ? prev.filter((g) => g !== group.value) : [...prev, group.value]
                                            );
                                        }}
                                        className="rounded-full"
                                    >
                                        {group.label}
                                        {selectedGroups.includes(group.value) && <span className="ml-2">✓</span>}
                                    </Button>
                                ))}
                            </div>
                            {selectedGroups.length > 0 && (
                                <div className="text-sm text-muted-foreground mt-1">{selectedGroups.length} grupo(s) seleccionado(s)</div>
                            )}
                        </div>
                    )}
                </div>

                <div className="space-y-2">
                    <Label className="text-base font-medium text-continental-black">Año</Label>
                    <Select value={selectedYear} onValueChange={setSelectedYear}>
                        <SelectTrigger className="w-full max-w-sm">
                            <SelectValue placeholder="Seleccionar año" />
                        </SelectTrigger>
                        <SelectContent>
                            {Array.from({ length: (config?.anioVigente || new Date().getFullYear()) - 2020 + 3 }, (_, i) => {
                                const year = 2020 + i;
                                return (
                                    <SelectItem key={year} value={year.toString()}>
                                        {year}
                                    </SelectItem>
                                );
                            })}
                        </SelectContent>
                    </Select>
                </div>

                {/* 🆕 SECCIÓN COMBINADA: Filtro de fecha y hora */}
                <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4 max-w-2xl">
                    <div className="flex items-center justify-between">
                        <Label className="text-base font-medium text-continental-black">
                            Filtro por fecha y hora (opcional)
                        </Label>
                        {hasAnyTemporalFilter && (
                            <button
                                onClick={clearAllTemporalFilters}
                                className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 underline"
                            >
                                <X size={12} />
                                Limpiar todo
                            </button>
                        )}
                    </div>

                    {/* Selector de modo de fecha */}
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => { setDateFilterMode('single'); clearDateFilters(); }}
                            className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${dateFilterMode === 'single'
                                ? 'bg-continental-black text-white border-continental-black'
                                : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                                }`}
                        >
                            Día específico
                        </button>
                        <button
                            type="button"
                            onClick={() => { setDateFilterMode('range'); clearDateFilters(); }}
                            className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${dateFilterMode === 'range'
                                ? 'bg-continental-black text-white border-continental-black'
                                : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                                }`}
                        >
                            Rango de fechas
                        </button>
                    </div>

                    {/* Input(s) de fecha según el modo */}
                    {dateFilterMode === 'single' ? (
                        <div className="flex flex-col gap-1">
                            <span className="text-xs text-gray-600">Fecha</span>
                            <input
                                type="date"
                                value={singleDate}
                                onChange={(e) => setSingleDate(e.target.value)}
                                className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-xs bg-white"
                            />
                            {singleDate && (
                                <span className="text-xs text-gray-500 italic">{formatDateDisplay(singleDate)}</span>
                            )}
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-3">
                            <div className="flex flex-col gap-1">
                                <span className="text-xs text-gray-600">Fecha desde</span>
                                <input
                                    type="date"
                                    value={dateRangeFrom}
                                    max={dateRangeTo || undefined}
                                    onChange={(e) => setDateRangeFrom(e.target.value)}
                                    className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                />
                                {dateRangeFrom && (
                                    <span className="text-xs text-gray-500 italic">{formatDateDisplay(dateRangeFrom)}</span>
                                )}
                            </div>
                            <div className="flex flex-col gap-1">
                                <span className="text-xs text-gray-600">Fecha hasta</span>
                                <input
                                    type="date"
                                    value={dateRangeTo}
                                    min={dateRangeFrom || undefined}
                                    onChange={(e) => setDateRangeTo(e.target.value)}
                                    className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                />
                                {dateRangeTo && (
                                    <span className="text-xs text-gray-500 italic">{formatDateDisplay(dateRangeTo)}</span>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Separador visual */}
                    <div className="flex items-center gap-2 pt-1">
                        <div className="h-px flex-1 bg-gray-200" />
                        <span className="text-xs text-gray-400 px-2">y opcionalmente filtrar por hora</span>
                        <div className="h-px flex-1 bg-gray-200" />
                    </div>

                    {/* Filtro de horas */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                            <span className="text-xs text-gray-600">Hora desde</span>
                            <input
                                type="time"
                                value={timeFrom}
                                onChange={(e) => setTimeFrom(e.target.value)}
                                className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                            />
                            {timeFrom && (
                                <span className="text-xs text-gray-500 italic">{formatTime12Hour(timeFrom)}</span>
                            )}
                        </div>
                        <div className="flex flex-col gap-1">
                            <span className="text-xs text-gray-600">Hora hasta</span>
                            <input
                                type="time"
                                value={timeTo}
                                onChange={(e) => setTimeTo(e.target.value)}
                                className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                            />
                            {timeTo && (
                                <span className="text-xs text-gray-500 italic">{formatTime12Hour(timeTo)}</span>
                            )}
                        </div>
                    </div>

                    {/* Resumen de filtros activos */}
                    {hasAnyTemporalFilter && (
                        <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-xs text-blue-700 flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="font-medium">Filtros activos:</span>
                            {hasDateFilter() && (
                                <span>
                                    📅 {getActiveDateLabel()}
                                </span>
                            )}
                            {(timeFrom || timeTo) && (
                                <span>
                                    🕐 {timeFrom ? formatTime12Hour(timeFrom) : "inicio"} — {timeTo ? formatTime12Hour(timeTo) : "fin"}
                                </span>
                            )}
                        </div>
                    )}
                </div>

                {/* Categoría de reporte */}
                <div className="space-y-2">
                    <Label className="text-base font-medium text-continental-black">Categoría de reporte</Label>
                    <Select
                        value={selectedCategory}
                        onValueChange={(value) => setSelectedCategory(value as any)}
                    >
                        <SelectTrigger className="w-full max-w-sm">
                            <SelectValue placeholder="Seleccionar categoría" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos los reportes</SelectItem>
                            <SelectItem value="programacion-anual">Programación Anual</SelectItem>
                            <SelectItem value="reprogramacion">Reprogramación</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-base font-bold text-continental-black">
                            {categoriaTitulos[selectedCategory]}
                        </h2>
                        <span className="text-sm text-gray-600">
                            {filteredReports.length} reporte(s)
                        </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {filteredReports.map((report) => (
                            <Card key={report.id} className="rounded-xl border-gray-300">
                                <CardContent className="p-6">
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-start gap-4">
                                            <div className="flex-shrink-0">
                                                <report.icon size={48} className="text-continental-black" />
                                            </div>

                                            <div className="space-y-2">
                                                <h3 className="font-semibold text-continental-black">{report.title}</h3>
                                                <p className="text-sm text-gray-600">{report.subtitle}</p>
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-xs px-2 py-0.5 rounded-full ${report.category === 'programacion-anual'
                                                        ? 'bg-blue-100 text-blue-700'
                                                        : 'bg-purple-100 text-purple-700'
                                                        }`}>
                                                        {report.category === 'programacion-anual' ? 'Programación Anual' : 'Reprogramación'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <Button onClick={() => handleDownload(report.id)} variant="continental" className="flex items-center gap-2">
                                            <Download size={16} />
                                            Descargar
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>

            </div>
        </div>
    );
};