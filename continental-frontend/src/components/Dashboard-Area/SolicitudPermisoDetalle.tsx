import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { ArrowLeft, CheckCircle, XCircle, Clock } from 'lucide-react'
import { Button } from '../ui/button'
import { solicitudesPermisosService, type SolicitudPermisoDto } from '@/services/solicitudesPermisosService'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export default function SolicitudPermisoDetalle() {
    const { id } = useParams()
    const navigate = useNavigate()
    const location = useLocation()
    const savedFilters = (location.state as any)?.filters
    const returnTab = (location.state as any)?.returnTab ?? 'permisos'
    const goBack = () => navigate('/area/solicitudes', {
        state: { filters: savedFilters, refetch: true, activeTab: returnTab }
    })
    const [solicitud, setSolicitud] = useState<SolicitudPermisoDto | null>(null)
    const [loading, setLoading] = useState(true)
    const [processingAction, setProcessingAction] = useState(false)

    useEffect(() => {
        const loadSolicitud = async () => {
            if (!id) return
            setLoading(true)
            try {
                // ✅ Usar nuevo método que consulta directamente por ID
                const solicitudData = await solicitudesPermisosService.obtenerSolicitudPorId(parseInt(id, 10))
                setSolicitud(solicitudData)
            } catch (error) {
                console.error('Error cargando solicitud:', error)
                toast.error('Error al cargar la solicitud')
            } finally {
                setLoading(false)
            }
        }
        loadSolicitud()
    }, [id])

    const handleAprobar = async () => {
        if (!solicitud) return
        setProcessingAction(true)
        try {
            await solicitudesPermisosService.responderSolicitud({
                solicitudId: solicitud.id,
                aprobar: true
            })
            toast.success('Solicitud aprobada correctamente')
            goBack()
        } catch (error) {
            console.error('Error al aprobar:', error)
            toast.error('Error al aprobar la solicitud')
        } finally {
            setProcessingAction(false)
        }
    }

    const handleRechazar = async () => {
        if (!solicitud) return
        const motivo = prompt('Ingrese el motivo del rechazo:')
        if (!motivo) return

        setProcessingAction(true)
        try {
            await solicitudesPermisosService.responderSolicitud({
                solicitudId: solicitud.id,
                aprobar: false,
                motivoRechazo: motivo
            })
            toast.success('Solicitud rechazada correctamente')
            goBack()
        } catch (error) {
            console.error('Error al rechazar:', error)
            toast.error('Error al rechazar la solicitud')
        } finally {
            setProcessingAction(false)
        }
    }

    if (loading) {
        return (
            <div className="p-6 bg-gray-50 min-h-screen">
                <div className="max-w-7xl mx-auto">
                    <div className="flex items-center justify-center h-64">
                        <div className="text-gray-600">Cargando solicitud...</div>
                    </div>
                </div>
            </div>
        )
    }

    if (!solicitud) {
        return (
            <div className="p-6 bg-gray-50 min-h-screen">
                <div className="max-w-7xl mx-auto">
                    <div className="flex items-center justify-center h-64">
                        <div className="text-gray-600">Solicitud no encontrada</div>
                    </div>
                </div>
            </div>
        )
    }

    const getStatusColor = (estado: string) => {
        switch (estado) {
            case 'Aprobada': return 'text-green-600 bg-green-50'
            case 'Rechazada': return 'text-red-600 bg-red-50'
            case 'Pendiente': return 'text-yellow-600 bg-yellow-50'
            default: return 'text-gray-600 bg-gray-50'
        }
    }

    const getStatusIcon = (estado: string) => {
        switch (estado) {
            case 'Aprobada': return <CheckCircle className="w-5 h-5" />
            case 'Rechazada': return <XCircle className="w-5 h-5" />
            default: return <Clock className="w-5 h-5" />
        }
    }

    return (
        <div className="p-6 bg-gray-50 min-h-screen">
            <div className="max-w-7xl mx-auto space-y-6">
                <div className="flex items-center gap-4">
                    <Button variant="outline" onClick={goBack} className="flex items-center gap-2">
                        <ArrowLeft className="w-4 h-4" />
                        Volver
                    </Button>
                    <h1 className="text-2xl font-bold text-gray-900">
                        Detalle de Solicitud de Permiso #{solicitud.id}
                    </h1>
                </div>

                <div className="bg-white rounded-lg shadow-sm border p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold text-gray-900">Información del Empleado</h3>
                            <div className="space-y-2">
                                <div>
                                    <span className="text-sm text-gray-500">Nombre:</span>
                                    <p className="font-medium">{solicitud.nombreEmpleado}</p>
                                </div>
                                <div>
                                    <span className="text-sm text-gray-500">Nómina:</span>
                                    <p className="font-medium">{solicitud.nominaEmpleado}</p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold text-gray-900">Detalles del Permiso</h3>
                            <div className="space-y-2">
                                <div>
                                    <span className="text-sm text-gray-500">Tipo:</span>
                                    <p className="font-medium">
                                        <span className="font-mono bg-gray-100 px-2 py-1 rounded mr-2">
                                            {solicitud.claveVisualizacion}
                                        </span>
                                        {solicitud.descripcionPermiso}
                                    </p>
                                </div>
                                <div>
                                    <span className="text-sm text-gray-500">Fecha Inicio:</span>
                                    <p className="font-medium">
                                        {format(new Date(solicitud.fechaInicio + 'T00:00:00'), "d 'de' MMMM, yyyy", { locale: es })}
                                    </p>
                                </div>
                                <div>
                                    <span className="text-sm text-gray-500">Fecha Fin:</span>
                                    <p className="font-medium">
                                        {format(new Date(solicitud.fechaFin + 'T00:00:00'), "d 'de' MMMM, yyyy", { locale: es })}
                                    </p>
                                </div>
                                {solicitud.observaciones && (
                                    <div>
                                        <span className="text-sm text-gray-500">Observaciones:</span>
                                        <p className="font-medium">{solicitud.observaciones}</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold text-gray-900">Estado y Fechas</h3>
                            <div className="space-y-2">
                                <div>
                                    <span className="text-sm text-gray-500">Estado:</span>
                                    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium mt-1 ${getStatusColor(solicitud.estado)}`}>
                                        {getStatusIcon(solicitud.estado)}
                                        {solicitud.estado}
                                    </div>
                                </div>
                                <div>
                                    <span className="text-sm text-gray-500">Fecha de Solicitud:</span>
                                    <p className="font-medium">
                                        {format(new Date(solicitud.fechaSolicitud), "d 'de' MMMM, yyyy 'a las' HH:mm", { locale: es })}
                                    </p>
                                </div>
                                {solicitud.fechaRespuesta && (
                                    <div>
                                        <span className="text-sm text-gray-500">Fecha de Respuesta:</span>
                                        <p className="font-medium">
                                            {format(new Date(solicitud.fechaRespuesta), "d 'de' MMMM, yyyy 'a las' HH:mm", { locale: es })}
                                        </p>
                                    </div>
                                )}
                                <div>
                                    <span className="text-sm text-gray-500">Solicitado por:</span>
                                    <p className="font-medium">{solicitud.delegadoNombre}</p>
                                </div>
                                {solicitud.motivoRechazo && (
                                    <div>
                                        <span className="text-sm text-gray-500">Motivo de Rechazo:</span>
                                        <p className="font-medium text-red-600">{solicitud.motivoRechazo}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {solicitud.estado === 'Pendiente' && (
                        <div className="mt-6 pt-6 border-t flex gap-4">
                            <Button
                                onClick={handleAprobar}
                                disabled={processingAction}
                                className="bg-green-600 hover:bg-green-700 text-white"
                            >
                                <CheckCircle className="w-4 h-4 mr-2" />
                                {processingAction ? 'Aprobando...' : 'Aprobar Solicitud'}
                            </Button>
                            <Button
                                onClick={handleRechazar}
                                disabled={processingAction}
                                variant="outline"
                                className="border-red-600 text-red-600 hover:bg-red-50"
                            >
                                <XCircle className="w-4 h-4 mr-2" />
                                {processingAction ? 'Rechazando...' : 'Rechazar Solicitud'}
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}