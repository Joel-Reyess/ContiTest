import { useEffect, useState, useCallback, useRef } from 'react'
import { Search } from 'lucide-react'
import { Link } from 'react-router-dom'
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

    const [showRejectModal, setShowRejectModal] = useState(false)
    const [query, setQuery] = useState('')
    
    // Ref para evitar llamadas duplicadas
    const lastFetchedFiltersRef = useRef<string>('')

    // Función para obtener datos del usuario
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
            
            // Establecer área por defecto
            if (userDetail?.areas && userDetail.areas.length > 0) {
                const firstArea = userDetail.areas[0]
                setSelectedAreaId(firstArea.areaId)
            }
        } catch (error) {
            console.error('Error fetching user data:', error)
        } finally {
            setLoadingUserData(false)
        }
    }, [user?.id])

    // Efecto para cargar datos del usuario
    useEffect(() => {
        fetchUserData()
    }, [fetchUserData])

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
            label: 'Porcentaje',
            sortable: true,
            className: 'w-[80px]',
            render: (value) => (
                <div className="text-xs text-gray-900 font-semibold text-center px-1">
                    {Number(value).toFixed(1)}%
                </div>
            )
        },
        {
            key: 'acciones',
            label: 'Acciones',
            sortable: false,
            className: 'w-[100px] pr-2',
            render: (_, row) => (
                <div className="w-[130px]">
                    {/* Solo mostrar botones de aprobar/rechazar si la solicitud está pendiente */}
                    {row.estadoSolicitud === 'Pendiente' && (
                        <div className="flex items-center gap-2 mb-2">
                            <button
                                type="button"
                                onClick={() => handleAprobar(row.id)}
                                className="inline-flex h-7 max-w-[60px] items-center justify-center
                                    rounded-lg bg-emerald-500 px-3 text-xs font-semibold text-white
                                    shadow-sm hover:bg-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-300 cursor-pointer
                                "
                            >
                                Aprobar
                            </button>

                            <button
                                type="button"
                                onClick={() => handleRechazar(row.id)}
                                className="inline-flex h-7 max-w-[60px] items-center justify-center
                                    rounded-lg border border-rose-500 bg-white px-3 text-xs font-semibold text-rose-600
                                    hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-200 cursor-pointer
                                "
                            >
                                Rechazar
                            </button>
                        </div>
                    )}

                    <Link
                        to={`/area/solicitudes/${row.id}`}
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
        console.log('Ordenar por:', columnKey)
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
                            data={solicitudes}
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