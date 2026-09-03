import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { DateRangeInput } from "@/components/ui/date-range-input";
import { Card, CardContent } from "@/components/ui/card";
import { downloadConstanciaAntiguedadPDF } from "@/services/pdfService";
import { toast } from "sonner";
import { empleadosService } from "@/services/empleadosService";
import { solicitudesService } from "@/services/solicitudesService";
import { areasService } from "@/services/areasService";
import { useVacationConfig } from "@/hooks/useVacationConfig";
import type { Area } from "@/interfaces/Areas.interface";
import { PeriodOptions } from "@/interfaces/Calendar.interface";
import { exportarReprogramacionesExcel } from "@/utils/reprogramacionesExcel";
import { ReporteAprobaciones } from "./ReporteAprobaciones";
import { reportesService } from "@/services/reportesService";
import { edicionDiasEmpresaService } from "@/services/edicionDiasEmpresaService";
import { vacacionesService, getDiasConRebasePorcentaje } from "@/services/vacacionesService";
import { generarExcelDiasRebasePorcentaje } from "@/utils/diasRebasePorcentajeExcel";
import { generarExcelVacacionesAsignadasEmpresa } from "@/utils/vacacionesAsignadasEmpresaExcel";
import { generarExcelEmpleadosFaltantesCaptura } from "@/utils/empleadosFaltantesCapturaExcel";
import { BloquesReservacionService } from "@/services/bloquesReservacionService";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type { EmpleadoDetalle } from "@/interfaces/Api.interface";
import {
  Download,
  Palmtree,
  Calendar,
  RefreshCw,
  FileText,
  Award,
  ShieldCheck,
  ShieldAlert,
  FileSpreadsheet,
  AlertTriangle,
  UserMinus,
  Loader2,
  X
} from "lucide-react";

const MIN_REPROGRAMACION_DATE = "2026-01-01";

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

const formatFechaMMDDYYYY = (fecha: string | undefined | null): string => {
  if (!fecha) return "";
  const normalized = fecha.includes("T") ? fecha : `${fecha}T00:00:00`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
};

export const Reportes = () => {
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [areas, setAreas] = useState<Area[]>([]);
  const [selectedArea, setSelectedArea] = useState<number | "all">("all");
  const [loadingGeneral, setLoadingGeneral] = useState(false);
  const [loadingFiltered, setLoadingFiltered] = useState(false);
  const { currentPeriod, loading: configLoading, config } = useVacationConfig();
  const isReprogramming = currentPeriod === PeriodOptions.reprogramming;
  const [selectedYear, setSelectedYear] = useState<string>("");
  // Ver la nota del mismo estado en Dashboard-Admin/Reportes: los reportes de
  // bloques van contra el anio en preparacion mientras no se elija otro.
  const [anioTocado, setAnioTocado] = useState(false);

  useEffect(() => {
    if (config?.anioVigente && !selectedYear) {
      setSelectedYear(config.anioVigente.toString());
    }
  }, [config, selectedYear]);

  // Años que se ofrecen: desde 2020 hasta dos después del mayor entre el
  // vigente, el que está en preparación y el actual. Antes el jefe/RH no tenía
  // selector: todos los reportes salían del año vigente aunque ya se estuviera
  // preparando el siguiente.
  const aniosDisponibles = useMemo(() => {
    const tope = Math.max(config?.anioVigente || 0, config?.anioProgramacionAnual || 0, new Date().getFullYear()) + 2;
    return Array.from({ length: tope - 2020 + 1 }, (_, i) => 2020 + i);
  }, [config?.anioVigente, config?.anioProgramacionAnual]);

  useEffect(() => {
    const loadAreas = async () => {
      try {
        const fetched = await areasService.getAreas();
        const ordered = [...fetched].sort((a, b) => (a.areaId || 0) - (b.areaId || 0));
        setAreas(ordered);
      } catch (error) {
        console.error("Error cargando areas", error);
        toast.error("No se pudieron cargar las areas");
      }
    };
    loadAreas();
  }, []);

  // Grupos del área elegida. El jefe solo tenía filtro de área (y ni ese estaba
  // en pantalla): la constancia le salía de toda el área aunque quisiera un
  // grupo. Mismo comportamiento que el superusuario.
  const [availableGroups, setAvailableGroups] = useState<{ value: string; label: string; grupoId?: number }[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);

  useEffect(() => {
    const loadGroups = async () => {
      if (selectedArea === "all") {
        setAvailableGroups([]);
        setSelectedGroups([]);
        return;
      }
      try {
        const grupos = await areasService.getGroupsByAreaId(selectedArea as number);
        setAvailableGroups(grupos.map((g) => ({ value: g.rol, label: g.rol, grupoId: g.grupoId })));
      } catch (error) {
        console.error("Error cargando grupos del área", error);
        setAvailableGroups([]);
      }
      setSelectedGroups([]);
    };
    loadGroups();
  }, [selectedArea]);

  const selectedAreaName = useMemo(() => {
    if (selectedArea === "all") return "Todas";
    const found = areas.find((a) => a.areaId === selectedArea);
    return found?.nombreGeneral || `Área ${selectedArea}`;
  }, [areas, selectedArea]);
    type DateFilterMode = 'single' | 'range';
    type ReportCategory = 'programacion-anual' | 'reprogramacion';
    interface ReportCard { id: number; icon: any; title: string; subtitle: string; category: ReportCategory; requiresReprogramming?: boolean; }

    const [selectedCategory, setSelectedCategory] = useState<ReportCategory | 'all'>('all');

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
            id: 10,
            icon: UserMinus,
            title: "Empleados faltantes de capturar vacaciones",
            subtitle: "Asignados en bloque cola sin vacaciones manuales activas.",
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
            id: 11,
            icon: RefreshCw,
            title: "General de Reprogramaciones",
            subtitle: "Todas las reprogramaciones (solo en periodo de reprogramación).",
            category: 'reprogramacion',
            requiresReprogramming: true
        },
        {
            id: 19,
            icon: RefreshCw,
            title: "Reprogramación de días asignados por la empresa",
            subtitle: "Días que los sindicalizados solicitaron cambiar (día original y nuevo día asignado).",
            category: 'programacion-anual'
        },
        {
            id: 20,
            icon: ShieldAlert,
            title: "Días capturados con rebase del porcentaje",
            subtitle: "Días capturados aun con el grupo por encima del porcentaje permitido, con quién los capturó.",
            category: 'programacion-anual'
        },
    ];

  const ensureReprogramming = (): boolean => {
    if (!isReprogramming) {
      toast.error("Disponible solo durante el periodo de reprogramacion.");
      return false;
    }
    return true;
  };

  const handleDownloadConstancia = async () => {
    if (!selectedYear) {
      toast.error("Selecciona el año para generar la constancia de antiguedad");
      return;
    }

    const areaId = selectedArea === "all" ? undefined : selectedArea;
    let loadingToast: string | number | undefined;

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

    try {
      loadingToast = toast.loading("Generando PDF de Constancia de Antiguedad...");

      const empleadosResponse = await runWithTimeout(
        empleadosService.getEmpleadosSindicalizados({
          AreaId: areaId,
          Page: 1,
          PageSize: 1000
        }),
        60000,
        "empleados sindicalizados"
      );

      const empleadosLista = empleadosResponse.usuarios || [];
      const empleadosPorNomina = new Map(empleadosLista.map((emp) => [String(emp.nomina), emp]));

      // Los códigos de grupo no se escriben igual en todos lados (R0144_02 /
      // R0144-02): se compara por id y, si no viene, por el código normalizado.
      const normalizarRol = (valor?: string | null) => (valor ?? "").replace(/[_\-\s]/g, "").toUpperCase();
      const idsSeleccionados = new Set(
        availableGroups
          .filter((g) => selectedGroups.includes(g.value))
          .map((g) => g.grupoId)
          .filter((id): id is number => typeof id === "number")
      );
      const rolesSeleccionados = new Set(selectedGroups.map(normalizarRol));

      const nominasFiltradas = new Set(
        empleadosLista
          .filter((emp) => !selectedArea || selectedArea === "all" || emp.area?.areaId === selectedArea)
          .filter((emp) =>
            selectedGroups.length === 0 ||
            (emp.grupo?.grupoId != null && idsSeleccionados.has(emp.grupo.grupoId)) ||
            rolesSeleccionados.has(normalizarRol(emp.grupo?.rol))
          )
          .map((emp) => String(emp.nomina))
      );

      if (nominasFiltradas.size === 0) {
        toast.dismiss(loadingToast);
        toast.error("No hay empleados sindicalizados con los criterios seleccionados");
        return;
      }

      const vacacionesAsignadas = await runWithTimeout(
        vacacionesService.getVacacionesAsignadas(
          {
            areaId: areaId,
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
        const totalAnuales = vacaciones.filter((v: any) => v.tipoVacacion === "Anual" && v.estadoVacacion === "Activa")
          .length;

        const totalProgramados = totalVacacionesAsignadas;
        const porProgramar = (empleado.totalVacaciones || 0) - totalAutomaticas - totalAnuales;
        const totalGozados = 0;
        const porGozar = empleado.totalVacaciones || 0;

        const empleadoInfo = empleado.nomina ? empleadosPorNomina.get(String(empleado.nomina)) : undefined;
        const fechaIngresoRaw = empleadoInfo?.fechaIngreso || (empleado as any).fechaIngreso || "";
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
        area: selectedAreaName,
        grupos: selectedGroups.length > 0
          ? selectedGroups
          : selectedArea === "all" ? ["Toda la planta"] : ["Todos los grupos"],
        periodo: {
          inicio: `01/01/${selectedYear}`,
          fin: `12/31/${selectedYear}`
        },
        targetYear: parseInt(selectedYear)
      };

      await downloadConstanciaAntiguedadPDF(pdfData);
      toast.success(`PDF de Constancia de Antiguedad generado para ${empleadosData.length} empleado(s)`);
    } catch (error) {
      console.error("Error generating PDF (Dashboard-Area):", error);
      toast.error(error instanceof Error ? error.message : "Error al generar el PDF de Constancia de Antiguedad");
    } finally {
      if (loadingToast !== undefined) {
        toast.dismiss(loadingToast);
      } else {
        toast.dismiss();
      }
    }
  };

  const validateFiltered = (): boolean => {
    if (!startDate || !endDate) {
      toast.error("Captura el rango de fechas (inicio y fin).");
      return false;
    }
    if (new Date(startDate) < new Date(MIN_REPROGRAMACION_DATE)) {
      toast.error("El calendario de reprogramaciones comienza en 2026.");
      return false;
    }
    if (new Date(startDate) > new Date(endDate)) {
      toast.error("La fecha de inicio no puede ser mayor a la fecha fin.");
      return false;
    }
    if (selectedArea === "all") {
      toast.error("Selecciona el área para filtrar.");
      return false;
    }
    return true;
  };

  const handleReprogGeneral = async () => {
    if (!ensureReprogramming()) return;
    setLoadingGeneral(true);
    try {
      const response = await solicitudesService.getSolicitudesList({
        areaId: selectedArea === "all" ? undefined : selectedArea,
        fechaDesde: undefined,
        fechaHasta: undefined
      });

      const solicitudes = response?.solicitudes || [];
      if (solicitudes.length === 0) {
        toast.info("No hay reprogramaciones con los filtros seleccionados.");
        return;
      }

      exportarReprogramacionesExcel(solicitudes, {
        titulo: "Reporte general de reprogramaciones",
        tipo: "general",
        area: selectedAreaName,
        fechaDesde: undefined,
        fechaHasta: undefined
      });
      toast.success("Reporte general descargado.");
    } catch (error: any) {
      console.error("Error al descargar reprogramaciones generales", error);
      toast.error(error?.message || "No se pudo generar el reporte general de reprogramaciones.");
    } finally {
      setLoadingGeneral(false);
    }
  };

  const handleReprogFiltrado = async () => {
    if (!ensureReprogramming()) return;
    if (!validateFiltered()) return;
    setLoadingFiltered(true);
    try {
      const response = await solicitudesService.getSolicitudesList({
        areaId: selectedArea === "all" ? undefined : selectedArea
      });

      const solicitudes = response?.solicitudes || [];
      const start = new Date(startDate);
      const end = new Date(endDate);
      const isInRange = (value?: string | null) => {
        if (!value) return false;
        const current = new Date(value);
        if (Number.isNaN(current.getTime())) return false;
        return current >= start && current <= end;
      };

      const filteredByDates = solicitudes.filter((s) => isInRange(s.fechaOriginal) || isInRange(s.fechaNueva));

      if (filteredByDates.length === 0) {
        toast.info("No se encontraron reprogramaciones usando fecha original o nueva en ese rango.");
        return;
      }

      exportarReprogramacionesExcel(filteredByDates, {
        titulo: "Reprogramaciones por área y fecha",
        tipo: "hu57",
        area: selectedAreaName,
        fechaDesde: startDate,
        fechaHasta: endDate
      });
      toast.success("Reporte filtrado descargado.");
    } catch (error: any) {
      console.error("Error al descargar reporte filtrado", error);
      toast.error(error?.message || "No se pudo generar el reporte filtrado.");
    } finally {
      setLoadingFiltered(false);
    }
  };

  const handleDownloadVacacionesAsignadas = async () => {
    try {
      if (!selectedYear) {
        toast.error("Selecciona el año para generar el reporte");
        return;
      }

      const loadingToast = toast.loading("Generando listado de vacaciones asignadas por la empresa...");

      const data = await reportesService.obtenerVacacionesEmpresa({
        anio: parseInt(selectedYear),
        areaId: selectedArea === "all" ? undefined : selectedArea,
        grupoId: undefined
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
        error instanceof Error ? error.message : "No se pudo generar el reporte de vacaciones asignadas por la empresa"
      );
    }
  };

    const handleDownload = async (reportId: number) => {
        if (reportId === 20) {
            try {
                toast.loading("Generando reporte de días con rebase...");
                const anio = selectedYear ? parseInt(selectedYear) : (config?.anioVigente ?? new Date().getFullYear());
                const areaIdFiltro = selectedArea === "all" ? undefined : (selectedArea as number);
                const grupoIdFiltro = selectedGroups.length === 1
                    ? availableGroups.find((g) => g.value === selectedGroups[0])?.grupoId
                    : undefined;

                const filas = await getDiasConRebasePorcentaje(anio, {
                    areaId: areaIdFiltro,
                    grupoId: grupoIdFiltro,
                });
                toast.dismiss();

                generarExcelDiasRebasePorcentaje(filas, { anio, area: selectedAreaName });
                toast.success(
                    filas.length > 0
                        ? `Reporte descargado (${filas.length} día(s) con rebase).`
                        : "No hay días capturados con rebase para esos filtros; el archivo se descargó vacío."
                );
            } catch (error) {
                toast.dismiss();
                toast.error(error instanceof Error ? error.message : "No se pudo generar el reporte");
            }
            return;
        }
        if (reportId === 1) {
            await handleDownloadVacacionesAsignadas();
        } else if (reportId === 5) {
            await handleDownloadConstancia();
        } else if (reportId === 11) {
            await handleReprogGeneral();
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
                    areaId: selectedArea === "all" ? undefined : selectedArea,
                    grupoId: undefined
                });
                toast.dismiss(loadingToast);
                if (!data.empleados.length) {
                    toast.info("No hay empleados pendientes de capturar vacaciones con los filtros seleccionados");
                    return;
                }
                generarExcelEmpleadosFaltantesCaptura(data);
                toast.success(`Reporte descargado con ${data.totalEmpleados} empleado(s) pendiente(s)`);
            } catch (error) {
                toast.dismiss();
                toast.error(error instanceof Error ? error.message : "No se pudo generar el reporte de faltantes de capturar vacaciones");
            }
        } else if (reportId === 7) {
            try {
                const anio = anioTocado && selectedYear
                    ? parseInt(selectedYear)
                    : (config?.anioProgramacionAnual ?? config?.anioVigente);
                if (!anio) {
                    toast.error("Selecciona el año para generar el reporte");
                    return;
                }
                const loadingToast = toast.loading("Generando reporte de empleados que no respondieron...");
                const data = await BloquesReservacionService.obtenerEmpleadosNoRespondieron(
                    anio,
                    selectedArea === "all" ? undefined : selectedArea,
                    undefined
                );
                toast.dismiss(loadingToast);
                if (data.totalEmpleadosNoRespondio === 0) {
                    toast.info(`No hay empleados que no hayan respondido en ${anio}`);
                    return;
                }
                const { generarExcelEmpleadosNoRespondieron } = await import("@/utils/empleadosNoRespondieronExcel");
                generarExcelEmpleadosNoRespondieron(data);
                toast.success(`Reporte descargado: ${data.totalEmpleadosNoRespondio} empleado(s) que no respondieron`);
            } catch (error) {
                toast.dismiss();
                toast.error(error instanceof Error ? error.message : "No se pudo descargar el reporte de empleados que no respondieron");
            }
        } else if (reportId === 19) {
            try {
                const anio = selectedYear ? parseInt(selectedYear) : undefined;
                const areaIdFilter = selectedArea === 'all' ? undefined : selectedArea;
                const loadingToast = toast.loading("Generando reporte de reprogramación de días asignados por la empresa...");
                const datos = await edicionDiasEmpresaService.obtenerReporte(anio, areaIdFilter);
                toast.dismiss(loadingToast);
                if (!datos.length) {
                    toast.info("No hay registros con los filtros seleccionados.");
                    return;
                }
                const { exportarEdicionDiasEmpresaExcel } = await import("@/utils/edicionDiasEmpresaExcel");
                exportarEdicionDiasEmpresaExcel(datos, { area: selectedAreaName, anio });
                toast.success(`Reporte descargado (${datos.length} registro(s)).`);
            } catch (error) {
                toast.dismiss();
                toast.error(error instanceof Error ? error.message : "No se pudo generar el reporte");
            }
        } else if (reportId === 8) {
            // Estaba listado en la pantalla del jefe pero sin rama aqui, asi que
            // caia al "en desarrollo" de abajo. El endpoint ya existia; lo unico
            // que faltaba era llamarlo y que el backend lo acotara a sus areas
            // (ver ResolverAreasPermitidasAsync en ReportesController).
            try {
                const loadingToast = toast.loading("Generando reporte de vacaciones por área...");
                const anio = selectedYear ? parseInt(selectedYear) : undefined;
                const areaIdFiltro = selectedArea === "all" ? undefined : (selectedArea as number);

                await reportesService.exportarVacacionesPorArea(anio, areaIdFiltro);

                toast.dismiss(loadingToast);
                toast.success("Reporte de vacaciones por área descargado");
            } catch (error) {
                toast.dismiss();
                toast.error(
                    error instanceof Error
                        ? error.message
                        : "No se pudo descargar el reporte de vacaciones por área"
                );
            }
        } else {
            toast.info("Funcionalidad en desarrollo para este tipo de reporte");
        }
    };

    const filteredReports = selectedCategory === 'all'
        ? reportCards
        : reportCards.filter(r => r.category === selectedCategory);

    const categoriaTitulos = {
        'programacion-anual': 'Programación Anual',
        'reprogramacion': 'Reprogramación',
        'all': 'Todos los reportes'
    };
    {/* 
      REPORTE: Control de Aprobaciones en Días Llenos
      Muestra solicitudes de reprogramación que fueron aprobadas en días donde
      el porcentaje de ausencias ya estaba al límite o lleno (días con alta ocupación).
      Sirve para auditar si los jefes aprobaron solicitudes en días que técnicamente
      no debían permitirse.
    
      Para reactivarlo, descomentar el siguiente bloque:
    
      <div className="space-y-4">
        <h2 className="text-base font-bold text-continental-black text-left">Control de Aprobaciones en Días Llenos</h2>
        <p className="text-sm text-gray-600">
          Reporta solicitudes aprobadas (automáticas o por jefe) en días con alta ocupación por vacaciones o permisos.
        </p>
        <ReporteAprobaciones selectedArea={selectedArea} selectedAreaName={selectedAreaName} />
      </div>
    */}
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
                    <Label className="text-base font-medium text-continental-black">Año</Label>
                    <Select value={selectedYear} onValueChange={(v) => { setAnioTocado(true); setSelectedYear(v); }}>
                        <SelectTrigger className="w-full max-w-xs">
                            <SelectValue placeholder="Seleccionar año" />
                        </SelectTrigger>
                        <SelectContent>
                            {aniosDisponibles.map((year) => (
                                <SelectItem key={year} value={year.toString()}>
                                    {year}
                                    {config?.anioVigente === year ? " (vigente)" : ""}
                                    {config?.anioProgramacionAnual === year ? " (en preparación)" : ""}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-500">
                        Aplica a vacaciones asignadas por la empresa, constancias, faltantes por capturar, no respondieron y reprogramación de días de empresa.
                    </p>
                </div>

                <div className="space-y-2">
                    <Label className="text-base font-medium text-continental-black">Área</Label>
                    <Select
                        value={String(selectedArea)}
                        onValueChange={(value) => setSelectedArea(value === "all" ? "all" : parseInt(value))}
                    >
                        <SelectTrigger className="w-full max-w-sm">
                            <SelectValue placeholder="Todas las áreas" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todas las áreas</SelectItem>
                            {areas.map((area) => (
                                <SelectItem key={area.areaId} value={String(area.areaId)}>
                                    {area.nombreGeneral}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label className="text-base font-medium text-continental-black">Grupo (opcional)</Label>
                    {selectedArea === "all" ? (
                        <p className="text-sm text-gray-500">Selecciona un área para poder filtrar por grupo.</p>
                    ) : availableGroups.length === 0 ? (
                        <p className="text-sm text-gray-500">Esta área no tiene grupos cargados.</p>
                    ) : (
                        <div className="flex flex-col gap-2">
                            <div className="flex flex-wrap gap-2">
                                {availableGroups.map((group) => (
                                    <Button
                                        key={group.value}
                                        type="button"
                                        variant={selectedGroups.includes(group.value) ? "default" : "outline"}
                                        onClick={() =>
                                            setSelectedGroups((prev) =>
                                                prev.includes(group.value)
                                                    ? prev.filter((g) => g !== group.value)
                                                    : [...prev, group.value]
                                            )
                                        }
                                        className="rounded-full"
                                    >
                                        {group.label}
                                        {selectedGroups.includes(group.value) && <span className="ml-2">✓</span>}
                                    </Button>
                                ))}
                            </div>
                            <p className="text-xs text-gray-500">
                                {selectedGroups.length > 0
                                    ? `${selectedGroups.length} grupo(s) seleccionado(s) — aplica a la constancia de antigüedad.`
                                    : "Sin grupos seleccionados: la constancia sale de toda el área."}
                            </p>
                        </div>
                    )}
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
