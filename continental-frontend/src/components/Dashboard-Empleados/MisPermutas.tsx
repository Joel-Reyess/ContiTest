import { useState, useEffect } from "react";
import { NavbarUser } from "../ui/navbar-user";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Download, Calendar, ArrowLeftRight, Search, User } from "lucide-react";
import { Button } from "../ui/button";
import { permutasListService, type PermutaListItem } from "@/services/permutasListService";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { useAuth } from "@/hooks/useAuth";
import { UserRole } from "@/interfaces/User.interface";

const MisPermutas = () => {
    const navigate = useNavigate();
    const { user } = useAuth();

    // Determinar si es delegado sindical
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

    const [permutas, setPermutas] = useState<PermutaListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [yearFilter, setYearFilter] = useState<number>(new Date().getFullYear());
    const [currentPage, setCurrentPage] = useState(1);

    // 🆕 Nuevos filtros mejorados
    const [requesterFilter, setRequesterFilter] = useState<"all" | "mine" | "others">("all");
    const [nominaSearch, setNominaSearch] = useState("");
    const [employeeNameSearch, setEmployeeNameSearch] = useState("");

    const itemsPerPage = 10;

    useEffect(() => {
        loadPermutas();
    }, [yearFilter]);

    const loadPermutas = async () => {
        try {
            setLoading(true);
            const data = await permutasListService.obtenerPermutas({
                anio: yearFilter
            });
            setPermutas(data.permutas);
        } catch (error) {
            console.error('Error cargando permutas:', error);
            toast.error('Error al cargar las permutas');
        } finally {
            setLoading(false);
        }
    };

    const handleExportExcel = async () => {
        try {
            const blob = await permutasListService.exportarExcel(yearFilter);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Permutas_${yearFilter}_${format(new Date(), 'yyyyMMdd')}.csv`;
            a.click();
            window.URL.revokeObjectURL(url);
            toast.success('Excel descargado exitosamente');
        } catch (error) {
            console.error('Error exportando Excel:', error);
            toast.error('Error al exportar Excel');
        }
    };

    // 🆕 Filtrado mejorado con identificación de delegado
    // 🆕 Filtrado mejorado con identificación de delegado
    const filteredPermutas = permutas.filter((permuta) => {
        // Filtro por solicitante (mías vs todas)
        let byRequester = true;
        if (requesterFilter !== "all") {
            if (requesterFilter === "mine") {
                // Solo las que YO solicité
                byRequester = permuta.solicitadoPorId === user?.id;
            } else if (requesterFilter === "others") {
                // Las que solicitaron otros
                byRequester = permuta.solicitadoPorId !== user?.id;
            }
        }

        // Filtro por búsqueda de nombre de empleado (origen o destino)
        const byEmployeeName = !employeeNameSearch ||
            permuta.empleadoOrigenNombre.toLowerCase().includes(employeeNameSearch.toLowerCase()) ||
            permuta.empleadoDestinoNombre.toLowerCase().includes(employeeNameSearch.toLowerCase());

        // Filtro por nómina (si existe en el modelo)
        const byNomina = !nominaSearch ||
            (permuta as any).empleadoOrigenNomina?.toString().includes(nominaSearch) ||
            (permuta as any).empleadoDestinoNomina?.toString().includes(nominaSearch);

        return byRequester && byEmployeeName && byNomina;
    });

    const totalPages = Math.ceil(filteredPermutas.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentPermutas = filteredPermutas.slice(startIndex, endIndex);

    const formatDate = (dateString: string) => {
        try {
            const date = parseISO(dateString);
            return format(date, "dd 'de' MMMM 'de' yyyy", { locale: es });
        } catch {
            return dateString;
        }
    };

    // 🆕 Determinar si una permuta fue solicitada por el usuario actual
    const isMine = (permuta: PermutaListItem) => {
        return permuta.solicitadoPorId === user?.id;
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
                        Permutas de Turno
                    </h1>
                    <p className="text-slate-600">
                        {isDelegadoSindical
                            ? "Historial de intercambios de turnos que gestionaste"
                            : "Historial de intercambios de turnos registrados"}
                    </p>
                </div>
                <NavbarUser />
            </header>

            <div className="mt-8 flex-1 flex flex-col">
                {/* Filtros y exportación */}
                <div className="w-full max-w-7xl mx-auto mb-4">
                    <div className="flex flex-col gap-4">
                        {/* Primera fila de filtros */}
                        <div className="flex flex-col md:flex-row gap-3 md:items-end md:justify-between">
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

                        {/* 🆕 Segunda fila de filtros (mejorados) */}
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
                                        <option value="all">Todas las permutas</option>
                                        <option value="mine">Mis solicitudes</option>
                                        <option value="others">Otros delegados</option>
                                    </select>
                                </div>

                                <div className="flex flex-col flex-1">
                                    <label className="text-sm text-slate-600 mb-1">Buscar por nombre</label>
                                    <div className="relative">
                                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <input
                                            type="text"
                                            value={employeeNameSearch}
                                            onChange={(e) => {
                                                setEmployeeNameSearch(e.target.value);
                                                setCurrentPage(1);
                                            }}
                                            placeholder="Buscar por nombre de empleado..."
                                            className="pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
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

                {/* Lista de permutas */}
                <div className="flex-1 flex flex-col gap-4 w-full max-w-7xl mx-auto">
                    {loading ? (
                        <div className="flex justify-center items-center py-12">
                            <div className="text-gray-500">Cargando permutas...</div>
                        </div>
                    ) : currentPermutas.length === 0 ? (
                        <div className="flex justify-center items-center py-12">
                            <div className="text-gray-500">
                                {filteredPermutas.length === 0 && permutas.length > 0
                                    ? "No se encontraron permutas con los filtros aplicados"
                                    : "No hay permutas registradas"}
                            </div>
                        </div>
                    ) : (
                        currentPermutas.map((permuta) => (
                            <div
                                key={permuta.id}
                                className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow"
                            >
                                <div className="flex items-start gap-4">
                                    <div className="p-3 bg-blue-50 rounded-lg">
                                        <ArrowLeftRight className="w-6 h-6 text-blue-600" />
                                    </div>

                                    <div className="flex-1">
                                        {/* 🆕 Header con badge mejorado */}
                                        <div className="flex items-center gap-2 mb-3">
                                            <Calendar className="w-4 h-4 text-gray-500" />
                                            <span className="text-sm font-medium text-gray-700">
                                                {formatDate(permuta.fechaPermuta)}
                                            </span>
                                            {/* 🆕 Badge mejorado para identificar al solicitante */}
                                            {isDelegadoSindical && (
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 ${isMine(permuta)
                                                        ? "bg-green-100 text-green-700"
                                                        : "bg-blue-100 text-blue-700"
                                                    }`}>
                                                    <User className="w-3 h-3" />
                                                    {isMine(permuta) ? "Mi solicitud" : permuta.solicitadoPorNombre}
                                                </span>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                                <p className="text-xs font-medium text-blue-800 mb-1">
                                                    Empleado Origen:
                                                </p>
                                                <p className="text-sm font-semibold text-blue-900">
                                                    {permuta.empleadoOrigenNombre}
                                                </p>
                                                {/* 🆕 Mostrar nómina si existe */}
                                                {(permuta as any).empleadoOrigenNomina && (
                                                    <p className="text-xs text-blue-700 mt-1">
                                                        <span className="font-mono bg-blue-100 px-1.5 py-0.5 rounded">
                                                            #{(permuta as any).empleadoOrigenNomina}
                                                        </span>
                                                    </p>
                                                )}
                                                <p className="text-xs text-blue-700 mt-1">
                                                    Turno: {permuta.turnoEmpleadoOrigen}
                                                </p>
                                            </div>

                                            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                                                <p className="text-xs font-medium text-green-800 mb-1">
                                                    Empleado Destino:
                                                </p>
                                                <p className="text-sm font-semibold text-green-900">
                                                    {permuta.empleadoDestinoNombre}
                                                </p>
                                                {/* 🆕 Mostrar nómina si existe */}
                                                {(permuta as any).empleadoDestinoNomina && (
                                                    <p className="text-xs text-green-700 mt-1">
                                                        <span className="font-mono bg-green-100 px-1.5 py-0.5 rounded">
                                                            #{(permuta as any).empleadoDestinoNomina}
                                                        </span>
                                                    </p>
                                                )}
                                                <p className="text-xs text-green-700 mt-1">
                                                    Turno: {permuta.turnoEmpleadoDestino}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="bg-gray-50 rounded-lg p-3 mb-3">
                                            <p className="text-xs font-medium text-gray-700 mb-1">
                                                Motivo:
                                            </p>
                                            <p className="text-sm text-gray-800">{permuta.motivo}</p>
                                        </div>

                                        <div className="flex items-center gap-4 text-xs text-gray-500">
                                            <span className="flex items-center gap-1">
                                                <User className="w-3 h-3" />
                                                Solicitado por: {permuta.solicitadoPorNombre}
                                            </span>
                                            <span>
                                                Fecha: {format(parseISO(permuta.fechaSolicitud), "dd/MM/yyyy HH:mm")}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Paginación */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200">
                        <div className="text-sm text-gray-600">
                            Mostrando {filteredPermutas.length === 0 ? 0 : startIndex + 1} a{" "}
                            {Math.min(endIndex, filteredPermutas.length)} de {filteredPermutas.length} permutas
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
                                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                                    let pageNum;
                                    if (totalPages <= 5) {
                                        pageNum = i + 1;
                                    } else if (currentPage <= 3) {
                                        pageNum = i + 1;
                                    } else if (currentPage >= totalPages - 2) {
                                        pageNum = totalPages - 4 + i;
                                    } else {
                                        pageNum = currentPage - 2 + i;
                                    }

                                    return (
                                        <button
                                            key={pageNum}
                                            onClick={() => setCurrentPage(pageNum)}
                                            className={`px-3 py-2 text-sm font-medium rounded-md ${currentPage === pageNum
                                                    ? "bg-blue-600 text-white"
                                                    : "text-gray-500 bg-white border border-gray-300 hover:bg-gray-50"
                                                }`}
                                        >
                                            {pageNum}
                                        </button>
                                    );
                                })}
                            </div>

                            <button
                                onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
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

export default MisPermutas;