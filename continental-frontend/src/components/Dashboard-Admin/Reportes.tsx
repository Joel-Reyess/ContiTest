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
import { Loader2, RefreshCw } from "lucide-react";
import { Download, Palmtree, FileText, Award, AlertTriangle, FileSpreadsheet, UserMinus } from "lucide-react";
import type { EmpleadoDetalle } from "@/interfaces/Api.interface";
import { PeriodOptions } from "@/interfaces/Calendar.interface";
import { exportarReprogramacionesExcel } from "@/utils/reprogramacionesExcel";
import { solicitudesService } from "@/services/solicitudesService";

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

export const Reportes = () => {
  const [selectedArea, setSelectedArea] = useState<string>("");
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
    const [selectedYear, setSelectedYear] = useState<string>("");
    const [loadingGeneral, setLoadingGeneral] = useState(false);

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

            const solicitudes = response?.solicitudes || [];
            if (solicitudes.length === 0) {
                toast.info("No hay reprogramaciones con los filtros seleccionados.");
                return;
            }

            exportarReprogramacionesExcel(solicitudes, {
                titulo: "Reporte general de reprogramaciones",
                tipo: "general",
                area: areaName,
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

  const reportCards = [
    {
      id: 1,
      icon: Palmtree,
      title: "Reporte de Vacaciones Asignadas por la Empresa",
      subtitle: "Reporte con los empleados en vacaciones."
    },
    {
      id: 10,
      icon: UserMinus,
      title: "Empleados faltantes de capturar vacaciones",
      subtitle: "Asignados en bloque cola sin vacaciones manuales activas."
    },
    {
      id: 5,
      icon: Award,
      title: "Constancia de Antiguedad",
      subtitle: "Constancia de antiguedad y vacaciones adicionales para empleados sindicalizados."
    },
    {
      id: 6,
      icon: FileText,
      title: "Empleados sin Asignación Automática",
      subtitle: "Reporte de empleados que no tienen asignación automática de vacaciones."
    },
    {
      id: 7,
      icon: AlertTriangle,
      title: "Empleados que No Respondieron",
      subtitle: "Reporte de empleados que no respondieron a la asignación de bloques de vacaciones."
    },
    {
      id: 8,
      icon: FileSpreadsheet,
      title: "Vacaciones Programadas por Área",
      subtitle: "Exporta todas las vacaciones programadas agrupadas por área en formato Excel."
    },
    {
      id: 9,
      icon: FileSpreadsheet,
      title: "Reporte SAP",
      subtitle: "Genera archivo plano (Nómina, fecha dos veces y 1100, sin encabezados)."
    },
    {
        id: 11, // Nuevo ID
        icon: RefreshCw, // O Calendar
        title: "General de Reprogramaciones",
        subtitle: "Todas las reprogramaciones (solo en periodo de reprogramación).",
        requiresReprogramming: true // Flag para identificarlo
    },
    {
        id: 12,
        icon: FileText,
        title: "Reporte SAP Reprogramación (Eliminar)",
        subtitle: "Días que se quitarán de la programación original."
    },
    {
        id: 13,
        icon: FileText,
        title: "Reporte SAP Reprogramación (Nuevos)",
        subtitle: "Días que se agregarán a la nueva programación."
    }
  ];

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
      } else if (reportId === 5) {
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
                  gruposRol
              });

              toast.dismiss(loadingToast);
              toast.success(`Reporte SAP Reprogramación (${tipo}) descargado exitosamente`);
          } catch (error) {
              console.error("Error al descargar Reporte SAP Reprogramación:", error);
              toast.dismiss();
              toast.error(error instanceof Error ? error.message : "No se pudo generar el reporte");
          }
      } else {
          console.log(`Descargando reporte ${reportId}`);
          toast.info("Funcionalidad en desarrollo para este tipo de reporte");
      }
  };

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
          <Label className="text-base font-medium text-continental-black">Área</Label>
          <Select
            value={selectedArea}
            onValueChange={(value) => {
              setSelectedArea(value);
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
                <SelectValue placeholder="Seleccionar área" />
              )}
            </SelectTrigger>
            <SelectContent>
              {areas.map((area) => (
                <SelectItem key={area.areaId} value={area.areaId.toString()}>
                  {area.nombreGeneral}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-base font-medium text-continental-black">Grupo</Label>
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

        <div className="space-y-4">
          <h2 className="text-base font-bold text-continental-black text-left">Tipo de reporte</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {reportCards.map((report) => (
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
                          <FileText size={16} className="text-gray-400" />
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
