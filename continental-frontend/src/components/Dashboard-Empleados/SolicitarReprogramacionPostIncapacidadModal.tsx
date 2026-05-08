import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CalendarPlus2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import {
    reprogramacionPostIncapacidadService,
    type IncapacidadConsumida,
    type VacacionNoCanjeada,
} from '@/services/reprogramacionPostIncapacidadService'

interface Props {
    show: boolean
    onClose: () => void
    empleadoId?: number
    empleadoNombre?: string
    onSolicitudCreada?: () => void
}

export function SolicitarReprogramacionPostIncapacidadModal({
    show, onClose, empleadoId, empleadoNombre, onSolicitudCreada,
}: Props) {
    const [incapacidades, setIncapacidades] = useState<IncapacidadConsumida[]>([])
    const [vacaciones, setVacaciones] = useState<VacacionNoCanjeada[]>([])
    const [permisoId, setPermisoId] = useState<number | null>(null)
    const [vacacionId, setVacacionId] = useState<number | null>(null)
    const [fechaNueva, setFechaNueva] = useState('')
    const [motivo, setMotivo] = useState('')
    const [loadingData, setLoadingData] = useState(false)
    const [loadingSubmit, setLoadingSubmit] = useState(false)

    const incapacidadSel = permisoId ? incapacidades.find(i => i.id === permisoId) : null
    const vacacionSel = vacacionId ? vacaciones.find(v => v.id === vacacionId) : null

    // Fecha mínima permitida = día siguiente al "hasta" de la incapacidad
    const fechaMinima = incapacidadSel
        ? format(addDays(parseISO(incapacidadSel.hasta), 1), 'yyyy-MM-dd')
        : ''

    useEffect(() => {
        if (!show || !empleadoId) return
        let cancel = false
        setLoadingData(true)
        reprogramacionPostIncapacidadService.getIncapacidadesConsumidas(empleadoId)
            .then(incs => {
                if (cancel) return
                setIncapacidades(incs)
                if (!incs.length) toast.info('El empleado no tiene incapacidades/permisos consumidos.')
            })
            .catch((e: unknown) => {
                console.error(e)
                toast.error('Error al cargar datos del empleado')
            })
            .finally(() => { if (!cancel) setLoadingData(false) })

        return () => { cancel = true }
    }, [show, empleadoId])

    // Cuando se selecciona una incapacidad, cargar vacaciones cuya fecha cae
    // dentro de ese rango (días que el operador no gozó por estar incapacitado).
    useEffect(() => {
        if (!empleadoId || !permisoId) {
            setVacaciones([])
            setVacacionId(null)
            return
        }
        let cancel = false
        reprogramacionPostIncapacidadService.getVacacionesEnIncapacidad(empleadoId, permisoId)
            .then(vacs => {
                if (cancel) return
                // Defensa cliente: aún si el backend regresa otros tipos
                // (cache/legacy), mostramos sólo vacaciones seleccionadas (Anual).
                // Las asignadas por la empresa se reprograman desde SuperUsuario.
                const soloAnuales = (vacs || []).filter(v => v.tipoVacacion === 'Anual')
                if (vacs && vacs.length !== soloAnuales.length) {
                    console.warn('[ReprogPostIncapacidad] Backend regresó tipos no-Anual; filtrando en cliente:',
                        vacs.map(v => v.tipoVacacion))
                }
                setVacaciones(soloAnuales)
                setVacacionId(null)
                if (!soloAnuales.length) toast.info('No hay vacaciones seleccionadas (Anual) del empleado dentro del rango de esta incapacidad.')
            })
            .catch((e: unknown) => {
                console.error(e)
                if (!cancel) toast.error('Error al cargar vacaciones en rango de incapacidad')
            })
        return () => { cancel = true }
    }, [empleadoId, permisoId])

    const limpiar = () => {
        setPermisoId(null)
        setVacacionId(null)
        setFechaNueva('')
        setMotivo('')
    }

    const handleClose = () => {
        limpiar()
        onClose()
    }

    const handleSubmit = async () => {
        if (!empleadoId || !permisoId || !vacacionId || !fechaNueva) {
            toast.error('Completa incapacidad, vacación y fecha nueva.')
            return
        }
        if (!motivo.trim()) {
            toast.error('El motivo es obligatorio.')
            return
        }
        if (incapacidadSel && fechaNueva <= incapacidadSel.hasta) {
            toast.error('La fecha nueva debe ser posterior al fin de la incapacidad.')
            return
        }

        setLoadingSubmit(true)
        try {
            await reprogramacionPostIncapacidadService.solicitar({
                empleadoId,
                permisoIncapacidadId: permisoId,
                vacacionOriginalId: vacacionId,
                fechaNueva,
                motivo: motivo.trim(),
            })
            toast.success('Solicitud enviada. Pendiente de aprobación del jefe de área.')
            onSolicitudCreada?.()
            handleClose()
        } catch (e: any) {
            toast.error(e?.message || 'Error al enviar la solicitud')
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
                                    <CalendarPlus2 className="h-5 w-5 text-continental-yellow" />
                                    Reprogramación post-incapacidad
                                </h2>
                                {empleadoNombre && (
                                    <p className="text-xs text-gray-700 mt-1">
                                        Empleado: <span className="font-semibold">{empleadoNombre}</span>
                                    </p>
                                )}
                            </div>
                            <button
                                onClick={handleClose}
                                className="text-gray-400 hover:text-gray-600 cursor-pointer"
                                aria-label="Cerrar"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <p className="text-sm text-gray-600 mb-4">
                            Selecciona la incapacidad/permiso ya consumido y una vacación
                            seleccionada del empleado que cayó <span className="font-semibold">dentro</span> de
                            ese rango (no la gozó por estar incapacitado). Solo aplica a vacaciones
                            tipo "Anual"; los días asignados por la empresa se reprograman desde
                            el módulo de SuperUsuario.
                        </p>

                        {loadingData ? (
                            <div className="py-8 text-center text-gray-500 text-sm">Cargando datos…</div>
                        ) : (
                            <div className="space-y-4">
                                {/* Incapacidad */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Incapacidad / permiso consumido
                                    </label>
                                    <select
                                        value={permisoId ?? ''}
                                        onChange={e => setPermisoId(e.target.value ? Number(e.target.value) : null)}
                                        className="w-full border border-gray-300 rounded px-2 py-2 text-sm"
                                        disabled={incapacidades.length === 0}
                                    >
                                        <option value="">— Selecciona —</option>
                                        {incapacidades.map(i => (
                                            <option key={i.id} value={i.id}>
                                                {format(parseISO(i.desde), 'dd/MM/yyyy')} → {format(parseISO(i.hasta), 'dd/MM/yyyy')}
                                                {i.claseAbsentismo ? ` · ${i.claseAbsentismo}` : ''}
                                            </option>
                                        ))}
                                    </select>
                                    {incapacidadSel && (
                                        <p className="text-xs text-gray-500 mt-1">
                                            Retorno: <span className="font-medium">{format(addDays(parseISO(incapacidadSel.hasta), 1), 'EEEE dd/MM/yyyy', { locale: es })}</span>
                                        </p>
                                    )}
                                </div>

                                {/* Vacación a mover (filtrada al rango de la incapacidad) */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Vacación seleccionada dentro del rango de la incapacidad
                                    </label>
                                    <select
                                        value={vacacionId ?? ''}
                                        onChange={e => setVacacionId(e.target.value ? Number(e.target.value) : null)}
                                        className="w-full border border-gray-300 rounded px-2 py-2 text-sm"
                                        disabled={!permisoId || vacaciones.length === 0}
                                    >
                                        <option value="">
                                            {!permisoId
                                                ? '— Primero selecciona una incapacidad —'
                                                : '— Selecciona —'}
                                        </option>
                                        {vacaciones.map(v => (
                                            <option key={v.id} value={v.id}>
                                                {format(parseISO(v.fecha), 'EEEE dd/MM/yyyy', { locale: es })} · Seleccionada (Anual)
                                            </option>
                                        ))}
                                    </select>
                                    {vacacionSel && (
                                        <p className="text-xs text-gray-500 mt-1">
                                            Día original: <span className="font-medium text-red-600">
                                                {format(parseISO(vacacionSel.fecha), 'dd/MM/yyyy')}
                                            </span>
                                        </p>
                                    )}
                                </div>

                                {/* Fecha nueva */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Fecha nueva (post-incapacidad)
                                    </label>
                                    <input
                                        type="date"
                                        value={fechaNueva}
                                        onChange={e => setFechaNueva(e.target.value)}
                                        min={fechaMinima || undefined}
                                        className="w-full border border-gray-300 rounded px-2 py-2 text-sm"
                                        disabled={!incapacidadSel}
                                    />
                                    {!incapacidadSel && (
                                        <p className="text-xs text-gray-400 mt-1">
                                            Selecciona primero una incapacidad para habilitar la fecha.
                                        </p>
                                    )}
                                </div>

                                {/* Motivo */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Motivo
                                    </label>
                                    <textarea
                                        value={motivo}
                                        onChange={e => setMotivo(e.target.value)}
                                        rows={3}
                                        maxLength={500}
                                        placeholder="Ej. Reincorporación tras incapacidad por enfermedad…"
                                        className="w-full border border-gray-300 rounded px-2 py-2 text-sm resize-none"
                                    />
                                    <p className="text-xs text-gray-400 mt-1 text-right">
                                        {motivo.length}/500
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
                                disabled={loadingSubmit || loadingData || !permisoId || !vacacionId || !fechaNueva || !motivo.trim()}
                            >
                                {loadingSubmit ? 'Enviando…' : 'Enviar solicitud'}
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
