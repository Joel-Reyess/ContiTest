import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CalendarPlus2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import {
    vacacionLaboradaService,
    type VacacionCandidataLaborada,
} from '@/services/vacacionLaboradaService'

interface Props {
    show: boolean
    onClose: () => void
    empleadoId?: number
    empleadoNombre?: string
    onSolicitudCreada?: () => void
}

export function SolicitarVacacionLaboradaModal({
    show, onClose, empleadoId, empleadoNombre, onSolicitudCreada,
}: Props) {
    const [candidatas, setCandidatas] = useState<VacacionCandidataLaborada[]>([])
    const [vacacionId, setVacacionId] = useState<number | null>(null)
    const [fechaNueva, setFechaNueva] = useState('')
    const [motivo, setMotivo] = useState('')
    const [loadingData, setLoadingData] = useState(false)
    const [loadingSubmit, setLoadingSubmit] = useState(false)

    const vacacionSel = vacacionId ? candidatas.find(v => v.vacacionId === vacacionId) : null

    // Fecha mínima permitida = mañana (la fecha nueva debe ser estrictamente futura).
    const hoyStr = format(new Date(), 'yyyy-MM-dd')
    const fechaMinima = format(addDays(new Date(), 1), 'yyyy-MM-dd')

    useEffect(() => {
        if (!show || !empleadoId) return
        let cancel = false
        setLoadingData(true)
        vacacionLaboradaService.getVacacionesLaborables(empleadoId)
            .then(vs => {
                if (cancel) return
                setCandidatas(vs || [])
                if (!vs || vs.length === 0) {
                    toast.info('El empleado no tiene vacaciones activas con fecha ≤ hoy.')
                }
            })
            .catch((e: unknown) => {
                console.error(e)
                toast.error('Error al cargar vacaciones del empleado')
            })
            .finally(() => { if (!cancel) setLoadingData(false) })

        return () => { cancel = true }
    }, [show, empleadoId])

    const limpiar = () => {
        setVacacionId(null)
        setFechaNueva('')
        setMotivo('')
    }

    const handleClose = () => {
        limpiar()
        onClose()
    }

    const handleSubmit = async () => {
        if (!empleadoId || !vacacionId || !fechaNueva) {
            toast.error('Selecciona la vacación trabajada y la fecha nueva.')
            return
        }
        if (fechaNueva <= hoyStr) {
            toast.error('La fecha nueva debe ser posterior a hoy.')
            return
        }

        setLoadingSubmit(true)
        try {
            await vacacionLaboradaService.solicitar({
                empleadoId,
                vacacionOriginalId: vacacionId,
                fechaNueva,
                motivo: motivo.trim() || undefined,
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
                                    Vacación laborada
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
                            Registra que el empleado se presentó a trabajar en un día que tenía
                            programado como vacación. Elige el día trabajado y una fecha nueva
                            futura para re-programarlo. Al aprobar el jefe: se cancela la
                            vacación original y se crea una nueva en la fecha elegida.
                        </p>

                        {loadingData ? (
                            <div className="py-8 text-center text-gray-500 text-sm">Cargando datos…</div>
                        ) : (
                            <div className="space-y-4">
                                {/* Vacación trabajada */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Vacación trabajada (fecha ≤ hoy)
                                    </label>
                                    <select
                                        value={vacacionId ?? ''}
                                        onChange={e => setVacacionId(e.target.value ? Number(e.target.value) : null)}
                                        className="w-full border border-gray-300 rounded px-2 py-2 text-sm"
                                        disabled={candidatas.length === 0}
                                    >
                                        <option value="">— Selecciona —</option>
                                        {candidatas.map(v => (
                                            <option key={v.vacacionId} value={v.vacacionId}>
                                                {format(parseISO(v.fechaVacacion), 'EEEE dd/MM/yyyy', { locale: es })} · {v.tipoVacacion}
                                            </option>
                                        ))}
                                    </select>
                                    {vacacionSel && (
                                        <p className="text-xs text-gray-500 mt-1">
                                            Día trabajado: <span className="font-medium text-red-600">
                                                {format(parseISO(vacacionSel.fechaVacacion), 'dd/MM/yyyy')}
                                            </span>
                                        </p>
                                    )}
                                </div>

                                {/* Fecha nueva */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Fecha nueva (futura)
                                    </label>
                                    <input
                                        type="date"
                                        value={fechaNueva}
                                        onChange={e => setFechaNueva(e.target.value)}
                                        min={fechaMinima}
                                        className="w-full border border-gray-300 rounded px-2 py-2 text-sm"
                                    />
                                    <p className="text-xs text-gray-400 mt-1">
                                        Debe ser posterior a hoy y no puede ser día inhábil.
                                    </p>
                                </div>

                                {/* Motivo */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Motivo <span className="text-gray-400">(opcional)</span>
                                    </label>
                                    <textarea
                                        value={motivo}
                                        onChange={e => setMotivo(e.target.value)}
                                        rows={3}
                                        maxLength={500}
                                        placeholder="Ej. Cobertura de operación crítica…"
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
                                disabled={loadingSubmit || loadingData || !vacacionId || !fechaNueva}
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
