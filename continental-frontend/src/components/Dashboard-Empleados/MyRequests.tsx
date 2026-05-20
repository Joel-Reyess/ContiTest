import { NavbarUser } from "../ui/navbar-user";
import { useNavigate } from "react-router-dom";
import {
    ChevronLeft,
    Calendar,
    Clock,
    CheckCircle,
    XCircle,
    AlertCircle,
    Download,
    Search,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { useState, useEffect } from "react";
import { Button } from "../ui/button";
import { ReprogramacionService } from "@/services/reprogramacionService";
import { festivosTrabajadosService, type SolicitudFestivoTrabajado } from "@/services/festivosTrabajadosService";
import { useAuth } from "@/hooks/useAuth";
import type { SolicitudReprogramacion, UsuarioInfoDto, SolicitudPermisoDto } from "@/interfaces/Api.interface";
import { exportarSolicitudesExcel, exportarSolicitudesCSV } from "@/utils/solicitudesExport";
import { SolicitudesPDFDownloadLink } from "./SolicitudesPDF";
import { useVacationConfig } from "@/hooks/useVacationConfig";
import { PeriodOptions } from "@/interfaces/Calendar.interface";
import { UserRole } from "@/interfaces/User.interface";
import { solicitudesPermisosService } from "@/services/solicitudesPermisosService";
import {
    reprogramacionPostIncapacidadService,
    type SolicitudReprogramacionPostIncapacidad,
} from "@/services/reprogramacionPostIncapacidadService";

export type RequestStatus = "approved" | "rejected" | "pending" | "cancelled";
export type RequestType = "day_exchange" | "holiday_worked" | "permission_request";

export interface VacationRequest {
    id: string;
    type: RequestType;
    requestDate: string;
    responseDate?: string;
    status: RequestStatus;
    rejectionReason?: string;
    // Para intercambio de Días
    requestedDay: string;
    dayToGive?: string;
    // Para festivo trabajado
    workedHoliday?: string;
    employeeName?: string;
    employeeArea?: string;
    employeeGroup?: string;
    employeeNomina?: string; // 🆕 Agregado
    requester?: string | null;
    reviewer?: string | null;
}

// Función para mapear SolicitudReprogramacion a VacationRequest
const mapSolicitudToRequest = (solicitud: SolicitudReprogramacion): VacationRequest => {
    const rawEstado = solicitud.estadoSolicitud as string;
    const status: RequestStatus =
        rawEstado === 'Aprobada' ? 'approved' :
            rawEstado === 'Rechazada' ? 'rejected' :
                rawEstado === 'Cancelada' ? 'cancelled' : 'pending';
    return {
        id: solicitud.id.toString(),
        type: "day_exchange",
        requestDate: solicitud.fechaSolicitud,
        responseDate: solicitud.fechaAprobacion || undefined,
        status,
        rejectionReason: solicitud.motivoRechazo || undefined,
        requestedDay: solicitud.fechaNueva,
        dayToGive: solicitud.fechaOriginal,
        employeeName: solicitud.nombreEmpleado,
        employeeArea: solicitud.areaEmpleado,
        employeeGroup: solicitud.grupoEmpleado,
        employeeNomina: solicitud.nominaEmpleado, // 🆕 Agregado
        requester: solicitud.solicitadoPor || null,
        reviewer: solicitud.aprobadoPor || null
    };
};

const mapFestivoToRequest = (
    solicitud: SolicitudFestivoTrabajado,
    fallbackArea?: string,
    fallbackGroup?: string,
    fallbackNomina?: string // 🆕 Agregado
): VacationRequest => {
    const festivoData = solicitud as any;
    const status: RequestStatus =
        solicitud.estadoSolicitud === 'Aprobada' ? 'approved' :
            solicitud.estadoSolicitud === 'Rechazada' ? 'rejected' : 'pending';

    return {
        id: solicitud.id.toString(),
        type: "holiday_worked",
        requestDate: solicitud.fechaSolicitud,
        responseDate: solicitud.fechaAprobacion || undefined,
        status,
        rejectionReason: undefined,
        requestedDay: solicitud.fechaNueva,
        workedHoliday: solicitud.festivoOriginal,
        employeeName: festivoData.nombreEmpleado || solicitud.nombreEmpleado,
        employeeArea: fallbackArea,
        employeeGroup: fallbackGroup,
        employeeNomina: fallbackNomina, // 🆕 Agregado
        requester: festivoData.solicitadoPor || null,
        reviewer: solicitud.aprobadoPor || festivoData.aprobadoPor || null,
    };
};

const mapPostIncapacidadToRequest = (
    s: SolicitudReprogramacionPostIncapacidad
): VacationRequest => {
    const status: RequestStatus =
        s.estadoSolicitud === 'Aprobada' ? 'approved' :
            s.estadoSolicitud === 'Rechazada' ? 'rejected' :
                s.estadoSolicitud === 'Cancelada' ? 'cancelled' : 'pending';
    return {
        id: `pi-${s.id}`,
        type: "day_exchange",
        requestDate: s.fechaSolicitud,
        responseDate: s.fechaRespuesta || undefined,
        status,
        rejectionReason: s.motivoRechazo || undefined,
        requestedDay: s.fechaNueva,
        dayToGive: s.fechaOriginal,
        employeeName: s.nombreEmpleado || undefined,
        employeeArea: s.areaEmpleado || undefined,
        employeeGroup: s.grupoEmpleado || undefined,
        employeeNomina: s.nomina ? s.nomina.toString() : undefined,
        requester: s.nombreSolicitadoPor || null,
        reviewer: s.nombreAprobadoPor || null,
    };
};

const mapPermisoToRequest = (solicitud: SolicitudPermisoDto): VacationRequest => {
    const status: RequestStatus =
        solicitud.estado === 'Aprobada' ? 'approved' :
            solicitud.estado === 'Rechazada' ? 'rejected' : 'pending';

    return {
        id: solicitud.id.toString(),
        type: "permission_request",
        requestDate: solicitud.fechaSolicitud.toString(),
        responseDate: solicitud.fechaRespuesta?.toString(),
        status,
        rejectionReason: solicitud.motivoRechazo,
        requestedDay: solicitud.fechaInicio,
        dayToGive: solicitud.fechaFin,
        employeeName: solicitud.nombreEmpleado,
        employeeArea: undefined,
        employeeGroup: undefined,
        employeeNomina: undefined, // 🆕 Agregado
        requester: solicitud.delegadoNombre,
        reviewer: solicitud.jefeAreaNombre || null
    };
};

const MyRequests = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { currentPeriod } = useVacationConfig();

    const [selectedEmployee] = useState<UsuarioInfoDto | null>(() => {
        const saved = localStorage.getItem('selectedEmployee');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (error) {
                console.error('Error parsing selectedEmployee from localStorage:', error);
                return null;
            }
        }
        return null;
    });

    const currentEmployee = selectedEmployee || (user as unknown as UsuarioInfoDto);
    const hasRole = (roleName: string) => {
        return (user?.roles || []).some((role) => {
            if (typeof role === 'string') {
                return role === roleName;
            }
            return role.name === roleName;
        });
    };
    const isUnionCommittee = Boolean((user as any)?.isUnionCommittee);
    const isDelegadoSindical = isUnionCommittee || hasRole(UserRole.UNION_REPRESENTATIVE) || user?.area?.nombreGeneral === 'Sindicato';

    const [requests, setRequests] = useState<VacationRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [permisosStats, setPermisosStats] = useState<{
        total: number;
        pendientes: number;
        aprobadas: number;
        rechazadas: number;
    }>({ total: 0, pendientes: 0, aprobadas: 0, rechazadas: 0 });

    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 5;
    const [statusFilter, setStatusFilter] = useState<"all" | RequestStatus>("all");
    const [typeFilter, setTypeFilter] = useState<"all" | RequestType>("all");
    const [yearFilter, setYearFilter] = useState<number>(new Date().getFullYear());

    // 🆕 Nuevos filtros
    const [requesterFilter, setRequesterFilter] = useState<"all" | "sistema" | "delegado">("all");
    const [nominaSearch, setNominaSearch] = useState("");

    const [exportOpen, setExportOpen] = useState(false);

    // Cargar datos reales
    useEffect(() => {
        const loadRequests = async () => {
            if (!currentEmployee?.id && !isDelegadoSindical) {
                setLoading(false);
                return;
            }

            try {
                setLoading(true);
                setError(null);

                let reprogramacionesRequests: VacationRequest[] = [];
                let festivosRequests: VacationRequest[] = [];
                let permisosRequests: VacationRequest[] = [];
                let postIncapacidadRequests: VacationRequest[] = [];

                // Cargar reprogramaciones
                try {
                    if (isDelegadoSindical) {
                        const historialCreadas = await ReprogramacionService.obtenerCreadasPorMi(yearFilter);
                        reprogramacionesRequests = (historialCreadas?.solicitudes ?? []).map(mapSolicitudToRequest);
                        console.log('✅ Historial creadas por mi:', historialCreadas);
                    } else {
                        const historialReprogramaciones = await ReprogramacionService.obtenerHistorial(
                            currentEmployee.id,
                            yearFilter
                        );
                        reprogramacionesRequests = (historialReprogramaciones?.solicitudes ?? []).map(mapSolicitudToRequest);
                        console.log('✅ Historial reprogramaciones:', historialReprogramaciones);
                    }
                } catch (err) {
                    console.error('Error al cargar historial de reprogramaciones:', err);
                }

                // Cargar festivos trabajados
                try {
                    if (isDelegadoSindical) {
                        const historialCreadas = await festivosTrabajadosService.getCreadasPorMi(yearFilter);
                        festivosRequests = (historialCreadas?.solicitudes ?? []).map((s) =>
                            mapFestivoToRequest(s)
                        );
                        console.log('✅ Historial festivos creadas por mi:', historialCreadas);
                    } else {
                        const targetEmpleadoId = currentEmployee?.id || user?.id;
                        if (targetEmpleadoId) {
                            const historialFestivos = await festivosTrabajadosService.getHistorialFestivos(
                                targetEmpleadoId,
                                yearFilter
                            );
                            festivosRequests = (historialFestivos?.solicitudes ?? []).map((s) =>
                                mapFestivoToRequest(
                                    s,
                                    currentEmployee?.area?.nombreGeneral,
                                    currentEmployee?.grupo?.rol,
                                    currentEmployee?.nomina // 🆕 Agregado
                                )
                            );
                            console.log('✅ Historial festivos:', historialFestivos);
                        }
                    }
                } catch (err) {
                    console.error('Error al cargar historial de festivos trabajados:', err);
                }

                // Cargar reprogramaciones post-incapacidad
                try {
                    if (isDelegadoSindical) {
                        const data = await reprogramacionPostIncapacidadService.getCreadasPorMi(yearFilter);
                        postIncapacidadRequests = (data ?? [])
                            .filter((s) => {
                                const y = new Date(s.fechaSolicitud).getFullYear();
                                return y === yearFilter;
                            })
                            .map(mapPostIncapacidadToRequest);
                        console.log('✅ Historial post-incapacidad creadas por mi:', data);
                    } else if (currentEmployee?.id) {
                        const data = await reprogramacionPostIncapacidadService.getPorEmpleado(currentEmployee.id);
                        postIncapacidadRequests = (data ?? [])
                            .filter((s) => {
                                const y = new Date(s.fechaSolicitud).getFullYear();
                                return y === yearFilter;
                            })
                            .map(mapPostIncapacidadToRequest);
                        console.log('✅ Historial post-incapacidad empleado:', data);
                    }
                } catch (err) {
                    console.error('Error al cargar historial post-incapacidad:', err);
                }

                // Cargar solicitudes de permisos
                try {
                    const targetNomina = currentEmployee?.nomina || user?.nomina;
                    if (targetNomina) {
                        const historialPermisos = await solicitudesPermisosService.obtenerHistorialPorNomina(
                            parseInt(targetNomina, 10),
                            yearFilter
                        );
                        permisosRequests = (historialPermisos?.solicitudes ?? []).map(mapPermisoToRequest);
                        console.log('✅ Historial permisos:', historialPermisos);
                    }
                } catch (err) {
                    console.error('Error al cargar historial de permisos:', err);
                }

                const allRequests = [...reprogramacionesRequests, ...festivosRequests, ...permisosRequests, ...postIncapacidadRequests];
                allRequests.sort((a, b) => new Date(b.requestDate).getTime() - new Date(a.requestDate).getTime());

                console.log('✅ Total solicitudes cargadas:', allRequests.length);
                setRequests(allRequests);

            } catch (error) {
                console.error('❌ Error crítico al cargar solicitudes:', error);
                setError('Error al cargar las solicitudes');
                setRequests([]);
            } finally {
                setLoading(false);
            }
        };

        loadRequests();
    }, [currentEmployee?.id, yearFilter, isDelegadoSindical, user?.id]);

    // 🆕 Filtrado mejorado con nuevos filtros
    const filteredRequests = requests.filter((r) => {
        const byStatus = statusFilter === "all" || r.status === statusFilter;
        const byType = typeFilter === "all" || r.type === typeFilter;

        // 🆕 Filtro por solicitante
        let byRequester = true;
        if (requesterFilter === "sistema") {
            byRequester = !r.requester || r.requester.toLowerCase().includes("sistema");
        } else if (requesterFilter === "delegado") {
            byRequester = r.requester && !r.requester.toLowerCase().includes("sistema");
        }

        // 🆕 Filtro por nómina
        const byNomina = !nominaSearch ||
            (r.employeeNomina && r.employeeNomina.toLowerCase().includes(nominaSearch.toLowerCase()));

        return byStatus && byType && byRequester && byNomina;
    });

    const exportMeta = {
        empleadoArea: isDelegadoSindical ? 'Varias areas' : currentEmployee?.area?.nombreGeneral,
        empleadoGrupo: isDelegadoSindical ? 'Varios grupos' : currentEmployee?.grupo?.rol,
        periodoLabel: currentPeriod === PeriodOptions.reprogramming ? 'Reprogramacion' : currentPeriod,
        periodoActivo: currentPeriod === PeriodOptions.reprogramming,
        filtros: {
            tipo: typeFilter === 'all' ? 'Todos' : getRequestTypeText(typeFilter),
            estado: statusFilter === 'all' ? 'Todos' : getStatusText(statusFilter),
            solicitante: requesterFilter === 'all' ? 'Todos' : requesterFilter === 'sistema' ? 'Sistema' : 'Delegado Sindical', // 🆕
            nomina: nominaSearch || 'Todas', // 🆕
        },
    };

    const totalPages = Math.ceil(filteredRequests.length / itemsPerPage) || 1;
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentRequests = filteredRequests.slice(startIndex, endIndex);

    const handleExportExcel = () => {
        try {
            const empleadoNombre = currentEmployee?.fullName || currentEmployee?.username || 'Empleado';
            exportarSolicitudesExcel(filteredRequests, empleadoNombre, exportMeta);
            setExportOpen(false);
        } catch (error) {
            console.error('Error al exportar Excel:', error);
            alert('Error al exportar el archivo. Por favor, intente nuevamente.');
        }
    };

    const handleExportCSV = () => {
        try {
            const empleadoNombre = currentEmployee?.fullName || currentEmployee?.username || 'Empleado';
            exportarSolicitudesCSV(filteredRequests, empleadoNombre, exportMeta);
            setExportOpen(false);
        } catch (error) {
            console.error('Error al exportar CSV:', error);
            alert('Error al exportar el archivo. Por favor, intente nuevamente.');
        }
    };

    const handleExportPDF = () => {
        setExportOpen(false);
    };

    const handleCancelarSolicitud = async (request: VacationRequest) => {
        if (!confirm('¿Estás seguro de que deseas cancelar esta solicitud?')) return;
        try {
            await ReprogramacionService.cancelarSolicitud(parseInt(request.id));
            setRequests(prev => prev.map(r =>
                r.id === request.id ? { ...r, status: 'cancelled' as RequestStatus } : r
            ));
        } catch (error) {
            alert('Error al cancelar la solicitud. Intente nuevamente.');
        }
    };

    return (
        <div className="flex flex-col min-h-screen w-full bg-white p-12 max-w-[2000px] mx-auto">
            <header className="flex justify-between">
                <div className="flex flex-col gap-1">
                    <div
                        className="flex items-center gap-2 cursor-pointer"
                        onClick={() => navigate(-1)}
                    >
                        <ChevronLeft /> Regresar
                    </div>
                    <h1 className="text-2xl font-bold text-slate-800">
                        {isDelegadoSindical ? "Reprogramaciones que solicitaste" : "Mis solicitudes"}
                    </h1>
                    <p className="text-slate-600">
                        {isDelegadoSindical
                            ? "Historial de reprogramaciones que generaste para compañeros sindicalizados"
                            : "Gestiona tus solicitudes aquí"}
                    </p>
                </div>
                <NavbarUser />
            </header>

            <div className="mt-8 flex-1 flex flex-col">
                {/* Barra de filtros y exportación */}
                <div className="w-full max-w-7xl mx-auto mb-4">
                    <div className="flex flex-col gap-4">
                        {/* Primera fila de filtros */}
                        <div className="flex flex-col md:flex-row gap-3 md:items-end md:justify-between">
                            <div className="flex flex-col sm:flex-row gap-3">
                                <div className="flex flex-col">
                                    <label className="text-sm text-slate-600 mb-1">Estatus</label>
                                    <select
                                        value={statusFilter}
                                        onChange={(e) => {
                                            setStatusFilter(e.target.value as any);
                                            setCurrentPage(1);
                                        }}
                                        className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="all">Todos</option>
                                        <option value="approved">Aprobada</option>
                                        <option value="rejected">Rechazada</option>
                                        <option value="pending">Pendiente</option>
                                    </select>
                                </div>

                                <div className="flex flex-col">
                                    <label className="text-sm text-slate-600 mb-1">Tipo</label>
                                    <select
                                        value={typeFilter}
                                        onChange={(e) => {
                                            setTypeFilter(e.target.value as any);
                                            setCurrentPage(1);
                                        }}
                                        className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="all">Todos</option>
                                        <option value="day_exchange">Reprogramación de Vacaciones</option>
                                        <option value="holiday_worked">Festivo Trabajado</option>
                                        <option value="permission_request">Permiso/Incapacidad</option>
                                    </select>
                                </div>

                                <div className="flex flex-col">
                                    <label className="text-sm text-slate-600 mb-1">Año</label>
                                    <select
                                        value={yearFilter}
                                        onChange={(e) => {
                                            setYearFilter(parseInt(e.target.value));
                                            setCurrentPage(1);
                                        }}
                                        className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        {Array.from({ length: 5 }, (_, i) => {
                                            const year = new Date().getFullYear() - 2 + i;
                                            return (
                                                <option key={year} value={year}>
                                                    {year}
                                                </option>
                                            );
                                        })}
                                    </select>
                                </div>
                            </div>

                            <div className="relative flex gap-2">
                                <Button
                                    onClick={() => setExportOpen((v) => !v)}
                                    className="inline-flex cursor-pointer items-center gap-2"
                                    variant="continental"
                                    title="Exportar"
                                >
                                    <Download className="w-4 h-4" />
                                    Exportar
                                </Button>

                                {exportOpen && (
                                    <div className="absolute right-0 mt-10 w-56 bg-white border border-gray-200 rounded-md shadow-lg z-10">
                                        <button
                                            className="w-full cursor-pointer text-left px-4 py-2 text-sm hover:bg-gray-50"
                                            onClick={handleExportExcel}
                                        >
                                            Excel (.xlsx)
                                        </button>
                                        <button
                                            className="w-full cursor-pointer text-left px-4 py-2 text-sm hover:bg-gray-50"
                                            onClick={handleExportCSV}
                                        >
                                            CSV
                                        </button>
                                        <SolicitudesPDFDownloadLink
                                            solicitudes={filteredRequests}
                                            empleadoNombre={currentEmployee?.fullName || currentEmployee?.username || 'Empleado'}
                                            className="w-full cursor-pointer text-left px-4 py-2 text-sm hover:bg-gray-50 block"
                                        >
                                            <button
                                                className="w-full text-left"
                                                onClick={handleExportPDF}
                                            >
                                                PDF
                                            </button>
                                        </SolicitudesPDFDownloadLink>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 🆕 Segunda fila de filtros (nuevos) */}
                        {isDelegadoSindical && (
                            <div className="flex flex-col sm:flex-row gap-3">
                                <div className="flex flex-col">
                                    <label className="text-sm text-slate-600 mb-1">Solicitado por</label>
                                    <select
                                        value={requesterFilter}
                                        onChange={(e) => {
                                            setRequesterFilter(e.target.value as any);
                                            setCurrentPage(1);
                                        }}
                                        className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[200px]"
                                    >
                                        <option value="all">Todos</option>
                                        <option value="sistema">Sistema</option>
                                        <option value="delegado">Delegado Sindical</option>
                                    </select>
                                </div>

                                <div className="flex flex-col flex-1">
                                    <label className="text-sm text-slate-600 mb-1">Buscar por nómina</label>
                                    <div className="relative">
                                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <input
                                            type="text"
                                            value={nominaSearch}
                                            onChange={(e) => {
                                                setNominaSearch(e.target.value);
                                                setCurrentPage(1);
                                            }}
                                            placeholder="Ingresa número de nómina..."
                                            className="pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Lista de solicitudes */}
                <div className="flex-1 flex flex-col gap-4 w-full max-w-7xl mx-auto">
                    {loading ? (
                        <div className="flex justify-center items-center py-12">
                            <div className="text-gray-500">Cargando solicitudes...</div>
                        </div>
                    ) : error ? (
                        <div className="flex justify-center items-center py-12">
                            <div className="text-red-500">{error}</div>
                        </div>
                    ) : currentRequests.length === 0 ? (
                        <div className="flex justify-center items-center py-12">
                            <div className="text-gray-500">No hay solicitudes para mostrar</div>
                        </div>
                    ) : (
                        currentRequests.map((request) => {
                            return (
                                <div
                                    key={request.id}
                                    className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow"
                                >
                                    {/* Tipo de solicitud */}
                                    <div className="mb-4">
                                        <div className="flex items-center gap-2 mb-3">
                                            <span className="text-sm font-medium text-gray-700">
                                                {getRequestTypeText(request.type)}
                                            </span>
                                            {/* 🆕 Badge para Sistema/Delegado */}
                                            {isDelegadoSindical && (
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${!request.requester || request.requester.toLowerCase().includes("sistema")
                                                        ? "bg-gray-100 text-gray-700"
                                                        : "bg-blue-100 text-blue-700"
                                                    }`}>
                                                    {!request.requester || request.requester.toLowerCase().includes("sistema")
                                                        ? "Sistema"
                                                        : "Delegado"}
                                                </span>
                                            )}
                                        </div>

                                        {/* Header de la tarjeta */}
                                        <div className="flex items-start justify-between mb-4">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-2">
                                                    {getStatusIcon(request.status)}
                                                    <span
                                                        className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(
                                                            request.status
                                                        )}`}
                                                    >
                                                        {getStatusText(request.status)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Datos del empleado y flujo */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 text-sm text-gray-700">
                                            {request.employeeName && (
                                                <div>
                                                    <p className="font-medium text-gray-800">Empleado destino</p>
                                                    <p className="text-gray-700">{request.employeeName}</p>
                                                    <p className="text-xs text-gray-500">
                                                        {/* 🆕 Mostrar nómina */}
                                                        {request.employeeNomina && (
                                                            <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded mr-2">
                                                                #{request.employeeNomina}
                                                            </span>
                                                        )}
                                                        {request.employeeArea || "Área no especificada"} · {request.employeeGroup || "Grupo no especificado"}
                                                    </p>
                                                </div>
                                            )}
                                            <div className="space-y-1">
                                                {request.requester && (
                                                    <p>
                                                        <span className="font-medium text-gray-800">Solicitado por: </span>
                                                        <span className="text-gray-700">{request.requester}</span>
                                                    </p>
                                                )}
                                                {request.reviewer && (
                                                    <p>
                                                        <span className="font-medium text-gray-800">Revisado por: </span>
                                                        <span className="text-gray-700">{request.reviewer}</span>
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        {/* Fechas */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                            <div className="flex items-center gap-2 text-sm text-gray-600">
                                                <Calendar className="w-4 h-4" />
                                                <div>
                                                    <span className="font-medium">Fecha de solicitud:</span>
                                                    <br />
                                                    <span>{formatDate(request.requestDate)}</span>
                                                </div>
                                            </div>
                                            {request.responseDate && (
                                                <div className="flex items-center gap-2 text-sm text-gray-600">
                                                    <Clock className="w-4 h-4" />
                                                    <div>
                                                        <span className="font-medium">
                                                            Fecha de respuesta:
                                                        </span>
                                                        <br />
                                                        <span>{formatDate(request.responseDate)}</span>
                                                    </div>
                                                </div>
                                            )}
                                            {isDelegadoSindical &&
                                                request.type === "day_exchange" &&
                                                request.status === "pending" && (
                                                    <div className="mt-4 flex justify-end">
                                                        <button
                                                            onClick={() => handleCancelarSolicitud(request)}
                                                            className="px-4 py-2 text-sm font-medium text-red-600 border border-red-300 rounded-md hover:bg-red-50"
                                                        >
                                                            Cancelar solicitud
                                                        </button>
                                                    </div>
                                                )}
                                        </div>

                                        {request.type === "day_exchange" &&
                                            request.requestedDay &&
                                            request.dayToGive && (
                                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div>
                                                            <p className="text-xs font-medium text-blue-800 mb-1">
                                                                Día que solicita:
                                                            </p>
                                                            <p className="text-sm text-blue-700 font-medium">
                                                                {formatDateOnly(request.requestedDay)}
                                                            </p>
                                                        </div>
                                                        <div>
                                                            <p className="text-xs font-medium text-blue-800 mb-1">
                                                                Día que dará a cambio:
                                                            </p>
                                                            <p className="text-sm text-blue-700 font-medium">
                                                                {formatDateOnly(request.dayToGive)}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                        {request.type === "holiday_worked" &&
                                            request.requestedDay && (
                                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div>
                                                            <p className="text-xs font-medium text-blue-800 mb-1">
                                                                Día de compensación solicitado:
                                                            </p>
                                                            <p className="text-sm text-blue-700 font-medium">
                                                                {formatDateOnly(request.requestedDay)}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        {request.type === "permission_request" &&
                                            request.requestedDay &&
                                            request.dayToGive && (
                                                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div>
                                                            <p className="text-xs font-medium text-purple-800 mb-1">
                                                                Fecha Inicio:
                                                            </p>
                                                            <p className="text-sm text-purple-700 font-medium">
                                                                {formatDateOnly(request.requestedDay)}
                                                            </p>
                                                        </div>
                                                        <div>
                                                            <p className="text-xs font-medium text-purple-800 mb-1">
                                                                Fecha Fin:
                                                            </p>
                                                            <p className="text-sm text-purple-700 font-medium">
                                                                {formatDateOnly(request.dayToGive)}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                    </div>

                                    {/* Motivo de rechazo */}
                                    {request.status === "rejected" && request.rejectionReason && (
                                        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                                            <p className="text-sm font-medium text-red-800 mb-2">
                                                Motivo del rechazo:
                                            </p>
                                            <p className="text-sm text-red-700">
                                                {request.rejectionReason}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Paginación */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200">
                        <div className="text-sm text-gray-600">
                            Mostrando{" "}
                            {filteredRequests.length === 0 ? 0 : startIndex + 1} a{" "}
                            {Math.min(endIndex, filteredRequests.length)} de{" "}
                            {filteredRequests.length} solicitudes
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                                disabled={currentPage === 1}
                                className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Anterior
                            </button>

                            <div className="flex gap-1">
                                {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                                    (page) => (
                                        <button
                                            key={page}
                                            onClick={() => setCurrentPage(page)}
                                            className={`px-3 py-2 text-sm font-medium rounded-md ${currentPage === page
                                                ? "bg-blue-600 text-white"
                                                : "text-gray-500 bg-white border border-gray-300 hover:bg-gray-50"
                                                }`}
                                        >
                                            {page}
                                        </button>
                                    )
                                )}
                            </div>

                            <button
                                onClick={() =>
                                    setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                                }
                                disabled={currentPage === totalPages}
                                className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Siguiente
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MyRequests;

export const getStatusIcon = (status: RequestStatus) => {
    switch (status) {
        case "approved":
            return <CheckCircle className="w-5 h-5 text-green-600" />;
        case "rejected":
            return <XCircle className="w-5 h-5 text-red-600" />;
        case "pending":
            return <AlertCircle className="w-5 h-5 text-yellow-600" />;
    }
};

export const getStatusText = (status: RequestStatus) => {
    switch (status) {
        case "approved":
            return "Aprobada";
        case "rejected":
            return "Rechazada";
        case "pending":
            return "Pendiente";
        case "cancelled":
            return "Cancelada";
    }
};

export const getStatusColor = (status: RequestStatus) => {
    switch (status) {
        case "approved":
            return "bg-green-100 text-green-800";
        case "rejected":
            return "bg-red-100 text-red-800";
        case "pending":
            return "bg-yellow-100 text-yellow-800";
        case "cancelled":
            return "bg-gray-100 text-gray-700";
    }
};

export const formatDate = (dateString: string, showTime: boolean = true) => {
    try {
        const date = parseISO(dateString);
        return format(
            date,
            showTime
                ? "dd 'de' MMMM 'de' yyyy 'a las' HH:mm"
                : "dd 'de' MMMM 'de' yyyy",
            { locale: es }
        );
    } catch {
        return dateString;
    }
};

export const formatDateOnly = (dateString: string) => {
    try {
        const date = parseISO(dateString);
        return format(date, "EEEE dd 'de' MMMM 'de' yyyy", { locale: es });
    } catch {
        return dateString;
    }
};

export const getRequestTypeText = (type: RequestType) => {
    switch (type) {
        case "day_exchange":
            return "Reprogramación de Vacaciones";
        case "holiday_worked":
            return "Festivo Trabajado";
        case "permission_request":
            return "Permiso/Incapacidad";
    }
};