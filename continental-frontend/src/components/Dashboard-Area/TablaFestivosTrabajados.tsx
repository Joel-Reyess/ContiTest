import { useEffect, useState, useCallback, useRef } from 'react'
import { Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { DataTable, type Column } from '../ui/data-table'
import RejectModal from './RejectModal'
import ApproveModal from './ApproveModal'
import { festivosTrabajadosService, type SolicitudFestivoDto } from '../../services/festivosTrabajadosService'
import { useAuth } from '../../hooks/useAuth'
import { userService } from '../../services/userService'
import { type User } from '@/interfaces/User.interface'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'

export function TablaFestivosTrabajados() {
    const { user } = useAuth()
    const [solicitudes, setSolicitudes] = useState<SolicitudFestivoDto[]>([])
    const [loading, setLoading] = useState(true)
    const [userData, setUserData] = useState<User | null>(null)
    const [loadingUserData, setLoadingUserData] = useState(false)
    const [selectedAreaId, setSelectedAreaId] = useState<number | null>(null)
    const [estadoFilter, setEstadoFilter] = useState<string>('Pendiente')
    const [selectedSolicitudForReject, setSelectedSolicitudForReject] = useState<SolicitudFestivoDto | null>(null)
    const [showApproveModal, setShowApproveModal] = useState(false)
    const [selectedSolicitudForApprove, setSelectedSolicitudForApprove] = useState<SolicitudFestivoDto | null>(null)
    const [showRejectModal, setShowRejectModal] = useState(false)
    const [query, setQuery] = useState('')
    const lastFetchedFiltersRef = useRef<string>('')

    const fetchUserData = useCallback(async () => {
        if (!user?.id) {
            setLoadingUserData(false)
            return
        }
        setLoadingUserData(true)
        try {
            const userDetail = await userService.getUserById(user.id)
            setUserData(userDetail)
            if (userDetail?.areas && userDetail.areas.length > 0) {
                setSelectedAreaId(userDetail.areas[0].areaId)
            }
        } catch (error) {
            console.error('Error fetching user data:', error)
        } finally {
            setLoadingUserData(false)
        }
    }, [user?.id])

    const fetchSolicitudes = useCallback(async () => {
        if (!selectedAreaId) return

        const filtersKey = `${selectedAreaId}-${estadoFilter}`
        if (lastFetchedFiltersRef.current === filtersKey) return

        lastFetchedFiltersRef.current = filtersKey
        setLoading(true)

        try {
            const response = await festivosTrabajadosService.getSolicitudes({
                estado: estadoFilter === 'Todas' ? undefined : estadoFilter,
                areaId: selectedAreaId
            })
            setSolicitudes(response)
        } catch (error) {
            console.error('Error fetching solicitudes festivos:', error)
            toast.error('Error al cargar solicitudes de festivos trabajados')
        } finally {
            setLoading(false)
        }
    }, [selectedAreaId, estadoFilter])

    useEffect(() => {
        fetchUserData()
    }, [fetchUserData])

    useEffect(() => {
        fetchSolicitudes()
    }, [fetchSolicitudes])

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

    const handleApproveConfirm = async () => {
        if (!selectedSolicitudForApprove) return
        try {
            await festivosTrabajadosService.aprobarSolicitud({
                solicitudId: selectedSolicitudForApprove.id,
                aprobada: true
            })
            toast.success('Solicitud aprobada exitosamente')
            fetchSolicitudes()
        } catch (error) {
            toast.error('Error al aprobar solicitud')
        }
        setShowApproveModal(false)
        setSelectedSolicitudForApprove(null)
    }

    const handleRejectConfirm = async (motivo: string) => {
        if (!selectedSolicitudForReject) return
        try {
            await festivosTrabajadosService.aprobarSolicitud({
                solicitudId: selectedSolicitudForReject.id,
                aprobada: false,
                motivoRechazo: motivo
            })
            toast.success('Solicitud rechazada')
            fetchSolicitudes()
        } catch (error) {
            toast.error('Error al rechazar solicitud')
        }
        setShowRejectModal(false)
        setSelectedSolicitudForReject(null)
    }

    const columns: Column<SolicitudFestivoDto>[] = [
        {
            key: 'nominaEmpleado',
            label: 'Nómina',
            sortable: true,
            render: (value) => <div className="text-gray-900 font-extrabold text-lg">{String(value)}</div>
        },
        {
            key: 'nombreEmpleado',
            label: 'Nombre',
            sortable: true,
            render: (value) => <div className="uppercase text-gray-900 text-sm">{String(value)}</div>
        },
        {
            key: 'areaEmpleado',
            label: 'Área',
            sortable: true,
            render: (value) => <div className="text-gray-900 text-sm">{String(value)}</div>
        },
        {
            key: 'grupoEmpleado',
            label: 'Grupo',
            sortable: true,
            render: (value) => <div className="text-gray-900 text-xs font-medium">{String(value)}</div>
        },
        {
            key: 'fechaSolicitud',
            label: 'Fecha Solicitud',
            sortable: true,
            render: (value) => {
                const date = new Date(String(value))
                return (
                    <div className="text-sm text-gray-900">
                        {date.toLocaleDateString()}
                        <div className="text-xs text-gray-600">{date.toLocaleTimeString()}</div>
                    </div>
                )
            }
        },
        {
            key: 'festivoOriginal',
            label: 'Festivo Original',
            sortable: true,
            render: (value) => <div className="text-sm text-gray-900">{new Date(String(value) + 'T00:00:00').toLocaleDateString()}</div>
        },
        {
            key: 'fechaNueva',
            label: 'Fecha Nueva',
            sortable: true,
            render: (value) => <div className="text-sm text-gray-900">{new Date(String(value) + 'T00:00:00').toLocaleDateString()}</div>
        },
        {
            key: 'estadoSolicitud',
            label: 'Estado',
            sortable: true,
            render: (value) => {
                const estado = String(value)
                const colorClass = estado === 'Pendiente' ? 'bg-yellow-100 text-yellow-800' :
                    estado === 'Aprobada' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                return <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${colorClass}`}>{estado}</span>
            }
        },
        {
            key: 'porcentajeCalculado',
            label: 'Porcentaje',
            sortable: true,
            render: (value) => <div className="text-xs text-gray-900 font-semibold text-center">{Number(value).toFixed(1)}%</div>
        },
        {
            key: 'acciones',
            label: 'Acciones',
            sortable: false,
            render: (_, row) => (
                <div className="w-[130px]">
                    {row.estadoSolicitud === 'Pendiente' && (
                        <div className="flex items-center gap-2 mb-2">
                            <button
                                onClick={() => handleAprobar(row.id)}
                                className="inline-flex h-7 max-w-[60px] items-center justify-center rounded-lg bg-emerald-500 px-3 text-xs font-semibold text-white hover:bg-emerald-600 cursor-pointer"
                            >
                                Aprobar
                            </button>
                            <button
                                onClick={() => handleRechazar(row.id)}
                                className="inline-flex h-7 max-w-[60px] items-center justify-center rounded-lg border border-rose-500 bg-white px-3 text-xs font-semibold text-rose-600 hover:bg-rose-50 cursor-pointer"
                            >
                                Rechazar
                            </button>
                        </div>
                    )}
                </div>
            )
        }
    ]

    const totalSolicitudes = solicitudes.length
    const pendientes = solicitudes.filter(s => s.estadoSolicitud === 'Pendiente').length
    const aprobadas = solicitudes.filter(s => s.estadoSolicitud === 'Aprobada').length
    const rechazadas = solicitudes.filter(s => s.estadoSolicitud === 'Rechazada').length

    return (
        <>
            <section className="rounded-lg border-2 border-gray-300 bg-white">
                <div className="px-4 pt-3 pb-2">
                    <h2 className="text-base font-semibold text-gray-900">Solicitudes de Festivos Trabajados</h2>
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

                        {userData?.areas && userData.areas.length > 0 && (
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-700">Área</span>
                                <Select value={selectedAreaId?.toString() || ""} onValueChange={(value) => setSelectedAreaId(parseInt(value))}>
                                    <SelectTrigger className="w-48">
                                        <SelectValue placeholder="Selecciona un área" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {userData.areas.map((area) => (
                                            <SelectItem key={area.areaId} value={area.areaId.toString()}>{area.nombreGeneral}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-700">Estado</span>
                            <select
                                value={estadoFilter}
                                onChange={(e) => setEstadoFilter(e.target.value)}
                                className="text-sm border border-gray-300 rounded-md px-2 py-1.5"
                            >
                                <option value="Todas">Todas</option>
                                <option value="Pendiente">Pendiente</option>
                                <option value="Aprobada">Aprobada</option>
                                <option value="Rechazada">Rechazada</option>
                            </select>
                        </div>

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
                        <div className="p-8 text-center"><div className="text-gray-600">Cargando solicitudes...</div></div>
                    ) : (
                        <DataTable<SolicitudFestivoDto> columns={columns} data={solicitudes} keyField="id" emptyMessage="No hay solicitudes de festivos trabajados" onSort={() => { }} className="border-t border-gray-200" />
                    )}
                </div>
            </section>

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
        </>
    )
}