import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Users, Calendar as CalendarIcon, Download } from "lucide-react";
import { format, addWeeks, startOfWeek, startOfYear } from "date-fns";
import { es } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import useAuth from "@/hooks/useAuth";
import { areasService } from "@/services/areasService";
import { rolesService, type WeeklyRolesResponse, type WeeklyRoleEntry } from "@/services/rolesService";
import { empleadosService } from "@/services/empleadosService";
import type { Area, Grupo } from "@/interfaces/Areas.interface";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { toast } from "sonner";
import { exportWeeklyRolesExcel } from "@/utils/weeklyRolesExcel";
import { UserRole } from "@/interfaces/User.interface";
import { httpClient } from '@/services/httpClient'; 
import { vacacionesService } from "@/services/vacacionesService";

const dayLabels = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];
const getWeekStart = (date: Date): Date => startOfWeek(date, { weekStartsOn: 1 });
const buildWeekDays = (weekStart: Date): Date[] =>
    Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        return d;
    });
const formatIso = (date: Date) => format(date, "yyyy-MM-dd");

const WeeklyRoles = () => {
    const { user, hasRole } = useAuth();
    const navigate = useNavigate();

    const [areas, setAreas] = useState<Area[]>([]);
    const [groups, setGroups] = useState<Grupo[]>([]);
    const [areaNames, setAreaNames] = useState<Map<number, string>>(new Map());
    const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
    const [selectedArea, setSelectedArea] = useState<number | "all">("all");
    const [weekStart, setWeekStart] = useState<Date>(getWeekStart(new Date()));
    const [weeklyData, setWeeklyData] = useState<WeeklyRolesResponse | null>(null);
    const [groupEmployees, setGroupEmployees] = useState<{ id: number; nomina: string; fullName: string; maquina?: string }[]>([]);
    const [employeesCache] = useState<Map<number, { id: number; nomina: string; fullName: string; maquina?: string }[]>>(new Map());
    const [weeklyCache] = useState<Map<string, WeeklyRolesResponse>>(new Map());
    const [loadingGroups, setLoadingGroups] = useState(false);
    const [loadingWeek, setLoadingWeek] = useState(false);
    const [loadingEmployees, setLoadingEmployees] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [exportingAll, setExportingAll] = useState(false);
    const [customWeekStart, setCustomWeekStart] = useState<string>("");

    const canAccess =
        hasRole(UserRole.SUPER_ADMIN) ||
        hasRole(UserRole.AREA_ADMIN) ||
        hasRole(UserRole.LEADER) ||
        hasRole(UserRole.INDUSTRIAL) ||
        hasRole(UserRole.UNION_REPRESENTATIVE) ||
        (user as any)?.isUnionCommittee ||
        user?.area?.nombreGeneral === "Sindicato";
    const isIndustrial = hasRole(UserRole.INDUSTRIAL);
    const isBoss = hasRole(UserRole.AREA_ADMIN);
    const isAdmin = hasRole(UserRole.SUPER_ADMIN);

    // Cargar areas y grupos (si es jefe de área solo ve sus áreas)
    useEffect(() => {
        const loadGroups = async () => {
            setLoadingGroups(true);
            try {
                const [areasResp, groupsResp] = await Promise.all([areasService.getAreas(), areasService.getGroups()]);

                const allAreas: Area[] = Array.isArray(areasResp) ? areasResp : [];
                const orderedGroups = [...groupsResp].sort((a, b) => (a.grupoId || 0) - (b.grupoId || 0));

                const map = new Map<number, string>();
                allAreas.forEach((a) => {
                    if (a.areaId != null) {
                        const name = a.nombreGeneral || `Area ${a.areaId}`;
                        map.set(a.areaId, name);
                    }
                });
                setAreaNames(map);

                const jefeId = user?.id;

                let allowedAreas: Area[];


                if (isAdmin) {
                    allowedAreas = allAreas;
                } else if (isBoss) {
                    allowedAreas = allAreas.filter(
                        (a) =>
                            (a.jefe?.id != null && jefeId != null && a.jefe.id === jefeId) ||
                            (user?.area?.areaId != null && a.areaId === user.area.areaId)
                    );
                    if (allowedAreas.length === 0 && user?.area?.areaId) {
                        const fallback = allAreas.find((a) => a.areaId === user.area.areaId);
                        allowedAreas = fallback ? [fallback] : [];
                    }
                } else if (isIndustrial && user?.id) {
                    // ✅ USAR ENDPOINT ESPECÍFICO DEL BACKEND para ingenieros
                    console.log('🔧 Es ingeniero industrial, obteniendo áreas asignadas...');
                    try {
                        const ingenierosAreasResp = await httpClient.get(`/api/Area/by-ingeniero/${user.id}`, { activo: true });
                        const ingenierosAreas = Array.isArray(ingenierosAreasResp?.data) ? ingenierosAreasResp.data : [];
                        console.log('✅ Áreas del ingeniero desde backend:', ingenierosAreas);

                        const areaIds = ingenierosAreas.map((a: any) => a.areaId);
                        allowedAreas = allAreas.filter((a) => areaIds.includes(a.areaId));
                        console.log('✅ Áreas filtradas:', allowedAreas);
                    } catch (error) {
                        console.error('❌ Error obteniendo áreas del ingeniero:', error);
                        // Fallback al área del usuario si falla
                        allowedAreas = allAreas.filter((a) => a.areaId === user?.area?.areaId);
                    }
                } else {
                    allowedAreas = allAreas;
                }

                const allowedAreaIds = allowedAreas.map((a) => a.areaId).filter((id) => id != null);
                const filteredGroups =
                    allowedAreaIds.length > 0
                        ? orderedGroups.filter((g) => allowedAreaIds.includes(g.areaId as number))
                        : orderedGroups;

                setAreas(allowedAreas);
                setGroups(filteredGroups);

                if ((isBoss || isIndustrial) && allowedAreaIds.length > 0) {  // ✅ AGREGAR isIndustrial
                    setSelectedArea(allowedAreaIds[0] as number);
                } else if (!isBoss && !isIndustrial && filteredGroups.length > 0) {  // ✅ AGREGAR !isIndustrial
                    setSelectedArea("all");
                }

                if (filteredGroups.length > 0) {
                    const defaultGroup = user?.grupo?.grupoId?.toString() ?? filteredGroups[0].grupoId?.toString() ?? null;
                    setSelectedGroup(defaultGroup);
                }
            } catch (error) {
                console.error("Error cargando grupos", error);
                toast.error("No se pudieron cargar los grupos.");
            } finally {
                setLoadingGroups(false);
            }
        };

        loadGroups();
        // hasRole se mantiene fuera para evitar re-renderes por referencia de función
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.area?.areaId, user?.grupo?.grupoId]);

    const [porcentajeAusenciaMaximo, setPorcentajeAusenciaMaximo] = useState(4.5);

    useEffect(() => {
        vacacionesService.getConfig().then(config => {
            setPorcentajeAusenciaMaximo(config.porcentajeAusenciaMaximo);
        });
    }, []);

    const [areaManningBase, setAreaManningBase] = useState<number>(0);

    useEffect(() => {
        if (!selectedArea || selectedArea === "all") return;
        const area = areas.find(a => a.areaId === selectedArea);
        if (area) setAreaManningBase((area as any).manning ?? 0);
    }, [selectedArea, areas]);

    // Ajustar grupo al cambiar el área seleccionada
    useEffect(() => {
        if (selectedArea === "all") return;
        const candidates = groups.filter((g) => g.areaId === selectedArea);
        if (candidates.length === 0) {
            setSelectedGroup(null);
            return;
        }
        const currentMatches = candidates.find((g) => g.grupoId?.toString() === selectedGroup);
        if (!currentMatches) {
            setSelectedGroup(candidates[0].grupoId?.toString() ?? null);
        }
    }, [selectedArea, groups, selectedGroup]);

    // Cargar roles semanales
    useEffect(() => {
        const loadWeek = async () => {
            if (!selectedGroup) return;
            if (isBoss || isIndustrial) {
                weeklyCache.clear();
            }
            const cacheKey = `${selectedGroup}_${formatIso(weekStart)}`;
            const cached = weeklyCache.get(cacheKey);
            if (cached) {
                setWeeklyData(cached);
                return;
            }

            setLoadingWeek(true);
            try {
                const data = await rolesService.getWeeklyRoles(parseInt(selectedGroup, 10), formatIso(weekStart));
                setWeeklyData(data);
                weeklyCache.set(cacheKey, data);
            } catch (error: any) {
                console.error("Error cargando roles semanales", error);
                toast.error(error?.message || "No se pudieron cargar los roles semanales.");
                setWeeklyData(null);
            } finally {
                setLoadingWeek(false);
            }
        };

        loadWeek();
    }, [selectedGroup, weekStart, isBoss, isIndustrial]);

    // Cargar empleados del grupo seleccionado
    // Cargar empleados del grupo seleccionado
    useEffect(() => {
        const loadEmployees = async () => {
            if (!selectedGroup) return;

            // ✅ CRÍTICO: Si es jefe o ingeniero, NO usar caché
            const shouldUseCache = !isBoss && !isIndustrial;

            if (shouldUseCache) {
                const cached = employeesCache.get(parseInt(selectedGroup, 10));
                if (cached) {
                    setGroupEmployees(cached);
                    return;
                }
            }

            setLoadingEmployees(true);
            try {
                const resp = await empleadosService.getEmpleadosSindicalizados({
                    GrupoId: parseInt(selectedGroup, 10),
                    PageSize: 500,
                });

                const emps = (resp.usuarios || []).map((u) => ({
                    id: u.id,
                    nomina: u.nomina?.toString() || u.username || "",
                    fullName: u.fullName || "",
                    maquina: u.maquina || "",
                }));

                emps.sort((a, b) => {
                    const na = parseInt(a.nomina, 10);
                    const nb = parseInt(b.nomina, 10);
                    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
                    return a.nomina.localeCompare(b.nomina);
                });

                setGroupEmployees(emps);

                // Solo cachear si no es jefe ni ingeniero
                if (shouldUseCache) {
                    employeesCache.set(parseInt(selectedGroup, 10), emps);
                }
            } catch (error) {
                console.error("Error cargando empleados del grupo", error);
                toast.error("No se pudieron cargar los empleados del grupo.");
                setGroupEmployees([]);
            } finally {
                setLoadingEmployees(false);
            }
        };

        loadEmployees();
    }, [selectedGroup, isBoss, isIndustrial]);

    // Cargar empleados del grupo seleccionado
    useEffect(() => {
        const loadEmployees = async () => {
            if (!selectedGroup) return;

            // ✅ Si es jefe, NO usar cache para evitar datos obsoletos
            if (!isBoss) {
                const cached = employeesCache.get(parseInt(selectedGroup, 10));
                if (cached) {
                    setGroupEmployees(cached);
                    return;
                }
            }

            setLoadingEmployees(true);
            try {
                const resp = await empleadosService.getEmpleadosSindicalizados({
                    GrupoId: parseInt(selectedGroup, 10),
                    PageSize: 500,
                });
                const emps = (resp.usuarios || []).map((u) => ({
                    id: u.id,
                    nomina: u.nomina?.toString() || u.username || "",
                    fullName: u.fullName || "",
                    maquina: u.maquina || "",
                }));
                emps.sort((a, b) => {
                    const na = parseInt(a.nomina, 10);
                    const nb = parseInt(b.nomina, 10);
                    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
                    return a.nomina.localeCompare(b.nomina);
                });
                setGroupEmployees(emps);

                // Solo cachear si NO es jefe
                if (!isBoss) {
                    employeesCache.set(parseInt(selectedGroup, 10), emps);
                }
            } catch (error) {
                console.error("Error cargando empleados del grupo", error);
                toast.error("No se pudieron cargar los empleados del grupo.");
                setGroupEmployees([]);
            } finally {
                setLoadingEmployees(false);
            }
        };
        loadEmployees();
    }, [selectedGroup, isBoss]); // ✅ Agregar isBoss como dependencia

    const weekDays = useMemo(() => buildWeekDays(weekStart), [weekStart]);
    const weekLabel = useMemo(() => {
        const startLabel = format(weekDays[0], "dd MMM", { locale: es });
        const endLabel = format(weekDays[6], "dd MMM yyyy", { locale: es });
        return `${startLabel} - ${endLabel}`;
    }, [weekDays]);

    const employees = useMemo(() => {
        if (groupEmployees.length > 0) return groupEmployees;
        if (!weeklyData) return [];
        const unique = new Map<number, WeeklyRoleEntry["empleado"]>();
        weeklyData.semana.forEach((entry) => unique.set(entry.empleado.id, entry.empleado));
        return Array.from(unique.values()).map((e) => ({
            id: e.id,
            nomina: e.nomina,
            fullName: e.fullName,
            maquina: undefined as string | undefined,
        }));
    }, [groupEmployees, weeklyData]);

    // MEJORA: Función robusta con múltiples fallbacks para matching de empleados
    const getShiftForDay = (emp: { id: number; nomina: string }, day: Date) => {
        const dateStr = formatIso(day);

        const entry = weeklyData?.semana.find((s) => {
            const fecha = (s as any)?.fecha ?? (s as any)?.Fecha;
            if (fecha !== dateStr) return false;

            const empleado = (s as any)?.empleado ?? (s as any)?.Empleado ?? {};

            // Estrategia 1: Match por ID (más confiable)
            if (empleado.id === emp.id || empleado.Id === emp.id) return true;

            // Estrategia 2: Match por nómina — normalizar a string para comparar
            const nominaSource = String(empleado.nomina ?? empleado.Nomina ?? empleado.username ?? empleado.Username ?? '');
            const nominaTarget = String(emp.nomina ?? '');
            if (nominaSource && nominaTarget && nominaSource === nominaTarget) return true;

            return false;
        });

        const rawTurno = (entry as any)?.codigoTurno ?? (entry as any)?.CodigoTurno;
        if (typeof rawTurno === "string" && rawTurno.trim() !== "") {
            const turno = rawTurno.trim().toUpperCase();
            return turno === "VA" ? "V" : turno;
        }

        return "";
    };

    const goPrevWeek = () => setWeekStart((prev) => addWeeks(prev, -1));
    const goNextWeek = () => setWeekStart((prev) => addWeeks(prev, 1));

    const groupsByArea = selectedArea === "all" ? groups : groups.filter((g) => g.areaId === selectedArea);

    // Año base para exportar: usa el año de la semana visible; si los datos cargados pertenecen a otro año (p.ej. 2026), se usa ese.
    const exportYear = useMemo(() => {
        const firstDate = weeklyData?.semana?.[0]?.fecha;
        if (firstDate) {
            const parsed = new Date(firstDate);
            if (!Number.isNaN(parsed.getTime())) return parsed.getFullYear();
        }
        return weekStart.getFullYear();
    }, [weeklyData, weekStart]);

    const handleExportRoles = async () => {
        const groupsToExport = groupsByArea;

        if (!groupsToExport.length) {
            toast.info("Selecciona un Area y un grupo con datos para exportar.");
            return;
        }

        const currentGroup = groups.find(g => g.grupoId?.toString() === selectedGroup);

        if (!currentGroup) {
            toast.error("No se encontró el grupo seleccionado.");
            return;
        }

        setExporting(true);
        try {
            const payloads = [];
            const weekDaysArr = buildWeekDays(weekStart);

            for (const group of groupsToExport) {
                const data = await rolesService.getWeeklyRoles(group.grupoId, formatIso(weekStart));
                const empleadosResp = await empleadosService.getEmpleadosSindicalizados({
                    GrupoId: group.grupoId,
                    PageSize: 500,
                });
                const emps = (empleadosResp.usuarios || []).map((u) => ({
                    id: u.id,
                    nomina: u.nomina?.toString() || u.username || "",
                    fullName: u.fullName || "",
                    maquina: u.maquina || "",
                }));

                payloads.push({
                    areaId: group.areaId,
                    areaName: areaNames.get(group.areaId ?? -1) || group.areaNombre || `Area ${group.areaId}`,
                    groupName: group.rol || group.nombreGeneral || `Grupo ${group.grupoId}`,
                    grupoId: group.grupoId,
                    weekStart,
                    weekDays: weekDaysArr,
                    roles: data.semana,
                    employees: emps,
                });
            }

            exportWeeklyRolesExcel(payloads, {
                areaFilterName: selectedArea === "all" ? "todas" : areaNames.get(selectedArea as number),
            });
            toast.success("Roles semanales exportados a Excel.");
        } catch (error: any) {
            console.error("Error exportando roles semanales", error);
            toast.error(error?.message || "No se pudo exportar el Excel de roles.");
        } finally {
            setExporting(false);
        }
    };

    const handleExportAllWeeks = async () => {
        const groupsToExport = groupsByArea;

        if (!groupsToExport.length) {
            toast.info("No hay grupos para exportar.");
            return;
        }

        setExportingAll(true);
        try {
            const year = exportYear;
            const startYear = startOfYear(new Date(year, 0, 1));
            const firstWeek = getWeekStart(startYear);
            const endOfYear = startOfYear(new Date(year + 1, 0, 1));
            const payloads = [];

            for (const group of groupsToExport) {
                const empleadosResp = await empleadosService.getEmpleadosSindicalizados({
                    GrupoId: group.grupoId,
                    PageSize: 500,
                });
                const emps = (empleadosResp.usuarios || []).map((u) => ({
                    id: u.id,
                    nomina: u.nomina?.toString() || u.username || "",
                    fullName: u.fullName || "",
                    maquina: u.maquina || "",
                }));

                let cursor = new Date(firstWeek);
                while (cursor < endOfYear) {
                    const data = await rolesService.getWeeklyRoles(group.grupoId, formatIso(cursor));
                    payloads.push({
                        areaId: group.areaId,
                        areaName: areaNames.get(group.areaId ?? -1) || group.areaNombre || `Area ${group.areaId}`,
                        groupName: group.rol || group.nombreGeneral || `Grupo ${group.grupoId}`,
                        grupoId: group.grupoId,
                        weekStart: cursor,
                        weekDays: buildWeekDays(cursor),
                        roles: data.semana,
                        employees: emps,
                    });
                    cursor = addWeeks(cursor, 1);
                }
            }

            exportWeeklyRolesExcel(payloads, {
                areaFilterName: selectedArea === "all" ? "todas" : areaNames.get(selectedArea as number),
            });
            toast.success("Export de todo el año generado.");
        } catch (error: any) {
            console.error("Error exportando año completo", error);
            toast.error(error?.message || "No se pudo exportar el año completo.");
        } finally {
            setExportingAll(false);
        }
    };

    if (!canAccess) {
        return (
            <div className="p-8">
                <div className="max-w-4xl mx-auto bg-white shadow-sm rounded-lg p-6 text-center">
                    <p className="text-lg font-semibold text-gray-700">No tienes permisos para consultar los roles semanales.</p>
                </div>
            </div>
        );
    }

    const uniqueAreas = areas
        .map((a) => ({
            id: a.areaId,
            name: areaNames.get(a.areaId ?? -1) || a.nombreGeneral || `Area ${a.areaId}`,
        }))
        .filter((a) => a.id != null);

    // Cálculos de las tablas de balance y programación
    const weeklyStats = useMemo(() => {
        if (!weeklyData || employees.length === 0) return null;

        const currentGroup = groups.find(g => g.grupoId?.toString() === selectedGroup);
        // Manning dinámico: viene del área seleccionada a través del grupo
        const manning = areaManningBase > 0 ? areaManningBase : (currentGroup?.personasPorTurno ?? 0);
        const totalEnRol = employees.length;

        return weekDays.map(day => {
            const dateStr = formatIso(day);
            let inc = 0, apc = 0, vac = 0, permiso = 0, castigo = 0, fueraTiempo = 0, descanso = 0;

            employees.forEach(emp => {
                const shift = getShiftForDay(emp, day)?.toUpperCase() ?? '';
                if (shift === 'E') inc++;
                else if (['A', 'R', 'M'].includes(shift)) apc++;
                else if (shift === 'V') vac++;
                else if (['P', 'G', 'H', 'O'].includes(shift)) permiso++;
                else if (shift === 'S') castigo++;
                else if (shift === 'T') fueraTiempo++;
                else if (shift === 'D') descanso++;
                // 1, 2, 3, F — trabajando, no se cuentan como ausentes ni descanso
            });

            const totalNoDispo = inc + apc + vac + permiso + castigo + fueraTiempo;
            const totalEnRol = employees.length;
            const totalDispo = Math.max(0, totalEnRol - totalNoDispo - descanso);
            const manning = areaManningBase > 0 ? areaManningBase : 0;
            const diferencia = totalDispo - manning;

            const horasDispo = totalDispo * 8;
            const horasExtra6 = diferencia < 0 ? Math.abs(diferencia) * 8 : 0;
            const pctExtra6 = horasDispo > 0 ? horasExtra6 / horasDispo : 0;

            const vacProgramadas = totalNoDispo;
            const personalTiempoNormal = Math.max(0, totalEnRol - totalNoDispo - descanso);
            const horasTiempoNormal = personalTiempoNormal * 8;
            const diferenciaVAP = personalTiempoNormal - manning;
            const horasExtraVAP = diferenciaVAP < 0 ? Math.abs(diferenciaVAP) * 8 : 0;
            const baseCalculo = horasTiempoNormal > 0 ? horasTiempoNormal : (manning * 8);
            const pctExtraVAP = baseCalculo > 0 && horasExtraVAP > 0 ? horasExtraVAP / baseCalculo : 0;
            const tienesTurnoTrabajo = employees.some(emp => {
                const s = getShiftForDay(emp, day)?.toUpperCase() ?? '';
                return s === '1' || s === '2' || s === '3' || s === 'F';
            });
            return {
                dateStr,
                inc, apc, vac, permiso, castigo, fueraTiempo,
                totalNoDispo, totalEnRol, totalDispo, manning, diferencia,
                horasDispo, horasExtra6, pctExtra6,
                vacProgramadas, personalTiempoNormal,
                horasTiempoNormal, horasExtraVAP, pctExtraVAP,
                esDiaDescanso: !tienesTurnoTrabajo,
            };
        });
    }, [weeklyData, employees, weekDays, groups, selectedGroup, areaManningBase]);

    return (
        <div className="flex flex-col min-h-screen w-full bg-white p-6 md:p-10 max-w-[2000px] mx-auto">
            <header className="flex flex-wrap items-center justify-between gap-3 mb-6">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" onClick={() => navigate(-1)} className="flex items-center gap-2">
                        <ChevronLeft className="w-4 h-4" />
                        Regresar
                    </Button>
                    <div>
                        <p className="text-xs uppercase text-slate-500">Roles semanales</p>
                        <h1 className="text-2xl font-bold text-slate-800">Consulta de turnos por grupo</h1>
                    </div>
                    {/* LEYENDA - arriba, en línea horizontal */}
                    <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-semibold text-gray-700 mr-1">Leyenda:</span>
                            {[
                                { code: "D", label: "Descanso", color: "bg-gray-100 text-gray-700" },
                                { code: "1", label: "Mañana", color: "bg-emerald-100 text-emerald-700" },
                                { code: "2", label: "Tarde", color: "bg-yellow-100 text-yellow-700" },
                                { code: "3", label: "Noche", color: "bg-blue-100 text-blue-700" },
                                { code: "V", label: "Vacaciones", color: "bg-purple-100 text-purple-700" },
                                { code: "P", label: "Perm. c/Goce", color: "bg-green-100 text-green-700" },
                                { code: "E", label: "Inc. Enfermedad", color: "bg-red-100 text-red-700" },
                                { code: "A", label: "Inc. Accidente", color: "bg-orange-100 text-orange-700" },
                                { code: "M", label: "Inc. Maternidad", color: "bg-pink-100 text-pink-700" },
                                { code: "G", label: "Perm. s/Goce", color: "bg-amber-100 text-amber-700" },
                                { code: "R", label: "Inc. Riesgo", color: "bg-rose-100 text-rose-700" },
                                { code: "S", label: "Suspensión", color: "bg-slate-100 text-slate-700" },
                                { code: "O", label: "Perm. Paternidad", color: "bg-cyan-100 text-cyan-700" },
                                { code: "H", label: "Perm. s/Goce Alt", color: "bg-indigo-100 text-indigo-700" },
                                { code: "F", label: "Festivo Trabajado", color: "bg-teal-100 text-teal-700" },
                                { code: "C", label: "Día empresa reprog.", color: "bg-amber-100 text-amber-800" },
                            ].map(({ code, label, color }) => (
                                <span key={code} className="flex items-center gap-1">
                                    <span className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 font-semibold ${color}`}>{code}</span>
                                    <span className="text-gray-500">{label}</span>
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-continental-blue-dark border-continental-blue-dark/40">
                        Semana {weekLabel}
                    </Badge>
                    <Badge variant="outline" className="text-slate-600 border-slate-200 flex items-center gap-1">
                        <Users className="w-3 h-3" /> {employees.length} empleados
                    </Badge>
                </div>
            </header>

            <div className="flex flex-wrap items-center gap-3 mb-4">
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={goPrevWeek} className="flex items-center gap-1">
                        <ChevronLeft className="w-4 h-4" />
                        Semana previa
                    </Button>
                    <Button variant="outline" onClick={goNextWeek} className="flex items-center gap-1">
                        Semana siguiente
                        <ChevronRight className="w-4 h-4" />
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => {
                            setWeekStart(getWeekStart(new Date()));
                            setCustomWeekStart("");
                        }}
                        className="flex items-center gap-1 text-xs"
                    >
                        Borrar
                    </Button>
                </div>
                <div className="flex items-center gap-2">
                    <label className="text-sm text-slate-600">Ir a semana:</label>
                    <input
                        type="date"
                        className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={customWeekStart}
                        onChange={(e) => {
                            const val = e.target.value;
                            setCustomWeekStart(val);
                            if (!val || val.length !== 10) return;
                            const picked = new Date(val + "T12:00:00");
                            if (
                                !isNaN(picked.getTime()) &&
                                picked.getFullYear() >= 1900 &&
                                picked.getFullYear() <= 2100
                            ) {
                                setWeekStart(picked);
                                // NO llamar setCustomWeekStart aquí
                            }
                        }}
                    />
                    <span className="text-xs text-slate-500">{weekLabel}</span>
                </div>
                <div className="ml-auto flex items-center gap-2">
                    <label className="text-sm text-slate-600">Area</label>
                    <select
                        className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={selectedArea}
                        onChange={(e) => setSelectedArea(e.target.value === "all" ? "all" : parseInt(e.target.value, 10))}
                        disabled={loadingGroups}
                    >
                        {(isAdmin || (!isBoss && !isIndustrial)) && <option value="all">Todas</option>}
                        {uniqueAreas.map((a) => (
                            <option key={a.id ?? "na"} value={a.id ?? ""}>
                                {a.name}
                            </option>
                        ))}
                    </select>
                    <label className="text-sm text-slate-600">Grupo</label>
                    <select
                        className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={selectedGroup ?? ""}
                        onChange={(e) => setSelectedGroup(e.target.value)}
                        disabled={loadingGroups}
                    >
                        {!loadingGroups && groupsByArea.length === 0 && <option value="">Sin grupos</option>}
                        {groupsByArea.map((g) => (
                            <option key={g.grupoId} value={g.grupoId}>
                                {g.rol || g.nombreGeneral || `Grupo ${g.grupoId}`} — {areaNames.get(g.areaId ?? -1) ?? `Area ${g.areaId}`}
                            </option>
                        ))}
                    </select>
                    <Button
                        variant="continentalOutline"
                        onClick={handleExportRoles}
                        disabled={exporting || loadingWeek || loadingGroups}
                        className="flex items-center gap-2"
                    >
                        {exporting ? "Exportando..." : <><Download className="w-4 h-4" /> Excel por semana</>}
                    </Button>
                    <Button
                        variant="continentalOutline"
                        onClick={handleExportAllWeeks}
                        disabled={exportingAll || loadingGroups}
                        className="flex items-center gap-2"
                    >
                        {exportingAll ? "Exportando año..." : <><Download className="w-4 h-4" /> Excel año completo</>}
                    </Button>
                </div>
            </div>

            <div className="overflow-auto border border-gray-200 rounded-lg shadow-sm">
                <table className="min-w-full text-sm">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-40">
                                Nomina / Nombre
                            </th>
                            {weekDays.map((day, idx) => (
                                <th key={idx} className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                    <div className="capitalize">{format(day, "EEE", { locale: es })}</div>
                                    <div className="text-[11px] text-gray-500">{format(day, "dd/MM")}</div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loadingWeek ? (
                            <tr>
                                <td colSpan={8} className="text-center py-6 text-gray-500">
                                    Cargando roles...
                                </td>
                            </tr>
                        ) : employees.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="text-center py-6 text-gray-500">
                                    No hay datos para esta semana.
                                </td>
                            </tr>
                        ) : (
                            employees.map((emp) => (
                                <tr key={emp.id} className="border-t border-gray-100">
                                    <td className="px-4 py-2">
                                        <div className="font-semibold text-gray-800 leading-tight">{emp.nomina}</div>
                                        <div className="text-xs text-gray-600 uppercase">
                                            {emp.fullName}
                                            {emp.maquina && <span className="ml-1 text-blue-600 font-medium">({emp.maquina})</span>}
                                        </div>
                                    </td>
                                    {weekDays.map((day, idx) => {
                                        const shift = getShiftForDay(emp, day);
                                        const chipColor =
                                            shift === "D"
                                                ? "bg-gray-100 text-gray-700"
                                                : shift === "1"
                                                    ? "bg-emerald-100 text-emerald-700"
                                                    : shift === "2"
                                                        ? "bg-yellow-100 text-yellow-700"
                                                        : shift === "3"
                                                            ? "bg-blue-100 text-blue-700"
                                                            : shift === "V"
                                                                ? "bg-purple-100 text-purple-700"
                                                                : shift === "P"
                                                                    ? "bg-green-100 text-green-700"
                                                                    : shift === "E"
                                                                        ? "bg-red-100 text-red-700"
                                                                        : shift === "A"
                                                                            ? "bg-orange-100 text-orange-700"
                                                                            : shift === "M"
                                                                                ? "bg-pink-100 text-pink-700"
                                                                                : shift === "G"
                                                                                    ? "bg-amber-100 text-amber-700"
                                                                                    : shift === "R"
                                                                                        ? "bg-rose-100 text-rose-700"
                                                                                        : shift === "S"
                                                                                            ? "bg-slate-100 text-slate-700"
                                                                                            : shift === "F"
                                                                                                ? "bg-teal-100 text-teal-700"
                                                                                                : shift === "O"
                                                                                                    ? "bg-cyan-100 text-cyan-700"
                                                                                                    : shift === "H"
                                                                                                        ? "bg-indigo-100 text-indigo-700"
                                                                                                        : shift === "C"
                                                                                                            ? "bg-amber-100 text-amber-800"
                                                                                                            : "bg-slate-100 text-slate-600";

                                        return (
                                            <td key={idx} className="px-3 py-2 text-center">
                                                <span
                                                    className={`inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-semibold ${chipColor}`}
                                                >
                                                    {shift || "—"}
                                                </span>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* TABLA: Balance personal (Inc APC VAP CT) */}
            {weeklyStats && (
                <div className="mt-4 overflow-auto border border-gray-200 rounded-lg shadow-sm">
                    <table className="min-w-full text-xs">
                        <thead className="bg-slate-100">
                            <tr>
                                <th className="px-3 py-2 text-left font-semibold text-gray-700 w-48">Balance personal</th>
                                {weekDays.map((day, idx) => (
                                    <th key={idx} className="px-3 py-2 text-center font-semibold text-gray-600">
                                        <div>{dayLabels[idx]}</div>
                                        <div className="text-[10px] text-gray-500">{format(day, "dd/MM")}</div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {[
                                { label: "Inc – Incapacidad", key: "inc" as const, cls: "text-red-700 bg-red-50" },
                                { label: "APC – Acc/Riesgo/Mat", key: "apc" as const, cls: "text-orange-700 bg-orange-50" },
                                { label: "V – Vacaciones", key: "vac" as const, cls: "text-purple-700 bg-purple-50" },
                                { label: "P – Permisos", key: "permiso" as const, cls: "text-green-700 bg-green-50" },
                                { label: "C – Castigo/Suspensión", key: "castigo" as const, cls: "text-slate-700 bg-slate-50" },
                                { label: "T – Fuera de tiempo", key: "fueraTiempo" as const, cls: "text-gray-700 bg-gray-50" },
                                { label: "Total no disponible", key: "totalNoDispo" as const, cls: "font-semibold text-gray-800" },
                                { label: "Total en rol", key: "totalEnRol" as const, cls: "font-semibold text-gray-800" },
                                { label: "Total disponible", key: "totalDispo" as const, cls: "font-semibold text-blue-700" },
                                { label: "Manning requerido", key: "manning" as const, cls: "font-semibold text-gray-700" },
                                { label: "Diferencia", key: "diferencia" as const, cls: "font-semibold" },
                            ].map(({ label, key, cls }) => (
                                <tr key={key} className="border-t border-gray-100">
                                    <td className={`px-3 py-1.5 ${cls}`}>{label}</td>
                                    {weekDays.map((day, idx) => {
                                        const stat = weeklyStats.find(s => s.dateStr === formatIso(day));
                                        if (!stat) return <td key={idx} className="px-3 py-1.5 text-center">—</td>;
                                        // Mostrar guión en días de descanso para totalDispo y diferencia
                                        if ((key === 'totalDispo' || key === 'diferencia') && stat.esDiaDescanso) {
                                            return <td key={idx} className={`px-3 py-1.5 text-center ${cls}`}>—</td>;
                                        }
                                        const val = stat[key];
                                        const isNeg = key === "diferencia" && typeof val === "number" && val < 0;
                                        return (
                                            <td key={idx} className={`px-3 py-1.5 text-center ${cls} ${isNeg ? "text-red-600 font-bold" : ""}`}>
                                                {typeof val === "number" ? val : "—"}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* TABLA: Apartado Programación de Vacaciones + Cálculo 6% */}
            {weeklyStats && (
                <div className="mt-4 overflow-auto border border-gray-200 rounded-lg shadow-sm">
                    <table className="min-w-full text-xs">
                        <thead className="bg-blue-50">
                            <tr>
                                <th className="px-3 py-2 text-left font-semibold text-gray-700 w-48">
                                    Resumen requerimiento tiempo extra / {porcentajeAusenciaMaximo}%
                                </th>
                                {weekDays.map((day, idx) => (
                                    <th key={idx} className="px-3 py-2 text-center font-semibold text-gray-600">
                                        <div>{dayLabels[idx]}</div>
                                        <div className="text-[10px] text-gray-500">{format(day, "dd/MM")}</div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {/* Apartado Programación */}
                            <tr className="border-t border-blue-200 bg-blue-50">
                                <td colSpan={8} className="px-3 py-1 font-semibold text-blue-800 text-[11px] uppercase tracking-wide">
                                    Apartado Programación de Vacaciones
                                </td>
                            </tr>
                            {[
                                {
                                    label: "Personal requerido (manning)",
                                    render: (stat: typeof weeklyStats[0]) => (
                                        <span>{stat.manning}</span>
                                    )
                                },
                                {
                                    label: "Personal no disponible",
                                    render: (stat: typeof weeklyStats[0]) => (
                                        <span>{stat.vacProgramadas}</span>
                                    )
                                },
                                {
                                    label: "Personal tiempo normal",
                                    render: (stat: typeof weeklyStats[0]) => (
                                        <span>{stat.personalTiempoNormal}</span>
                                    )
                                },
                                {
                                    label: "Horas tiempo normal",
                                    render: (stat: typeof weeklyStats[0]) => (
                                        <span>{stat.esDiaDescanso || stat.horasTiempoNormal === 0 ? "—" : stat.horasTiempoNormal}</span>
                                    )
                                },
                                {
                                    label: "Horas tiempo extra",
                                    render: (stat: typeof weeklyStats[0]) => (
                                        <span>{stat.esDiaDescanso || stat.horasExtraVAP === 0 ? "—" : stat.horasExtraVAP.toString()}</span>
                                    )
                                },
                                {
                                    label: `% de tiempo extra (${porcentajeAusenciaMaximo}%)`,
                                    render: (stat: typeof weeklyStats[0]) => {
                                        const pct = stat.pctExtraVAP * 100;
                                        const color = pct > porcentajeAusenciaMaximo ? "text-red-600 font-semibold" : "text-green-600 font-semibold";
                                        return <span className={color}>{stat.esDiaDescanso || stat.horasTiempoNormal === 0 ? "—" : pct.toFixed(1) + "%"}</span>;
                                    }
                                },
                            ].map(({ label, render }, rowIdx) => (
                                <tr key={rowIdx} className="border-t border-gray-100">
                                    <td className="px-3 py-1.5 text-gray-700">{label}</td>
                                    {weekDays.map((day, idx) => {
                                        const stat = weeklyStats.find(s => s.dateStr === formatIso(day));
                                        return (
                                            <td key={idx} className="px-3 py-1.5 text-center text-gray-700">
                                                {stat ? render(stat) : "—"}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                           
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default WeeklyRoles;