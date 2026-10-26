import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Calendar, CheckCircle, Clock, MapPin, User as UserIcon, XCircle } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { Button } from '../ui/button'
import CalendarWidget from './CalendarWidget'
import RejectModal from './RejectModal'
import ApproveModal from './ApproveModal'
import { useAuth } from '@/hooks/useAuth'
import { UserRole } from '@/interfaces/User.interface'
import { areasService } from '@/services/areasService'
import {
    SOLICITUDES_OFICIALES,
    completarPorcentajes,
    esTipoSolicitudOficial,
    motivoDeError,
    type FilaSolicitudOficial,
} from './solicitudesFormatoOficial'

type AreaOption = { id: string; name: string; grupos?: any[]; jefeFullName?: string }

/**
 * Detalle de una solicitud con el formato de "Ver solicitud" de
 * Reprogramaciones: datos del empleado, de la solicitud (con % turno y % día),
 * estado, Aprobar/Rechazar y el calendario del área para evaluar el día.
 * Ruta: /area/solicitudes/:tipo/:id (vacación laborada, post-incapacidad, día
 * empresa, edición de días empresa).
 */
export default function SolicitudOficialDetallePage() {
    const { tipo, id } = useParams()
    const navigate = useNavigate()
    const location = useLocation()
    const { user, hasRole } = useAuth()
    // Gerente BT / RH: solo lectura, sin aprobar/rechazar
    const soloLectura = hasRole(UserRole.GERENTE_BT) || hasRole(UserRole.RH)

    const estadoNavegacion = location.state as { filters?: unknown; fila?: FilaSolicitudOficial } | null
    const savedFilters = estadoNavegacion?.filters
    const definicion = esTipoSolicitudOficial(tipo) ? SOLICITUDES_OFICIALES[tipo] : null

    const [solicitud, setSolicitud] = useState<FilaSolicitudOficial | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [processingAction, setProcessingAction] = useState(false)
    const [showApproveModal, setShowApproveModal] = useState(false)
    const [showRejectModal, setShowRejectModal] = useState(false)
    const [selectedAreaId, setSelectedAreaId] = useState<string>('')
    const [areaOptions, setAreaOptions] = useState<AreaOption[]>([])

    const volver = (refetch = false) =>
        navigate('/area/solicitudes', { state: { filters: savedFilters, refetch, activeTab: tipo } })

    // La fila llega desde la lista; si se recargó la página se busca de nuevo.
    useEffect(() => {
        let cancelado = false
        const cargar = async () => {
            if (!definicion || !tipo) {
                setError('Tipo de solicitud no reconocido')
                setLoading(false)
                return
            }
            const solicitudId = Number(id)
            setLoading(true)
            try {
                let fila = estadoNavegacion?.fila
                if (!fila || fila.tipo !== tipo || fila.id !== solicitudId) {
                    fila = (await definicion.cargar()).find((f) => f.id === solicitudId)
                }
                if (!fila) {
                    if (!cancelado) setSolicitud(null)
                    return
                }
                if (fila.porcentajeCalculado == null || !fila.areaEmpleado) {
                    fila = (await completarPorcentajes([fila]))[0]
                }
                if (!cancelado) setSolicitud(fila)
            } catch (e) {
                if (!cancelado) setError(motivoDeError(e, 'No se pudo cargar la solicitud'))
            } finally {
                if (!cancelado) setLoading(false)
            }
        }
        cargar()
        return () => {
            cancelado = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tipo, id])

    // Áreas para el calendario: las mismas fuentes que el detalle de Reprogramaciones.
    useEffect(() => {
        const list: AreaOption[] = []
        const areasFromUser = (user as any)?.areas || []
        areasFromUser.forEach((a: any) => {
            if (a?.areaId) {
                list.push({
                    id: String(a.areaId),
                    name: a.nombreGeneral || a.areaNombre || `Area ${a.areaId}`,
                    grupos: a.grupos,
                    jefeFullName: a?.jefe?.fullName,
                })
            }
        })
        if (user?.area?.areaId) {
            list.push({
                id: String(user.area.areaId),
                name: user.area.nombreGeneral || `Area ${user.area.areaId}`,
                grupos: (user.area as any)?.grupos,
                jefeFullName: (user.area as any)?.jefe?.fullName,
            })
        }
        if (list.length === 0 && solicitud?.areaEmpleado) {
            list.push({ id: solicitud.areaEmpleado.toLowerCase().replace(/\s+/g, '_'), name: solicitud.areaEmpleado, grupos: [] })
        }
        setAreaOptions(Array.from(new Map(list.map((a) => [a.id, a])).values()))
    }, [user, solicitud?.areaEmpleado])

    const areaGroupsLoadedRef = useRef(false)
    useEffect(() => {
        const loadAreaGroups = async () => {
            if (areaGroupsLoadedRef.current || !solicitud?.areaEmpleado) return
            if (areaOptions.some((a) => Array.isArray(a.grupos) && a.grupos.length > 0)) return
            areaGroupsLoadedRef.current = true
            try {
                const all = await areasService.getAreas()
                const target = solicitud.areaEmpleado.toLowerCase().trim()
                const matches = all.filter((a: any) => (a.nombreGeneral || a.areaNombre || '').toLowerCase().trim() === target)
                if (matches.length === 0) return
                const mapped = matches.map((a: any) => ({
                    id: String(a.areaId),
                    name: a.nombreGeneral || a.areaNombre || `Area ${a.areaId}`,
                    grupos: a.grupos || [],
                    jefeFullName: a?.jefe?.fullName,
                }))
                setAreaOptions(mapped)
                if (!selectedAreaId && mapped.length > 0) setSelectedAreaId(mapped[0].id)
            } catch (err) {
                console.error('No se pudieron obtener grupos del Area para calendario', err)
            }
        }
        loadAreaGroups()
    }, [areaOptions, solicitud?.areaEmpleado, selectedAreaId])

    useEffect(() => {
        if (!solicitud || areaOptions.length === 0) return
        const target = solicitud.areaEmpleado?.toLowerCase().trim()
        const match = areaOptions.find((a) => a.name?.toLowerCase().trim() === target)
        if (match) {
            setSelectedAreaId(match.id)
            return
        }
        if (!selectedAreaId) setSelectedAreaId(areaOptions[0].id)
    }, [solicitud, areaOptions, selectedAreaId])

    const handleApproveConfirm = async () => {
        if (!solicitud || !definicion) return
        setProcessingAction(true)
        try {
            await definicion.aprobar(solicitud.id)
            toast.success(definicion.mensajeAprobada)
            volver(true)
        } catch (e) {
            toast.error(motivoDeError(e, 'Error al aprobar la solicitud'))
        } finally {
            setProcessingAction(false)
            setShowApproveModal(false)
        }
    }

    const handleRejectConfirm = async (motivo: string) => {
        if (!solicitud || !definicion) return
        setProcessingAction(true)
        try {
            await definicion.rechazar(solicitud.id, motivo)
            toast.success('Solicitud rechazada correctamente')
            volver(true)
        } catch (e) {
            toast.error(motivoDeError(e, 'Error al rechazar la solicitud'))
        } finally {
            setProcessingAction(false)
            setShowRejectModal(false)
        }
    }

    const contenedor = (contenido: ReactNode) => (
        <div className="p-6 bg-gray-50 min-h-screen">
            <div className="max-w-7xl mx-auto">
                <div className="flex items-center justify-center h-64">{contenido}</div>
            </div>
        </div>
    )

    if (loading) return contenedor(<div className="text-gray-600">Cargando solicitud...</div>)
    if (error) return contenedor(<div className="text-red-600">Error: {error}</div>)
    if (!solicitud || !definicion) return contenedor(<div className="text-gray-600">Solicitud no encontrada</div>)

    const getStatusColor = (estado: string) => {
        switch (estado) {
            case 'Aprobada':
                return 'text-green-600 bg-green-50'
            case 'Rechazada':
                return 'text-red-600 bg-red-50'
            case 'Pendiente':
                return 'text-yellow-600 bg-yellow-50'
            default:
                return 'text-gray-600 bg-gray-50'
        }
    }

    const getStatusIcon = (estado: string) => {
        switch (estado) {
            case 'Aprobada':
                return <CheckCircle className="w-5 h-5" />
            case 'Rechazada':
                return <XCircle className="w-5 h-5" />
            default:
                return <Clock className="w-5 h-5" />
        }
    }

    const formatPorcentaje = (valor: number | undefined | null) =>
        valor === undefined || valor === null || isNaN(valor) ? 'N/A' : `${valor.toFixed(1)}%`

    const fechaLarga = (iso?: string | null) =>
        iso ? format(new Date(iso.slice(0, 10) + 'T00:00:00'), "d 'de' MMMM, yyyy", { locale: es }) : 'No especificada'

    const fechaHora = (iso?: string | null) =>
        iso ? format(new Date(iso), "d 'de' MMMM, yyyy 'a las' HH:mm", { locale: es }) : 'No especificada'

    const areaCalendario = selectedAreaId || areaOptions[0]?.id
    const etiquetaOriginal = definicion.etiquetas?.fechaOriginal ?? 'Fecha Original'
    const etiquetaNueva = definicion.etiquetas?.fechaNueva ?? 'Fecha Nueva'
    const notaPorcentaje = definicion.fechaPorcentaje === 'original' ? ' (primer día)' : ''

    return (
        <div className="p-6 bg-gray-50 min-h-screen">
            <div className="max-w-7xl mx-auto space-y-6">
                <div className="flex items-center gap-4">
                    <Button variant="outline" onClick={() => volver(true)} className="flex items-center gap-2">
                        <ArrowLeft className="w-4 h-4" />
                        Volver
                    </Button>
                    <h1 className="text-2xl font-bold text-gray-900">
                        Detalle de Solicitud #{solicitud.id}
                        <span className="ml-2 text-base font-medium text-gray-500">{definicion.nombre}</span>
                    </h1>
                </div>

                <div className="bg-white rounded-lg shadow-sm border p-6">
                    {solicitud.estadoSolicitud === 'Pendiente' && !soloLectura && (
                        <div className="mt-6 pt-6 border-t flex gap-4">
                            <Button
                                onClick={() => setShowApproveModal(true)}
                                disabled={processingAction}
                                className="bg-green-600 hover:bg-green-700 text-white"
                            >
                                <CheckCircle className="w-4 h-4 mr-2" />
                                Aprobar Solicitud
                            </Button>
                            <Button
                                onClick={() => setShowRejectModal(true)}
                                disabled={processingAction}
                                variant="outline"
                                className="border-red-600 text-red-600 hover:bg-red-50"
                            >
                                <XCircle className="w-4 h-4 mr-2" />
                                Rechazar Solicitud
                            </Button>
                        </div>
                    )}
                    {solicitud.estadoSolicitud === 'Pendiente' && soloLectura && (
                        <div className="mt-6 pt-6 border-t">
                            <div className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded px-3 py-2">
                                Modo lectura: solo puede consultar la solicitud.
                            </div>
                        </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                                <UserIcon className="w-5 h-5" />
                                Información del Empleado
                            </h3>
                            <div className="space-y-2">
                                <div>
                                    <span className="text-sm text-gray-500">Nombre:</span>
                                    <p className="font-medium">{solicitud.nombreEmpleado || 'No especificado'}</p>
                                </div>
                                <div>
                                    <span className="text-sm text-gray-500">Nómina:</span>
                                    <p className="font-medium">{solicitud.nominaEmpleado || 'No especificado'}</p>
                                </div>
                                <div>
                                    <span className="text-sm text-gray-500">Área:</span>
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
                                    <span className="text-sm text-gray-500">{etiquetaOriginal}:</span>
                                    <p className="font-medium">{fechaLarga(solicitud.fechaOriginal)}</p>
                                </div>
                                <div>
                                    <span className="text-sm text-gray-500">{etiquetaNueva}:</span>
                                    <p className="font-medium">{fechaLarga(solicitud.fechaNueva)}</p>
                                </div>
                                {solicitud.detalles.map((d) => (
                                    <div key={d.etiqueta}>
                                        <span className="text-sm text-gray-500">{d.etiqueta}:</span>
                                        <p className="font-medium">{d.valor || '—'}</p>
                                    </div>
                                ))}
                                <div>
                                    <span className="text-sm text-gray-500">Motivo:</span>
                                    <p className="font-medium">{solicitud.motivo || 'Sin motivo especificado'}</p>
                                </div>
                                <div>
                                    <span className="text-sm text-gray-500">% Turno{notaPorcentaje}:</span>
                                    <p className="font-medium">{formatPorcentaje(solicitud.porcentajeCalculado)}</p>
                                </div>
                                <div>
                                    <span className="text-sm text-gray-500">% Día{notaPorcentaje}:</span>
                                    <p className="font-medium">{formatPorcentaje(solicitud.porcentajeDelDia)}</p>
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
                                    <div
                                        className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium mt-1 ${getStatusColor(solicitud.estadoSolicitud)}`}
                                    >
                                        {getStatusIcon(solicitud.estadoSolicitud)}
                                        {solicitud.estadoSolicitud || 'Pendiente'}
                                    </div>
                                </div>
                                <div>
                                    <span className="text-sm text-gray-500">Fecha de Solicitud:</span>
                                    <p className="font-medium">{fechaHora(solicitud.fechaSolicitud)}</p>
                                </div>
                                {solicitud.fechaRespuesta && (
                                    <div>
                                        <span className="text-sm text-gray-500">
                                            Fecha de {solicitud.estadoSolicitud === 'Rechazada' ? 'Rechazo' : 'Aprobación'}:
                                        </span>
                                        <p className="font-medium">{fechaHora(solicitud.fechaRespuesta)}</p>
                                    </div>
                                )}
                                {solicitud.respondidoPor && (
                                    <div>
                                        <span className="text-sm text-gray-500">Respondida por:</span>
                                        <p className="font-medium">{solicitud.respondidoPor}</p>
                                    </div>
                                )}
                                {solicitud.motivoRechazo && (
                                    <div>
                                        <span className="text-sm text-gray-500">Motivo de rechazo:</span>
                                        <p className="font-medium text-red-700">{solicitud.motivoRechazo}</p>
                                    </div>
                                )}
                                <div>
                                    <span className="text-sm text-gray-500">Solicitado por:</span>
                                    <p className="font-medium">{solicitud.solicitadoPor || 'No especificado'}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {areaOptions.length > 0 && areaCalendario ? (
                    <div className="bg-white rounded-lg shadow-sm border p-6">
                        <h2 className="text-xl font-semibold text-gray-900 mb-4">Calendario del Área</h2>
                        <CalendarWidget
                            showTabs
                            showHeader
                            showSidebar
                            defaultView="calendar"
                            areas={areaOptions}
                            selectedArea={areaCalendario}
                            onAreaChange={setSelectedAreaId}
                            currentAreaGroups={areaOptions.find((a) => a.id === areaCalendario)?.grupos || []}
                            bossName={areaOptions.find((a) => a.id === areaCalendario)?.jefeFullName}
                        />
                    </div>
                ) : (
                    <div className="bg-white rounded-lg shadow-sm border p-6">
                        <p className="text-sm text-gray-600">No se pudieron cargar las Áreas para mostrar el calendario.</p>
                    </div>
                )}
            </div>

            {showRejectModal && (
                <RejectModal
                    show={showRejectModal}
                    onClose={() => setShowRejectModal(false)}
                    onConfirm={handleRejectConfirm}
                    solicitudId={String(solicitud.id)}
                    nombreEmpleado={solicitud.nombreEmpleado}
                />
            )}
            {showApproveModal && (
                <ApproveModal
                    show={showApproveModal}
                    onClose={() => setShowApproveModal(false)}
                    onConfirm={handleApproveConfirm}
                    solicitudId={String(solicitud.id)}
                    nombreEmpleado={solicitud.nombreEmpleado}
                    tipoSolicitud={definicion.nombre}
                    fechaActual={fechaLarga(solicitud.fechaOriginal)}
                    fechaReprogramacion={fechaLarga(solicitud.fechaNueva)}
                    etiquetaFechaActual={definicion.etiquetas ? etiquetaOriginal : undefined}
                    etiquetaFechaNueva={definicion.etiquetas ? etiquetaNueva : undefined}
                />
            )}
        </div>
    )
}
