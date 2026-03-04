import { useEffect, useState, useCallback, useRef } from 'react'
import { Search } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { DataTable, type Column } from '../ui/data-table'
import RejectModal from './RejectModal'
import ApproveModal from './ApproveModal'
import { useSolicitudes } from '../../hooks/useSolicitudes'
import { type Solicitud, type SolicitudFilters } from '../../interfaces/Solicitudes.interface'
import { useAuth } from '../../hooks/useAuth'
import { userService } from '../../services/userService'
import { type User } from '@/interfaces/User.interface'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function TablaSolicitudes() {
    const { user } = useAuth()
    const {
        solicitudes,
        loading,
        error,
        totalSolicitudes,
        pendientes,
        aprobadas,
        rechazadas,
        fetchSolicitudes,
        aprobarSolicitud,
        rechazarSolicitud
    } = useSolicitudes()

    // Estados para datos del usuario y filtros por área
    const [userData, setUserData] = useState<User | null>(null)
    const [loadingUserData, setLoadingUserData] = useState(false)
    const [selectedAreaId, setSelectedAreaId] = useState<number | null>(null)
    const [estadoFilter, setEstadoFilter] = useState<string>('Todas')
    const [selectedSolicitudForReject, setSelectedSolicitudForReject] = useState<Solicitud | null>(null)
    const [showApproveModal, setShowApproveModal] = useState(false)
    const [selectedSolicitudForApprove, setSelectedSolicitudForApprove] = useState<Solicitud | null>(null)
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
    const [sortedSolicitudes, setSortedSolicitudes] = useState<Solicitud[]>([])

    const [showRejectModal, setShowRejectModal] = useState(false)
    const [query, setQuery] = useState('')
    
    // Ref para evitar llamadas duplicadas
    const lastFetchedFiltersRef = useRef<string>('')

    const location = useLocation()
    const filtersRestoredRef = useRef(false)

    /// Función para obtener datos del usuario
    const fetchUserData = useCallback(async () => {
        if (!user?.id) {
            setLoadingUserData(false)
            return
        }

        setLoadingUserData(true)

        try {
            const userDetail = await userService.getUserById(user.id)
            console.log('User data for solicitudes:', userDetail)
            setUserData(userDetail)

            // Solo establecer área por defecto si NO hay filtros guardados
            const savedFilters = (location.state as any)?.filters
            if (!savedFilters?.selectedAreaId) {
                if (userDetail?.areas && userDetail.areas.length > 0) {
                    const firstArea = userDetail.areas[0]
                    setSelectedAreaId(firstArea.areaId)
                }
            }
        } catch (error) {
            console.error('Error fetching user data:', error)
        } finally {
            setLoadingUserData(false)
        }
    }, [user?.id, location.state])

    // Cargar datos del usuario después de restaurar filtros
    useEffect(() => {
        if (filtersRestoredRef.current && !userData) {
            fetchUserData()
        }
    }, [filtersRestoredRef.current, userData, fetchUserData])

    // Efecto para aplicar filtros
    useEffect(() => {
        // Solo hacer fetch si tenemos un área seleccionada
        if (!selectedAreaId) {
            return
        }

        const filters: SolicitudFilters = {
            areaId: selectedAreaId
        }

        if (estadoFilter !== 'Todas') {
            filters.estado = estadoFilter
        }

        // Crear clave única para los filtros
        const filtersKey = JSON.stringify(filters)
        
        // Evitar llamadas duplicadas
        if (lastFetchedFiltersRef.current === filtersKey) {
            console.log('TablaSolicitudes: Skipping duplicate fetch for filters:', filters)
            return
        }

        lastFetchedFiltersRef.current = filtersKey
        console.log('TablaSolicitudes: Fetching with filters:', filters)
        fetchSolicitudes(filters)
    }, [selectedAreaId, estadoFilter, fetchSolicitudes])

    // Efecto para restaurar filtros PRIMERO (antes de cualquier fetch)
    useEffect(() => {
        if (filtersRestoredRef.current) return

        const savedFilters = (location.state as any)?.filters

        if (savedFilters) {
            // Restaurar todos los filtros de forma síncrona
            if (savedFilters.selectedAreaId) setSelectedAreaId(savedFilters.selectedAreaId)
            if (savedFilters.estadoFilter) setEstadoFilter(savedFilters.estadoFilter)
            if (savedFilters.query) setQuery(savedFilters.query)
            if (savedFilters.sortDirection) setSortDirection(savedFilters.sortDirection)

            filtersRestoredRef.current = true

            // Marcar que se han restaurado los filtros para evitar fetch automático
            lastFetchedFiltersRef.current = 'RESTORING'
        }
    }, [location.state])

    // Al inicio del componente, después de los estados
    const abortControllerRef = useRef<AbortController | null>(null)

    useEffect(() => {
        if (lastFetchedFiltersRef.current === 'RESTORING' || loadingUserData || !userData) {
            return
        }

        if (!selectedAreaId) {
            return
        }

        const filters: SolicitudFilters = {
            areaId: selectedAreaId
        }

        if (estadoFilter && estadoFilter !== 'Todas' && estadoFilter !== '') {
            filters.estado = estadoFilter
        }

        const filtersKey = JSON.stringify(filters)

        if (lastFetchedFiltersRef.current === filtersKey) {
            return
        }

        lastFetchedFiltersRef.current = filtersKey
        fetchSolicitudes(filters)

    }, [selectedAreaId, estadoFilter, fetchSolicitudes, loadingUserData, userData])

    // Efecto para mantener solicitudes ordenadas
    useEffect(() => {
        if (solicitudes.length > 0) {
            const sorted = [...solicitudes].sort((a, b) => {
                const dateA = new Date(a.fechaSolicitud).getTime()
                const dateB = new Date(b.fechaSolicitud).getTime()
                return sortDirection === 'desc' ? dateB - dateA : dateA - dateB
            })
            setSortedSolicitudes(sorted)
        }
    }, [solicitudes, sortDirection])

    // Limpiar el estado de navegación después de restaurar
    // Efecto para restaurar filtros PRIMERO (antes de cualquier fetch)
    useEffect(() => {
        if (filtersRestoredRef.current) return

        const savedFilters = (location.state as any)?.filters

        if (savedFilters) {
            // Restaurar todos los filtros de forma síncrona
            if (savedFilters.selectedAreaId) setSelectedAreaId(savedFilters.selectedAreaId)
            if (savedFilters.estadoFilter) setEstadoFilter(savedFilters.estadoFilter)
            if (savedFilters.query) setQuery(savedFilters.query)
            if (savedFilters.sortDirection) setSortDirection(savedFilters.sortDirection)

            filtersRestoredRef.current = true

            // Marcar que se han restaurado los filtros para evitar fetch automático
            lastFetchedFiltersRef.current = 'RESTORING'

            // Resetear después de un pequeño delay
            setTimeout(() => {
                if (lastFetchedFiltersRef.current === 'RESTORING') {
                    lastFetchedFiltersRef.current = ''
                }
            }, 100)
        } else {
            // Si no hay filtros guardados, marcar como restaurado para permitir fetch normal
            filtersRestoredRef.current = true
                fetchUserData()
        }
    }, [location.state])

    const columns: Column<Solicitud>[] = [
        {
            key: 'nominaEmpleado',
            label: 'No Nomina',
            sortable: true,
            render: (value) => (
                <div className="text-gray-900 font-extrabold text-lg">{String(value)}</div>
            )
        },
        {
            key: 'nombreEmpleado',
            label: 'Nombre',
            sortable: true,
            render: (value) => (
                <div className="uppercase text-gray-900 text-sm leading-4 whitespace-pre-line">
                    {String(value)}
                </div>
            )
        },
        {
            key: 'areaEmpleado',
            label: 'Área',
            sortable: true,
            render: (value) => (
                <div className="text-gray-900 text-sm">{String(value)}</div>
            )
        },
        {
            key: 'grupoEmpleado',
            label: 'Grupo',
            sortable: true,
            className: 'w-[100px]',
            render: (value) => (
                <div className="text-gray-900 text-xs font-medium px-1">{String(value)}</div>
            )
        },
        {
            key: 'fechaSolicitud',
            label: 'Fecha Solicitud',
            sortable: true,
            render: (value) => {
                const dateStr = new Date(String(value)).toLocaleDateString()
                const timeStr = new Date(String(value)).toLocaleTimeString()
                return (
                    <div className="text-sm text-gray-900">
                        {dateStr}
                        <div className="text-xs text-gray-600">{timeStr}</div>
                    </div>
                )
            }
        },
        {
            key: 'fechaOriginal',
            label: 'Fecha Original',
            sortable: true,
            render: (value) => (
                <div className="text-sm text-gray-900">
                    {new Date(String(value) + 'T00:00:00').toLocaleDateString()}
                </div>
            )
        },
        {
            key: 'fechaNueva',
            label: 'Fecha Nueva',
            sortable: true,
            render: (value) => (
                <div className="text-sm text-gray-900">
                    {new Date(String(value) + 'T00:00:00').toLocaleDateString()}
                </div>
            )
        },
        {
            key: 'estadoSolicitud',
            label: 'Estado',
            sortable: true,
            render: (value) => {
                const estado = String(value)
               const colorClass =
                    estado === 'Pendiente'
                        ? 'bg-yellow-100 text-yellow-800'
                        : estado === 'Aprobada' || estado === 'Manual' // ✅ incluir manual
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800';

                return (
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${colorClass}`}>
                        {estado}
                    </span>
                )
            }
        },
        {
            key: 'porcentajeCalculado',
            label: '% Turno',
            sortable: true,
            className: 'w-[90px]',
            render: (value, row) => {
                const pct = Number(value)
                const colorClass = pct > 4.5
                    ? 'text-red-600 font-bold'
                    : pct > 3
                        ? 'text-yellow-600 font-semibold'
                        : 'text-gray-900 font-semibold'
                return (
                    <div className={`text-xs text-center px-1 ${colorClass}`}>
                        {pct.toFixed(1)}%
                        <div className="text-gray-400 font-normal text-xs">del turno</div>
                    </div>
                )
            }
        },
        {
            key: 'porcentajeDelDia',
            label: '% Día',
            sortable: true,
            className: 'w-[90px]',
            render: (value) => {
                const pct = Number(value ?? 0)
                const colorClass = pct > 4.5
                    ? 'text-red-600 font-bold'
                    : pct > 3
                        ? 'text-yellow-600 font-semibold'
                        : 'text-gray-900 font-semibold'
                return (
                    <div className={`text-xs text-center px-1 ${colorClass}`}>
                        {pct > 0 ? `${pct.toFixed(1)}%` : '—'}
                        <div className="text-gray-400 font-normal text-xs">del día</div>
                    </div>
                )
            }
        },
        {
            key: 'acciones',
            label: 'Acciones',
            sortable: false,
            className: 'w-[130px] pr-2',
            render: (_, row) => (
                <div className="flex flex-col gap-2">
                    <Link
                        to={`/area/solicitudes/${row.id}`}
                        state={{
                            filters: {
                                selectedAreaId,
                                estadoFilter,
                                query,
                                sortDirection
                            }
                        }}
                        className="inline-flex h-7 w-full items-center justify-center
                        rounded-lg bg-[var(--color-continental-yellow,#FDB41C)]
                    px-3 text-sm font-semibold text-black hover:opacity-90
                        "
                    >
                        Ver solicitud
                    </Link>
                </div>
            ),
        }
    ]

    const handleSort = (columnKey: string) => {
        if (columnKey === 'fechaSolicitud') {
            const newDirection = sortDirection === 'desc' ? 'asc' : 'desc'
            setSortDirection(newDirection)

            const sorted = [...sortedSolicitudes].sort((a, b) => {
                const dateA = new Date(a.fechaSolicitud).getTime()
                const dateB = new Date(b.fechaSolicitud).getTime()

                return newDirection === 'desc' ? dateB - dateA : dateA - dateB
            })

            setSortedSolicitudes(sorted)
        }
    }

    const handleAprobar = (id: number) => {
        const solicitud = solicitudes.find(s => s.id === id)
        if (solicitud) {
            setSelectedSolicitudForApprove(solicitud)
            setShowApproveModal(true)
        }
    }

    const handleRechazar = (id: number) => {
        const solicitud = solicitudes.find(s => s.id === id)
        if (solicitud) {
            setSelectedSolicitudForReject(solicitud)
            setShowRejectModal(true)
        }
    }

    const handleRejectConfirm = async (motivo: string) => {
        if (selectedSolicitudForReject) {
            try {
                await rechazarSolicitud(selectedSolicitudForReject.id, motivo)
                console.log(`Solicitud ${selectedSolicitudForReject.id} rechazada exitosamente con motivo: ${motivo}`)
            } catch (error) {
                console.error('Error al rechazar solicitud:', error)
            }
        }
        setShowRejectModal(false)
        setSelectedSolicitudForReject(null)
    }

    const handleRejectCancel = () => {
        setShowRejectModal(false)
        setSelectedSolicitudForReject(null)
    }

    const handleApproveConfirm = async () => {
        if (selectedSolicitudForApprove) {
            try {
                await aprobarSolicitud(selectedSolicitudForApprove.id)
                console.log(`Solicitud ${selectedSolicitudForApprove.id} aprobada exitosamente`)
            } catch (error) {
                console.error('Error al aprobar solicitud:', error)
            }
        }
        setShowApproveModal(false)
        setSelectedSolicitudForApprove(null)
    }

    const handleApproveCancel = () => {
        setShowApproveModal(false)
        setSelectedSolicitudForApprove(null)
    }

    return (
        <>
            <section className="rounded-lg border-2 border-gray-300 bg-white">
                <div className="px-4 pt-3 pb-2">
                    <h2 className="text-base font-semibold text-gray-900">Solicitudes de Reprogramaciones</h2>
                </div>

                <div className="px-4 pt-4">
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="relative">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Busca por nombre o nómina..."
                                className="pl-9 pr-3 py-2 rounded-md border border-gray-300 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-gray-200"
                            />
                        </div>

                        {/* Selector de Área */}
                        {userData && userData.areas && userData.areas.length > 0 && (
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-700">Área</span>
                                <Select 
                                    value={selectedAreaId?.toString() || ""} 
                                    onValueChange={(value) => setSelectedAreaId(parseInt(value))}
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

                        <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-700">Estado</span>
                            <select
                                value={estadoFilter}
                                onChange={(e) => setEstadoFilter(e.target.value as any)}
                                className="text-sm border border-gray-300 rounded-md px-2 py-1.5"
                            >
                                <option value="">Todas</option>
                                <option value="Pendiente">Pendiente</option>
                                <option value="Aprobada">Aprobada</option>
                                <option value="Rechazada">Rechazada</option>
                            </select>
                        </div>

                        {/* Mostrar estadísticas */}
                        <div className="flex items-center gap-4 text-sm text-gray-600">
                            <span>Total: {totalSolicitudes}</span>
                            <span>Pendientes: {pendientes}</span>
                            <span>Aprobadas: {aprobadas}</span>
                            <span>Rechazadas: {rechazadas}</span>
                        </div>
                    </div>
                </div>

                <div className="mt-3">
                    {loading || loadingUserData ? (
                        <div className="p-8 text-center">
                            <div className="text-gray-600">Cargando solicitudes...</div>
                        </div>
                    ) : error ? (
                        <div className="p-8 text-center">
                            <div className="text-red-600">Error: {error}</div>
                        </div>
                    ) : (
                        <DataTable<Solicitud>
                            columns={columns}
                            data={sortedSolicitudes}
                            keyField="id"
                            emptyMessage="No hay solicitudes disponibles"
                            onSort={handleSort}
                            className="border-t border-gray-200"
                        />
                    )}
                </div>
            </section>

            {selectedSolicitudForReject && (
                <RejectModal
                    show={showRejectModal}
                    onClose={handleRejectCancel}
                    onConfirm={handleRejectConfirm}
                    solicitudId={selectedSolicitudForReject.id.toString()}
                    nombreEmpleado={selectedSolicitudForReject.nombreEmpleado}
                />
            )}

            {selectedSolicitudForApprove && (
                <ApproveModal
                    show={showApproveModal}
                    onClose={handleApproveCancel}
                    onConfirm={handleApproveConfirm}
                    solicitudId={selectedSolicitudForApprove.id.toString()}
                    nombreEmpleado={selectedSolicitudForApprove.nombreEmpleado}
                    tipoSolicitud={"Reprogramación"}
                    fechaActual={selectedSolicitudForApprove.fechaOriginal}
                    fechaReprogramacion={selectedSolicitudForApprove.fechaNueva}
                />
            )}
        </>
    )
}