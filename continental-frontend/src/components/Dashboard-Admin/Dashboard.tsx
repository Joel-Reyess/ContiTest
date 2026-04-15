import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
    PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
    BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList
} from 'recharts';
import { ausenciasService } from '@/services/ausenciasService';
import { httpClient } from '@/services/httpClient';
import { areasService } from '@/services/areasService';
import type { AusenciasPorGrupo } from '@/interfaces/Ausencias.interface';
import type { Area } from '@/interfaces/Areas.interface';
import useAuth from '@/hooks/useAuth';
import { UserRole } from '@/interfaces/User.interface';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const COLORES_MOTIVOS: Record<string, string> = {
    Anual: '#22c55e',
    Reprogramacion: '#3b82f6',
    FestivoTrabajado: '#f59e0b',
    Permiso: '#a855f7',
    Incapacidad: '#ef4444',
    Vacacion: '#22c55e',
};

type AnualRow = { mes: number; totalEmpleados: number; vacacion: number; reprogramacion: number; festivoTrabajado: number; permiso: number; incapacidad: number };
type SemanalRow = { semana: number; totalEmpleados: number; vacacion: number; reprogramacion: number; festivoTrabajado: number; permiso: number; incapacidad: number };
type MotivoRow = { motivo: string; total: number };
type TiempoExtraRow = { semana: number; horasExtra: number; horasNormales: number; pctExtra: number };

// ── Tooltip personalizado para barras apiladas con porcentaje ──────────────
const TooltipBarras = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const totalAusentes = payload.reduce((sum: number, p: any) => sum + (p.value ?? 0), 0);
    const totalEmpleados = payload[0]?.payload?._totalEmpleados ?? totalAusentes;
    return (
        <div style={{
            background: 'white', border: '1px solid #e5e7eb', borderRadius: 8,
            padding: '10px 14px', fontSize: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
            <p style={{ fontWeight: 600, marginBottom: 6, color: '#111827' }}>{label}</p>
            {payload.map((p: any) => (
                <div key={p.dataKey} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 2 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#374151' }}>
                        <span style={{ width: 10, height: 10, borderRadius: 2, background: p.fill, display: 'inline-block' }} />
                        {p.name ?? p.dataKey}
                    </span>
                    <span style={{ fontWeight: 500, color: '#111827' }}>
                        {p.value} ({totalEmpleados > 0 ? ((p.value / totalEmpleados) * 100).toFixed(1) : 0}%)
                    </span>
                </div>
            ))}
            <div style={{ borderTop: '1px solid #f3f4f6', marginTop: 6, paddingTop: 6, display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: 12 }}>
                <span style={{ color: '#374151' }}>Total ausentes</span>
                <span style={{ color: '#111827' }}>{totalAusentes} / {totalEmpleados}</span>
            </div>
        </div>
    );
};

// ── Tooltip personalizado para pie con porcentaje ─────────────────────────
const TooltipPie = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const entry = payload[0];
    return (
        <div style={{
            background: 'white', border: '1px solid #e5e7eb', borderRadius: 8,
            padding: '8px 12px', fontSize: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: entry.payload.fill, display: 'inline-block' }} />
                <span style={{ fontWeight: 500, color: '#111827' }}>{entry.name}:</span>
                <span style={{ color: '#374151' }}>{entry.value} ({entry.payload.percent != null ? (entry.payload.percent * 100).toFixed(1) : 0}%)</span>
            </span>
        </div>
    );
};

// ── Tooltip para tiempo extra ─────────────────────────────────────────────
const TooltipTE = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div style={{
            background: 'white', border: '1px solid #e5e7eb', borderRadius: 8,
            padding: '10px 14px', fontSize: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
            <p style={{ fontWeight: 600, marginBottom: 6, color: '#111827' }}>Semana {label}</p>
            {payload.map((p: any) => (
                <div key={p.dataKey} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 2 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#374151' }}>
                        <span style={{ width: 10, height: 10, borderRadius: 2, background: p.fill, display: 'inline-block' }} />
                        {p.name}
                    </span>
                    <span style={{ fontWeight: 500, color: '#111827' }}>
                        {p.dataKey === 'pctExtra' ? `${p.value}%` : `${p.value} hrs`}
                    </span>
                </div>
            ))}
        </div>
    );
};

export const Dashboard: React.FC = () => {
    const { user, hasRole } = useAuth();
    const isAdmin = hasRole(UserRole.SUPER_ADMIN);

    // ── Modo de vista ─────────────────────────────────────────────────────────
    const [vistaMode, setVistaMode] = useState<'ausencias' | 'tiempoExtra'>('ausencias');

    // ── Filtros ──────────────────────────────────────────────────────────────
    const hoy = new Date();
    const [anioSel, setAnioSel] = useState(hoy.getFullYear());
    const [mesSel, setMesSel] = useState(hoy.getMonth() + 1);
    const [semanaSel, setSemanaSel] = useState<number | 'all'>('all');
    const [diaSel, setDiaSel] = useState<string>('');

    const [areaSelId, setAreaSelId] = useState<number | 'all'>(() =>
        !hasRole(UserRole.SUPER_ADMIN) && user?.area?.areaId
            ? user.area.areaId
            : 'all'
    );

    // ── Datos maestros ───────────────────────────────────────────────────────
    const [areas, setAreas] = useState<Area[]>([]);
    const [grupos, setGrupos] = useState<AusenciasPorGrupo[]>([]);
    const [anualData, setAnualData] = useState<AnualRow[]>([]);
    const [semanalData, setSemanalData] = useState<SemanalRow[]>([]);
    const [motivosData, setMotivosData] = useState<MotivoRow[]>([]);
    const [tiempoExtraData, setTiempoExtraData] = useState<TiempoExtraRow[]>([]);
    const [loadingTEAnual, setLoadingTEAnual] = useState(false);
    const [loadingHoy, setLoadingHoy] = useState(true);
    const [loadingHist, setLoadingHist] = useState(true);
    const [loadingTE, setLoadingTE] = useState(false);
    const [grupoExpandido, setGrupoExpandido] = useState<number | null>(null);

    const [tiempoExtraAnualData, setTiempoExtraAnualData] = useState<any[]>([]);

    // ── Cargar áreas ─────────────────────────────────────────────────────────
    useEffect(() => {
        areasService.getAreas()
            .then(resp => setAreas(Array.isArray(resp) ? resp : []))
            .catch(console.error);
    }, []);

    useEffect(() => {
        if (!isAdmin && user?.area?.areaId) {
            setAreaSelId(prev => prev === 'all' ? user.area.areaId : prev);
        }
    }, [isAdmin, user?.area?.areaId]);

    // ── Fecha efectiva ────────────────────────────────────────────────────────
    const fechaEfectiva = useMemo(() => {
        if (diaSel) return diaSel;
        if (semanaSel !== 'all') {
            const primerDia = (Number(semanaSel) - 1) * 7 + 1;
            const d = new Date(anioSel, mesSel - 1, Math.min(primerDia, 28));
            return d.toISOString().split('T')[0];
        }
        const esHoy = anioSel === hoy.getFullYear() && mesSel === hoy.getMonth() + 1;
        if (esHoy) return hoy.toISOString().split('T')[0];
        return `${anioSel}-${String(mesSel).padStart(2, '0')}-01`;
    }, [diaSel, semanaSel, anioSel, mesSel]);

    const buildAreaParam = useCallback((prefix = '&') =>
        areaSelId !== 'all' ? `${prefix}areaId=${areaSelId}` : ''
        , [areaSelId]);

    // ── Cargar datos del día ──────────────────────────────────────────────────
    useEffect(() => {
        setLoadingHoy(true);
        const fecha = new Date(fechaEfectiva + 'T00:00:00');
        ausenciasService.calcularAusenciasParaCalendario({
            fechaInicio: fecha,
            view: 'daily',
            areaId: areaSelId !== 'all' ? areaSelId : undefined,
        })
            .then(data => {
                const diaData = data.find(d => d.fecha === fechaEfectiva);
                setGrupos(diaData?.ausenciasPorGrupo ?? []);
            })
            .catch(console.error)
            .finally(() => setLoadingHoy(false));
    }, [fechaEfectiva, areaSelId]);

    // ── Cargar datos históricos ───────────────────────────────────────────────
    useEffect(() => {
        setLoadingHist(true);
        const areaParam = buildAreaParam();
        Promise.all([
            httpClient.get<any>(`/api/dashboard/ausencias-anuales?anio=${anioSel}${areaParam}`),
            httpClient.get<any>(`/api/dashboard/ausencias-semanales?anio=${anioSel}&mes=${mesSel}${areaParam}`),
            httpClient.get<any>(`/api/dashboard/ausencias-motivos?fecha=${anioSel}-${String(mesSel).padStart(2, '0')}-01&fechaFin=${anioSel}-${String(mesSel).padStart(2, '0')}-${String(new Date(anioSel, mesSel, 0).getDate()).padStart(2, '0')}${areaParam}`),
        ])
            .then(([anual, semanal, motivos]) => {
                setAnualData(anual?.data ?? anual ?? []);
                setSemanalData(semanal?.data ?? semanal ?? []);
                setMotivosData(motivos?.data ?? motivos ?? []);
            })
            .catch(console.error)
            .finally(() => setLoadingHist(false));
    }, [anioSel, mesSel, fechaEfectiva, buildAreaParam]);

    // ── Cargar datos de tiempo extra ──────────────────────────────────────────
    // Reemplaza el useEffect de tiempo extra completo por este:
    useEffect(() => {
        if (vistaMode !== 'tiempoExtra') return;
        const areaParam = buildAreaParam();

        setLoadingTE(true);
        httpClient.get<any>(`/api/dashboard/resumen-tiempo-extra-semanal-v2?anio=${anioSel}&mes=${mesSel}${areaParam}`)
            .then(data => setTiempoExtraData(data?.data ?? data ?? []))
            .catch(console.error)
            .finally(() => setLoadingTE(false));

        setLoadingTEAnual(true);
        httpClient.get<any>(`/api/dashboard/resumen-tiempo-extra-anual?anio=${anioSel}${areaParam}`)
            .then(data => setTiempoExtraAnualData(data?.data ?? data ?? []))
            .catch(console.error)
            .finally(() => setLoadingTEAnual(false));
    }, [vistaMode, anioSel, mesSel, buildAreaParam]);

    const tiempoExtraForChart = useMemo(() => {
        const seen = new Set<number>();
        return tiempoExtraData
            .map(r => ({
                ...r,
                semanaLabel: `Sem ${(r as any).semanaAnual ?? r.semana}` // Sem 14, 15...
            }))
            .filter(r => {
                if (seen.has(r.semana)) return false;
                seen.add(r.semana);
                return true;
            });
    }, [tiempoExtraData]);

    // ── Datos derivados para gráficas ────────────────────────────────────────
    const anualForChart = useMemo(() => anualData.map(r => ({
        name: MESES[r.mes - 1],
        _totalEmpleados: r.totalEmpleados,
        Vacación: r.vacacion,
        Reprogramación: r.reprogramacion,
        'Festivo Trab.': r.festivoTrabajado,
        Permiso: r.permiso,
        Incapacidad: r.incapacidad,
        _total: r.vacacion + r.reprogramacion + r.festivoTrabajado + r.permiso + r.incapacidad,
    })), [anualData]);

    const semanalForChart = useMemo(() => {
        const rows = semanaSel !== 'all'
            ? semanalData.filter(r => r.semana === Number(semanaSel))
            : semanalData;
        return rows.map(r => {
            const primerDia = (r.semana - 1) * 7 + 1;
            const fecha = new Date(anioSel, mesSel - 1, Math.min(primerDia, 28));
            const startOfYear = new Date(fecha.getFullYear(), 0, 1);
            const weekNum = Math.ceil(((fecha.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
            return ({
                name: `Sem ${weekNum}`,
                _totalEmpleados: r.totalEmpleados,
                Vacación: r.vacacion,
                Reprogramación: r.reprogramacion,
                'Festivo Trab.': r.festivoTrabajado,
                Permiso: r.permiso,
                Incapacidad: r.incapacidad,
                _total: r.vacacion + r.reprogramacion + r.festivoTrabajado + r.permiso + r.incapacidad,
            });
        });
    }, [semanalData, semanaSel, anioSel, mesSel]);

    const motivosPie = useMemo(() => {
        const total = motivosData.reduce((s, m) => s + m.total, 0);
        return motivosData.map(m => ({
            name: m.motivo,
            value: m.total,
            percent: total > 0 ? m.total / total : 0,
            fill: COLORES_MOTIVOS[m.motivo] ?? '#6b7280',
        }));
    }, [motivosData]);

    const gruposUnicos = useMemo(() => {
        if (areaSelId !== 'all') {
            // Con área seleccionada: deduplicar por grupoId
            const map = new Map<number, AusenciasPorGrupo>();
            grupos.forEach(g => {
                if (!map.has(g.grupoId)) map.set(g.grupoId, g);
            });
            return Array.from(map.values());
        }

        // Sin área (todas): agrupar por nombreGrupo y sumar
        const map = new Map<string, AusenciasPorGrupo>();
        grupos.forEach(g => {
            const key = g.nombreGrupo;
            if (!map.has(key)) {
                map.set(key, {
                    ...g,
                    empleadosAusentes: [...(g.empleadosAusentes ?? [])],
                    empleadosDisponibles: [...(g.empleadosDisponibles ?? [])],
                });
            } else {
                const existing = map.get(key)!;
                existing.personalTotal += g.personalTotal;
                existing.personalDisponible += g.personalDisponible;
                existing.personalNoDisponible += g.personalNoDisponible;
                existing.porcentajeAusencia = existing.personalTotal > 0
                    ? (existing.personalNoDisponible / existing.personalTotal) * 100
                    : 0;
                existing.excedeLimite = existing.excedeLimite || g.excedeLimite;
                existing.empleadosAusentes = [
                    ...(existing.empleadosAusentes ?? []),
                    ...(g.empleadosAusentes ?? []),
                ];
                existing.empleadosDisponibles = [
                    ...(existing.empleadosDisponibles ?? []),
                    ...(g.empleadosDisponibles ?? []),
                ];
            }
        });
        return Array.from(map.values());
    }, [grupos, areaSelId]);

    // Total ausentes del mes seleccionado (desde anualData)
    const totalesMes = useMemo(() => {
        const mesRow = anualData.find(r => r.mes === mesSel);
        if (!mesRow) return { disponible: 0, ausente: 0, total: 0 };
        const ausente = mesRow.vacacion + mesRow.reprogramacion + mesRow.festivoTrabajado + mesRow.permiso + mesRow.incapacidad;
        return {
            ausente,
            total: mesRow.totalEmpleados,
            disponible: Math.max(0, mesRow.totalEmpleados - ausente),
        };
    }, [anualData, mesSel]);

    // Para el pie del día (tabla de grupos sigue usando el snapshot diario)
    const totales = useMemo(() => gruposUnicos.reduce(
        (acc, g) => ({ disponible: acc.disponible + g.personalDisponible, ausente: acc.ausente + g.personalNoDisponible }),
        { disponible: 0, ausente: 0 }
    ), [gruposUnicos]);

    const totalPersonal = totalesMes.total > 0 ? totalesMes.total : (totales.disponible + totales.ausente);
    const ausentesPie = totalesMes.total > 0 ? totalesMes.ausente : totales.ausente;
    const disponiblesPie = totalesMes.total > 0 ? totalesMes.disponible : totales.disponible;

    const piePersonal = [
        { name: 'Disponible', value: disponiblesPie, percent: totalPersonal > 0 ? disponiblesPie / totalPersonal : 0, fill: '#22c55e' },
        { name: 'Ausente', value: ausentesPie, percent: totalPersonal > 0 ? ausentesPie / totalPersonal : 0, fill: '#ef4444' },
    ];

    const diasDelMes = useMemo(() => {
        const total = new Date(anioSel, mesSel, 0).getDate();
        return Array.from({ length: total }, (_, i) => {
            const d = i + 1;
            return `${anioSel}-${String(mesSel).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        });
    }, [anioSel, mesSel]);

    const labelPeriodo = useMemo(() => {
        if (diaSel) return diaSel;
        if (semanaSel !== 'all') return `Sem ${semanaSel} — ${MESES[mesSel - 1]} ${anioSel}`;
        return `${MESES[mesSel - 1]} ${anioSel}`;
    }, [diaSel, semanaSel, mesSel, anioSel]);

    const stackedBarProps = { stackId: 'a' as const };

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="p-6 space-y-6 bg-gray-50 min-h-screen">

            {/* HEADER + FILTROS */}
            <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
                <h1 className="text-xl font-bold text-gray-900">Dashboard de Ausencias</h1>

                <div className="flex flex-wrap items-end gap-4">

                    {/* Toggle Vista */}
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-gray-500">Vista</label>
                        <div className="flex rounded border border-gray-300 overflow-hidden text-sm">
                            <button
                                onClick={() => setVistaMode('ausencias')}
                                className={`px-3 py-1.5 transition-colors ${vistaMode === 'ausencias' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                            >
                                Ausencias
                            </button>
                            <button
                                onClick={() => setVistaMode('tiempoExtra')}
                                className={`px-3 py-1.5 transition-colors border-l border-gray-300 ${vistaMode === 'tiempoExtra' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                            >
                                Tiempo Extra
                            </button>
                        </div>
                    </div>

                    {isAdmin && (
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-medium text-gray-500">Área</label>
                            <select
                                value={areaSelId}
                                onChange={e => {
                                    setAreaSelId(e.target.value === 'all' ? 'all' : Number(e.target.value));
                                    setGrupoExpandido(null);
                                }}
                                className="border border-gray-300 rounded px-2 py-1.5 text-sm min-w-[160px]"
                            >
                                <option value="all">Todas las áreas</option>
                                {areas.map(a => (
                                    <option key={a.areaId} value={a.areaId}>{a.nombreGeneral}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-gray-500">Año</label>
                        <select
                            value={anioSel}
                            onChange={e => { setAnioSel(Number(e.target.value)); setDiaSel(''); }}
                            className="border border-gray-300 rounded px-2 py-1.5 text-sm"
                        >
                            {[0, 1, 2].map(i => {
                                const y = hoy.getFullYear() - i;
                                return <option key={y} value={y}>{y}</option>;
                            })}
                        </select>
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-gray-500">Mes</label>
                        <select
                            value={mesSel}
                            onChange={e => { setMesSel(Number(e.target.value)); setSemanaSel('all'); setDiaSel(''); }}
                            className="border border-gray-300 rounded px-2 py-1.5 text-sm"
                        >
                            {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                        </select>
                    </div>

                    {/* Solo mostrar filtros de semana/día en modo ausencias */}
                    {vistaMode === 'ausencias' && (
                        <>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-medium text-gray-500">Semana</label>
                                <select
                                    value={semanaSel}
                                    onChange={e => { setSemanaSel(e.target.value === 'all' ? 'all' : Number(e.target.value)); setDiaSel(''); }}
                                    className="border border-gray-300 rounded px-2 py-1.5 text-sm"
                                >
                                    <option value="all">Todas</option>
                                    {[1, 2, 3, 4, 5].map(s => <option key={s} value={s}>Semana {s}</option>)}
                                </select>
                            </div>

                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-medium text-gray-500">Día específico</label>
                                <select
                                    value={diaSel}
                                    onChange={e => setDiaSel(e.target.value)}
                                    className="border border-gray-300 rounded px-2 py-1.5 text-sm"
                                >
                                    <option value="">— Sin filtro —</option>
                                    {diasDelMes.map(d => (
                                        <option key={d} value={d}>
                                            {new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' })}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </>
                    )}

                    <button
                        onClick={() => {
                            setAnioSel(hoy.getFullYear());
                            setMesSel(hoy.getMonth() + 1);
                            setSemanaSel('all');
                            setDiaSel('');
                            if (isAdmin) setAreaSelId('all');
                        }}
                        className="text-xs text-blue-600 hover:underline pb-1"
                    >
                        Limpiar filtros
                    </button>
                </div>

                <p className="text-xs text-gray-400">
                    Mostrando datos para: <span className="font-medium text-gray-600">{labelPeriodo}</span>
                    {areaSelId !== 'all' && (
                        <span> · Área: <span className="font-medium text-gray-600">
                            {areas.find(a => a.areaId === areaSelId)?.nombreGeneral ?? areaSelId}
                        </span></span>
                    )}
                    {vistaMode === 'tiempoExtra' && (
                        <span className="ml-2 inline-flex items-center gap-1 text-amber-600 font-medium">
                            · Vista: Tiempo Extra
                        </span>
                    )}
                </p>
            </div>

            {/* ── VISTA AUSENCIAS ─────────────────────────────────────────────────── */}
            {vistaMode === 'ausencias' && (
                <>
                    {/* GRÁFICA ANUAL */}
                    <div className="bg-white border border-gray-200 rounded-lg p-6">
                        <h2 className="text-base font-semibold text-gray-700 mb-4">
                            Ausencias por mes — {anioSel}
                            {areaSelId !== 'all' && (
                                <span className="ml-2 text-sm font-normal text-gray-400">
                                    · {areas.find(a => a.areaId === areaSelId)?.nombreGeneral}
                                </span>
                            )}
                        </h2>
                        {loadingHist ? (
                            <div className="flex items-center justify-center h-[280px] text-gray-400 text-sm">Cargando...</div>
                        ) : (
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={anualForChart} margin={{ top: 20, right: 16, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                                    <Tooltip content={<TooltipBarras />} />
                                    <Legend />
                                    <Bar dataKey="Vacación" {...stackedBarProps} fill="#22c55e" />
                                    <Bar dataKey="Reprogramación" {...stackedBarProps} fill="#3b82f6" />
                                    <Bar dataKey="Festivo Trab." {...stackedBarProps} fill="#f59e0b" />
                                    <Bar dataKey="Permiso" {...stackedBarProps} fill="#a855f7" />
                                    <Bar dataKey="Incapacidad" {...stackedBarProps} fill="#ef4444">
                                        <LabelList
                                            dataKey="_total"
                                            position="top"
                                            style={{ fontSize: 11, fill: '#6b7280', fontWeight: 500 }}
                                            formatter={(v: number) => v > 0 ? v : ''}
                                        />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>

                    {/* FILA: Pasteles */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                        {/* Personal disponible vs ausente */}
                        <div className="bg-white border border-gray-200 rounded-lg p-6">
                            <h2 className="text-base font-semibold text-gray-700 mb-1">
                                Personal — {labelPeriodo}
                            </h2>
                            <p className="text-xs text-gray-400 mb-2">{totalPersonal} empleados en total</p>

                            {!loadingHoy && (
                                <div className="flex gap-4 mb-4">
                                    <div className="flex-1 bg-green-50 rounded-lg p-3 text-center">
                                        <p className="text-xs text-green-600 font-medium">Disponibles</p>
                                        <p className="text-2xl font-bold text-green-700">{disponiblesPie}</p>
                                        <p className="text-xs text-green-500">
                                            {totalPersonal > 0 ? ((disponiblesPie / totalPersonal) * 100).toFixed(1) : 0}%
                                        </p>
                                    </div>
                                    <div className="flex-1 bg-red-50 rounded-lg p-3 text-center">
                                        <p className="text-xs text-red-600 font-medium">Ausentes</p>
                                        <p className="text-2xl font-bold text-red-700">{ausentesPie}</p>
                                        <p className="text-xs text-red-500">
                                            {totalPersonal > 0 ? ((ausentesPie / totalPersonal) * 100).toFixed(1) : 0}%
                                        </p>
                                    </div>
                                </div>
                            )}

                            {loadingHoy ? (
                                <div className="flex items-center justify-center h-[200px] text-gray-400 text-sm">Cargando...</div>
                            ) : (
                                <ResponsiveContainer width="100%" height={200}>
                                    <PieChart>
                                        <Pie
                                            data={piePersonal}
                                            dataKey="value"
                                            nameKey="name"
                                            cx="50%" cy="50%"
                                            outerRadius={75}
                                            label={({ name, value, percent }) =>
                                                `${name}: ${value} (${(percent * 100).toFixed(1)}%)`
                                            }
                                            labelLine={false}
                                        >
                                            {piePersonal.map((entry, i) => (
                                                <Cell key={i} fill={entry.fill} />
                                            ))}
                                        </Pie>
                                        <Tooltip content={<TooltipPie />} />
                                    </PieChart>
                                </ResponsiveContainer>
                            )}
                        </div>

                        {/* Motivos de ausencia */}
                        <div className="bg-white border border-gray-200 rounded-lg p-6">
                            <h2 className="text-base font-semibold text-gray-700 mb-1">
                                Motivos de ausencia — {labelPeriodo}
                            </h2>
                            <p className="text-xs text-gray-400 mb-4">Distribución por tipo de ausencia</p>
                            {loadingHist ? (
                                <div className="flex items-center justify-center h-[240px] text-gray-400 text-sm">Cargando...</div>
                            ) : motivosPie.length === 0 ? (
                                <div className="flex items-center justify-center h-[240px] text-gray-400 text-sm">Sin ausencias</div>
                            ) : (
                                <ResponsiveContainer width="100%" height={240}>
                                    <PieChart>
                                        <Pie
                                            data={motivosPie}
                                            dataKey="value"
                                            nameKey="name"
                                            cx="50%" cy="50%"
                                            outerRadius={85}
                                            label={({ name, value, percent }) =>
                                                `${name}: ${value} (${(percent * 100).toFixed(1)}%)`
                                            }
                                            labelLine
                                        >
                                            {motivosPie.map((entry, i) => (
                                                <Cell key={i} fill={entry.fill} />
                                            ))}
                                        </Pie>
                                        <Tooltip content={<TooltipPie />} />
                                        <Legend />
                                    </PieChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </div>

                    {/* FILA: Semanal + Tabla */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                        {/* Semanal */}
                        <div className="bg-white border border-gray-200 rounded-lg p-6">
                            <h2 className="text-base font-semibold text-gray-700 mb-4">
                                Ausencias por semana — {MESES[mesSel - 1]} {anioSel}
                                {semanaSel !== 'all' && <span className="text-gray-400 text-sm ml-1">(Sem {semanaSel})</span>}
                                {areaSelId !== 'all' && (
                                    <span className="ml-2 text-sm font-normal text-gray-400">
                                        · {areas.find(a => a.areaId === areaSelId)?.nombreGeneral}
                                    </span>
                                )}
                            </h2>
                            {loadingHist ? (
                                <div className="flex items-center justify-center h-[240px] text-gray-400 text-sm">Cargando...</div>
                            ) : semanalForChart.length === 0 ? (
                                <div className="flex items-center justify-center h-[240px] text-gray-400 text-sm">Sin datos</div>
                            ) : (
                                <ResponsiveContainer width="100%" height={260}>
                                    <BarChart data={semanalForChart} margin={{ top: 20, right: 16, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                                        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                                        <Tooltip content={<TooltipBarras />} />
                                        <Legend />
                                        <Bar dataKey="Vacación" {...stackedBarProps} fill="#22c55e" />
                                        <Bar dataKey="Reprogramación" {...stackedBarProps} fill="#3b82f6" />
                                        <Bar dataKey="Festivo Trab." {...stackedBarProps} fill="#f59e0b" />
                                        <Bar dataKey="Permiso" {...stackedBarProps} fill="#a855f7" />
                                        <Bar dataKey="Incapacidad" {...stackedBarProps} fill="#ef4444">
                                            <LabelList
                                                dataKey="_total"
                                                position="top"
                                                style={{ fontSize: 11, fill: '#6b7280', fontWeight: 500 }}
                                                formatter={(v: number) => v > 0 ? v : ''}
                                            />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </div>

                        {/* Tabla resumen expandible */}
                        <div className="bg-white border border-gray-200 rounded-lg p-6">
                            <h2 className="text-base font-semibold text-gray-700 mb-4">
                                Detalle por grupo — {labelPeriodo}
                            </h2>
                            {loadingHoy ? (
                                <div className="flex items-center justify-center h-[240px] text-gray-400 text-sm">Cargando...</div>
                            ) : (
                                <div className="overflow-auto max-h-[380px]">
                                    <table className="w-full text-sm">
                                        <thead className="sticky top-0 bg-white">
                                            <tr className="bg-gray-50 text-gray-600">
                                                <th className="text-left px-3 py-2">Grupo</th>
                                                <th className="text-center px-3 py-2">Total</th>
                                                <th className="text-center px-3 py-2">Disp.</th>
                                                <th className="text-center px-3 py-2">Aus.</th>
                                                <th className="text-center px-3 py-2">%</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {gruposUnicos.map(g => (
                                                <React.Fragment key={g.grupoId}>
                                                    <tr
                                                        className={`border-t cursor-pointer hover:bg-gray-50 transition-colors
                                                            ${g.excedeLimite ? 'bg-red-50' : ''}
                                                            ${grupoExpandido === g.grupoId ? 'bg-blue-50' : ''}`}
                                                        onClick={() => setGrupoExpandido(p => p === g.grupoId ? null : g.grupoId)}
                                                    >
                                                        <td className="px-3 py-2 font-medium">
                                                            <span className="text-gray-400 text-xs mr-1">
                                                                {grupoExpandido === g.grupoId ? '▼' : '▶'}
                                                            </span>
                                                            {g.nombreGrupo}
                                                        </td>
                                                        <td className="px-3 py-2 text-center">{g.personalTotal}</td>
                                                        <td className="px-3 py-2 text-center text-green-600">{g.personalDisponible}</td>
                                                        <td className="px-3 py-2 text-center text-red-600">{g.personalNoDisponible}</td>
                                                        <td className={`px-3 py-2 text-center font-semibold ${g.excedeLimite ? 'text-red-600' : 'text-gray-700'}`}>
                                                            {g.porcentajeAusencia.toFixed(1)}%
                                                            {g.excedeLimite && <span className="ml-1">⚠️</span>}
                                                        </td>
                                                    </tr>

                                                    {grupoExpandido === g.grupoId && (
                                                        <tr>
                                                            <td colSpan={5} className="px-4 py-3 bg-gray-50 border-b">
                                                                {g.empleadosAusentes?.length > 0 ? (
                                                                    <>
                                                                        <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
                                                                            Empleados ausentes ({g.personalNoDisponible})
                                                                        </p>
                                                                        <table className="w-full text-xs mb-3">
                                                                            <thead>
                                                                                <tr className="text-gray-400">
                                                                                    <th className="text-left py-1 pr-3">Nombre</th>
                                                                                    <th className="text-left py-1 pr-3">Nómina</th>
                                                                                    <th className="text-left py-1 pr-3">Motivo</th>
                                                                                    <th className="text-left py-1">Subtipo</th>
                                                                                </tr>
                                                                            </thead>
                                                                            <tbody>
                                                                                {g.empleadosAusentes.map(emp => (
                                                                                    <tr key={emp.empleadoId} className="border-t border-gray-200">
                                                                                        <td className="py-1 pr-3 font-medium text-gray-800">{emp.nombreCompleto}</td>
                                                                                        <td className="py-1 pr-3 text-gray-500">{emp.nomina ?? '—'}</td>
                                                                                        <td className="py-1 pr-3">
                                                                                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${emp.tipoAusencia === 'Vacacion' ? 'bg-green-100 text-green-700'
                                                                                                    : emp.tipoAusencia === 'Reprogramacion' ? 'bg-blue-100 text-blue-700'
                                                                                                        : emp.tipoAusencia === 'Incapacidad' ? 'bg-red-100 text-red-700'
                                                                                                            : emp.tipoAusencia === 'Permiso' ? 'bg-purple-100 text-purple-700'
                                                                                                                : emp.tipoAusencia === 'Festivo Trabajado' ? 'bg-yellow-100 text-yellow-700'
                                                                                                                    : 'bg-gray-100 text-gray-700'
                                                                                                }`}>
                                                                                                {emp.tipoAusencia}
                                                                                            </span>
                                                                                        </td>
                                                                                        <td className="py-1 text-gray-400">{emp.tipoVacacion ?? '—'}</td>
                                                                                    </tr>
                                                                                ))}
                                                                            </tbody>
                                                                        </table>
                                                                    </>
                                                                ) : (
                                                                    <p className="text-xs text-gray-400 mb-3">Sin empleados ausentes</p>
                                                                )}

                                                                {g.empleadosDisponibles && g.empleadosDisponibles.length > 0 && (
                                                                    <div className="pt-2 border-t border-gray-200">
                                                                        <p className="text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
                                                                            Disponibles ({g.personalDisponible})
                                                                        </p>
                                                                        <div className="flex flex-wrap gap-1">
                                                                            {g.empleadosDisponibles.map(emp => (
                                                                                <span key={emp.empleadoId}
                                                                                    className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded">
                                                                                    {emp.nombreCompleto}
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    )}
                                                </React.Fragment>
                                            ))}

                                            {gruposUnicos.length === 0 && (
                                                <tr>
                                                    <td colSpan={5} className="px-3 py-8 text-center text-gray-400">
                                                        Sin datos para el periodo seleccionado
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}

            {/* ── VISTA TIEMPO EXTRA ──────────────────────────────────────────────── */}
            {vistaMode === 'tiempoExtra' && (
                <>

                    {/* GRÁFICA: Horas normales vs horas extra por mes (anual) */}
                    <div className="bg-white border border-gray-200 rounded-lg p-6">
                        <h2 className="text-base font-semibold text-gray-700 mb-1">
                            Horas normales vs tiempo extra por mes — {anioSel}
                        </h2>
                        <p className="text-xs text-gray-400 mb-4">
                            Resumen anual basado en déficit de manning
                            {areaSelId !== 'all' && (
                                <span> · {areas.find(a => a.areaId === areaSelId)?.nombreGeneral}</span>
                            )}
                        </p>
                        {loadingTEAnual ? (
                            <div className="flex items-center justify-center h-[280px] text-gray-400 text-sm">Cargando...</div>
                        ) : tiempoExtraAnualData.length === 0 ? (
                            <div className="flex items-center justify-center h-[280px] text-gray-400 text-sm">Sin datos</div>
                        ) : (
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart
                                    data={tiempoExtraAnualData.map((r: any) => ({
                                        ...r,
                                        name: MESES[r.mes - 1]
                                    }))}
                                    margin={{ top: 20, right: 16, left: 0, bottom: 0 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }}
                                        label={{ value: 'Horas', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }} />
                                    <Tooltip content={<TooltipTE />} />
                                    <Legend />
                                    <Bar dataKey="horasNormales" name="Horas normales" fill="#22c55e">
                                        <LabelList
                                            dataKey="horasNormales"
                                            position="inside"
                                            style={{ fontSize: 10, fill: '#fff', fontWeight: 500 }}
                                            formatter={(v: number) => v > 0 ? v : ''}
                                        />
                                    </Bar>
                                    <Bar dataKey="horasExtra" name="Horas extra" fill="#ef4444">
                                        <LabelList
                                            dataKey="horasExtra"
                                            position="top"
                                            style={{ fontSize: 11, fill: '#6b7280', fontWeight: 500 }}
                                            formatter={(v: number) => v > 0 ? v : ''}
                                        />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>

                    {/* GRÁFICA: Horas normales vs horas extra por semana */}
                    <div className="bg-white border border-gray-200 rounded-lg p-6">
                        <h2 className="text-base font-semibold text-gray-700 mb-1">
                            Horas normales vs tiempo extra por semana — {MESES[mesSel - 1]} {anioSel}
                        </h2>
                        <p className="text-xs text-gray-400 mb-4">
                            Basado en déficit de manning por día respecto al personal disponible
                            {areaSelId !== 'all' && (
                                <span> · {areas.find(a => a.areaId === areaSelId)?.nombreGeneral}</span>
                            )}
                        </p>
                        {loadingTE ? (
                            <div className="flex items-center justify-center h-[280px] text-gray-400 text-sm">Cargando...</div>
                        ) : tiempoExtraData.length === 0 ? (
                            <div className="flex items-center justify-center h-[280px] text-gray-400 text-sm">Sin datos</div>
                        ) : (
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={tiempoExtraForChart} margin={{ top: 20, right: 16, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis dataKey="semanaLabel" tick={{ fontSize: 12 }} />
                                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} label={{ value: 'Horas', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }} />
                                    <Tooltip content={<TooltipTE />} />
                                    <Legend />
                                    <Bar dataKey="horasNormales" name="Horas normales" fill="#22c55e">
                                        <LabelList
                                            dataKey="horasNormales"
                                            position="inside"
                                            style={{ fontSize: 10, fill: '#fff', fontWeight: 500 }}
                                            formatter={(v: number) => v > 0 ? v : ''}
                                        />
                                    </Bar>
                                    <Bar dataKey="horasExtra" name="Horas extra" fill="#ef4444">
                                        <LabelList
                                            dataKey="horasExtra"
                                            position="top"
                                            style={{ fontSize: 11, fill: '#6b7280', fontWeight: 500 }}
                                            formatter={(v: number) => v > 0 ? v : ''}
                                        />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>

                    {/* GRÁFICA: % de tiempo extra por semana */}
                    <div className="bg-white border border-gray-200 rounded-lg p-6">
                        <h2 className="text-base font-semibold text-gray-700 mb-1">
                            % Tiempo extra por semana — {MESES[mesSel - 1]} {anioSel}
                        </h2>
                        <p className="text-xs text-gray-400 mb-4">
                            Porcentaje de horas extra respecto a horas normales disponibles
                            {areaSelId !== 'all' && (
                                <span> · {areas.find(a => a.areaId === areaSelId)?.nombreGeneral}</span>
                            )}
                        </p>
                        {loadingTE ? (
                            <div className="flex items-center justify-center h-[260px] text-gray-400 text-sm">Cargando...</div>
                        ) : tiempoExtraData.length === 0 ? (
                            <div className="flex items-center justify-center h-[260px] text-gray-400 text-sm">Sin datos</div>
                        ) : (
                            <ResponsiveContainer width="100%" height={260}>
                                <BarChart data={tiempoExtraForChart} margin={{ top: 20, right: 16, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="semanaLabel" tick={{ fontSize: 12 }} />
                                    <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 12 }} />
                                    <Tooltip content={<TooltipTE />} />
                                    <Legend />
                                    <Bar dataKey="pctExtra" name="% Tiempo extra" fill="#f59e0b">
                                        <LabelList
                                            dataKey="pctExtra"
                                            position="top"
                                            style={{ fontSize: 11, fill: '#6b7280', fontWeight: 500 }}
                                            formatter={(v: number) => v > 0 ? `${v}%` : ''}
                                        />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>


                    {/* TABLA: Detalle por grupo — Tiempo Extra */}
                    <div className="bg-white border border-gray-200 rounded-lg p-6">
                        <h2 className="text-base font-semibold text-gray-700 mb-4">
                            Detalle por grupo — {MESES[mesSel - 1]} {anioSel}
                        </h2>
                        {loadingHoy ? (
                            <div className="flex items-center justify-center h-[240px] text-gray-400 text-sm">Cargando...</div>
                        ) : (
                            <div className="overflow-auto max-h-[380px]">
                                <table className="w-full text-sm">
                                    <thead className="sticky top-0 bg-white">
                                        <tr className="bg-gray-50 text-gray-600">
                                            <th className="text-left px-3 py-2">Grupo</th>
                                            <th className="text-center px-3 py-2">Total</th>
                                            <th className="text-center px-3 py-2">Disp.</th>
                                            <th className="text-center px-3 py-2">Aus.</th>
                                            <th className="text-center px-3 py-2">%</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {grupos.map(g => (
                                            <React.Fragment key={g.grupoId}>
                                                <tr
                                                    className={`border-t cursor-pointer hover:bg-gray-50 transition-colors
                                    ${g.excedeLimite ? 'bg-red-50' : ''}
                                    ${grupoExpandido === g.grupoId ? 'bg-blue-50' : ''}`}
                                                    onClick={() => setGrupoExpandido(p => p === g.grupoId ? null : g.grupoId)}
                                                >
                                                    <td className="px-3 py-2 font-medium">
                                                        <span className="text-gray-400 text-xs mr-1">
                                                            {grupoExpandido === g.grupoId ? '▼' : '▶'}
                                                        </span>
                                                        {g.nombreGrupo}
                                                    </td>
                                                    <td className="px-3 py-2 text-center">{g.personalTotal}</td>
                                                    <td className="px-3 py-2 text-center text-green-600">{g.personalDisponible}</td>
                                                    <td className="px-3 py-2 text-center text-red-600">{g.personalNoDisponible}</td>
                                                    <td className={`px-3 py-2 text-center font-semibold ${g.excedeLimite ? 'text-red-600' : 'text-gray-700'}`}>
                                                        {g.porcentajeAusencia.toFixed(1)}%
                                                        {g.excedeLimite && <span className="ml-1">⚠️</span>}
                                                    </td>
                                                </tr>
                                                {grupoExpandido === g.grupoId && (
                                                    <tr>
                                                        <td colSpan={5} className="px-4 py-3 bg-gray-50 border-b">
                                                            {/* mismo contenido expandible que en vista ausencias */}
                                                            {g.empleadosAusentes?.length > 0 ? (
                                                                <>
                                                                    <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
                                                                        Empleados ausentes ({g.personalNoDisponible})
                                                                    </p>
                                                                    <table className="w-full text-xs mb-3">
                                                                        <thead>
                                                                            <tr className="text-gray-400">
                                                                                <th className="text-left py-1 pr-3">Nombre</th>
                                                                                <th className="text-left py-1 pr-3">Nómina</th>
                                                                                <th className="text-left py-1 pr-3">Motivo</th>
                                                                                <th className="text-left py-1">Subtipo</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            {g.empleadosAusentes.map(emp => (
                                                                                <tr key={emp.empleadoId} className="border-t border-gray-200">
                                                                                    <td className="py-1 pr-3 font-medium text-gray-800">{emp.nombreCompleto}</td>
                                                                                    <td className="py-1 pr-3 text-gray-500">{emp.nomina ?? '—'}</td>
                                                                                    <td className="py-1 pr-3">
                                                                                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${emp.tipoAusencia === 'Vacacion' ? 'bg-green-100 text-green-700'
                                                                                                : emp.tipoAusencia === 'Reprogramacion' ? 'bg-blue-100 text-blue-700'
                                                                                                    : emp.tipoAusencia === 'Incapacidad' ? 'bg-red-100 text-red-700'
                                                                                                        : emp.tipoAusencia === 'Permiso' ? 'bg-purple-100 text-purple-700'
                                                                                                            : 'bg-gray-100 text-gray-700'
                                                                                            }`}>
                                                                                            {emp.tipoAusencia}
                                                                                        </span>
                                                                                    </td>
                                                                                    <td className="py-1 text-gray-400">{emp.tipoVacacion ?? '—'}</td>
                                                                                </tr>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                </>
                                                            ) : (
                                                                <p className="text-xs text-gray-400 mb-3">Sin empleados ausentes</p>
                                                            )}
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        ))}
                                        {grupos.length === 0 && (
                                            <tr>
                                                <td colSpan={5} className="px-3 py-8 text-center text-gray-400">
                                                    Sin datos para el periodo seleccionado
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};