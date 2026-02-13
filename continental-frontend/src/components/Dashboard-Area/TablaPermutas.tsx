import { useState, useEffect, useRef, useCallback } from "react";
import { Calendar, ArrowLeftRight, Download, Search } from "lucide-react";
import { Button } from "../ui/button";
import { permutasListService, type PermutaListItem } from "@/services/permutasListService";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { useAuth } from "@/hooks/useAuth";
import { userService } from "@/services/userService";
import { type User } from "@/interfaces/User.interface";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const TablaPermutas = () => {
    const { user } = useAuth();
    const [permutas, setPermutas] = useState<PermutaListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [yearFilter, setYearFilter] = useState<number>(new Date().getFullYear());
    const [currentPage, setCurrentPage] = useState(1);

    // 🆕 Estados para filtros
    const [userData, setUserData] = useState<User | null>(null);
    const [loadingUserData, setLoadingUserData] = useState(false);
    const [selectedAreaId, setSelectedAreaId] = useState<number | null>(null);
    const [nominaSearch, setNominaSearch] = useState("");

    const itemsPerPage = 5;
    const abortControllerRef = useRef<AbortController | null>(null);
    const lastFetchedFiltersRef = useRef<string>('');

    // 🆕 Función para obtener datos del usuario
    const fetchUserData = useCallback(async () => {
        if (!user?.id) {
            setLoadingUserData(false);
            return;
        }

        setLoadingUserData(true);
        try {
            const userDetail = await userService.getUserById(user.id);
            console.log('User data for permutas:', userDetail);
            setUserData(userDetail);

            // Establecer área por defecto
            if (userDetail?.areas && userDetail.areas.length > 0) {
                const firstArea = userDetail.areas[0];
                setSelectedAreaId(firstArea.areaId);
            }
        } catch (error) {
            console.error('Error fetching user data:', error);
        } finally {
            setLoadingUserData(false);
        }
    }, [user?.id]);

    // 🆕 Cargar datos del usuario al inicio
    useEffect(() => {
        fetchUserData();
    }, [fetchUserData]);

    // 🆕 Efecto para cargar permutas con filtros
    useEffect(() => {
        if (loadingUserData || !userData) {
            return;
        }

        // Solo hacer fetch si tenemos un área seleccionada
        if (!selectedAreaId) {
            return;
        }

        // Cancelar petición anterior
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();

        const filtersKey = JSON.stringify({ yearFilter, selectedAreaId });

        // Evitar llamadas duplicadas
        if (lastFetchedFiltersRef.current === filtersKey) {
            return;
        }

        const timeoutId = setTimeout(() => {
            lastFetchedFiltersRef.current = filtersKey;
            loadPermutas();
        }, 300);

        return () => {
            clearTimeout(timeoutId);
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
                abortControllerRef.current = null;
            }
        };
    }, [yearFilter, selectedAreaId, loadingUserData, userData]);

    const loadPermutas = async () => {
        try {
            setLoading(true);

            const data = await permutasListService.obtenerPermutas({
                anio: yearFilter,
                areaId: selectedAreaId || undefined
            });

            setPermutas(data.permutas);
            console.log('📋 Permutas cargadas:', data.permutas.length);
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
            a.download = `Permutas_${yearFilter}_${format(new Date(), 'yyyyMMdd')}.xlsx`;
            a.click();
            window.URL.revokeObjectURL(url);
            toast.success('Excel descargado exitosamente');
        } catch (error) {
            console.error('Error exportando Excel:', error);
            toast.error('Error al exportar Excel');
        }
    };

    // 🆕 Filtrado por nómina en frontend
    const filteredPermutas = permutas.filter((permuta) => {
        if (!nominaSearch) return true;

        const searchLower = nominaSearch.toLowerCase();
        return (
            (permuta as any).empleadoOrigenNomina?.toString().includes(nominaSearch) ||
            (permuta as any).empleadoDestinoNomina?.toString().includes(nominaSearch) ||
            permuta.empleadoOrigenNombre.toLowerCase().includes(searchLower) ||
            permuta.empleadoDestinoNombre.toLowerCase().includes(searchLower)
        );
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

    const handleAprobar = async (permutaId: number) => {
        try {
            await permutasListService.responderPermuta(permutaId, true);
            toast.success('Permuta aprobada exitosamente');
            loadPermutas();
        } catch (error: any) {
            toast.error(error.message);
        }
    };

    const handleRechazar = async (permutaId: number) => {
        const motivo = prompt('Motivo del rechazo:');
        if (!motivo) return;

        try {
            await permutasListService.responderPermuta(permutaId, false, motivo);
            toast.success('Permuta rechazada');
            loadPermutas();
        } catch (error: any) {
            toast.error(error.message);
        }
    };

    return (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex flex-col gap-4 mb-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-semibold text-gray-900">
                            Historial de Permutas de Turno
                        </h2>
                        <p className="text-sm text-gray-600 mt-1">
                            Intercambios de turnos registrados por empleados del área
                        </p>
                    </div>
                    <Button
                        onClick={handleExportExcel}
                        className="inline-flex items-center gap-2"
                        variant="outline"
                        size="sm"
                    >
                        <Download className="w-4 h-4" />
                        Exportar
                    </Button>
                </div>

                {/* 🆕 Fila de filtros */}
                <div className="flex flex-wrap items-center gap-4">
                    {/* Selector de Año */}
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-700">Año</span>
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

                    {/* 🆕 Selector de Área */}
                    {userData && userData.areas && userData.areas.length > 0 && (
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-700">Área</span>
                            <Select
                                value={selectedAreaId?.toString() || ""}
                                onValueChange={(value) => {
                                    setSelectedAreaId(parseInt(value));
                                    setCurrentPage(1);
                                }}
                            >
                                <SelectTrigger className="w-48">
                                    <SelectValue placeholder="Selecciona un área" />
                                </SelectTrigger>
                                <SelectContent>
                                    {userData.areas.map((area) => (
                                        <SelectItem key={area.areaId} value={area.areaId.toString()}>
                                            {area.nombreGeneral}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {/* 🆕 Búsqueda por nómina/nombre */}
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            value={nominaSearch}
                            onChange={(e) => {
                                setNominaSearch(e.target.value);
                                setCurrentPage(1);
                            }}
                            placeholder="Busca por nómina o nombre..."
                            className="pl-9 pr-3 py-2 rounded-md border border-gray-300 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-gray-200"
                        />
                    </div>

                    {/* 🆕 Contador de resultados */}
                    <div className="text-sm text-gray-600">
                        Total: {filteredPermutas.length} permutas
                    </div>
                </div>
            </div>

            {loading || loadingUserData ? (
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
                <>
                    <div className="space-y-4">
                        {currentPermutas.map((permuta) => (
                            <div
                                key={permuta.id}
                                className="border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow"
                            >
                                <div className="flex items-start gap-4">
                                    <div className="p-2 bg-blue-50 rounded-lg">
                                        <ArrowLeftRight className="w-5 h-5 text-blue-600" />
                                    </div>

                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-3">
                                            <Calendar className="w-4 h-4 text-gray-500" />
                                            <span className="text-sm font-medium text-gray-700">
                                                {formatDate(permuta.fechaPermuta)}
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                                <p className="text-xs font-medium text-blue-800 mb-1">
                                                    Empleado Origen:
                                                </p>
                                                <p className="text-sm font-semibold text-blue-900">
                                                    {permuta.empleadoOrigenNombre}
                                                </p>
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
                                                <p className="text-xs text-green-700 mt-1">
                                                    Turno: {permuta.turnoEmpleadoDestino}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="bg-gray-50 rounded-lg p-3 mb-2">
                                            <p className="text-xs font-medium text-gray-700 mb-1">
                                                Motivo:
                                            </p>
                                            <p className="text-sm text-gray-800">{permuta.motivo}</p>
                                        </div>

                                        <div className="flex items-center gap-3 mt-3">
                                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${permuta.estadoSolicitud === 'Aprobada'
                                                    ? 'bg-green-100 text-green-800'
                                                    : permuta.estadoSolicitud === 'Rechazada'
                                                        ? 'bg-red-100 text-red-800'
                                                        : 'bg-yellow-100 text-yellow-800'
                                                }`}>
                                                {permuta.estadoSolicitud}
                                            </span>

                                            {permuta.estadoSolicitud === 'Pendiente' && (
                                                <>
                                                    <Button
                                                        size="sm"
                                                        variant="continental"
                                                        onClick={() => handleAprobar(permuta.id)}
                                                    >
                                                        Aprobar
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="destructive"
                                                        onClick={() => handleRechazar(permuta.id)}
                                                    >
                                                        Rechazar
                                                    </Button>
                                                </>
                                            )}
                                        </div>

                                        {permuta.motivoRechazo && (
                                            <p className="text-xs text-red-600 mt-2">
                                                Motivo rechazo: {permuta.motivoRechazo}
                                            </p>
                                        )}

                                        <div className="flex items-center gap-4 text-xs text-gray-500 mt-2">
                                            <span>
                                                Solicitado por: {permuta.solicitadoPorNombre}
                                            </span>
                                            <span>
                                                Fecha: {format(parseISO(permuta.fechaSolicitud), "dd/MM/yyyy HH:mm")}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

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
                </>
            )}
        </div>
    );
};