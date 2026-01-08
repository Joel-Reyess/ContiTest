/**
 * =============================================================================
 * SOLICITUD DETALLE PAGE
 * =============================================================================
 * 
 * @description
 * Página completa para mostrar el detalle de una solicitud específica.
 * Maneja la carga de datos desde la URL, gestiona el estado de loading
 * y renderiza tanto el detalle de la solicitud como un calendario contextual.
 * 
 * @inputs (Datos de endpoints)
 * - id: string - ID de la solicitud obtenido desde parámetros de URL
 * - solicitud: Solicitud | null - Datos completos de la solicitud desde contexto
 *   - Incluye toda la información necesaria para mostrar detalles
 * 
 * @used_in (Componentes padre)
 * - src/components/Dashboard-Area/AreaDashboard.tsx (como ruta)
 * 
 * @user_roles (Usuarios que acceden)
 * - Jefe de Área
 * 
 * @dependencies
 * - react-router-dom: Hooks de routing (useParams, useNavigate)
 * - React: Framework base y hooks (useEffect, useState)
 * - ./SolicitudDetalle: Componente de detalle de solicitud
 * - ./CalendarWidget: Widget de calendario contextual
 * 
 * @author Vulcanics Dev Team
 * @created 2024
 * @last_modified 2025-08-20
 * =============================================================================
 */

import { useParams, useNavigate } from 'react-router-dom'
import { useEffect, useState, useMemo } from 'react'
import { ArrowLeft, Calendar, User as UserIcon, MapPin, Clock, CheckCircle, XCircle } from 'lucide-react'
import { Button } from '../ui/button'
import CalendarWidget from './CalendarWidget'
import { solicitudesService } from '../../services/solicitudesService'
import { useAuth } from '@/hooks/useAuth'
import { areasService } from '@/services/areasService'
import type { Solicitud } from '../../interfaces/Solicitudes.interface'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

type AreaOption = { id: string; name: string; grupos?: any[]; jefeFullName?: string };

export default function SolicitudDetallePage() {
    const { id } = useParams()                // id que llega en la URL
    const navigate = useNavigate()
    const { user } = useAuth()
    const [solicitud, setSolicitud] = useState<Solicitud | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [processingAction, setProcessingAction] = useState(false)
    const [selectedAreaId, setSelectedAreaId] = useState<string>('') // para calendario por Área
    const [areaOptions, setAreaOptions] = useState<AreaOption[]>([])

    // Opciones de Área base desde el usuario o desde la solicitud
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
            list.push({
                id: slug,
                name: solicitud.areaEmpleado,
                grupos: [], // sin grupos conocidos
            })
        }

        const unique = Array.from(new Map(list.map((a) => [a.id, a])).values())
        setAreaOptions(unique)
    }, [user, solicitud?.areaEmpleado])

    // Si no hay grupos (por permisos/401), intentar cargarlos desde getAreas
    useEffect(() => {
        const loadAreaGroups = async () => {
            if (!solicitud?.areaEmpleado) return
            const hasGroups = areaOptions.some(a => Array.isArray(a.grupos) && a.grupos.length > 0)
            if (hasGroups) return

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
                if (!selectedAreaId && mapped.length > 0) {
                    setSelectedAreaId(mapped[0].id)
                }
            } catch (err) {
                console.error('No se pudieron obtener grupos del Area para calendario', err)
            }
        }

        loadAreaGroups()
    }, [areaOptions, solicitud?.areaEmpleado, selectedAreaId])

    useEffect(() => {
        const loadSolicitud = async () => {
            if (!id) return

            setLoading(true)
            setError(null)
            try {
                const solicitudId = parseInt(id, 10)
                if (isNaN(solicitudId)) {
                    throw new Error('ID de solicitud inválido')
                }

                const data = await solicitudesService.getSolicitudById(solicitudId)
                setSolicitud(data)

            } catch (error) {
                console.error('Error loading solicitud:', error)
                setError(error instanceof Error ? error.message : 'Error desconocido')
            } finally {
                setLoading(false)
            }
        }

        loadSolicitud()
    }, [id])

    // Seleccionar Área por nombre de la solicitud o primera disponible
    useEffect(() => {
        if (!solicitud || areaOptions.length === 0) return
        const target = solicitud.areaEmpleado?.toLowerCase?.().trim()
        const match = areaOptions.find(a => a.name?.toLowerCase?.().trim() === target)
        if (match) {
            setSelectedAreaId(match.id)
            return
        }
        if (!selectedAreaId) {
            setSelectedAreaId(areaOptions[0].id)
        }
    }, [solicitud, areaOptions, selectedAreaId])

    const handleAprobar = async () => {
        if (!solicitud) return

        setProcessingAction(true)
        try {
            await solicitudesService.aprobarSolicitud(solicitud.id)
            toast.success('Solicitud aprobada correctamente')
            navigate(-1)
        } catch (error) {
            console.error('Error al aprobar solicitud:', error)
            toast.error('Error al aprobar la solicitud')
        } finally {
            setProcessingAction(false)
        }
    }

    const handleRechazar = async (motivo: string) => {
        if (!solicitud) return

        setProcessingAction(true)
        try {
            await solicitudesService.rechazarSolicitud(solicitud.id, motivo)
            toast.success('Solicitud rechazada correctamente')
            navigate(-1)
        } catch (error) {
            console.error('Error al rechazar solicitud:', error)
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

    if (error) {
        return (
            <div className="p-6 bg-gray-50 min-h-screen">
                <div className="max-w-7xl mx-auto">
                    <div className="flex items-center justify-center h-64">
                        <div className="text-red-600">Error: {error}</div>
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

    // Función helper para formatear porcentaje de manera segura
    const formatPorcentaje = (valor: number | undefined | null): string => {
        if (valor === undefined || valor === null || isNaN(valor)) {
            return 'N/A'
        }
        return `${valor.toFixed(1)}%`
    }

    return (
        <div className="p-6 bg-gray-50 min-h-screen">
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header con botón de regreso */}
                <div className="flex items-center gap-4">
                    <Button
                        variant="outline"
                        onClick={() => navigate(-1)}
                        className="flex items-center gap-2"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Volver
                    </Button>
                    <h1 className="text-2xl font-bold text-gray-900">
                        Detalle de Solicitud #{solicitud.id}
                    </h1>
                </div>

                {/* Información de la solicitud */}
                <div className="bg-white rounded-lg shadow-sm border p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {/* Información del empleado */}
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

                        {/* Detalles de la solicitud */}
                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                                <Calendar className="w-5 h-5" />
                                Detalles de la Solicitud
                            </h3>
                            <div className="space-y-2">
                                <div>
                                    <span className="text-sm text-gray-500">Fecha Original:</span>
                                    <p className="font-medium">
                                        {solicitud.fechaOriginal && solicitud.fechaOriginal !== '0001-01-01'
                                            ? format(new Date(solicitud.fechaOriginal + 'T00:00:00'), "d 'de' MMMM, yyyy", { locale: es })
                                            : 'No especificada'
                                        }
                                    </p>
                                </div>
                                <div>
                                    <span className="text-sm text-gray-500">Fecha Nueva:</span>
                                    <p className="font-medium">
                                        {solicitud.fechaNueva 
                                            ? format(new Date(solicitud.fechaNueva + 'T00:00:00'), "d 'de' MMMM, yyyy", { locale: es })
                                            : 'No especificada'
                                        }
                                    </p>
                                </div>
                                <div>
                                    <span className="text-sm text-gray-500">Motivo:</span>
                                    <p className="font-medium">{solicitud.motivo || 'Sin motivo especificado'}</p>
                                </div>
                                <div>
                                    <span className="text-sm text-gray-500">Porcentaje Calculado:</span>
                                    <p className="font-medium">{formatPorcentaje(solicitud.porcentajeCalculado)}</p>
                                </div>
                            </div>
                        </div>

                        {/* Estado y fechas */}
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
                                            : 'No especificada'
                                        }
                                    </p>
                                </div>
                                {solicitud.fechaAprobacion && (
                                    <div>
                                        <span className="text-sm text-gray-500">Fecha de Aprobación:</span>
                                        <p className="font-medium">
                                            {format(new Date(solicitud.fechaAprobacion), "d 'de' MMMM, yyyy 'a las' HH:mm", { locale: es })}
                                        </p>
                                    </div>
                                )}
                                <div>
                                    <span className="text-sm text-gray-500">Solicitado por:</span>
                                    <p className="font-medium">{solicitud.solicitadoPor || 'Sistema'}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Botones de acción */}
                    {solicitud.estadoSolicitud === 'Pendiente' && solicitud.puedeAprobar && (
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
                                onClick={() => {
                                    const motivo = prompt('Ingrese el motivo del rechazo:')
                                    if (motivo) handleRechazar(motivo)
                                }}
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

                {/* Calendario de Área (mensual/semanal/diario) para evaluar factibilidad */}
                {areaOptions.length > 0 ? (
                    <div className="bg-white rounded-lg shadow-sm border p-6">
                        <h2 className="text-xl font-semibold text-gray-900 mb-4">
                            Calendario del Área
                        </h2>
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
                        <p className="text-sm text-gray-600">
                            No se pudieron cargar las Áreas para mostrar el calendario.
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}