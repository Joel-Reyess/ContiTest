import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Clock, Eye } from 'lucide-react';
import { solicitudesPermisosService, type SolicitudPermisoDto } from '@/services/solicitudesPermisosService';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export const SolicitudesPermisos = () => {
    const [solicitudes, setSolicitudes] = useState<SolicitudPermisoDto[]>([]);
    const [loading, setLoading] = useState(true);
    const [filtroEstado, setFiltroEstado] = useState<string>('Pendiente');
    const [processingId, setProcessingId] = useState<number | null>(null);

    const cargarSolicitudes = async () => {
        setLoading(true);
        try {
            const response = await solicitudesPermisosService.obtenerSolicitudesPendientes();
            const filtradas = response.solicitudes.filter(
                s => filtroEstado === '' || s.estado === filtroEstado
            );
            setSolicitudes(filtradas);
        } catch (error) {
            console.error('Error cargando solicitudes:', error);
            toast.error('Error al cargar solicitudes de permisos');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        cargarSolicitudes();
    }, [filtroEstado]);

    const handleAprobar = async (solicitudId: number) => {
        setProcessingId(solicitudId);
        try {
            await solicitudesPermisosService.responderSolicitud({
                solicitudId,
                aprobar: true
            });
            toast.success('Solicitud aprobada exitosamente');
            cargarSolicitudes();
        } catch (error) {
            toast.error('Error al aprobar solicitud');
        } finally {
            setProcessingId(null);
        }
    };

    const handleRechazar = async (solicitudId: number) => {
        const motivo = prompt('Ingrese el motivo del rechazo:');
        if (!motivo) return;

        setProcessingId(solicitudId);
        try {
            await solicitudesPermisosService.responderSolicitud({
                solicitudId,
                aprobar: false,
                motivoRechazo: motivo
            });
            toast.success('Solicitud rechazada');
            cargarSolicitudes();
        } catch (error) {
            toast.error('Error al rechazar solicitud');
        } finally {
            setProcessingId(null);
        }
    };

    const getEstadoBadge = (estado: string) => {
        const styles = {
            Pendiente: 'bg-yellow-100 text-yellow-800',
            Aprobada: 'bg-green-100 text-green-800',
            Rechazada: 'bg-red-100 text-red-800'
        };
        return styles[estado as keyof typeof styles] || 'bg-gray-100 text-gray-800';
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="text-gray-600">Cargando solicitudes...</div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">
                    Solicitudes de Permisos e Incapacidades
                </h2>
                <div className="flex gap-2">
                    {['Pendiente', 'Aprobada', 'Rechazada', ''].map(estado => (
                        <Button
                            key={estado}
                            variant={filtroEstado === estado ? 'continental' : 'outline'}
                            size="sm"
                            onClick={() => setFiltroEstado(estado)}
                        >
                            {estado || 'Todas'}
                        </Button>
                    ))}
                </div>
            </div>

            {solicitudes.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                    No hay solicitudes {filtroEstado ? `en estado: ${filtroEstado}` : ''}
                </div>
            ) : (
                <div className="bg-white border rounded-lg overflow-hidden">
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Nomina</th>
                                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Empleado</th>
                                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Tipo</th>
                                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Periodo</th>
                                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Solicitado por</th>
                                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Estado</th>
                                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {solicitudes.map((solicitud) => (
                                <tr key={solicitud.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 text-sm">{solicitud.nominaEmpleado}</td>
                                    <td className="px-4 py-3 text-sm font-medium">{solicitud.nombreEmpleado}</td>
                                    <td className="px-4 py-3 text-sm">
                                        <span className="font-mono bg-gray-100 px-2 py-1 rounded">
                                            {solicitud.claveVisualizacion}
                                        </span>
                                        <div className="text-xs text-gray-600 mt-1">
                                            {solicitud.descripcionPermiso}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-sm">
                                        <div>{format(new Date(solicitud.fechaInicio + 'T00:00:00'), 'dd/MM/yyyy')}</div>
                                        <div className="text-xs text-gray-600">
                                            al {format(new Date(solicitud.fechaFin + 'T00:00:00'), 'dd/MM/yyyy')}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-sm">
                                        <div>{solicitud.delegadoNombre}</div>
                                        <div className="text-xs text-gray-600">
                                            {format(new Date(solicitud.fechaSolicitud), "dd/MM/yyyy HH:mm", { locale: es })}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getEstadoBadge(solicitud.estado)}`}>
                                            {solicitud.estado === 'Pendiente' && <Clock className="w-3 h-3" />}
                                            {solicitud.estado === 'Aprobada' && <CheckCircle className="w-3 h-3" />}
                                            {solicitud.estado === 'Rechazada' && <XCircle className="w-3 h-3" />}
                                            {solicitud.estado}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        {solicitud.estado === 'Pendiente' && (
                                            <div className="flex gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="border-green-600 text-green-600 hover:bg-green-50"
                                                    onClick={() => handleAprobar(solicitud.id)}
                                                    disabled={processingId === solicitud.id}
                                                >
                                                    <CheckCircle className="w-3 h-3 mr-1" />
                                                    Aprobar
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="border-red-600 text-red-600 hover:bg-red-50"
                                                    onClick={() => handleRechazar(solicitud.id)}
                                                    disabled={processingId === solicitud.id}
                                                >
                                                    <XCircle className="w-3 h-3 mr-1" />
                                                    Rechazar
                                                </Button>
                                            </div>
                                        )}
                                        {solicitud.estado !== 'Pendiente' && (
                                            <Button size="sm" variant="ghost">
                                                <Eye className="w-3 h-3" />
                                            </Button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};