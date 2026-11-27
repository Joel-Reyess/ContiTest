/**
 * Modal para configuración y ejecución de programación automática de vacaciones
 */

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, AlertTriangle, CheckCircle, XCircle, Clock, X, Plus, Trash2 } from 'lucide-react';
import { areasService } from '@/services/areasService';
import type { Area } from '@/interfaces/Areas.interface';
import { AsignacionAutomaticaService } from '@/services/asignacionAutomaticaService';
import { capacidadPorcentajeService, type CapacidadPorcentaje } from '@/services/capacidadPorcentajeService';
import type { AsignacionAutomaticaResponse } from '@/interfaces/Api.interface';
import { diaDeRegla, reglasDomingoService, type ReglaDomingo } from '@/services/reglasDomingoService';
import { format, getWeek, startOfMonth, endOfMonth, eachWeekOfInterval, endOfWeek } from 'date-fns';
import { es } from 'date-fns/locale';

interface ProgramacionAutomaticaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNotification: (type: 'success' | 'info' | 'warning' | 'error', title: string, message?: string) => void;
  onSuccess?: () => void;
  /** Año que debe traer preseleccionado el modal (el que se está programando). */
  anioObjetivo?: number;
}

type ModalStep = 'confirmation' | 'processing' | 'results';

export const ProgramacionAutomaticaModal = ({ 
  isOpen, 
  onClose, 
  onNotification,
  onSuccess,
  anioObjetivo
}: ProgramacionAutomaticaModalProps) => {
  // Año que se está programando. Llega desde la vista (el año en preparación
  // cuando convive con la reprogramación del año en curso); "año actual + 1"
  // queda sólo como respaldo. Sigue siendo editable a mano.
  const anioPorDefecto = anioObjetivo ?? new Date().getFullYear() + 1;
  const [step, setStep] = useState<ModalStep>('confirmation');
  const [anio, setAnio] = useState<number>(anioPorDefecto);
  // El modal vive montado todo el tiempo: el estado inicial se toma la primera
  // vez que se pinta la vista (año vigente) y al abrirlo desde la preparación del
  // siguiente año seguía diciendo 2026 aunque abajo dijera "se está programando
  // 2027" (validación nov-2026). Al abrir se toma siempre el año que se programa.
  useEffect(() => {
    if (isOpen) setAnio(anioPorDefecto);
  }, [isOpen, anioPorDefecto]);
  const anioDistinto = Number.isFinite(anio) && anio !== anioPorDefecto;
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultados, setResultados] = useState<AsignacionAutomaticaResponse | null>(null);
  const [isReverting, setIsReverting] = useState(false);
  const [mesesExcluidos, setMesesExcluidos] = useState<number[]>([]);
  // Fechas de arranque/paro en las que se "cargan" días por la empresa, solo
  // para las áreas elegidas en cada una (requerimiento de planeación 2027).
  type VentanaForm = { id: number; nombre: string; fechaInicio: string; fechaFin: string; areaIds: number[]; porcentaje: string };
  const [ventanas, setVentanas] = useState<VentanaForm[]>([]);
  // Correr solo para algunas áreas (27-nov-2026: Herramental se quedó sin días
  // por la empresa y no había cómo completarlos sin volver a correr la planta).
  // Vacío = toda la planta. Solo se completa lo que le falte a cada empleado.
  const [soloAreas, setSoloAreas] = useState<number[]>([]);
  // Áreas de la corrida que se muestra en resultados (null = toda la planta).
  const [corridaSoloAreas, setCorridaSoloAreas] = useState<string[] | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  useEffect(() => {
    if (!isOpen || areas.length > 0) return;
    areasService
      .getAreas()
      .then((a) => setAreas([...a].sort((x, y) => x.nombreGeneral.localeCompare(y.nombreGeneral, 'es'))))
      .catch(() => setAreas([]));
  }, [isOpen, areas.length]);
  // Capacidades "solo días por la empresa" del año: también son fechas con
  // prioridad al asignar (se muestran para que se vea que las dos secciones coinciden).
  const [prioridadesCapacidad, setPrioridadesCapacidad] = useState<CapacidadPorcentaje[]>([]);
  useEffect(() => {
    if (!isOpen) return;
    capacidadPorcentajeService
      .listar(anio)
      // Las de todo el año no son prioridad (el backend tampoco las usa así).
      .then((r) => setPrioridadesCapacidad(r.capacidades.filter((c) => c.activa && c.aplicaA === 'Empresa' && c.periodo !== 'Anio' && !c.turno)))
      .catch(() => setPrioridadesCapacidad([]));
  }, [isOpen, anio]);
  // Paros con días por la empresa del año (Reglas de trabajo): a esas unidades se
  // les asignan primero sus días en esos sábados/domingos, según su rol. Se muestran
  // aquí para que se vea qué va a pasar antes de confirmar (nov-2026).
  const [parosEmpresa, setParosEmpresa] = useState<{ clave: string; reglas: ReglaDomingo[] }[]>([]);
  useEffect(() => {
    if (!isOpen || !Number.isFinite(anio)) return;
    reglasDomingoService
      .listar(anio)
      .then((r) => {
        const mapa = new Map<string, ReglaDomingo[]>();
        for (const x of r.reglas.filter((x) => x.activa && x.tipo === 'ParoEmpresa')) {
          const clave = [diaDeRegla(x), x.fechaInicio.slice(0, 10), x.fechaFin.slice(0, 10)].join('|');
          mapa.set(clave, [...(mapa.get(clave) ?? []), x]);
        }
        setParosEmpresa(Array.from(mapa.entries()).map(([clave, reglas]) => ({ clave, reglas })));
      })
      .catch(() => setParosEmpresa([]));
  }, [isOpen, anio]);
  // Hay áreas con el mismo nombre (dos "Mtto. A"): a esas se les pone el id
  // para saber cuál se está eligiendo.
  const etiquetaArea = (a: Area) =>
    areas.filter((x) => x.nombreGeneral === a.nombreGeneral).length > 1 ? `${a.nombreGeneral} (id ${a.areaId})` : a.nombreGeneral;
  const actualizarVentana = (id: number, cambios: Partial<VentanaForm>) =>
    setVentanas((vs) => vs.map((v) => (v.id === id ? { ...v, ...cambios } : v)));
  const ventanasValidas = ventanas.filter((v) => v.fechaInicio && v.fechaFin && v.fechaFin >= v.fechaInicio && v.areaIds.length > 0);

  // Nombres de los meses
  const MESES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  // Función para obtener las semanas de un mes específico
  const obtenerSemanasDelMes = (mes: number, anio: number): number[] => {
    const inicioMes = startOfMonth(new Date(anio, mes - 1));
    const finMes = endOfMonth(new Date(anio, mes - 1));
    
    const semanas: number[] = [];
    const semanasDelMes = eachWeekOfInterval(
      { start: inicioMes, end: finMes },
      { weekStartsOn: 1 } // Lunes como inicio de semana
    );

    semanasDelMes.forEach(inicioSemana => {
      const finSemana = endOfWeek(inicioSemana, { weekStartsOn: 1 });
      // Solo incluir semanas que tengan al menos un día del mes
      if (inicioSemana <= finMes && finSemana >= inicioMes) {
        const numeroSemana = getWeek(inicioSemana, { weekStartsOn: 1 });
        semanas.push(numeroSemana);
      }
    });

    return semanas;
  };

  // Función para obtener todas las semanas excluidas basadas en los meses seleccionados
  const obtenerSemanasExcluidas = (): number[] => {
    const semanasExcluidas: number[] = [];
    
    mesesExcluidos.forEach(mes => {
      const semanasMes = obtenerSemanasDelMes(mes, anio);
      semanasExcluidas.push(...semanasMes);
    });

    // Eliminar duplicados y ordenar
    return [...new Set(semanasExcluidas)].sort((a, b) => a - b);
  };

  // Función para manejar la selección/deselección de meses
  const handleMesToggle = (mes: number) => {
    setMesesExcluidos(prev => {
      if (prev.includes(mes)) {
        return prev.filter(m => m !== mes);
      } else {
        return [...prev, mes].sort((a, b) => a - b);
      }
    });
  };

  const handleClose = () => {
    if (isProcessing || isReverting) {
      onNotification('warning', 'Proceso en curso', 'No se puede cerrar el modal mientras se está procesando. Por favor espere.');
      return;
    }
    
    // Reset state when closing
    setStep('confirmation');
    setAnio(anioPorDefecto);
    setMesesExcluidos([]);
    setVentanas([]);
    setSoloAreas([]);
    setCorridaSoloAreas(null);
    setResultados(null);
    onClose();
  };

  const handleConfirmarProgramacion = async () => {
    try {
      setIsProcessing(true);
      setStep('processing');
      
      const semanasExcluidas = obtenerSemanasExcluidas();
      // Solo algunas áreas: se mandan los grupos de esas áreas.
      let grupoIds: number[] | undefined;
      if (soloAreas.length > 0) {
        const grupos = await areasService.getGroups();
        grupoIds = grupos.filter((g) => soloAreas.includes(g.areaId)).map((g) => g.grupoId);
        if (grupoIds.length === 0) {
          onNotification('error', 'Sin grupos', 'Las áreas elegidas no tienen grupos. No se asignó nada.');
          setStep('confirmation');
          return;
        }
      }
      const nombresSoloAreas = soloAreas.length > 0
        ? areas.filter((a) => soloAreas.includes(a.areaId)).map(etiquetaArea)
        : null;
      const response = await AsignacionAutomaticaService.ejecutarAsignacion(
        anio,
        semanasExcluidas,
        ventanasValidas.map((v) => ({
          nombre: v.nombre || undefined,
          fechaInicio: v.fechaInicio,
          fechaFin: v.fechaFin,
          areaIds: v.areaIds,
          porcentaje: v.porcentaje.trim() ? Number(v.porcentaje) : undefined,
        })),
        grupoIds
      );
      setCorridaSoloAreas(nombresSoloAreas);
      setResultados(response);
      setStep('results');
      
      onNotification('success', 'Programación Completada', 
        `Se procesaron ${response.totalEmpleadosProcesados} empleados y se asignaron ${response.totalDiasAsignados} días de vacaciones.`);
    } catch (error) {
      console.error('Error al ejecutar programación automática:', error);
      
      // Manejo específico para diferentes tipos de errores
      let errorMessage = 'Ocurrió un error al ejecutar la programación automática. Por favor intente nuevamente.';
      
      if (error instanceof Error) {
        if (error.message.includes('timeout') || error.message.includes('Request timeout')) {
          errorMessage = 'La operación tardó más de lo esperado. Esto puede deberse a la cantidad de empleados a procesar. Por favor intente nuevamente o contacte al administrador.';
        } else if (error.message.includes('Network Error') || error.message.includes('Failed to fetch')) {
          errorMessage = 'Error de conexión. Verifique su conexión a internet e intente nuevamente.';
        } else if (error.message) {
          errorMessage = error.message;
        }
      }
      
      onNotification('error', 'Error en la Programación', errorMessage);
      setStep('confirmation');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRevertir = async () => {
    if (!resultados) return;
    
    try {
      setIsReverting(true);
      
      const response = await AsignacionAutomaticaService.revertirAsignacion(resultados.anioAsignacion);
      
      onNotification('success', 'Asignación Revertida', 
        `Se eliminaron ${response.totalVacacionesEliminadas} vacaciones de ${response.empleadosAfectados} empleados.`);
      
      // Reset to initial state
      setStep('confirmation');
      setResultados(null);
      setAnio(anioPorDefecto);
    } catch (error) {
      console.error('Error al revertir asignación:', error);
      
      // Manejo específico para diferentes tipos de errores
      let errorMessage = 'Ocurrió un error al revertir la asignación. Por favor intente nuevamente.';
      
      if (error instanceof Error) {
        if (error.message.includes('timeout') || error.message.includes('Request timeout')) {
          errorMessage = 'La operación de reversión tardó más de lo esperado. Por favor intente nuevamente o contacte al administrador.';
        } else if (error.message.includes('Network Error') || error.message.includes('Failed to fetch')) {
          errorMessage = 'Error de conexión. Verifique su conexión a internet e intente nuevamente.';
        } else if (error.message) {
          errorMessage = error.message;
        }
      }
      
      onNotification('error', 'Error al Revertir', errorMessage);
    } finally {
      setIsReverting(false);
    }
  };

  const handleAceptar = () => {
    onNotification('success', 'Programación Aceptada', 
      'La programación automática ha sido aceptada y aplicada correctamente.');
    onSuccess?.();
    handleClose();
  };



  const renderConfirmationStep = () => (
    <div className="space-y-6">
      <div className="flex items-center gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
        <div className="text-sm text-yellow-800">
          <p className="font-medium mb-1">Configuración de Programación Automática</p>
          <p>Se está por configurar la programación automática de días de vacaciones.</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="anio" className="text-sm font-medium text-gray-700">
            Año de programación
          </Label>
          <Input
            id="anio"
            type="number"
            value={anio}
            onChange={(e) => setAnio(parseInt(e.target.value))}
            min={new Date().getFullYear()}
            max={new Date().getFullYear() + 5}
            className="w-full"
          />
          <p className="text-xs text-gray-500">
            Año que se está programando ({anioPorDefecto}); puedes cambiarlo si necesitas otro.
          </p>
          {anioDistinto && (
            <p className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded p-2">
              Ojo: vas a asignar días por la empresa de {anio}, no de {anioPorDefecto}.
              {anio < anioPorDefecto
                ? ` ${anio} ya tiene su programación; solo se completaría a quien le falten días, y nunca en fechas que ya pasaron.`
                : ''}
            </p>
          )}
        </div>

        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">Información importante:</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>
                  El proceso tarda varios minutos (con toda la planta puede pasar de
                  15). Si el navegador se cansa de esperar, lo ya asignado se
                  conserva: vuelve a ejecutarlo y continúa donde se quedó.
                </li>
                <li>No cierre la pestaña o el navegador durante el proceso</li>
                <li>
                  {soloAreas.length > 0
                    ? 'Solo se procesan los empleados de las áreas elegidas abajo; las demás no se tocan'
                    : 'Se procesarán todos los empleados automáticamente'}
                </li>
                <li>A quien ya tiene sus días por la empresa no se le cambia nada: solo se completa lo que falte</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Solo algunas áreas */}
      <div className="rounded-lg border border-gray-200 p-3 space-y-2">
        <Label className="text-sm font-medium text-continental-gray-1">
          Solo para estas áreas (opcional)
        </Label>
        <p className="text-xs text-gray-500">
          Si no eliges ninguna, se procesa toda la planta. Si eliges, solo se asignan los días por la empresa que les
          falten a los empleados de esas áreas (por ejemplo, un área que se quedó sin días). A las demás áreas no se
          les toca nada.
        </p>
        <div className="grid grid-cols-2 gap-1 max-h-40 overflow-y-auto">
          {areas.map((a) => (
            <label key={a.areaId} className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={soloAreas.includes(a.areaId)}
                onChange={(e) =>
                  setSoloAreas((s) => (e.target.checked ? [...s, a.areaId] : s.filter((x) => x !== a.areaId)))
                }
              />
              {etiquetaArea(a)}
            </label>
          ))}
        </div>
        {soloAreas.length > 0 && (
          <p className="text-xs font-medium text-blue-800 bg-blue-50 border border-blue-200 rounded p-2">
            Solo: {areas.filter((a) => soloAreas.includes(a.areaId)).map(etiquetaArea).join(', ')}
          </p>
        )}
      </div>

      {/* Seleccionar meses excluidos de la programación */}
      <div className="space-y-4">
        <div>
          <Label className="text-sm font-medium text-continental-gray-1">
            Meses a excluir de la programación automática
          </Label>
          <p className="text-xs text-gray-500 mt-1">
            Seleccione los meses cuyas semanas desea excluir de la asignación automática. Aplican a
            todos los empleados de todas las áreas, no solo a una (salvo los días de un "paro con días por la
            empresa", que se usan aunque el mes esté excluido). Si quieres que ciertas áreas tomen sus
            días en ciertas fechas (por ejemplo producción de enero a Semana Santa), usa abajo "Fechas de
            arranque o paro de planta".
          </p>
        </div>
        
        <div className="grid grid-cols-3 gap-2">
          {MESES.map((nombreMes, index) => {
            const numeroMes = index + 1;
            const isSelected = mesesExcluidos.includes(numeroMes);
            const semanasDelMes = obtenerSemanasDelMes(numeroMes, anio);
            
            return (
              <button
                key={numeroMes}
                type="button"
                onClick={() => handleMesToggle(numeroMes)}
                className={`
                  p-3 rounded-lg border text-sm font-medium transition-all
                  ${isSelected 
                    ? 'bg-continental-yellow border-continental-yellow text-continental-gray-1 shadow-sm' 
                    : 'bg-white border-gray-200 text-gray-700 hover:border-continental-yellow hover:bg-continental-yellow/10'
                  }
                `}
              >
                <div className="text-center">
                  <div className="font-medium">{nombreMes}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    Semanas: {semanasDelMes.join(', ')}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="rounded-lg border border-gray-200 p-3 space-y-3">
          <div className="flex flex-wrap items-start gap-2">
            <div className="mr-auto">
              <Label className="text-sm font-medium text-continental-gray-1">
                Fechas de arranque o paro de planta (opcional)
              </Label>
              <p className="text-xs text-gray-500 mt-1">
                A los empleados de las áreas que elijas se les asignan primero sus días en estas fechas, aunque el mes
                esté excluido. Cuántos caben por día lo decide el %: si pones uno aquí, se guarda como capacidad por
                periodo de esas áreas en esas fechas, solo para días por la empresa (y aparece en la pestaña Capacidad
                por periodo). Si lo dejas vacío rige el % que ya tengan.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setVentanas((vs) => [...vs, { id: Date.now(), nombre: '', fechaInicio: '', fechaFin: '', areaIds: [], porcentaje: '' }])
              }
              className="flex items-center gap-1"
            >
              <Plus className="w-4 h-4" /> Agregar fechas
            </Button>
          </div>
          {parosEmpresa.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
              <p className="font-medium">
                Paro con días por la empresa (Reglas de trabajo): a estas unidades se les asignan primero sus días en esos
                días, solo los que trabajan según su rol y sin % de ausencia. Lo que no alcance va de forma normal.
              </p>
              <ul className="mt-1 space-y-0.5">
                {parosEmpresa.map(({ clave, reglas }) => {
                  const r = reglas[0];
                  const dias = diaDeRegla(r) === 'Ambos' ? 'sábados y domingos' : diaDeRegla(r) === 'Sabado' ? 'sábados' : 'domingos';
                  const nombres = reglas.map((x) => (x.grupo ? `${x.area} (${x.grupo})` : x.area)).sort((a, b) => a.localeCompare(b, 'es'));
                  // Otra regla (más corta o de grupo) le gana algunos días: ahí no se ponen días por la empresa.
                  const parciales = reglas.filter(
                    (x) => x.diasDelPeriodo != null && x.diasQueManda != null && x.diasQueManda < x.diasDelPeriodo
                  );
                  return (
                    <li key={clave} title={nombres.join(', ')}>
                      {nombres.length <= 3 ? nombres.join(', ') : `${nombres.length} unidades organizativas`} · {dias} del{' '}
                      {r.fechaInicio.slice(0, 10)} al {r.fechaFin.slice(0, 10)}
                      {parciales.map((x) => (
                        <div key={x.id} className="ml-3 text-red-700">
                          ⚠ {x.area}: solo manda en {x.diasQueManda} de {x.diasDelPeriodo} días; los otros los gana{' '}
                          {(x.ganadaPor ?? []).join('; ')}. Ahí no se pondrán días por la empresa (revisa Reglas de trabajo).
                        </div>
                      ))}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {prioridadesCapacidad.length > 0 && (
            <div className="rounded-md border border-blue-200 bg-blue-50 p-2 text-xs text-blue-900">
              <p className="font-medium">Ya marcadas como prioridad desde Capacidad por periodo (solo días por la empresa):</p>
              <ul className="mt-1 space-y-0.5">
                {prioridadesCapacidad.map((c) => (
                  <li key={c.id}>
                    {c.alcance === 'Planta' ? 'Toda la planta' : c.alcance === 'Area' ? c.area : `Grupo ${c.grupo} (${c.area ?? ''})`} ·{' '}
                    {c.fechaInicio.slice(0, 10)} al {c.fechaFin.slice(0, 10)} · {c.porcentaje}%
                  </li>
                ))}
              </ul>
            </div>
          )}
          {ventanas.map((v) => (
            <div key={v.id} className="rounded-md bg-gray-50 p-3 space-y-2">
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col text-xs text-gray-600">
                  Nombre
                  <Input
                    className="h-8 w-44"
                    placeholder="Ej. Arranque de enero"
                    value={v.nombre}
                    onChange={(e) => actualizarVentana(v.id, { nombre: e.target.value })}
                  />
                </label>
                <label className="flex flex-col text-xs text-gray-600">
                  Desde
                  <Input type="date" className="h-8" value={v.fechaInicio} onChange={(e) => actualizarVentana(v.id, { fechaInicio: e.target.value })} />
                </label>
                <label className="flex flex-col text-xs text-gray-600">
                  Hasta
                  <Input type="date" className="h-8" min={v.fechaInicio} value={v.fechaFin} onChange={(e) => actualizarVentana(v.id, { fechaFin: e.target.value })} />
                </label>
                <label className="flex flex-col text-xs text-gray-600">
                  % esos días (opcional)
                  <Input
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="100"
                    className="h-8 w-28"
                    placeholder="Ej. 10"
                    value={v.porcentaje}
                    onChange={(e) => actualizarVentana(v.id, { porcentaje: e.target.value })}
                  />
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-red-600"
                  onClick={() => setVentanas((vs) => vs.filter((x) => x.id !== v.id))}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              <div className="text-xs text-gray-600">Áreas a las que aplica ({v.areaIds.length})</div>
              <div className="max-h-32 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1 bg-white rounded border p-2">
                {areas.map((a) => (
                  <label key={a.areaId} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={v.areaIds.includes(a.areaId)}
                      onChange={(e) =>
                        actualizarVentana(v.id, {
                          areaIds: e.target.checked ? [...v.areaIds, a.areaId] : v.areaIds.filter((x) => x !== a.areaId),
                        })
                      }
                    />
                    {a.nombreGeneral}
                  </label>
                ))}
              </div>
            </div>
          ))}
          {ventanas.length > 0 && ventanasValidas.length < ventanas.length && (
            <p className="text-xs text-orange-700">
              Las fechas sin "desde", "hasta" o sin áreas no se van a tomar en cuenta.
            </p>
          )}
        </div>

        {mesesExcluidos.length > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
            <h4 className="font-medium text-orange-800 mb-2">Resumen de exclusiones:</h4>
            <div className="text-sm text-orange-700">
              <p className="mb-1">
                <strong>Meses seleccionados:</strong> {mesesExcluidos.map(mes => MESES[mes - 1]).join(', ')}
              </p>
              <p>
                <strong>Semanas a excluir:</strong> {obtenerSemanasExcluidas().join(', ')}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3">
        <Button
          onClick={handleClose}
          variant="outline"
          className="px-6"
        >
          Cancelar
        </Button>
        <Button
          onClick={handleConfirmarProgramacion}
          variant="continental"
          className="px-6"
          disabled={!Number.isFinite(anio)}
        >
          {soloAreas.length > 0
            ? `Confirmar solo ${soloAreas.length} área${soloAreas.length === 1 ? '' : 's'}`
            : anioDistinto ? `Confirmar programación ${anio}` : 'Confirmar Programación'}
        </Button>
      </div>
    </div>
  );

  const renderProcessingStep = () => (
    <div className="space-y-6 text-center py-8">
      <div className="flex justify-center">
        <Loader2 className="w-12 h-12 text-continental-blue animate-spin" />
      </div>
      
      <div className="space-y-2">
        <h3 className="text-lg font-medium text-gray-900">
          Procesando Programación Automática
        </h3>
        <p className="text-gray-600">
          Configurando vacaciones para el año {anio}...
        </p>
        <p className="text-sm text-gray-500">
          Puede tardar varios minutos según cuántos empleados haya (con la planta completa, más de 15). No cierres esta ventana. Si se corta, lo asignado hasta ese momento queda guardado y al volver a ejecutarlo continúa donde se quedó.
        </p>
        <div className="text-xs text-gray-400 bg-gray-50 p-2 rounded">
          <p>• Procesando empleados por grupos</p>
          <p>• Calculando disponibilidad por semanas</p>
          <p>• Asignando días de vacaciones automáticamente</p>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 text-sm text-yellow-600 bg-yellow-50 p-3 rounded-lg">
        <AlertTriangle className="w-4 h-4" />
        <span>No cierre la pestaña o el navegador</span>
      </div>
    </div>
  );

  const renderResultsStep = () => {
    if (!resultados) return null;

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
          <div className="text-sm text-green-800">
            <p className="font-medium">Programación Completada Exitosamente</p>
            <p>La asignación automática de vacaciones ha sido procesada.</p>
          </div>
        </div>

        {/* Resumen simplificado */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-5 h-5 text-blue-600" />
                <span className="text-sm font-medium text-blue-800">Total Procesados</span>
              </div>
              <p className="text-2xl font-bold text-blue-900">{resultados.totalEmpleadosProcesados}</p>
            </div>
            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="text-sm font-medium text-green-800">Asignados</span>
              </div>
              <p className="text-2xl font-bold text-green-900">{resultados.totalEmpleadosAsignados}</p>
            </div>
            <div className="bg-red-50 p-4 rounded-lg border border-red-200">
              <div className="flex items-center gap-2 mb-2">
                <XCircle className="w-5 h-5 text-red-600" />
                <span className="text-sm font-medium text-red-800">Fallidos</span>
              </div>
              <p className="text-2xl font-bold text-red-900">
                {resultados.totalEmpleadosProcesados - resultados.totalEmpleadosAsignados}
              </p>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-5 h-5 text-purple-600" />
                <span className="text-sm font-medium text-purple-800">Días Asignados</span>
              </div>
              <p className="text-2xl font-bold text-purple-900">{resultados.totalDiasAsignados}</p>
            </div>
          </div>
          
          <div className="bg-gray-50 p-4 rounded-lg border">
            <h4 className="font-medium text-gray-900 mb-2">Información del Procesamiento</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
              <div>
                <span className="font-medium">Año de asignación:</span> {resultados.anioAsignacion}
              </div>
              <div>
                <span className="font-medium">Fecha de procesamiento:</span> {' '}
                {format(new Date(resultados.fechaProcesamiento), "d 'de' MMMM 'de' yyyy 'a las' HH:mm", { locale: es })}
              </div>
            </div>
          </div>
          

        </div>

        {resultados?.advertencias?.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium text-gray-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-500" />
              Advertencias ({resultados.advertencias.length})
            </h4>
            <div className="max-h-32 overflow-y-auto space-y-1">
              {resultados.advertencias.map((advertencia, index) => (
                <p key={index} className="text-xs text-yellow-700 bg-yellow-50 p-2 rounded">
                  {advertencia}
                </p>
              ))}
            </div>
          </div>
        )}

        {corridaSoloAreas && (
          <p className="text-xs text-blue-800 bg-blue-50 border border-blue-200 rounded p-2">
            Se corrió solo para: {corridaSoloAreas.join(', ')}. Aquí no hay "Revertir": revertir borra los días por la
            empresa de toda la planta.
          </p>
        )}

        <div className="flex justify-end gap-3">
          {!corridaSoloAreas && (
          <Button
            onClick={handleRevertir}
            variant="outline"
            disabled={isReverting}
            className="px-6 text-red-600 border-red-300 hover:bg-red-50"
          >
            {isReverting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Revirtiendo...
              </>
            ) : (
              <>
                <XCircle className="w-4 h-4 mr-2" />
                Revertir
              </>
            )}
          </Button>
          )}
          <Button
            onClick={handleAceptar}
            variant="continental"
            disabled={isReverting}
            className="px-6"
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            Aceptar
          </Button>
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm" 
        onClick={handleClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl max-w-4xl max-h-[90vh] overflow-y-auto w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">
            {step === 'confirmation' && 'Configurar Programación Automática'}
            {step === 'processing' && 'Procesando Programación'}
            {step === 'results' && 'Resultados de la Programación'}
          </h2>
          <button
            onClick={handleClose}
            disabled={isProcessing || isReverting}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 'confirmation' && renderConfirmationStep()}
          {step === 'processing' && renderProcessingStep()}
          {step === 'results' && renderResultsStep()}
        </div>
      </div>
    </div>
  );
};
