import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { X, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { permisosService, type PermisoIncapacidad } from '@/services/permisosService'

interface Props {
    show: boolean
    onClose: () => void
    nomina: number
    nombreEmpleado: string
    onPermisoExtendido?: () => void
}

export const ExtenderIncapacidadModal = ({
    show, onClose, nomina, nombreEmpleado, onPermisoExtendido,
}: Props) => {
    const [permisos, setPermisos] = useState<PermisoIncapacidad[]>([])
    const [loadingData, setLoadingData] = useState(false)
    const [loadingSubmit, setLoadingSubmit] = useState(false)
    const [permisoId, setPermisoId] = useState<number | null>(null)
    const [nuevaFechaHasta, setNuevaFechaHasta] = useState('')
    const [observaciones, setObservaciones] = useState('')

    useEffect(() => {
        if (!show || !nomina) return
        let cancel = false
        setLoadingData(true)
        permisosService.consultarPermisos({ nomina })
            .then(resp => {
                if (cancel) return
                const list = [...resp.permisos].sort((a, b) => b.hasta.localeCompare(a.hasta))
                setPermisos(list)
                if (!list.length) toast.info('El empleado no tiene permisos/incapacidades registrados.')
            })
            .catch((e: any) => toast.error(e?.message || 'Error al cargar permisos'))
            .finally(() => { if (!cancel) setLoadingData(false) })
        return () => { cancel = true }
    }, [show, nomina])

    const seleccionado = permisoId ? permisos.find(p => p.id === permisoId) : null

    const fechaMinima = seleccionado
        ? format(addDays(parseISO(seleccionado.hasta), 1), 'yyyy-MM-dd')
        : ''

    const limpiar = () => {
        setPermisoId(null)
        setNuevaFechaHasta('')
        setObservaciones('')
    }

    const handleClose = () => {
        limpiar()
        onClose()
    }

    const handleSubmit = async () => {
        if (!seleccionado || !nuevaFechaHasta) {
            toast.error('Selecciona un permiso/incapacidad y la nueva fecha Hasta.')
            return
        }
        if (nuevaFechaHasta <= seleccionado.hasta) {
            toast.error('La nueva fecha Hasta debe ser posterior a la actual.')
            return
        }

        setLoadingSubmit(true)
        try {
            const r = await permisosService.extenderPermiso({
                permisoId: seleccionado.id,
                nuevaFechaHasta,
                observaciones: observaciones.trim() || undefined,
            })
            toast.success(`Permiso extendido: ${r.hastaAnterior} → ${r.hastaNuevo}`)
            onPermisoExtendido?.()
            handleClose()
        } catch (e: any) {
            toast.error(e?.message || 'Error al extender permiso')
        } finally {
            setLoadingSubmit(false)
        }
    }

    if (!show) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="fixed inset-0 -z-10" onClick={handleClose} />
            <div className="relative z-50 w-full max-w-lg p-4">
                <div className="bg-white rounded-lg shadow-lg">
                    <div className="p-6">
                        <div className="flex items-start justify-between mb-3">
                            <div>
                                <h2 className="text-lg font-semibold flex items-center gap-2">
                                    <Calendar className="h-5 w-5 text-continental-yellow" />
                                    Extender incapacidad / permiso
                                </h2>
                                {nombreEmpleado && (
                                    <p className="text-xs text-gray-700 mt-1">
                                        Empleado: <span className="font-semibold">{nombreEmpleado}</span>
                                        {nomina ? <span className="ml-1 text-gray-400">(Nómina {nomina})</span> : null}
                                    </p>
                                )}
                            </div>
                            <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 cursor-pointer" aria-label="Cerrar">
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <p className="text-sm text-gray-600 mb-4">
                            Selecciona el permiso/incapacidad y proporciona la nueva fecha Hasta.
                            Las nomenclaturas se reflejarán en el rol semanal en los días extendidos.
                        </p>

                        {loadingData ? (
                            <div className="py-8 text-center text-gray-500 text-sm">Cargando…</div>
                        ) : (
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Permiso / incapacidad existente
                                    </label>
                                    <select
                                        value={permisoId ?? ''}
                                        onChange={e => setPermisoId(e.target.value ? Number(e.target.value) : null)}
                                        disabled={permisos.length === 0}
                                        className="w-full border border-gray-300 rounded px-2 py-2 text-sm"
                                    >
                                        <option value="">— Selecciona —</option>
                                        {permisos.map(p => (
                                            <option key={p.id} value={p.id}>
                                                {format(parseISO(p.desde), 'dd/MM/yy')} → {format(parseISO(p.hasta), 'dd/MM/yy')}
                                                {p.claseAbsentismo ? ` · ${p.claseAbsentismo}` : ''}
                                                {p.claveVisualizacion ? ` (${p.claveVisualizacion})` : ''}
                                            </option>
                                        ))}
                                    </select>
                                    {seleccionado && (
                                        <p className="text-xs text-gray-500 mt-1">
                                            Hasta actual: <span className="font-medium">
                                                {format(parseISO(seleccionado.hasta), 'EEEE dd/MM/yyyy', { locale: es })}
                                            </span>
                                            {' · '}
                                            {seleccionado.dias} día{seleccionado.dias !== 1 ? 's' : ''} hábil{seleccionado.dias !== 1 ? 'es' : ''}
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Nueva fecha Hasta
                                    </label>
                                    <input
                                        type="date"
                                        value={nuevaFechaHasta}
                                        onChange={e => setNuevaFechaHasta(e.target.value)}
                                        min={fechaMinima || undefined}
                                        className="w-full border border-gray-300 rounded px-2 py-2 text-sm"
                                        disabled={!seleccionado}
                                    />
                                    {!seleccionado && (
                                        <p className="text-xs text-gray-400 mt-1">
                                            Selecciona primero el permiso para habilitar la fecha.
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Observaciones (opcional)
                                    </label>
                                    <textarea
                                        value={observaciones}
                                        onChange={e => setObservaciones(e.target.value)}
                                        rows={3}
                                        maxLength={500}
                                        placeholder="Motivo de la extensión…"
                                        className="w-full border border-gray-300 rounded px-2 py-2 text-sm resize-none"
                                    />
                                    <p className="text-xs text-gray-400 mt-1 text-right">
                                        {observaciones.length}/500
                                    </p>
                                </div>
                            </div>
                        )}

                        <div className="flex justify-end gap-2 mt-6">
                            <Button variant="ghost" onClick={handleClose} disabled={loadingSubmit}>
                                Cancelar
                            </Button>
                            <Button
                                variant="continental"
                                onClick={handleSubmit}
                                disabled={loadingSubmit || loadingData || !seleccionado || !nuevaFechaHasta}
                            >
                                {loadingSubmit ? 'Extendiendo…' : 'Extender'}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

function addDays(d: Date, n: number) {
    const r = new Date(d)
    r.setDate(r.getDate() + n)
    return r
}
