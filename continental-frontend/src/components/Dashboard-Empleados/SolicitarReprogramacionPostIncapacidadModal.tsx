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

    // Fecha mínima permitida = el día siguiente más tardío entre el fin de la
    // incapacidad y "hoy" (no se puede reprogramar a fechas pasadas ni a un día
    // todavía dentro de la incapacidad).
    const hoyStr = format(new Date(), 'yyyy-MM-dd')
    const fechaMinima = incapacidadSel
        ? (() => {
            const tras = format(addDays(parseISO(incapacidadSel.hasta), 1), 'yyyy-MM-dd')
            const manana = format(addDays(new Date(), 1), 'yyyy-MM-dd')
            return tras > manana ? tras : manana
        })()
        : ''

    useEffect(() => {
        if (!show || !empleadoId) return
        let cancel = false
        setLoadingData(true)
        reprogramacionPostIncapacidadService.getIncapacidadesConsumidas(empleadoId)
            .then(incs => {
                if (cancel) return
                // Defensa cliente: la tabla PermisosEIncapacidadesSAP ingesta
                // también las vacaciones SAP (ClAbPre=1100). No deben aparecer
                // como permisos en este dropdown.
                const sinVacacionesSAP = (incs || []).filter(i => {
                    if (i.clAbPre === 1100) return false
                    const clase = (i.claseAbsentismo || '').toLowerCase()
                    if (clase.includes('vacaci')) return false
                    return true
                })
                if (incs && incs.length !== sinVacacionesSAP.length) {
                    console.warn('[ReprogPostIncapacidad] Backend incluyó vacaciones SAP (1100) en incapacidades; filtrando en cliente:',
                        incs.filter(i => !sinVacacionesSAP.includes(i)))
                }
                setIncapacidades(sinVacacionesSAP)
                if (!sinVacacionesSAP.length) toast.info('El empleado no tiene incapacidades/permisos consumidos.')
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
        const inc = incapacidades.find(i => i.id === permisoId)
        if (!inc) return
        let cancel = false
        reprogramacionPostIncapacidadService.getVacacionesEnIncapacidad(empleadoId, permisoId)
            .then(vacs => {
                if (cancel) return
                // Defensa cliente (dos capas) por si el backend está corriendo
                // código legacy:
                //   1. sólo Anual (las asignadas se reprograman desde SuperUsuario)
                //   2. fecha de la vacación debe caer DENTRO del rango de la
                //      incapacidad — si la vacación cayó fuera de ese rango,
                //      el empleado sí la gozó (o nunca la tuvo bloqueada por
                //      incapacidad) y por tanto no aplica reprogramar.
                const desde = inc.desde
                const hasta = inc.hasta
                // Sólo días Anual que cayeron dentro del rango Y ya pasaron.
                // Días futuros dentro del rango aún podrían gozarse normalmente
                // (extensión médica, alta anticipada, etc.).
                const filtradas = (vacs || []).filter(v =>
                    v.tipoVacacion === 'Anual' &&
                    v.fecha >= desde &&
                    v.fecha <= hasta &&
                    v.fecha < hoyStr
                )
                if (vacs && vacs.length !== filtradas.length) {
                    console.warn('[ReprogPostIncapacidad] Backend regresó vacaciones inválidas; filtrando en cliente:',
                        vacs.map(v => ({ id: v.id, fecha: v.fecha, tipo: v.tipoVacacion })),
                        '— rango incapacidad:', desde, '→', hasta, '— hoy:', hoyStr)
                }
                setVacaciones(filtradas)
                setVacacionId(null)
                if (!filtradas.length) toast.info('No hay vacaciones Anual ya transcurridas del empleado dentro del rango de esta incapacidad.')
            })
            .catch((e: unknown) => {
                console.error(e)
                if (!cancel) toast.error('Error al cargar vacaciones en rango de incapacidad')
            })
        return () => { cancel = true }
    }, [empleadoId, permisoId, incapacidades])

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
        if (fechaNueva <= hoyStr) {
            toast.error('La fecha nueva debe ser estrictamente posterior a hoy.')
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
                            Selecciona la incapacidad/permiso del empleado (puede seguir activa)
                            y una vacación seleccionada (Anual) que <span className="font-semibold">ya pasó</span> dentro
                            de ese rango — esos son los días que el operador no gozó por estar
                            incapacitado. Sólo aplica a Anuales; los días asignados por la empresa
                            se reprograman desde SuperUsuario. La fecha nueva debe ser posterior a
                            hoy y al fin de la incapacidad.
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
                                        Vacación seleccionada (Anual) ya transcurrida dentro del rango
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
