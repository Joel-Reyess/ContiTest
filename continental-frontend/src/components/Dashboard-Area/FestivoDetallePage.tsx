import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useState, useRef } from 'react'
import { ArrowLeft, Calendar, User as UserIcon, MapPin, Clock, CheckCircle, XCircle } from 'lucide-react'
import { Button } from '../ui/button'
import CalendarWidget from './CalendarWidget'
import { festivosTrabajadosService, type SolicitudFestivoTrabajado } from '../../services/festivosTrabajadosService'
import { useAuth } from '@/hooks/useAuth'
import { areasService } from '@/services/areasService'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import RejectModal from './RejectModal'
import ApproveModal from './ApproveModal'

type AreaOption = { id: string; name: string; grupos?: any[]; jefeFullName?: string }

export default function FestivoDetallePage() {
    const { id } = useParams()
    const navigate = useNavigate()
    const { user } = useAuth()
    const [solicitud, setSolicitud] = useState<SolicitudFestivoTrabajado | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [processingAction, setProcessingAction] = useState(false)
    const [selectedAreaId, setSelectedAreaId] = useState<string>('')
    const [areaOptions, setAreaOptions] = useState<AreaOption[]>([])
    const [selectedSolicitudForReject, setSelectedSolicitudForReject] = useState<SolicitudFestivoTrabajado | null>(null)
    const [selectedSolicitudForApprove, setSelectedSolicitudForApprove] = useState<SolicitudFestivoTrabajado | null>(null)
    const [showRejectModal, setShowRejectModal] = useState(false)
    const [showApproveModal, setShowApproveModal] = useState(false)

    const location = useLocation()
    const savedFilters = (location.state as any)?.filters
    const returnTab = (location.state as any)?.returnTab

    useEffect(() => {
        const list: AreaOption[] = []
        const areasFromUser = (user as any)?.areas || []
        areasFromUser.forEach((a: any) => {
            if (a?.areaId) {
                list.push({
                    id: String(a.areaId),
                    name: a.nombreGeneral || a.areaNombre || `Area ${a.areaId}`,
                    grupos: a.grupos,
                    jefeFullName: (a as any)?.jefe?.fullName
                })
            }
        })
        if (user?.area?.areaId) {
            list.push({
                id: String(user.area.areaId),
                name: user.area.nombreGeneral || `Area ${user.area.areaId}`,
                grupos: (user.area as any)?.grupos,
                jefeFullName: (user.area as any)?.jefe?.fullName
            })
        }
        if (list.length === 0 && solicitud?.areaEmpleado) {
            const slug = solicitud.areaEmpleado.toLowerCase().replace(/\s+/g, '_')
            list.push({ id: slug, name: solicitud.areaEmpleado, grupos: [] })
        }
        const unique = Array.from(new Map(list.map((a) => [a.id, a])).values())
        setAreaOptions(unique)
    }, [user, solicitud?.areaEmpleado])

    const areaGroupsLoadedRef = useRef(false)
    useEffect(() => {
        const loadAreaGroups = async () => {
            if (areaGroupsLoadedRef.current) return
            if (!solicitud?.areaEmpleado) return
            const hasGroups = areaOptions.some(a => Array.isArray(a.grupos) && a.grupos.length > 0)
            if (hasGroups) return
            areaGroupsLoadedRef.current = true
            try {
                const all = await areasService.getAreas()
                const targetName = solicitud.areaEmpleado.toLowerCase().trim()
                const matches = all.filter((a: any) =>
                    (a.nombreGeneral || a.areaNombre || '').toLowerCase().trim() === targetName
                )
                if (matches.length === 0) return
                const mapped = matches.map((a: any) => ({
                    id: String(a.areaId),
                    name: a.nombreGeneral || a.areaNombre || `Area ${a.areaId}`,
                    grupos: a.grupos || [],
                    jefeFullName: (a as any)?.jefe?.fullName
                }))
                setAreaOptions(mapped)
                if (!selectedAreaId && mapped.length > 0) setSelectedAreaId(mapped[0].id)
            } catch (err) {
                console.error('No se pudieron obtener grupos del Area para calendario', err)
            }
        }
        loadAreaGroups()
    }, [areaOptions, solicitud?.areaEmpleado, selectedAreaId])

    const loadedRef = useRef(false)
    useEffect(() => {
        if (loadedRef.current) return
        loadedRef.current = true
        const loadSolicitud = async () => {
            if (!id) return
            setLoading(true)
            setError(null)
            try {
                const solicitudId = parseInt(id, 10)
                if (isNaN(solicitudId)) throw new Error('ID de solicitud inv�lido')
                const data = await festivosTrabajadosService.getSolicitudById(solicitudId)
                setSolicitud(data)
            } catch (error) {
                console.error('Error loading solicitud festivo:', error)
                setError(error instanceof Error ? error.message : 'Error desconocido')
            } finally {
                setLoading(false)
            }
        }
        loadSolicitud()
    }, [id])

    useEffect(() => {
        if (!solicitud || areaOptions.length === 0) return
        const target = solicitud.areaEmpleado?.toLowerCase?.().trim()
        const match = areaOptions.find(a => a.name?.toLowerCase?.().trim() === target)
        if (match) { setSelectedAreaId(match.id); return }
        if (!selectedAreaId) setSelectedAreaId(areaOptions[0].id)
    }, [solicitud, areaOptions, selectedAreaId])

    const handleApproveConfirm = async () => {
        if (!selectedSolicitudForApprove) return
        setProcessingAction(true)
        try {
            await festivosTrabajadosService.aprobarSolicitud({
                solicitudId: selectedSolicitudForApprove.id,
                aprobada: true
            })
            toast.success('Solicitud aprobada correctamente')
            navigate('/area/solicitudes', {
                state: { filters: savedFilters, refetch: true, activeTab: returnTab ?? 'festivos' }
            })
        } catch (error) {
            toast.error('Error al aprobar la solicitud')
        } finally {
            setProcessingAction(false)
            setShowApproveModal(false)
            setSelectedSolicitudForApprove(null)
        }
    }

    const handleRejectConfirm = async (motivo: string) => {
        if (!selectedSolicitudForReject) return
        setProcessingAction(true)
        try {
            await festivosTrabajadosService.aprobarSolicitud({
                solicitudId: selectedSolicitudForReject.id,
                aprobada: false,
                motivoRechazo: motivo
            })
            toast.success('Solicitud rechazada correctamente')
            navigate('/area/solicitudes', {
                state: { filters: savedFilters, refetch: true, activeTab: returnTab ?? 'festivos' }
            })
        } catch (error) {
            toast.error('Error al rechazar la solicitud')
        } finally {
            setProcessingAction(false)
            setShowRejectModal(false)
            setSelectedSolicitudForReject(null)
        }
    }

    if (loading) return (
        <div className="p-6 bg-gray-50 min-h-screen">
            <div className="max-w-7xl mx-auto">
                <div className="flex items-center justify-center h-64">
                    <div className="text-gray-600">Cargando solicitud...</div>
                </div>
            </div>
        </div>
    )

    if (error) return (
        <div className="p-6 bg-gray-50 min-h-screen">
            <div className="max-w-7xl mx-auto">
                <div className="flex items-center justify-center h-64">
                    <div className="text-red-600">Error: {error}</div>
                </div>
            </div>
        </div>
    )

    if (!solicitud) return (
        <div className="p-6 bg-gray-50 min-h-screen">
            <div className="max-w-7xl mx-auto">
                <div className="flex items-center justify-center h-64">
                    <div className="text-gray-600">Solicitud no encontrada</div>
                </div>
            </div>
        </div>
    )

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
                    <Button
                        variant="outline"
                        onClick={() => navigate('/area/solicitudes', {
                            state: {
                                filters: savedFilters, refetch: true,
                                activeTab: returnTab ?? 'festivos'
                            }
                        })}
                        className="flex items-center gap-2"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Volver
                    </Button>
                    <h1 className="text-2xl font-bold text-gray-900">
                        Detalle de Festivo Trabajado #{solicitud.id}
                    </h1>
                </div>

                <div className="bg-white rounded-lg shadow-sm border p-6">
                    {solicitud.estadoSolicitud === 'Pendiente' && (
                        <div className="mb-6 pb-6 border-b flex gap-4">
                            <Button
                                onClick={() => { setSelectedSolicitudForApprove(solicitud); setShowApproveModal(true) }}
                                disabled={processingAction}
                                className="bg-green-600 hover:bg-green-700 text-white"
                            >
                                <CheckCircle className="w-4 h-4 mr-2" />
                                Aprobar Solicitud
                            </Button>
                            <Button
                                onClick={() => { setSelectedSolicitudForReject(solicitud); setShowRejectModal(true) }}
                                disabled={processingAction}
                                variant="outline"
                                className="border-red-600 text-red-600 hover:bg-red-50"
                            >
                                <XCircle className="w-4 h-4 mr-2" />
                                Rechazar Solicitud
                            </Button>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                                <UserIcon className="w-5 h-5" />
                                Informaci�n del Empleado
                            </h3>
                            <div className="space-y-2">
                                <div>
                                    <span className="text-sm text-gray-500">Nombre:</span>
                                    <p className="font-medium">{solicitud.nombreEmpleado || 'No especificado'}</p>
                                </div>
                                <div>
                                    <span className="text-sm text-gray-500">N�mina:</span>
                                    <p className="font-medium">{solicitud.nominaEmpleado || 'No especificado'}</p>
                                </div>
                                <div>
                                    <span className="text-sm text-gray-500">�rea:</span>
                                    <p className="font-medium">{solicitud.areaEmpleado || 'No especificado'}</p>
                                </div>
                                <div>
                                    <span className="text-sm text-gray-500">Grupo:</span>
                                    <p className="font-medium">{solicitud.grupoEmpleado || 'No especificado'}</p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                                <Calendar className="w-5 h-5" />
                                Detalles de la Solicitud
                            </h3>
                            <div className="space-y-2">
                                <div>
                                    <span className="text-sm text-gray-500">Festivo Trabajado:</span>
                                    <p className="font-medium">
                                        {solicitud.festivoOriginal
                                            ? format(new Date(solicitud.festivoOriginal + 'T00:00:00'), "d 'de' MMMM, yyyy", { locale: es })
                                            : 'No especificado'}
                                    </p>
                                </div>
                                <div>
                                    <span className="text-sm text-gray-500">Fecha de Descanso Solicitada:</span>
                                    <p className="font-medium">
                                        {solicitud.fechaNueva
                                            ? format(new Date(solicitud.fechaNueva + 'T00:00:00'), "d 'de' MMMM, yyyy", { locale: es })
                                            : 'No especificada'}
                                    </p>
                                </div>
                                <div>
                                    <span className="text-sm text-gray-500">Motivo:</span>
                                    <p className="font-medium">{solicitud.motivo || 'Sin motivo especificado'}</p>
                                </div>
                                <div>
                                    <span className="text-sm text-gray-500">% Turno:</span>
                                    <p className="font-medium">
                                        {solicitud.porcentajeCalculado != null && !isNaN(solicitud.porcentajeCalculado)
                                            ? `${solicitud.porcentajeCalculado.toFixed(1)}%`
                                            : 'N/A'}
                                    </p>
                                </div>
                                <div>
                                    <span className="text-sm text-gray-500">% D�a:</span>
                                    <p className="font-medium">
                                        {solicitud.porcentajeDelDia != null && !isNaN(solicitud.porcentajeDelDia)
                                            ? `${solicitud.porcentajeDelDia.toFixed(1)}%`
                                            : 'N/A'}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                                <MapPin className="w-5 h-5" />
                                Estado y Fechas
                            </h3>
                            <div className="space-y-2">
                                <div>
                                    <span className="text-sm text-gray-500">Estado:</span>
                                    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium mt-1 ${getStatusColor(solicitud.estadoSolicitud)}`}>
                                        {getStatusIcon(solicitud.estadoSolicitud)}
                                        {solicitud.estadoSolicitud || 'Pendiente'}
                                    </div>
                                </div>
                                <div>
                                    <span className="text-sm text-gray-500">Fecha de Solicitud:</span>
                                    <p className="font-medium">
                                        {solicitud.fechaSolicitud
                                            ? format(new Date(solicitud.fechaSolicitud), "d 'de' MMMM, yyyy 'a las' HH:mm", { locale: es })
                                            : 'No especificada'}
                                    </p>
                                </div>
                                {solicitud.fechaAprobacion && (
                                    <div>
                                        <span className="text-sm text-gray-500">Fecha de Resoluci�n:</span>
                                        <p className="font-medium">
                                            {format(new Date(solicitud.fechaAprobacion), "d 'de' MMMM, yyyy 'a las' HH:mm", { locale: es })}
                                        </p>
                                    </div>
                                )}
                                {solicitud.aprobadoPor && (
                                    <div>
                                        <span className="text-sm text-gray-500">Resuelto por:</span>
                                        <p className="font-medium">{solicitud.aprobadoPor}</p>
                                    </div>
                                )}
                                <div>
                                    <span className="text-sm text-gray-500">Solicitado por:</span>
                                    <p className="font-medium">{(solicitud as any).solicitadoPor || 'No especificado'}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {areaOptions.length > 0 ? (
                    <div className="bg-white rounded-lg shadow-sm border p-6">
                        <h2 className="text-xl font-semibold text-gray-900 mb-4">Calendario del �rea</h2>
                        <CalendarWidget
                            showTabs
                            showHeader
                            showSidebar
                            defaultView="calendar"
                            areas={areaOptions}
                            selectedArea={selectedAreaId || areaOptions[0].id}
                            onAreaChange={setSelectedAreaId}
                            currentAreaGroups={areaOptions.find(a => a.id === (selectedAreaId || areaOptions[0].id))?.grupos || []}
                            bossName={areaOptions.find(a => a.id === (selectedAreaId || areaOptions[0].id))?.jefeFullName}
                        />
                    </div>
                ) : (
                    <div className="bg-white rounded-lg shadow-sm border p-6">
                        <p className="text-sm text-gray-600">No se pudieron cargar las �reas para mostrar el calendario.</p>
                    </div>
                )}
            </div>

            {selectedSolicitudForReject && (
                <RejectModal
                    show={showRejectModal}
                    onClose={() => { setShowRejectModal(false); setSelectedSolicitudForReject(null) }}
                    onConfirm={handleRejectConfirm}
                    solicitudId={selectedSolicitudForReject.id.toString()}
                    nombreEmpleado={selectedSolicitudForReject.nombreEmpleado}
                />
            )}

            {selectedSolicitudForApprove && (
                <ApproveModal
                    show={showApproveModal}
                    onClose={() => { setShowApproveModal(false); setSelectedSolicitudForApprove(null) }}
                    onConfirm={handleApproveConfirm}
                    solicitudId={selectedSolicitudForApprove.id.toString()}
                    nombreEmpleado={selectedSolicitudForApprove.nombreEmpleado}
                    tipoSolicitud="Festivo Trabajado"
                    fechaActual={selectedSolicitudForApprove.festivoOriginal}
                    fechaReprogramacion={selectedSolicitudForApprove.fechaNueva}
                />
            )}
        </div>
    )
}