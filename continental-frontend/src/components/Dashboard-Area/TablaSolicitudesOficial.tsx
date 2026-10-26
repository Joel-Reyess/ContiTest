import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { DataTable, type Column } from '../ui/data-table'
import { useAuth } from '../../hooks/useAuth'
import { userService } from '../../services/userService'
import { type User } from '@/interfaces/User.interface'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { clasePorcentaje } from '@/utils/semaforoPorcentaje'
import {
    SOLICITUDES_OFICIALES,
    completarPorcentajes,
    motivoDeError,
    type FilaSolicitudOficial,
    type TipoSolicitudOficial,
} from './solicitudesFormatoOficial'

const TODAS_LAS_AREAS = '__todas__'

/**
 * Lista de solicitudes con el formato "oficial" de Solicitudes de
 * Reprogramaciones (misma tabla, filtros y "Ver solicitud" con calendario).
 * Se usa para vacación laborada, post-incapacidad, día empresa y edición de
 * días empresa; cada tipo trae sus datos con su propio endpoint.
 */
export function TablaSolicitudesOficial({ tipo }: { tipo: TipoSolicitudOficial }) {
    const definicion = SOLICITUDES_OFICIALES[tipo]
    const { user } = useAuth()
    const location = useLocation()
    const estadoNavegacion = location.state as { activeTab?: string; filters?: Record<string, string> } | null
    const filtrosGuardados = estadoNavegacion?.activeTab === tipo ? estadoNavegacion?.filters : undefined

    const [filas, setFilas] = useState<FilaSolicitudOficial[]>([])
    const [loading, setLoading] = useState(true)
    const [calculando, setCalculando] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [userData, setUserData] = useState<User | null>(null)
    const [area, setArea] = useState<string>(filtrosGuardados?.area || TODAS_LAS_AREAS)
    const [estadoFilter, setEstadoFilter] = useState<string>(filtrosGuardados?.estadoFilter ?? '')
    const [query, setQuery] = useState(filtrosGuardados?.query || '')
    const [orden, setOrden] = useState<{ columna: string; dir: 'asc' | 'desc' }>({ columna: 'fechaSolicitud', dir: 'desc' })

    useEffect(() => {
        if (!user?.id) return
        userService
            .getUserById(user.id)
            .then(setUserData)
            .catch((e) => console.error('Error al obtener las áreas del usuario:', e))
    }, [user?.id])

    const cargar = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const datos = (await definicion.cargar()).sort(
                (a, b) => new Date(b.fechaSolicitud).getTime() - new Date(a.fechaSolicitud).getTime()
            )
            setFilas(datos)
            setLoading(false)
            setCalculando(true)
            setFilas(await completarPorcentajes(datos))
        } catch (e) {
            setError(motivoDeError(e, 'No se pudieron cargar las solicitudes'))
            setFilas([])
        } finally {
            setLoading(false)
            setCalculando(false)
        }
    }, [definicion])

    useEffect(() => {
        cargar()
    }, [cargar])

    const areas = useMemo(() => {
        const nombres = (userData?.areas ?? []).map((a) => a.nombreGeneral).filter(Boolean)
        // Áreas de las solicitudes que no estén en el usuario (jefes con áreas por grupo).
        filas.forEach((f) => f.areaEmpleado && !nombres.includes(f.areaEmpleado) && nombres.push(f.areaEmpleado))
        return Array.from(new Set(nombres)).sort((a, b) => a.localeCompare(b, 'es'))
    }, [userData, filas])

    const delArea = useMemo(
        () => (area === TODAS_LAS_AREAS ? filas : filas.filter((f) => f.areaEmpleado === area)),
        [filas, area]
    )

    const visibles = useMemo(() => {
        const q = query.toLowerCase()
        const lista = delArea.filter((f) => {
            if (estadoFilter && f.estadoSolicitud !== estadoFilter) return false
            if (!q) return true
            return f.nominaEmpleado.toLowerCase().includes(q) || f.nombreEmpleado.toLowerCase().includes(q)
        })
        const valor = (f: FilaSolicitudOficial): string | number => {
            const v = (f as unknown as Record<string, unknown>)[orden.columna]
            if (orden.columna.startsWith('fecha')) return v ? new Date(String(v)).getTime() : 0
            if (typeof v === 'number') return v
            return v == null ? '' : String(v).toLowerCase()
        }
        return [...lista].sort((a, b) => {
            const va = valor(a)
            const vb = valor(b)
            const r = va < vb ? -1 : va > vb ? 1 : 0
            return orden.dir === 'asc' ? r : -r
        })
    }, [delArea, estadoFilter, query, orden])

    const total = delArea.length
    const pendientes = delArea.filter((f) => f.estadoSolicitud === 'Pendiente').length
    const aprobadas = delArea.filter((f) => f.estadoSolicitud === 'Aprobada').length
    const rechazadas = delArea.filter((f) => f.estadoSolicitud === 'Rechazada').length

    const porcentaje = (value: unknown, sufijo: string, limite?: number | null) => {
        if (value == null) {
            return (
                <div className="text-xs text-center px-1 text-gray-400">
                    {calculando ? '…' : '—'}
                    <div className="text-gray-400 font-normal text-xs">{sufijo}</div>
                </div>
            )
        }
        const pct = Number(value)
        const colorClass = clasePorcentaje(pct, limite)
        return (
            <div className={`text-xs text-center px-1 ${colorClass}`}>
                {pct.toFixed(1)}%
                <div className="text-gray-400 font-normal text-xs">{sufijo}</div>
            </div>
        )
    }

    const columns: Column<FilaSolicitudOficial>[] = [
        {
            key: 'nominaEmpleado',
            label: 'No Nomina',
            sortable: true,
            render: (value) => <div className="text-gray-900 font-extrabold text-lg">{String(value || '—')}</div>,
        },
        {
            key: 'nombreEmpleado',
            label: 'Nombre',
            sortable: true,
            render: (value) => <div className="uppercase text-gray-900 text-sm leading-4 whitespace-pre-line">{String(value)}</div>,
        },
        {
            key: 'areaEmpleado',
            label: 'Área',
            sortable: true,
            render: (value) => <div className="text-gray-900 text-sm">{String(value || '—')}</div>,
        },
        {
            key: 'grupoEmpleado',
            label: 'Grupo',
            sortable: true,
            className: 'w-[100px]',
            render: (value) => <div className="text-gray-900 text-xs font-medium px-1">{String(value || '—')}</div>,
        },
        {
            key: 'fechaSolicitud',
            label: 'Fecha Solicitud',
            sortable: true,
            render: (value) => (
                <div className="text-sm text-gray-900">
                    {new Date(String(value)).toLocaleDateString()}
                    <div className="text-xs text-gray-600">{new Date(String(value)).toLocaleTimeString()}</div>
                </div>
            ),
        },
        {
            key: 'fechaOriginal',
            label: definicion.etiquetas?.fechaOriginal ?? 'Fecha Original',
            sortable: true,
            render: (value) => (
                <div className="text-sm text-gray-900">{new Date(String(value).slice(0, 10) + 'T00:00:00').toLocaleDateString()}</div>
            ),
        },
        {
            key: 'fechaNueva',
            label: definicion.etiquetas?.fechaNueva ?? 'Fecha Nueva',
            sortable: true,
            render: (value) => (
                <div className="text-sm text-gray-900">{new Date(String(value).slice(0, 10) + 'T00:00:00').toLocaleDateString()}</div>
            ),
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
                        : estado === 'Aprobada'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                return <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${colorClass}`}>{estado}</span>
            },
        },
        {
            key: 'porcentajeCalculado',
            label: '% Turno',
            sortable: true,
            className: 'w-[90px]',
            render: (value, row) => porcentaje(value, 'del turno', row.porcentajeMaximoPermitido),
        },
        {
            key: 'porcentajeDelDia',
            label: '% Día',
            sortable: true,
            className: 'w-[90px]',
            render: (value, row) => porcentaje(value, 'del día', row.porcentajeMaximoPermitido),
        },
        {
            key: 'acciones',
            label: 'Acciones',
            sortable: false,
            className: 'w-[130px] pr-2',
            render: (_, row) => (
                <div className="flex flex-col gap-2">
                    <Link
                        to={`/area/solicitudes/${tipo}/${row.id}`}
                        state={{
                            filters: { area, estadoFilter, query },
                            returnTab: tipo,
                            fila: row,
                        }}
                        className="inline-flex h-7 w-full items-center justify-center rounded-lg bg-[var(--color-continental-yellow,#FDB41C)] px-3 text-sm font-semibold text-black hover:opacity-90"
                    >
                        Ver solicitud
                    </Link>
                </div>
            ),
        },
    ]

    return (
        <section className="rounded-lg border-2 border-gray-300 bg-white">
            <div className="px-4 pt-3 pb-2">
                <h2 className="text-base font-semibold text-gray-900">{definicion.titulo}</h2>
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

                    {areas.length > 0 && (
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-700">Área</span>
                            <Select value={area} onValueChange={setArea}>
                                <SelectTrigger className="w-48">
                                    <SelectValue placeholder="Selecciona un área" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={TODAS_LAS_AREAS}>Todas mis áreas</SelectItem>
                                    {areas.map((a) => (
                                        <SelectItem key={a} value={a}>
                                            {a}
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
                            onChange={(e) => setEstadoFilter(e.target.value)}
                            className="text-sm border border-gray-300 rounded-md px-2 py-1.5"
                        >
                            <option value="">Todas</option>
                            <option value="Pendiente">Pendiente</option>
                            <option value="Aprobada">Aprobada</option>
                            <option value="Rechazada">Rechazada</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-4 text-sm text-gray-600">
                        <span>Total: {total}</span>
                        <span>Pendientes: {pendientes}</span>
                        <span>Aprobadas: {aprobadas}</span>
                        <span>Rechazadas: {rechazadas}</span>
                    </div>
                </div>
            </div>

            <div className="mt-3">
                {loading ? (
                    <div className="p-8 text-center">
                        <div className="text-gray-600">Cargando solicitudes...</div>
                    </div>
                ) : error ? (
                    <div className="p-8 text-center">
                        <div className="text-red-600">Error: {error}</div>
                    </div>
                ) : (
                    <DataTable<FilaSolicitudOficial>
                        columns={columns}
                        data={visibles}
                        keyField="id"
                        emptyMessage="No hay solicitudes disponibles"
                        onSort={(columna) =>
                            setOrden((o) => ({
                                columna,
                                dir: o.columna === columna && o.dir === 'desc' ? 'asc' : 'desc',
                            }))
                        }
                        className="border-t border-gray-200"
                    />
                )}
            </div>
        </section>
    )
}
