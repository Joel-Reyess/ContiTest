import { useState, useEffect } from "react";
import { Calendar, ArrowLeftRight, Download } from "lucide-react";
import { Button } from "../ui/button";
import { permutasListService, type PermutaListItem } from "@/services/permutasListService";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

export const TablaPermutas = () => {
    const [permutas, setPermutas] = useState<PermutaListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [yearFilter, setYearFilter] = useState<number>(new Date().getFullYear());
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 5;

    useEffect(() => {
        loadPermutas();
    }, [yearFilter]);

    const loadPermutas = async () => {
        try {
            setLoading(true);

            // Obtener área del usuario actual
            const userStr = localStorage.getItem('user');
            let areaId: number | undefined;

            if (userStr) {
                const currentUser = JSON.parse(userStr);
                areaId = currentUser.areaId || currentUser.area?.areaId;
            }

            const data = await permutasListService.obtenerPermutas({
                anio: yearFilter,
                areaId: areaId
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
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-xl font-semibold text-gray-900">
                        Historial de Permutas de Turno
                    </h2>
                    <p className="text-sm text-gray-600 mt-1">
                        Intercambios de turnos registrados por empleados del área
                    </p>
                </div>
                <div className="flex items-center gap-3">
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
            </div>

            {loading ? (
                <div className="flex justify-center items-center py-12">
                    <div className="text-gray-500">Cargando permutas...</div>
                </div>
            ) : currentPermutas.length === 0 ? (
                <div className="flex justify-center items-center py-12">
                    <div className="text-gray-500">No hay permutas registradas</div>
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
                </>
            )}
        </div>
    );
};