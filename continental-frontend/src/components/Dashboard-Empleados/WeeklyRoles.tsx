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
import { httpClient } from '@/services/httpClient'; // ✅ AGREGAR ESTE IMPORT
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
    const [groupEmployees, setGroupEmployees] = useState<{ id: number; nomina: string; fullName: string }[]>([]);
    const [employeesCache] = useState<Map<number, { id: number; nomina: string; fullName: string }[]>>(new Map());
    const [weeklyCache] = useState<Map<string, WeeklyRolesResponse>>(new Map());
    const [loadingGroups, setLoadingGroups] = useState(false);
    const [loadingWeek, setLoadingWeek] = useState(false);
    const [loadingEmployees, setLoadingEmployees] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [exportingAll, setExportingAll] = useState(false);

    const canAccess =
        hasRole(UserRole.AREA_ADMIN) ||
        hasRole(UserRole.LEADER) ||
        hasRole(UserRole.INDUSTRIAL) ||
        hasRole(UserRole.UNION_REPRESENTATIVE) ||
        (user as any)?.isUnionCommittee ||
        user?.area?.nombreGeneral === "Sindicato";
    const isIndustrial = hasRole(UserRole.INDUSTRIAL);
    const isBoss = hasRole(UserRole.AREA_ADMIN);

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

                if (isBoss) {
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
    }, [selectedGroup, weekStart]);

    // Cargar empleados del grupo seleccionado
    useEffect(() => {
        const loadEmployees = async () => {
            if (!selectedGroup) return;
            const cached = employeesCache.get(parseInt(selectedGroup, 10));
            if (cached) {
                setGroupEmployees(cached);
                return;
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
                }));
                emps.sort((a, b) => {
                    const na = parseInt(a.nomina, 10);
                    const nb = parseInt(b.nomina, 10);
                    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
                    return a.nomina.localeCompare(b.nomina);
                });
                setGroupEmployees(emps);
                employeesCache.set(parseInt(selectedGroup, 10), emps);
            } catch (error) {
                console.error("Error cargando empleados del grupo", error);
                toast.error("No se pudieron cargar los empleados del grupo.");
                setGroupEmployees([]);
            } finally {
                setLoadingEmployees(false);
            }
        };
        loadEmployees();
    }, [selectedGroup]);

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
        }));
    }, [groupEmployees, weeklyData]);

    // MEJORA: Función robusta con múltiples fallbacks para matching de empleados
    const getShiftForDay = (emp: { id: number; nomina: string }, day: Date) => {
        const dateStr = formatIso(day);

        // Buscar con múltiples estrategias de matching
        const entry = weeklyData?.semana.find((s) => {
            // Normalizar fecha (soportar camelCase y PascalCase)
            const fecha = (s as any)?.fecha ?? (s as any)?.Fecha;
            if (fecha !== dateStr) return false;

            // Obtener objeto empleado con fallbacks
            const empleado = (s as any)?.empleado ?? (s as any)?.Empleado ?? {};

            // Estrategia 1: Match por ID
            const sameId = empleado.id === emp.id || empleado.Id === emp.id;

            // Estrategia 2: Match por nómina (con múltiples variaciones)
            const nominaMatch =
                empleado.nomina ?? empleado.Nomina ?? empleado.username ?? empleado.Username;
            const sameNomina =
                !!emp.nomina && (nominaMatch === emp.nomina || nominaMatch === (emp as any).username);

            // Estrategia 3: Match por fullName como username (casos edge)
            const fullName = empleado.fullName ?? empleado.FullName;
            const sameUsername = (emp as any).username && fullName === (emp as any).username;

            return sameId || sameNomina || sameUsername;
        });

        // MEJORA: Normalizar el turno con fallbacks y conversión VA→V
        const rawTurno = (entry as any)?.codigoTurno ?? (entry as any)?.CodigoTurno;
        if (typeof rawTurno === "string" && rawTurno.trim() !== "") {
            const turno = rawTurno.trim().toUpperCase();
            // Convertir "VA" a "V" por si el servicio no lo hizo
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
                        <p className="text-sm text-slate-600">
                            Turnos y descansos de lunes a domingo. Nomenclatura: D=Descanso, 1=Mañana, 2=Tarde, 3=Noche, V=Vacaciones.
                        </p>
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
                </div>
                <div className="flex items-center gap-2">
                    <CalendarIcon className="w-4 h-4 text-slate-500" />
                    <span className="text-sm text-slate-700">{weekLabel}</span>
                </div>
                <div className="ml-auto flex items-center gap-2">
                    <label className="text-sm text-slate-600">Area</label>
                    <select
                        className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={selectedArea}
                        onChange={(e) => setSelectedArea(e.target.value === "all" ? "all" : parseInt(e.target.value, 10))}
                        disabled={loadingGroups}
                    >
                        {!isBoss && !isIndustrial && <option value="all">Todas</option>}
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
                        {exporting ? (
                            "Exportando..."
                        ) : (
                            <>
                                <Download className="w-4 h-4" /> Excel por semana
                            </>
                        )}
                    </Button>
                    <Button
                        variant="continentalOutline"
                        onClick={handleExportAllWeeks}
                        disabled={exportingAll || loadingGroups}
                        className="flex items-center gap-2"
                    >
                        {exportingAll ? (
                            "Exportando año..."
                        ) : (
                            <>
                                <Download className="w-4 h-4" /> Excel año completo
                            </>
                        )}
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
                                    <div>{dayLabels[idx]}</div>
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
                                        <div className="text-xs text-gray-600 uppercase">{emp.fullName}</div>
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
                                                                                            : shift === "O"
                                                                                                ? "bg-cyan-100 text-cyan-700"
                                                                                                : shift === "H"
                                                                                                    ? "bg-indigo-100 text-indigo-700"
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

            <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Leyenda de códigos:</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
                    <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center rounded-full px-3 py-1 bg-gray-100 text-gray-700 font-semibold">D</span>
                        <span className="text-gray-600">Descanso</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center rounded-full px-3 py-1 bg-emerald-100 text-emerald-700 font-semibold">1</span>
                        <span className="text-gray-600">Turno Mañana</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center rounded-full px-3 py-1 bg-yellow-100 text-yellow-700 font-semibold">2</span>
                        <span className="text-gray-600">Turno Tarde</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center rounded-full px-3 py-1 bg-blue-100 text-blue-700 font-semibold">3</span>
                        <span className="text-gray-600">Turno Noche</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center rounded-full px-3 py-1 bg-purple-100 text-purple-700 font-semibold">V</span>
                        <span className="text-gray-600">Vacaciones</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center rounded-full px-3 py-1 bg-green-100 text-green-700 font-semibold">P</span>
                        <span className="text-gray-600">Permiso con Goce</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center rounded-full px-3 py-1 bg-red-100 text-red-700 font-semibold">E</span>
                        <span className="text-gray-600">Inc. Enfermedad</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center rounded-full px-3 py-1 bg-orange-100 text-orange-700 font-semibold">A</span>
                        <span className="text-gray-600">Inc. Accidente Trabajo</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center rounded-full px-3 py-1 bg-pink-100 text-pink-700 font-semibold">M</span>
                        <span className="text-gray-600">Inc. Maternidad</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center rounded-full px-3 py-1 bg-amber-100 text-amber-700 font-semibold">G</span>
                        <span className="text-gray-600">Permiso sin Goce</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center rounded-full px-3 py-1 bg-rose-100 text-rose-700 font-semibold">R</span>
                        <span className="text-gray-600">Inc. Riesgo Trabajo</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center rounded-full px-3 py-1 bg-slate-100 text-slate-700 font-semibold">S</span>
                        <span className="text-gray-600">Suspensión</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center rounded-full px-3 py-1 bg-cyan-100 text-cyan-700 font-semibold">O</span>
                        <span className="text-gray-600">Permiso Paternidad</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center rounded-full px-3 py-1 bg-indigo-100 text-indigo-700 font-semibold">H</span>
                        <span className="text-gray-600">Perm. sin Goce (Alt)</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WeeklyRoles;