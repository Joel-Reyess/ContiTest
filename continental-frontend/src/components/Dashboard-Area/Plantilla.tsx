/**
 * Plantilla (Área) — Búsqueda global en todos los empleados (frontend)
 */

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Fuse from 'fuse.js';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataTable, type Column, type PaginationConfig } from '@/components/ui/data-table';
import { FilterBar, type FilterConfig } from '@/components/ui/filter-bar';
import { ContentContainer } from '@/components/ui/content-container';
import { useEmpleadosSimple } from '@/hooks/useEmpleadosSimple';
import { useAreas } from '@/hooks/useAreas';
import useAuth from '@/hooks/useAuth';
import { UserRole } from '@/interfaces/User.interface';
import type { UsuarioInfoDto } from '@/interfaces/Api.interface';
import { areasService } from '@/services/areasService';
import { debugEmpleados } from '@/utils/empleadosDebugger';
import { userService } from '@/services/userService';
import { empleadosService } from '@/services/empleadosService';

type TableRow = {
    id: number;
    noNomina: string;
    nombre: string;
    areaId?: number;
    area: string;
    grupo: string;
    antiguedad: string;
};

const BULK_PAGE_SIZE = 200;
const BULK_MAX_PAGES = 10;

export const Plantilla = () => {
    const navigate = useNavigate();
    const { user, hasRole } = useAuth();

    useEffect(() => {
        debugEmpleados.logComponentMount('Plantilla', { AreaId: user?.area?.areaId });
        return () => debugEmpleados.logComponentUnmount('Plantilla');
    }, [user?.area?.areaId]);

    const [searchTerm, setSearchTerm] = useState('');
    const [selectedArea, setSelectedArea] = useState<string>('all');
    const [selectedGroup, setSelectedGroup] = useState('all');
    const [sortColumn, setSortColumn] = useState<keyof TableRow | null>(null);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

    const [allAreasPage, setAllAreasPage] = useState(1);
    const [allAreasPageSize, setAllAreasPageSize] = useState(25);

    const [deleteModal, setDeleteModal] = useState<{ open: boolean; row: TableRow | null }>({ open: false, row: null });
    const [deletePassword, setDeletePassword] = useState('');
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [deleteError, setDeleteError] = useState('');

    const {
        empleados,
        loading,
        error,
        currentPage,
        pageSize,
        totalUsers,
        totalPages,
        refetch,
        fetchAllAreas,
        setPage,
        setPageSize,
        setFilters,
    } = useEmpleadosSimple({ AreaId: user?.area?.areaId });

    const [allEmployees, setAllEmployees] = useState<UsuarioInfoDto[]>([]);
    const [loadingAll, setLoadingAll] = useState(false);

    const { areas, getAreaById } = useAreas();
    const [allowedAreas, setAllowedAreas] = useState<Array<{
        areaId: number;
        nombreGeneral: string;
        grupos?: Array<{ grupoId: number; rol: string }>;
    }>>([]);

    // OPTIMIZACIÓN: Combinar la carga de áreas en un solo useEffect
    useEffect(() => {
        let cancelled = false;

        const loadAllowedAreas = async () => {
            try {
                let list: Array<{ areaId: number; nombreGeneral: string; grupos?: any[] }> = [];

                // 0) Si el usuario ya trae areas en el token, úsalas y evita llamadas que pueden dar 401
                if (Array.isArray((user as any)?.areas) && (user as any).areas.length) {
                    list.push(
                        ...(user as any).areas.map((a: any) => ({
                            areaId: a.areaId,
                            nombreGeneral: a.nombreGeneral || a.areaNombre,
                            grupos: a.grupos as any
                        }))
                    );
                }

                if (list.length === 0 && user?.area?.areaId) {
                    list.push({
                        areaId: user.area.areaId,
                        nombreGeneral: user.area.nombreGeneral,
                        grupos: (user.area as any).grupos
                    });
                }

                // Preferentemente, trae lo que el backend exponga por líder (igual que calendario)
                if (list.length === 0 && user?.id) {
                    try {
                        const byLeader = await areasService.getAreasByLider(user.id);
                        const rawData = (byLeader?.success && byLeader.data) ? byLeader.data : (byLeader?.data ?? byLeader ?? []);
                        const data = Array.isArray(rawData) ? rawData : [];
                        list.push(
                            ...data.map((a: any) => ({
                                areaId: a.areaId,
                                nombreGeneral: a.nombreGeneral || a.areaNombre,
                                grupos: a.grupos as any
                            }))
                        );
                    } catch { /* ignore */ }
                }

                // Si es ingeniero industrial, agrega sus áreas
                if (user?.id && hasRole(UserRole.INDUSTRIAL)) {
                    try {
                        const resp = await areasService.getAreasByIngeniero(user.id);
                        const rawData = (resp?.success && resp.data) ? resp.data : (resp?.data ?? resp ?? []);
                        const data = Array.isArray(rawData) ? rawData : [];
                        list.push(
                            ...data.map((a: any) => ({
                                areaId: a.areaId,
                                nombreGeneral: a.areaNombre || a.nombreGeneral,
                                grupos: a.grupos as any
                            }))
                        );
                    } catch { /* ignore */ }
                }

                // Si es jefe de área, intenta derivar de getAreas (jefe o suplente)
                if (hasRole(UserRole.AREA_ADMIN)) {
                    try {
                        const all = await areasService.getAreas();
                        const mine = all.filter((a: any) => a.jefeId === user?.id || a.jefeSuplenteId === user?.id);
                        list.push(
                            ...mine.map((a: any) => ({
                                areaId: a.areaId,
                                nombreGeneral: a.nombreGeneral,
                                grupos: a.grupos as any
                            }))
                        );
                    } catch { /* ignore */ }
                }

                // Último recurso: el área asignada al usuario
                if (!list.length && user?.area?.areaId) {
                    list = [{
                        areaId: user.area.areaId,
                        nombreGeneral: user.area.nombreGeneral,
                        grupos: (user.area as any).grupos
                    }];
                }

                const unique = Array.from(new Map(list.map((a) => [a.areaId, a])).values());
                if (!cancelled) setAllowedAreas(unique);
            } catch {
                if (!cancelled) setAllowedAreas(user?.area?.areaId ? [{
                    areaId: user.area.areaId,
                    nombreGeneral: user.area.nombreGeneral
                }] : []);
            }
        };

        loadAllowedAreas();

        return () => {
            cancelled = true;
        };
    }, [user?.id, user?.area?.areaId]);

    // Si el valor seleccionado no existe en las opciones actuales, forzamos a la primera disponible
    useEffect(() => {
        const options = allowedAreas.length > 0
            ? ['all', ...allowedAreas.map(a => String(a.areaId))]
            : user?.area?.areaId
                ? [String(user.area.areaId)]
                : [];
        if (options.length > 0 && !options.includes(selectedArea)) {
            setSelectedArea(options[0]);
        }
    }, [allowedAreas, user?.area?.areaId, selectedArea]);

    const [availableGroups, setAvailableGroups] = useState<Array<{ id: number; label: string }>>([]);
    const leadersCacheRef = useRef<Map<number, string>>(new Map());
    const transformGroupRole = (role?: string) => role ?? 'Sin grupo';

    // OPTIMIZACIÓN: Usar useRef para evitar cambios de referencia
    const allowedAreasRef = useRef(allowedAreas);
    useEffect(() => {
        allowedAreasRef.current = allowedAreas;
    }, [allowedAreas]);

    const loadGroupsForArea = useCallback(async (areaId: string) => {
        if (areaId === 'all' || !areaId) {
            setAvailableGroups([]);
            return;
        }
        try {
            const allowed = allowedAreasRef.current.find(a => a.areaId === parseInt(areaId, 10));
            let groupsSource: Array<{ grupoId: number; rol: string; liderId?: number | null }> = [];

            if (allowed?.grupos?.length) {
                groupsSource = allowed.grupos as any;
            } else {
                const areaDetails = await getAreaById(parseInt(areaId, 10));
                if (areaDetails.grupos?.length) groupsSource = areaDetails.grupos as any;
            }

            if (!groupsSource.length) {
                setAvailableGroups([]);
                return;
            }

            const uniqueLeaderIds = Array.from(
                new Set(
                    groupsSource
                        .map(g => g.liderId)
                        .filter((id): id is number => typeof id === 'number' && id > 0)
                )
            );
            const missingIds = uniqueLeaderIds.filter(id => !leadersCacheRef.current.has(id));

            if (missingIds.length > 0) {
                await Promise.allSettled(
                    missingIds.map(async lid => {
                        try {
                            const u = await userService.getUserById(lid);
                            if (u?.fullName) leadersCacheRef.current.set(lid, u.fullName);
                        } catch { }
                    })
                );
            }

            const formatted = groupsSource.map(g => {
                const base = `${g.rol}`;
                const leaderFull = g.liderId ? leadersCacheRef.current.get(g.liderId) : undefined;
                const firstName = leaderFull ? leaderFull.split(' ')[0] : undefined;
                const label = firstName ? `${base} — ${firstName}` : base;
                return { id: g.grupoId, label };
            });
            setAvailableGroups(formatted);
        } catch {
            setAvailableGroups([]);
        }
    }, [getAreaById]);

    useEffect(() => {
        loadGroupsForArea(selectedArea);
        setSelectedGroup('all');
    }, [selectedArea, loadGroupsForArea]);

    // ===== Búsqueda global (frontend) =====
    useEffect(() => {
        if (!searchTerm.trim()) return;
        if (selectedArea !== 'all' && selectedArea === '') return;
        if (selectedArea === 'all' && allowedAreasRef.current.length === 0) return;

        const loadAllEmployees = async () => {
            try {
                setLoadingAll(true);
                const areaIds =
                    selectedArea === 'all'
                        ? allowedAreasRef.current.map(a => a.areaId)
                        : [parseInt(selectedArea, 10)];
                const grupoId = selectedGroup === 'all' ? undefined : parseInt(selectedGroup, 10);

                const acc: UsuarioInfoDto[] = [];
                for (const areaId of areaIds) {
                    for (let page = 1; page <= BULK_MAX_PAGES; page++) {
                        const resp = await empleadosService.getEmpleadosSindicalizados({
                            Page: page,
                            PageSize: BULK_PAGE_SIZE,
                            AreaId: areaId,
                            GrupoId: grupoId
                        });
                        const chunk = resp?.usuarios ?? [];
                        acc.push(...chunk);
                        if (chunk.length < BULK_PAGE_SIZE) break;
                    }
                }
                setAllEmployees(acc);
            } catch {
                setAllEmployees([]);
            } finally {
                setLoadingAll(false);
            }
        };

        loadAllEmployees();
    }, [searchTerm, selectedArea, selectedGroup]);

    const baseEmployees: UsuarioInfoDto[] = useMemo(
        () => (searchTerm.trim() ? allEmployees : empleados ?? []),
        [searchTerm, allEmployees, empleados]
    );

    const rows: TableRow[] = useMemo(() => {
        let data: TableRow[] = baseEmployees.map(e => ({
            id: e.id,
            noNomina: e.username ?? '',
            nombre: e.fullName ?? '',
            areaId: e.area?.areaId,
            area: e.area?.nombreGeneral ?? 'Sin área',
            grupo: transformGroupRole(e.grupo?.rol),
            antiguedad: (() => {
                const d = e.fechaIngreso ? new Date(e.fechaIngreso) : undefined;
                if (!d) return '—';
                const now = new Date();
                const y = now.getFullYear() - d.getFullYear();
                const m = now.getMonth() - d.getMonth();
                if (y > 0) return `${y} año${y > 1 ? 's' : ''}`;
                if (m > 0) return `${m} mes${m > 1 ? 'es' : ''}`;
                return 'Menos de 1 mes';
            })()
        }));
        if (sortColumn) {
            data.sort((a, b) => {
                const av = String(a[sortColumn] ?? '');
                const bv = String(b[sortColumn] ?? '');
                const cmp = av.localeCompare(bv, 'es');
                return sortDirection === 'asc' ? cmp : -cmp;
            });
        }
        return data;
    }, [baseEmployees, sortColumn, sortDirection]);

    const fuse = useMemo(
        () =>
            new Fuse(rows, {
                keys: [
                    { name: 'nombre', weight: 0.75 },
                    { name: 'noNomina', weight: 0.25 },
                    'area',
                    'grupo'
                ],
                threshold: 0.45,
                ignoreLocation: true,
                includeScore: false,
                findAllMatches: true,
                minMatchCharLength: 2
            }),
        [rows]
    );

    const filteredRows = useMemo(() => {
        const term = searchTerm.trim();
        if (!term) return rows;
        return fuse.search(term).map(r => r.item);
    }, [rows, fuse, searchTerm]);

    const handleSearchChange = useCallback((val: any) => {
        const v = typeof val === 'string' ? val : val?.target?.value ?? '';
        setSearchTerm(v);
    }, []);

    const areaOptions = useMemo(() => {
        if (allowedAreas.length > 0) {
            return [
                { value: 'all', label: 'Todas las áreas' },
                ...allowedAreas.map(a => ({ value: String(a.areaId), label: a.nombreGeneral }))
            ];
        }
        if (user?.area?.areaId) {
            return [{ value: String(user.area.areaId), label: user.area.nombreGeneral }];
        }
        return [] as { value: string; label: string }[];
    }, [allowedAreas, user?.area?.areaId, user?.area?.nombreGeneral]);

    // CRÍTICO: Usar useCallback en lugar de useMemo para los handlers
    const handleAreaChange = useCallback((v: string) => {
        setSearchTerm('');
        setSelectedArea(v);
        setSelectedGroup('all');
        if (v === 'all') {
            setAllAreasPage(1);
            setAllAreasPageSize(pageSize);
            const areaIds = allowedAreasRef.current.map(area => area.areaId);
            fetchAllAreas(areaIds, { Page: 1, PageSize: pageSize });
            return;
        }
        const areaId = parseInt(v, 10);
        setFilters(areaId, undefined);
    }, [pageSize, fetchAllAreas, setFilters]);

    const handleGroupChange = useCallback((v: string) => {
        setSelectedGroup(v);
        const areaId = selectedArea === 'all' ? undefined : parseInt(selectedArea, 10);
        const grupoId = v === 'all' ? undefined : parseInt(v, 10);
        if (selectedArea === 'all') {
            setAllAreasPage(1);
            const areaIds = allowedAreasRef.current.map(area => area.areaId);
            fetchAllAreas(areaIds, { Page: 1, PageSize: allAreasPageSize, GrupoId: grupoId });
        } else {
            setFilters(areaId, grupoId);
        }
    }, [selectedArea, allAreasPageSize, fetchAllAreas, setFilters]);

    const groupOptions = useMemo(() => [
        { value: 'all', label: 'Todos los grupos' },
        ...availableGroups.map(g => ({ value: String(g.id), label: g.label }))
    ], [availableGroups]);

    const filterConfigs: FilterConfig[] = useMemo(() => [
        {
            type: 'search',
            key: 'search',
            placeholder: 'Busca por nombre, nómina, área o grupo',
            value: searchTerm,
            onChange: handleSearchChange
        },
        {
            type: 'select',
            key: 'area',
            label: 'Área',
            placeholder: 'Seleccionar área',
            value: selectedArea,
            onChange: handleAreaChange,
            options: areaOptions
        },
        {
            type: 'select',
            key: 'group',
            label: 'Grupo',
            placeholder: 'Seleccionar grupo',
            value: selectedGroup,
            onChange: handleGroupChange,
            options: groupOptions
        }
    ], [searchTerm, selectedArea, selectedGroup, areaOptions, groupOptions, handleSearchChange, handleAreaChange, handleGroupChange]);

    const columns: Column<TableRow>[] = useMemo(() => [
        {
            key: 'noNomina',
            label: 'No nómina',
            sortable: true,
            render: v => <span className="font-bold">{String(v)}</span>
        },
        { key: 'nombre', label: 'Nombre', sortable: true },
        { key: 'area', label: 'Área', sortable: true },
        { key: 'grupo', label: 'Grupo', sortable: true },
        { key: 'antiguedad', label: 'Antigüedad', sortable: true },
        {
            key: 'acciones',
            label: 'Acciones',
            sortable: false,
            render: (_: any, row: TableRow) => (
                <div className="flex gap-2">
                    <Button
                        variant="continental"
                        size="sm"
                        onClick={() => navigate(`/area/plantilla/${row.id}`)}
                    >
                        Ver empleado
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600 border-red-300 hover:bg-red-50"
                        onClick={() => setDeleteModal({ open: true, row })}
                    >
                        Eliminar
                    </Button>
                </div>
            )
        }
    ], [navigate]);

    const handlePageChange = useCallback((page: number) => {
        if (selectedArea === 'all') {
            setAllAreasPage(page);
            const areaIds = allowedAreasRef.current.map(area => area.areaId);
            const grupoId = selectedGroup === 'all' ? undefined : parseInt(selectedGroup, 10);
            fetchAllAreas(areaIds, { Page: page, PageSize: allAreasPageSize, GrupoId: grupoId });
        } else {
            setPage(page);
        }
    }, [selectedArea, selectedGroup, allAreasPageSize, fetchAllAreas, setPage]);

    const handlePageSizeChange = useCallback((newSize: number) => {
        if (selectedArea === 'all') {
            setAllAreasPage(1);
            setAllAreasPageSize(newSize);
            const areaIds = allowedAreasRef.current.map(area => area.areaId);
            const grupoId = selectedGroup === 'all' ? undefined : parseInt(selectedGroup, 10);
            fetchAllAreas(areaIds, { Page: 1, PageSize: newSize, GrupoId: grupoId });
        } else {
            setPageSize(newSize);
        }
    }, [selectedArea, selectedGroup, fetchAllAreas, setPageSize]);

    const paginationConfig: PaginationConfig = useMemo(() => {
        if (searchTerm.trim()) {
            return {
                currentPage: 1,
                totalPages: 1,
                pageSize: filteredRows.length || 1,
                totalItems: filteredRows.length,
                onPageChange: () => { },
                onPageSizeChange: () => { }
            };
        }

        return {
            currentPage: selectedArea === 'all' ? allAreasPage : currentPage,
            totalPages,
            pageSize: selectedArea === 'all' ? allAreasPageSize : pageSize,
            totalItems: totalUsers,
            onPageChange: handlePageChange,
            onPageSizeChange: handlePageSizeChange
        };
    }, [searchTerm, filteredRows.length, selectedArea, allAreasPage, currentPage, totalPages,
        allAreasPageSize, pageSize, totalUsers, handlePageChange, handlePageSizeChange]);

    const handleSort = useCallback((column: keyof TableRow) => {
        if (sortColumn === column) {
            setSortDirection(d => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortColumn(column);
            setSortDirection('asc');
        }
    }, [sortColumn]);

    const handleRefetch = useCallback(async () => {
        if (selectedArea === 'all') {
            const areaIds = allowedAreasRef.current.map(area => area.areaId);
            const grupoId = selectedGroup === 'all' ? undefined : parseInt(selectedGroup, 10);
            await fetchAllAreas(areaIds, {
                Page: allAreasPage,
                PageSize: allAreasPageSize,
                GrupoId: grupoId
            });
        } else {
            await refetch();
        }
    }, [selectedArea, selectedGroup, allAreasPage, allAreasPageSize, fetchAllAreas, refetch]);

    const handleDeleteConfirm = useCallback(async () => {
        if (!deleteModal.row) return;
        setDeleteLoading(true);
        setDeleteError('');
        try {
            await empleadosService.deleteSindicalizado(deleteModal.row.id, deletePassword);
            setDeleteModal({ open: false, row: null });
            setDeletePassword('');
            await handleRefetch();
        } catch (e: any) {
            setDeleteError(e?.response?.data?.message ?? 'Error al eliminar');
        } finally {
            setDeleteLoading(false);
        }
    }, [deleteModal.row, deletePassword, handleRefetch]);

    return (
        <div className="p-6 bg-white min-h-screen">
            <div className="max-w-7xl mx-auto w-full space-y-6">
                <ContentContainer>
                    <FilterBar filters={filterConfigs} gridCols={3} />
                    {(loading || (searchTerm && loadingAll)) && (
                        <div className="flex justify-center items-center py-8">
                            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                            <span className="ml-2 text-gray-600">Cargando empleados...</span>
                        </div>
                    )}
                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-4">
                            <p className="text-red-800">Error: {error}</p>
                            <Button variant="outline" size="sm" onClick={handleRefetch} className="mt-2">
                                Reintentar
                            </Button>
                        </div>
                    )}
                    {!loading && !error && (
                        <DataTable<TableRow>
                            columns={columns}
                            data={filteredRows}
                            keyField="noNomina"
                            emptyMessage="No se encontraron empleados que coincidan con la búsqueda."
                            onSort={c => handleSort(c as keyof TableRow)}
                            pagination={paginationConfig}
                        />
                    )}
                    {searchTerm.trim() && (
                        <div className="text-xs text-gray-500 mt-2">
                            Buscando en {filteredRows.length.toLocaleString('es-MX')} empleados.
                        </div>
                    )}
                    {deleteModal.open && (
                        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                            <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
                                <h2 className="text-lg font-bold mb-2">Eliminar empleado</h2>
                                <p className="text-sm text-gray-600 mb-4">
                                    ¿Confirmas que deseas eliminar a <strong>{deleteModal.row?.nombre}</strong>?
                                    Esta acción eliminará al empleado de Users y Empleados. Ingresa tu contraseña para confirmar.
                                </p>
                                <input
                                    type="password"
                                    placeholder="Tu contraseña"
                                    className="w-full border rounded px-3 py-2 mb-3 text-sm"
                                    value={deletePassword}
                                    onChange={e => setDeletePassword(e.target.value)}
                                />
                                {deleteError && <p className="text-red-600 text-sm mb-3">{deleteError}</p>}
                                <div className="flex justify-end gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => { setDeleteModal({ open: false, row: null }); setDeletePassword(''); setDeleteError(''); }}
                                        disabled={deleteLoading}
                                    >
                                        Cancelar
                                    </Button>
                                    <Button
                                        variant="continental"
                                        size="sm"
                                        className="bg-red-600 hover:bg-red-700 text-white"
                                        onClick={handleDeleteConfirm}
                                        disabled={deleteLoading || !deletePassword}
                                    >
                                        {deleteLoading ? 'Eliminando...' : 'Confirmar eliminación'}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </ContentContainer>
            </div>
        </div>
    );
};
