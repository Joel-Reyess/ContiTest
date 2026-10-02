import { useState, useEffect } from "react";
import { Calendar, BarChart3, CheckCircle, Info, X, CalendarDays } from "lucide-react";
import { VacacionesGeneral } from "./VacacionesGeneral";
import { VacacionesCalendario } from "./VacacionesCalendario";
import { ConfigEdicionDias } from "./ConfigEdicionDias";
import { vacacionesService } from '@/services/vacacionesService';
import type { VacacionesConfig } from '@/interfaces/Vacaciones.interface';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

// Tipos para el sistema de notificaciones
type NotificationType = 'success' | 'info' | 'warning' | 'error';

interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  duration?: number;
}

const NOMBRE_PERIODO: Record<string, string> = {
  ProgramacionAnual: 'Programación Anual',
  Reprogramacion: 'Reprogramación',
  Cerrado: 'Cerrado',
};

const editableDesde = (cfg: VacacionesConfig) => ({
  porcentajeAusenciaMaximo: cfg.porcentajeAusenciaMaximo.toString(),
  porcentajeAusenciaPreparacion: cfg.porcentajeAusenciaPreparacion?.toString() ?? '',
  periodoActual: cfg.periodoActual,
  anioVigente: cfg.anioVigente.toString(),
  anioProgramacionAnual: cfg.anioProgramacionAnual?.toString() ?? '',
});

export const Vacaciones = () => {
  const [activeTab, setActiveTab] = useState<'general' | 'calendario' | 'edicion-dias'>('general');
  const [config, setConfig] = useState<VacacionesConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [editableConfig, setEditableConfig] = useState<{ porcentajeAusenciaMaximo: string; periodoActual: string; anioVigente: string; porcentajeAusenciaPreparacion: string; anioProgramacionAnual: string }>({
    porcentajeAusenciaMaximo: '',
    porcentajeAusenciaPreparacion: '',
    periodoActual: 'Cerrado',
    anioVigente: new Date().getFullYear().toString(),
    anioProgramacionAnual: ''
  });
  // El panel de abajo (VacacionesGeneral) carga su propia copia de la
  // configuración al montarse. Si se guarda aquí y no se remonta, se queda con
  // la vieja y cualquier botón suyo la vuelve a escribir encima.
  const [versionPanel, setVersionPanel] = useState(0);
  
  // Estados para el sistema de notificaciones
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Función para mostrar notificaciones
  const showNotification = (type: NotificationType, title: string, message?: string, duration: number = 4000) => {
    const id = Date.now().toString();
    const notification: Notification = { id, type, title, message, duration };

    setNotifications(prev => [...prev, notification]);

    // Auto-remover la notificación después del tiempo especificado
    setTimeout(() => {
      removeNotification(id);
    }, duration);
  };

  // Función para remover notificaciones
  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(notification => notification.id !== id));
  };

  // Componente de notificación individual
  const NotificationItem = ({ notification }: { notification: Notification }) => {
    const getIcon = () => {
      switch (notification.type) {
        case 'success':
          return <CheckCircle size={20} className="text-green-600" />;
        case 'info':
          return <Info size={20} className="text-blue-600" />;
        case 'warning':
          return <Info size={20} className="text-yellow-600" />;
        case 'error':
          return <X size={20} className="text-red-600" />;
        default:
          return <Info size={20} className="text-blue-600" />;
      }
    };

    const getBgColor = () => {
      switch (notification.type) {
        case 'success':
          return 'bg-green-50 border-green-200';
        case 'info':
          return 'bg-blue-50 border-blue-200';
        case 'warning':
          return 'bg-yellow-50 border-yellow-200';
        case 'error':
          return 'bg-red-50 border-red-200';
        default:
          return 'bg-blue-50 border-blue-200';
      }
    };

    return (
      <div className={`${getBgColor()} border rounded-lg p-4 shadow-lg transition-all duration-300 ease-in-out`}>
        <div className="flex items-start gap-3">
          {getIcon()}
          <div className="flex-1">
            <h4 className="font-medium text-continental-black">{notification.title}</h4>
            {notification.message && (
              <p className="text-sm text-continental-gray-1 mt-1">{notification.message}</p>
            )}
          </div>
          <button
            onClick={() => removeNotification(notification.id)}
            className="text-continental-gray-1 hover:text-continental-black transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    );
  };

  useEffect(() => {
    const loadConfig = async () => {
      setLoadingConfig(true);
      setConfigError(null);
      try {
        const cfg = await vacacionesService.getConfig();
        setConfig(cfg);
        setEditableConfig(editableDesde(cfg));
      } catch (e: any) {
        setConfigError(e?.message || 'Error cargando configuración');
      } finally {
        setLoadingConfig(false);
      }
    };
    loadConfig();
  }, []);

  const handleUpdateConfig = async () => {
    if (!editableConfig.porcentajeAusenciaMaximo || !editableConfig.periodoActual || !editableConfig.anioVigente) {
      showNotification('warning', 'Campos incompletos', 'Llena todos los campos antes de guardar.');
      return;
    }
    const anioVigenteNuevo = parseInt(editableConfig.anioVigente);
    // Vacío = no hay año en preparación.
    const anioPreparacionNuevo = editableConfig.anioProgramacionAnual.trim() === ''
      ? null
      : parseInt(editableConfig.anioProgramacionAnual);
    if (anioPreparacionNuevo != null && (isNaN(anioPreparacionNuevo) || anioPreparacionNuevo <= anioVigenteNuevo)) {
      showNotification('warning', 'Año en preparación inválido',
        `El año en preparación tiene que ser posterior al vigente (${anioVigenteNuevo}), o dejarse vacío.`);
      return;
    }

    // Periodo, año vigente y año en preparación deciden qué puede hacer TODA la
    // planta. Antes solo se cambiaban con los botones del panel o con una query
    // directa a la base; aquí se pueden corregir, pero con confirmación.
    if (config && (
      editableConfig.periodoActual !== config.periodoActual ||
      anioVigenteNuevo !== config.anioVigente ||
      anioPreparacionNuevo !== (config.anioProgramacionAnual ?? null)
    )) {
      const texto = (periodo: string, vigente: number, prep: number | null) =>
        `${NOMBRE_PERIODO[periodo] ?? periodo}, año vigente ${vigente}, ` +
        (prep != null ? `año en preparación ${prep}` : 'sin año en preparación');
      const efecto =
        editableConfig.periodoActual === 'Cerrado'
          ? 'Con el periodo Cerrado nadie puede capturar ni reprogramar.'
          : 'Reprogramación abierta' +
            (editableConfig.periodoActual === 'ProgramacionAnual' || anioPreparacionNuevo != null
              ? `; captura anual abierta (${anioPreparacionNuevo ?? anioVigenteNuevo}).`
              : '; captura anual cerrada.');
      const confirmado = window.confirm(
        `Vas a cambiar el estado de vacaciones de toda la planta.\n\n` +
        `Antes: ${texto(config.periodoActual, config.anioVigente, config.anioProgramacionAnual ?? null)}\n` +
        `Después: ${texto(editableConfig.periodoActual, anioVigenteNuevo, anioPreparacionNuevo)}\n\n` +
        `${efecto}\nNo se borra ninguna vacación, bloque ni solicitud.\n\n¿Guardar?`
      );
      if (!confirmado) return;
    }

    setSavingConfig(true);
    try {
      const payload = {
        porcentajeAusenciaMaximo: parseFloat(editableConfig.porcentajeAusenciaMaximo),
        periodoActual: editableConfig.periodoActual as VacacionesConfig['periodoActual'],
        anioVigente: anioVigenteNuevo,
        anioProgramacionAnual: anioPreparacionNuevo,
        // Vacío (o sin año en preparación) = ese año usa el porcentaje general.
        porcentajeAusenciaPreparacion:
          anioPreparacionNuevo == null || editableConfig.porcentajeAusenciaPreparacion.trim() === ''
            ? null
            : parseFloat(editableConfig.porcentajeAusenciaPreparacion)
      };
      const updated = await vacacionesService.updateConfig(payload);
      setConfig(updated);
      setEditableConfig(editableDesde(updated));
      setVersionPanel((v) => v + 1);
      showNotification('success', 'Configuración actualizada', 'La configuración de vacaciones se guardó correctamente.');
    } catch (e: any) {
      showNotification('error', 'Error al guardar', e?.message || 'No se pudo actualizar la configuración');
    } finally {
      setSavingConfig(false);
    }
  };

  return (
    <div className="p-6 bg-white min-h-screen flex flex-col overflow-hidden">
      <div className="max-w-7xl mx-auto w-full flex flex-col space-y-6">

        {/* Configuración Global de Vacaciones */}
        <div className="w-full border border-continental-gray-3 rounded-lg p-4 space-y-4 bg-white shadow-sm">
          <div className="flex flex-wrap gap-6 items-end">
            <div className="flex flex-col">
              <label className="text-xs font-medium text-continental-gray-1">Periodo actual</label>
              <select
                className="w-48 mt-1 h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                value={editableConfig.periodoActual}
                disabled={loadingConfig || savingConfig}
                onChange={(e) => setEditableConfig(prev => ({ ...prev, periodoActual: e.target.value }))}
              >
                <option value="ProgramacionAnual">Programación Anual</option>
                <option value="Reprogramacion">Reprogramación</option>
                <option value="Cerrado">Cerrado</option>
              </select>
            </div>
            <div className="flex flex-col">
              <label className="text-xs font-medium text-continental-gray-1">% Ausencia Máximo</label>
              <Input
                type="number"
                step="0.1"
                className="w-32 mt-1"
                value={editableConfig.porcentajeAusenciaMaximo}
                disabled={loadingConfig || savingConfig}
                onChange={(e) => setEditableConfig(prev => ({ ...prev, porcentajeAusenciaMaximo: e.target.value }))}
              />
            </div>
            <div className="flex flex-col">
              <label className="text-xs font-medium text-continental-gray-1">Año vigente (en curso)</label>
              <Input
                type="number"
                className="w-32 mt-1"
                value={editableConfig.anioVigente}
                disabled={loadingConfig || savingConfig}
                onChange={(e) => setEditableConfig(prev => ({ ...prev, anioVigente: e.target.value }))}
              />
              <span className="text-[11px] text-continental-gray-1 mt-1 max-w-[16rem]">
                Es el año que está corriendo, no el que se prepara. Para preparar el
                siguiente usa «Preparar programación anual» más abajo.
              </span>
            </div>
            <div className="flex flex-col">
              <label className="text-xs font-medium text-continental-gray-1">Año en preparación</label>
              <Input
                type="number"
                className="w-32 mt-1"
                placeholder="Ninguno"
                value={editableConfig.anioProgramacionAnual}
                disabled={loadingConfig || savingConfig}
                onChange={(e) => setEditableConfig(prev => ({ ...prev, anioProgramacionAnual: e.target.value }))}
              />
              <span className="text-[11px] text-continental-gray-1 mt-1 max-w-[16rem]">
                El año cuya captura anual corre junto con la reprogramación del vigente. Vacío = ninguno.
              </span>
            </div>
            {/* El año que se prepara puede necesitar otro porcentaje para poder
                repartir sus días; sin este campo, cambiarlo movía también el del
                año en curso. */}
            {editableConfig.anioProgramacionAnual.trim() !== '' && (
              <div className="flex flex-col">
                <label className="text-xs font-medium text-continental-gray-1">
                  % Ausencia Máximo {editableConfig.anioProgramacionAnual} (en preparación)
                </label>
                <Input
                  type="number"
                  step="0.1"
                  className="w-32 mt-1"
                  placeholder="Usa el general"
                  value={editableConfig.porcentajeAusenciaPreparacion}
                  disabled={loadingConfig || savingConfig}
                  onChange={(e) => setEditableConfig(prev => ({ ...prev, porcentajeAusenciaPreparacion: e.target.value }))}
                />
                <span className="text-[11px] text-continental-gray-1 mt-1 max-w-[16rem]">
                  Vacío = {editableConfig.anioProgramacionAnual} usa el porcentaje general.
                </span>
              </div>
            )}
            {config && (
              (editableConfig.porcentajeAusenciaMaximo !== config.porcentajeAusenciaMaximo.toString() ||
                editableConfig.porcentajeAusenciaPreparacion !== (config.porcentajeAusenciaPreparacion?.toString() ?? '') ||
                editableConfig.periodoActual !== config.periodoActual ||
                editableConfig.anioVigente !== config.anioVigente.toString() ||
                editableConfig.anioProgramacionAnual !== (config.anioProgramacionAnual?.toString() ?? '')) && (
                <div className="flex gap-2 ml-auto">
                  <Button
                    variant="outline"
                    disabled={loadingConfig || savingConfig}
                    onClick={() => {
                      setEditableConfig(editableDesde(config));
                    }}
                  >
                    Cancelar cambios
                  </Button>
                  <Button
                    variant="continental"
                    disabled={loadingConfig || savingConfig}
                    onClick={handleUpdateConfig}
                  >
                    {savingConfig ? 'Guardando...' : 'Guardar'}
                  </Button>
                </div>
              )
            )}
          </div>
          {configError && <p className="text-sm text-red-600">{configError}</p>}
          {config && (
            <p className="text-xs text-continental-gray-1">Última actualización: {new Date(config.updatedAt).toLocaleString()}</p>
          )}
        </div>

        {/* Tab Buttons */}
        <div className="bg-continental-gray-3 p-1 rounded-md w-full">
          <div className="flex w-full">
            <button
              onClick={() => setActiveTab('general')}
              className={`flex items-center justify-center gap-2 px-4 py-2 rounded-md transition-colors w-1/3 ${activeTab === 'general'
                ? 'bg-white text-continental-black shadow-sm'
                : 'bg-transparent text-continental-gray-1 hover:text-continental-black'
                }`}
            >
              <BarChart3 size={16} />
              <span>General</span>
            </button>
            <button
              onClick={() => setActiveTab('calendario')}
              className={`flex items-center justify-center gap-2 px-4 py-2 rounded-md transition-colors w-1/3 ${activeTab === 'calendario'
                ? 'bg-white text-continental-black shadow-sm'
                : 'bg-transparent text-continental-gray-1 hover:text-continental-black'
                }`}
            >
              <Calendar size={16} />
              <span>Calendario</span>
            </button>
            <button
              onClick={() => setActiveTab('edicion-dias')}
              className={`flex items-center justify-center gap-2 px-4 py-2 rounded-md transition-colors w-1/3 ${activeTab === 'edicion-dias'
                ? 'bg-white text-continental-black shadow-sm'
                : 'bg-transparent text-continental-gray-1 hover:text-continental-black'
                }`}
            >
              <CalendarDays size={16} />
              <span>Edición días empresa</span>
            </button>
          </div>
        </div>

        {/* Content based on active tab */}
        {activeTab === 'edicion-dias' && (
          <div className="p-4 bg-white border border-continental-gray-3 rounded-lg">
            <ConfigEdicionDias />
          </div>
        )}
        {activeTab === 'general' && (
          <VacacionesGeneral
            key={versionPanel}
            onNotification={showNotification}
            anioVigente={config?.anioVigente || new Date().getFullYear() + 1}
            onIrACalendario={() => setActiveTab('calendario')}
            onConfigUpdate={(updatedConfig) => {
              setConfig(updatedConfig);
              setEditableConfig(editableDesde(updatedConfig));
            }}
          />
        )}

        {activeTab === 'calendario' && (
          <VacacionesCalendario
            onNotification={showNotification}
            anioArranques={config?.anioProgramacionAnual ?? config?.anioVigente ?? null}
          />
        )}
      </div>

      {/* Sistema de Notificaciones */}
      {notifications.length > 0 && (
        <div className="fixed top-4 right-4 z-50 space-y-3 max-w-md">
          {notifications.map((notification) => (
            <NotificationItem key={notification.id} notification={notification} />
          ))}
        </div>
      )}
    </div>
  );
};