import { useState, useEffect } from "react";
import { NavbarUser } from "../ui/navbar-user";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Download, Calendar, ArrowLeftRight } from "lucide-react";
import { Button } from "../ui/button";
import { permutasListService, type PermutaListItem } from "@/services/permutasListService";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

const MisPermutas = () => {
    const navigate = useNavigate();
    const [permutas, setPermutas] = useState<PermutaListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [yearFilter, setYearFilter] = useState<number>(new Date().getFullYear());
    const [currentPage, setCurrentPage] = useState(1);
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

    const totalPages = Math.ceil(permutas.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentPermutas = permutas.slice(startIndex, endIndex);

    const formatDate = (dateString: string) => {
        try {
            const date = parseISO(dateString);
            return format(date, "dd 'de' MMMM 'de' yyyy", { locale: es });
        } catch {
            return dateString;
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
                        Permutas de Turno
                    </h1>
                    <p className="text-slate-600">
                        Historial de intercambios de turnos registrados
                    </p>
                </div>
                <NavbarUser />
            </header>

            <div className="mt-8 flex-1 flex flex-col">
                {/* Filtros y exportación */}
                <div className="w-full max-w-7xl mx-auto mb-4">
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

                        {/*<Button*/}
                        {/*    onClick={handleExportExcel}*/}
                        {/*    className="inline-flex cursor-pointer items-center gap-2"*/}
                        {/*    variant="continental"*/}
                        {/*>*/}
                        {/*    <Download className="w-4 h-4" />*/}
                        {/*    Exportar Excel*/}
                        {/*</Button>*/}
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
                            <div className="text-gray-500">No hay permutas registradas</div>
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
                                        <div className="flex items-center gap-2 mb-3">
                                            <Calendar className="w-4 h-4 text-gray-500" />
                                            <span className="text-sm font-medium text-gray-700">
                                                {formatDate(permuta.fechaPermuta)}
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
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

                                        <div className="bg-gray-50 rounded-lg p-3 mb-3">
                                            <p className="text-xs font-medium text-gray-700 mb-1">
                                                Motivo:
                                            </p>
                                            <p className="text-sm text-gray-800">{permuta.motivo}</p>
                                        </div>

                                        <div className="flex items-center gap-4 text-xs text-gray-500">
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
                        ))
                    )}
                </div>

                {/* Paginación */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200">
                        <div className="text-sm text-gray-600">
                            Mostrando {permutas.length === 0 ? 0 : startIndex + 1} a{" "}
                            {Math.min(endIndex, permutas.length)} de {permutas.length} permutas
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
            </div>
        </div>
    );
};

export default MisPermutas;