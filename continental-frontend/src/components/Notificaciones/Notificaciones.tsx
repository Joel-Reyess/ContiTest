import { useState, useEffect } from "react";
import { Navbar } from "../Navbar/Navbar";
import { Card } from "../ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Button } from "../ui/button";
import { List, ChevronLeft, ChevronRight, Loader2, Bell, Archive, CheckCircle, Eye } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import useAuth from "@/hooks/useAuth";
import { getNavigationItems, getUserRole } from "@/utils/navigationUtils";
import notificacionesService, {
    TipoNotificacion,
    EstatusNotificacion
} from "@/services/notificacionesService";
import type {
    Notificacion,
    ObtenerNotificacionesRequest,
    Estadisticas
} from "@/services/notificacionesService";
import { format, parseISO } from "date-fns";
import { showSuccess, showError, showInfo } from "@/utils/alerts";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/** formatea con '—' como en el mock: 23—08—2025 13:23:32 */
function formatearFechaNotificacion(fecha: string) {
    try {
        const fechaParsed = parseISO(fecha);
        return format(fechaParsed, "dd—MM—yyyy HH:mm:ss");
    } catch {
        return fecha;
    }
}

export const Notificaciones = () => {
    const location = useLocation();
    const { user } = useAuth();

    // Estados principales
    const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
    const [loading, setLoading] = useState(true);
    const [procesando, setProcesando] = useState<number | null>(null);
    const [estadisticas, setEstadisticas] = useState<Estadisticas | null>(null);

    // Estados de filtros
    const [selectedArea, setSelectedArea] = useState<string>("Todas");
    const [selectedGroup, setSelectedGroup] = useState<string>("Todas");
    const [selectedMovementType, setSelectedMovementType] = useState<string>("Todas");
    const [selectedReadStatus, setSelectedReadStatus] = useState<string>("Todas");

    // Estados de paginación
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalNotificaciones, setTotalNotificaciones] = useState(0);
    const itemsPerPage = 5;

    // Estados de información del usuario
    const [areasDisponibles, setAreasDisponibles] = useState<{id: number, nombre: string}[]>([]);
    const [gruposDisponibles, setGruposDisponibles] = useState<{id: number, nombre: string}[]>([]);

    // Estados para modales
    const [showMarkAllDialog, setShowMarkAllDialog] = useState(false);
    const [showArchiveDialog, setShowArchiveDialog] = useState(false);
    const [notificacionToArchive, setNotificacionToArchive] = useState<Notificacion | null>(null);

    // Obtener elementos de navegación dinámicamente según el rol del usuario
    const userRole = getUserRole(user);
    const navItems = userRole ? getNavigationItems(userRole) : [];

    // Cargar notificaciones
    const cargarNotificaciones = async () => {
        try {
            setLoading(true);

            const params: ObtenerNotificacionesRequest = {
                pagina: currentPage,
                tamañoPagina: itemsPerPage,
                ordenarPor: 'FechaAccion',
                direccionOrden: 'DESC'
            };

            // Aplicar filtros
            if (selectedReadStatus !== "Todas") {
                if (selectedReadStatus === "No leídas") {
                    params.estatus = EstatusNotificacion.NoLeida;
                } else if (selectedReadStatus === "Leídas") {
                    params.estatus = EstatusNotificacion.Leida;
                } else if (selectedReadStatus === "Archivadas") {
                    params.estatus = EstatusNotificacion.Archivada;
                }
            }

            if (selectedMovementType !== "Todas") {
                // Mapear tipos de movimiento a tipos de notificación
                const tipoMap: { [key: string]: TipoNotificacion } = {
                    "Registro de Vacaciones": TipoNotificacion.RegistroVacaciones,
                    "Solicitud de Reprogramación": TipoNotificacion.SolicitudReprogramacion,
                    "Sistema de Bloques": TipoNotificacion.SistemaBloques,
                    "Cambio de Manning": TipoNotificacion.CambioDeManning,
                    "Solicitud de Suplente": TipoNotificacion.SolicitudSuplente,
                };

                if (tipoMap[selectedMovementType]) {
                    params.tipoNotificacion = tipoMap[selectedMovementType];
                }
            }

            // Si hay área seleccionada (diferente de "Todas")
            if (selectedArea !== "Todas") {
                const area = areasDisponibles.find(a => a.nombre === selectedArea);
                if (area) {
                    params.areaId = area.id;
                }
            }

            // Si hay grupo seleccionado (diferente de "Todas")
            if (selectedGroup !== "Todas") {
                const grupo = gruposDisponibles.find(g => g.nombre === selectedGroup);
                if (grupo) {
                    params.grupoId = grupo.id;
                }
            }

            const response = await notificacionesService.obtenerNotificaciones(params);

            if (response.success && response.data) {
                setNotificaciones(response.data.notificaciones);
                setTotalPages(response.data.totalPaginas);
                setTotalNotificaciones(response.data.totalNotificaciones);
                setEstadisticas(response.data.estadisticas);

                // Extraer áreas y grupos únicos de las notificaciones
                const areasUnicas = new Map<number, string>();
                const gruposUnicos = new Map<number, string>();

                response.data.notificaciones.forEach(notif => {
                    if (notif.area) {
                        areasUnicas.set(notif.area.areaId, notif.area.nombreGeneral);
                    }
                    if (notif.grupo) {
                        gruposUnicos.set(notif.grupo.grupoId, notif.grupo.rol);
                    }
                });

                setAreasDisponibles(Array.from(areasUnicas).map(([id, nombre]) => ({ id, nombre })));
                setGruposDisponibles(Array.from(gruposUnicos).map(([id, nombre]) => ({ id, nombre })));
            }
        } catch (error) {
            console.error('Error cargando notificaciones:', error);
            showError('No se pudieron cargar las notificaciones');
        } finally {
            setLoading(false);
        }
    };

    // Marcar como leída
    const handleMarkAsRead = async (notificacion: Notificacion) => {
        if (notificacion.estatus !== EstatusNotificacion.NoLeida || !notificacion.puedeMarcarLeida) {
            console.log("No se puede marcar como leída");
            return;
        }

        try {
            setProcesando(notificacion.id);
            console.log(`Marcando notificación ${notificacion.id} como leída...`);

            const response = await notificacionesService.marcarComoLeida(notificacion.id);

            if (response.success) {
                // Actualizar estado local inmediatamente sin recargar
                setNotificaciones(prevNotifs => {
                    const updated = prevNotifs.map(n =>
                        n.id === notificacion.id
                            ? { ...n, estatus: EstatusNotificacion.Leida, puedeMarcarLeida: false }
                            : n
                    );
                    return updated;
                });

                // Actualizar estadísticas
                if (estadisticas) {
                    setEstadisticas({
                        ...estadisticas,
                        noLeidas: estadisticas.noLeidas - 1,
                        leidas: estadisticas.leidas + 1
                    });
                }

                showSuccess('Notificación marcada como leída');
                console.log('Notificación marcada exitosamente');
            } else {
                showError(response.errorMsg || 'No se pudo marcar la notificación');
            }
        } catch (error) {
            console.error('Error marcando como leída:', error);
            showError('Error al marcar la notificación como leída');
        } finally {
            setProcesando(null);
        }
    };

    // Marcar todas como leídas - Preparación
    const handleMarkAllAsRead = () => {
        const noLeidas = notificaciones.filter(n =>
            n.estatus === EstatusNotificacion.NoLeida && n.puedeMarcarLeida
        );

        if (noLeidas.length === 0) {
            showInfo('No hay notificaciones no leídas');
            return;
        }

        setShowMarkAllDialog(true);
    };

    // Confirmar marcar todas como leídas
    const confirmMarkAllAsRead = async () => {
        const noLeidas = notificaciones.filter(n =>
            n.estatus === EstatusNotificacion.NoLeida && n.puedeMarcarLeida
        );

        setShowMarkAllDialog(false);

        try {
            setLoading(true);
            let exitosas = 0;

            for (const notif of noLeidas) {
                const response = await notificacionesService.marcarComoLeida(notif.id);
                if (response.success) exitosas++;
            }

            // Actualizar estado local después de marcar todas
            setNotificaciones(prevNotifs => {
                const updated = prevNotifs.map(n =>
                    n.estatus === EstatusNotificacion.NoLeida && n.puedeMarcarLeida
                        ? { ...n, estatus: EstatusNotificacion.Leida, puedeMarcarLeida: false }
                        : n
                );
                return updated;
            });

            // Actualizar estadísticas
            if (estadisticas) {
                setEstadisticas({
                    ...estadisticas,
                    noLeidas: estadisticas.noLeidas - exitosas,
                    leidas: estadisticas.leidas + exitosas
                });
            }

            showSuccess(`${exitosas} notificaciones marcadas como leídas`);
        } catch (error) {
            console.error('Error marcando todas como leídas:', error);
            showError('No se pudieron marcar todas las notificaciones');
        } finally {
            setLoading(false);
        }
    };

    // Archivar notificación - Preparación
    const handleArchiveClick = (notificacion: Notificacion) => {
        if (!notificacion.puedeArchivar) {
            return;
        }
        setNotificacionToArchive(notificacion);
        setShowArchiveDialog(true);
    };

    // Confirmar archivar notificación
    const confirmArchive = async () => {
        if (!notificacionToArchive) return;

        setShowArchiveDialog(false);

        try {
            setProcesando(notificacionToArchive.id);
            const response = await notificacionesService.archivar(notificacionToArchive.id);

            if (response.success) {
                // Actualizar estado local sin recargar
                setNotificaciones(prevNotifs => {
                    const updated = prevNotifs.map(n =>
                        n.id === notificacionToArchive.id
                            ? { ...n, estatus: EstatusNotificacion.Archivada, puedeArchivar: false }
                            : n
                    );
                    return updated;
                });

                // Actualizar estadísticas
                if (estadisticas) {
                    const estuvoNoLeida = notificacionToArchive.estatus === EstatusNotificacion.NoLeida;
                    const estuvoLeida = notificacionToArchive.estatus === EstatusNotificacion.Leida;

                    setEstadisticas({
                        ...estadisticas,
                        noLeidas: estuvoNoLeida ? estadisticas.noLeidas - 1 : estadisticas.noLeidas,
                        leidas: estuvoLeida ? estadisticas.leidas - 1 : estadisticas.leidas,
                        archivadas: estadisticas.archivadas + 1
                    });
                }

                showSuccess('Notificación archivada');
            } else {
                showError(response.errorMsg || 'No se pudo archivar la notificación');
            }
        } catch (error) {
            console.error('Error archivando:', error);
            showError('Error al archivar la notificación');
        } finally {
            setProcesando(null);
            setNotificacionToArchive(null);
        }
    };

    // Obtener color del tipo de notificación
    const getTipoColor = (tipo: number): string => {
        const colores: { [key: number]: string } = {
            [TipoNotificacion.RegistroVacaciones]: "text-blue-600",
            [TipoNotificacion.SolicitudReprogramacion]: "text-purple-600",
            [TipoNotificacion.AprobacionReprogramacion]: "text-green-600",
            [TipoNotificacion.RechazoReprogramacion]: "text-red-600",
            [TipoNotificacion.SistemaBloques]: "text-gray-600",
            [TipoNotificacion.CambioDeManning]: "text-orange-600",
            [TipoNotificacion.SolicitudSuplente]: "text-indigo-600",
            [TipoNotificacion.CambioAreaEmpleadoSAP]: "text-orange-700",
            [TipoNotificacion.NuevaReglaSAP]: "text-yellow-700",
        };
        return colores[tipo] || "text-gray-600";
    };

    // Obtener ícono del tipo de notificación
    const getTipoIcon = (tipo: number) => {
        switch (tipo) {
            case TipoNotificacion.RegistroVacaciones:
                return <Bell className="w-4 h-4" />;
            case TipoNotificacion.AprobacionReprogramacion:
                return <CheckCircle className="w-4 h-4" />;
            case TipoNotificacion.SistemaBloques:
                return <Archive className="w-4 h-4" />;
            case TipoNotificacion.CambioAreaEmpleadoSAP:
            case TipoNotificacion.NuevaReglaSAP:
                return <Bell className="w-4 h-4" />;
            default:
                return <List className="w-4 h-4" />;
        }
    };

    // useEffect para cargar datos iniciales
    useEffect(() => {
        cargarNotificaciones();
    }, [currentPage]);

    // useEffect para resetear página cuando cambian filtros
    useEffect(() => {
        setCurrentPage(1);
        if (!loading) {
            cargarNotificaciones();
        }
    }, [selectedArea, selectedGroup, selectedMovementType, selectedReadStatus]);

    // Paginación
    const goToPage = (page: number) => {
        if (page >= 1 && page <= totalPages) {
            setCurrentPage(page);
        }
    };

    const goToPreviousPage = () => {
        if (currentPage > 1) {
            setCurrentPage(currentPage - 1);
        }
    };

    const goToNextPage = () => {
        if (currentPage < totalPages) {
            setCurrentPage(currentPage + 1);
        }
    };

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, totalNotificaciones);

    return (
        <div className="flex flex-col h-screen">
            <Navbar>
                <nav className="flex gap-2">
                    {navItems.map((item) => {
                        const isActive = location.pathname === item.to;
                        return (
                            <Link
                                key={item.to}
                                to={item.to}
                                className={`rounded-lg flex items-center gap-2 px-4 py-2 transition-colors ${
                                    isActive
                                        ? "bg-continental-yellow text-continental-black"
                                        : "hover:bg-continental-yellow hover:text-continental-black"
                                }`}
                            >
                                {item.icon}
                                <span>{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>
            </Navbar>

            <div className="flex-1 bg-white p-6">
                <div className="mx-auto max-w-6xl">
                    <Card className="px-4 py-3 mb-4 border border-gray-300/80 shadow-none">
                        <div className="flex items-start justify-between gap-3 text-sm">
                            <div className="flex items-start gap-2">
                                <List className="w-10 h-10" />
                                <div className="flex flex-col">
                                    <span className="font-semibold text-continental-black">
                                        Historial de notificaciones
                                    </span>
                                    <span className="text-continental-gray-1">
                                        Consulta las notificaciones y movimientos en la plataforma
                                    </span>
                                </div>
                            </div>

                            {/* Estadísticas rápidas */}
                            {estadisticas && (
                                <div className="flex gap-4 text-xs">
                                    <div className="flex items-center gap-1">
                                        <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                                        <span>No leídas: {estadisticas.noLeidas}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                        <span>Leídas: {estadisticas.leidas}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
                                        <span>Archivadas: {estadisticas.archivadas}</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="mt-3 grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                            {/* Área */}
                            <div className="flex flex-col">
                                <span className="text-[11px] text-continental-gray-1 mb-1">Área</span>
                                <Select value={selectedArea} onValueChange={setSelectedArea}>
                                    <SelectTrigger className="h-8 text-sm rounded-md border-gray-300 bg-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Todas">Todas</SelectItem>
                                        {areasDisponibles.map(area => (
                                            <SelectItem key={area.id} value={area.nombre}>
                                                {area.nombre}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Grupo */}
                            <div className="flex flex-col">
                                <span className="text-[11px] text-continental-gray-1 mb-1">Grupo</span>
                                <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                                    <SelectTrigger className="h-8 text-sm rounded-md border-gray-300 bg-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Todas">Todas</SelectItem>
                                        {gruposDisponibles.map(grupo => (
                                            <SelectItem key={grupo.id} value={grupo.nombre}>
                                                {grupo.nombre}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Tipo de movimiento */}
                            <div className="flex flex-col">
                                <span className="text-[11px] text-continental-gray-1 mb-1">Tipo de movimiento</span>
                                <Select value={selectedMovementType} onValueChange={setSelectedMovementType}>
                                    <SelectTrigger className="h-8 text-sm rounded-md border-gray-300 bg-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Todas">Todas</SelectItem>
                                        <SelectItem value="Registro de Vacaciones">Registro de Vacaciones</SelectItem>
                                        <SelectItem value="Solicitud de Reprogramación">Solicitud de Reprogramación</SelectItem>
                                        <SelectItem value="Sistema de Bloques">Sistema de Bloques</SelectItem>
                                        <SelectItem value="Cambio de Manning">Cambio de Manning</SelectItem>
                                        <SelectItem value="Solicitud de Suplente">Solicitud de Suplente</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Estado de lectura */}
                            <div className="flex flex-col">
                                <span className="text-[11px] text-continental-gray-1 mb-1">Estado</span>
                                <Select value={selectedReadStatus} onValueChange={setSelectedReadStatus}>
                                    <SelectTrigger className="h-8 text-sm rounded-md border-gray-300 bg-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Todas">Todas</SelectItem>
                                        <SelectItem value="No leídas">No leídas</SelectItem>
                                        <SelectItem value="Leídas">Leídas</SelectItem>
                                        <SelectItem value="Archivadas">Archivadas</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="flex justify-end">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleMarkAllAsRead}
                                    disabled={loading}
                                    className="text-xs h-8"
                                >
                                    {loading ? (
                                        <Loader2 className="w-4 h-4 animate-spin mr-1" />
                                    ) : null}
                                    Marcar todas como leídas
                                </Button>
                            </div>
                        </div>
                    </Card>

                    {/* Lista de notificaciones */}
                    {loading ? (
                        <div className="flex justify-center items-center h-64">
                            <Loader2 className="w-8 h-8 animate-spin text-continental-yellow" />
                        </div>
                    ) : (
                        <>
                            <div className="space-y-2 flex-1">
                                {notificaciones.map((notificacion) => (
                                    <Card
                                        key={notificacion.id}
                                        className={`rounded-md border border-gray-300 shadow-none px-4 py-3 transition-colors ${
                                            notificacion.estatus === EstatusNotificacion.NoLeida
                                                ? 'bg-[#F6F6F6] hover:bg-gray-200'
                                                : 'bg-white hover:bg-gray-50'
                                        }`}
                                    >
                                        <div className="flex justify-between items-start">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2">
                                                    <span className={`${getTipoColor(notificacion.tipoDeNotificacion)}`}>
                                                        {getTipoIcon(notificacion.tipoDeNotificacion)}
                                                    </span>
                                                    <div className="text-[15px] font-semibold text-continental-black leading-tight">
                                                        {notificacion.tipoNotificacionTexto}
                                                    </div>
                                                    {notificacion.estatus === EstatusNotificacion.NoLeida && (
                                                        <div className="w-2 h-2 bg-continental-yellow rounded-full"></div>
                                                    )}
                                                </div>
                                                <div className="text-sm text-continental-gray-1 mt-1">
                                                    {notificacion.mensaje}
                                                </div>
                                                <div className="flex items-center gap-3 mt-2">
                                                    <div className="text-xs text-continental-gray-2">
                                                        {formatearFechaNotificacion(notificacion.fechaAccion)}
                                                    </div>
                                                    {notificacion.area && (
                                                        <span className="text-xs text-continental-gray-2">
                                                            • {notificacion.area.nombreGeneral}
                                                        </span>
                                                    )}
                                                    {notificacion.grupo && (
                                                        <span className="text-xs text-continental-gray-2">
                                                            • {notificacion.grupo.rol}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Acciones */}
                                            <div className="flex gap-2 ml-4">
                                                {notificacion.estatus === EstatusNotificacion.NoLeida &&
                                                 notificacion.puedeMarcarLeida && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleMarkAsRead(notificacion)}
                                                        disabled={procesando === notificacion.id}
                                                        className="h-8 w-8 p-0"
                                                        title="Marcar como leída"
                                                    >
                                                        {procesando === notificacion.id ? (
                                                            <Loader2 className="w-4 h-4 animate-spin" />
                                                        ) : (
                                                            <Eye className="w-4 h-4" />
                                                        )}
                                                    </Button>
                                                )}

                                                {notificacion.puedeArchivar &&
                                                 notificacion.estatus !== EstatusNotificacion.Archivada && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleArchiveClick(notificacion)}
                                                        disabled={procesando === notificacion.id}
                                                        className="h-8 w-8 p-0"
                                                        title="Archivar"
                                                    >
                                                        {procesando === notificacion.id ? (
                                                            <Loader2 className="w-4 h-4 animate-spin" />
                                                        ) : (
                                                            <Archive className="w-4 h-4" />
                                                        )}
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </Card>
                                ))}
                            </div>

                            {notificaciones.length === 0 && (
                                <Card className="p-8 mt-2 text-center border border-gray-300 shadow-none">
                                    <div className="text-continental-gray-1">
                                        No se encontraron notificaciones para los filtros seleccionados
                                    </div>
                                </Card>
                            )}

                            {/* Paginación */}
                            {notificaciones.length > 0 && totalPages > 1 && (
                                <div className="mt-6 flex items-center justify-between border-t border-gray-200 pt-4">
                                    {/* Información de resultados */}
                                    <div className="text-sm text-continental-gray-1">
                                        Mostrando {startIndex + 1} a {endIndex} de {totalNotificaciones} resultados
                                    </div>

                                    {/* Controles de paginación */}
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={goToPreviousPage}
                                            disabled={currentPage === 1}
                                            className="flex items-center gap-1"
                                        >
                                            <ChevronLeft className="w-4 h-4" />
                                            Anterior
                                        </Button>

                                        {/* Números de página */}
                                        <div className="flex items-center gap-1">
                                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                                const pageNumber = Math.max(1, Math.min(currentPage - 2 + i, totalPages - 4)) + i;
                                                if (pageNumber <= totalPages) {
                                                    return (
                                                        <Button
                                                            key={pageNumber}
                                                            variant={currentPage === pageNumber ? "default" : "outline"}
                                                            size="sm"
                                                            onClick={() => goToPage(pageNumber)}
                                                            className={`w-8 h-8 p-0 ${
                                                                currentPage === pageNumber
                                                                    ? 'bg-continental-yellow hover:bg-continental-yellow text-continental-black'
                                                                    : ''
                                                            }`}
                                                        >
                                                            {pageNumber}
                                                        </Button>
                                                    );
                                                }
                                                return null;
                                            })}
                                        </div>

                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={goToNextPage}
                                            disabled={currentPage === totalPages}
                                            className="flex items-center gap-1"
                                        >
                                            Siguiente
                                            <ChevronRight className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Modal para marcar todas como leídas */}
            <AlertDialog open={showMarkAllDialog} onOpenChange={setShowMarkAllDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Marcar todas como leídas?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Se marcarán {notificaciones.filter(n => n.estatus === EstatusNotificacion.NoLeida && n.puedeMarcarLeida).length} notificaciones como leídas.
                            Esta acción no se puede deshacer.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmMarkAllAsRead}>
                            Marcar todas
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Modal para archivar notificación */}
            <AlertDialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Archivar notificación?</AlertDialogTitle>
                        <AlertDialogDescription>
                            La notificación será movida a la sección de archivadas.
                            Podrás verla aplicando el filtro correspondiente.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setNotificacionToArchive(null)}>
                            Cancelar
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={confirmArchive}>
                            Archivar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};