
/**
 * Plantilla (Admin) — Búsqueda global en todos los empleados (frontend)
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { DataTable, type Column, type PaginationConfig } from '@/components/ui/data-table';
import { FilterBar, type FilterConfig } from '@/components/ui/filter-bar';
import { ContentContainer } from '@/components/ui/content-container';
import { useLocation, useNavigate } from 'react-router-dom';
import { useEmpleadosSindicalizados } from '@/hooks/useEmpleadosSindicalizados';
import { useAreas } from '@/hooks/useAreas';
import { useLeaderCache } from '@/hooks/useLeaderCache';
import Fuse from 'fuse.js';
import { Loader2 } from 'lucide-react';
import { empleadosService } from '@/services/empleadosService';
import type { UsuarioInfoDto } from '@/interfaces/Api.interface';

interface TransformedEmployee {
  id: string;
  noNomina: string;
  nombre: string;
  area: string;
  grupo: string;
  antiguedad: string;
}

const BULK_PAGE_SIZE = 200;
const BULK_MAX_PAGES = 10;

export const Plantilla = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedArea, setSelectedArea] = useState('all');
  const [selectedGroup, setSelectedGroup] = useState('all');
  const [sortColumn, setSortColumn] = useState<keyof TransformedEmployee | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const {
    empleados, loading, error, currentPage, pageSize, totalUsers, totalPages,
    refetch, setPage, setPageSize, setFilters
  } = useEmpleadosSindicalizados();

  const { areas, getAreaById } = useAreas();
  const { getLeadersBatch, formatLeaderName } = useLeaderCache();
  type GroupOption = { value: string; label: string };
  const [availableGroups, setAvailableGroups] = useState<GroupOption[]>([]);

  const transformGroupRole = (role?: string) => role ?? 'Sin grupo';
  const calculateAntiguedad = (fechaIngreso?: string): string => {
    if (!fechaIngreso) return '—';
    const ingreso = new Date(fechaIngreso);
    const ahora = new Date();
    const years = ahora.getFullYear() - ingreso.getFullYear();
    const months = ahora.getMonth() - ingreso.getMonth();
    if (years > 0) return `${years} año${years > 1 ? 's' : ''}`;
    if (months > 0) return `${months} mes${months > 1 ? 'es' : ''}`;
    return 'Menos de 1 mes';
  };

  const loadGroupsForArea = useCallback(async (areaId: string) => {
    if (areaId === 'all' || !areaId) { setAvailableGroups([]); return; }
    try {
      const areaDetails = await getAreaById(parseInt(areaId, 10));
      if (!areaDetails?.grupos?.length) { setAvailableGroups([]); return; }
      const leaderIds = areaDetails.grupos.map((g: any) => g.liderId).filter((id: any) => typeof id === 'number');
      const leadersMap = leaderIds.length ? await getLeadersBatch(leaderIds) : new Map<number, any>();
      const opts = areaDetails.grupos.map((g: any) => {
        const code = transformGroupRole(g.rol);
        const leaderName = g.liderId && leadersMap.get(g.liderId)?.fullName ? ` - ${formatLeaderName(leadersMap.get(g.liderId).fullName)}` : '';
        return { value: String(g.grupoId), label: `${code}${leaderName}` };
      });
      setAvailableGroups(opts);
    } catch (err) { console.error('Error cargando grupos:', err); setAvailableGroups([]); }
  }, [getAreaById, getLeadersBatch, formatLeaderName]);
  useEffect(() => { loadGroupsForArea(selectedArea); }, [selectedArea, loadGroupsForArea]);

  // ===== Búsqueda global (frontend) =====
  const [allEmployees, setAllEmployees] = useState<UsuarioInfoDto[]>([]);
  const [loadingAll, setLoadingAll] = useState(false);

  const loadAllEmployees = useCallback(async () => {
    try {
      setLoadingAll(true);
      const areaId = selectedArea === 'all' ? undefined : parseInt(selectedArea, 10);
      const grupoId = selectedGroup === 'all' ? undefined : parseInt(selectedGroup, 10);
      const acc: UsuarioInfoDto[] = [];
      for (let page = 1; page <= BULK_MAX_PAGES; page++) {
        const resp = await empleadosService.getEmpleadosSindicalizados({ Page: page, PageSize: BULK_PAGE_SIZE, AreaId: areaId, GrupoId: grupoId });
        const chunk = resp?.usuarios ?? [];
        acc.push(...chunk);
        if (chunk.length < BULK_PAGE_SIZE) break;
      }
      setAllEmployees(acc);
    } catch { setAllEmployees([]); } finally { setLoadingAll(false); }
  }, [selectedArea, selectedGroup]);

  useEffect(() => { if (searchTerm.trim()) loadAllEmployees(); }, [searchTerm, selectedArea, selectedGroup, loadAllEmployees]);

  const baseRows: TransformedEmployee[] = useMemo(() => {
    const source = searchTerm.trim() ? allEmployees : (empleados ?? []);
    return source.map((e) => ({
      id: String(e.id),
      noNomina: e.username ?? '',
      nombre: e.fullName ?? '',
      area: e.area?.nombreGeneral ?? 'Sin área',
      grupo: transformGroupRole(e.grupo?.rol),
      antiguedad: calculateAntiguedad(e.fechaIngreso),
    }));
  }, [searchTerm, allEmployees, empleados]);

  const orderedRows = useMemo(() => {
    let data = [...baseRows];
    if (sortColumn) {
      data.sort((a, b) => {
        const av = String(a[sortColumn] ?? '');
        const bv = String(b[sortColumn] ?? '');
        const cmp = av.localeCompare(bv, 'es');
        return sortDirection === 'asc' ? cmp : -cmp;
      });
    }
    return data;
  }, [baseRows, sortColumn, sortDirection]);

  const fuse = useMemo(() => new Fuse(orderedRows, {
    keys: [{ name: 'nombre', weight: 0.75 }, { name: 'noNomina', weight: 0.25 }, 'area', 'grupo'],
    threshold: 0.45, ignoreLocation: true, includeScore: false, findAllMatches: true, minMatchCharLength: 2,
  }), [orderedRows]);

  const filteredRows = useMemo(() => {
    const term = searchTerm.trim();
    if (!term) return orderedRows;
    return fuse.search(term).map(r => r.item);
  }, [orderedRows, fuse, searchTerm]);

  const handleSearchChange = (val: any) => {
    const v = typeof val === 'string' ? val : (val?.target?.value ?? '');
    setSearchTerm(v);
    };

    const [deleteModal, setDeleteModal] = useState<{ open: boolean; row: TransformedEmployee | null }>({ open: false, row: null });
    const [deletePassword, setDeletePassword] = useState('');
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [deleteError, setDeleteError] = useState('');

    const handleDeleteConfirm = useCallback(async () => {
        if (!deleteModal.row) return;
        setDeleteLoading(true);
        setDeleteError('');
        try {
            await empleadosService.deleteSindicalizado(Number(deleteModal.row.id), deletePassword);
            setDeleteModal({ open: false, row: null });
            setDeletePassword('');
            refetch();
        } catch (e: any) {
            setDeleteError(e?.details?.errorMsg ?? e?.response?.data?.errorMsg ?? e?.message ?? 'Error al eliminar');
        } finally {
            setDeleteLoading(false);
        }
    }, [deleteModal.row, deletePassword, refetch]);

  const filterConfigs: FilterConfig[] = [
    { type: 'search', key: 'search', placeholder: 'Busca por nombre, nómina, área o grupo', value: searchTerm, onChange: handleSearchChange },
    { type: 'select', key: 'area', label: 'Área', placeholder: 'Seleccionar área', value: selectedArea,
      onChange: (v: string) => { setSelectedArea(v); setSelectedGroup('all'); setFilters(v === 'all' ? undefined : parseInt(v,10), undefined); },
      options: [{ value: 'all', label: 'Todas las áreas' }, ...areas.map(a => ({ value: String(a.areaId), label: a.nombreGeneral }))] },
    { type: 'select', key: 'group', label: 'Grupo', placeholder: 'Seleccionar grupo', value: selectedGroup,
      onChange: (v: string) => { setSelectedGroup(v); setFilters(selectedArea === 'all' ? undefined : parseInt(selectedArea,10), v === 'all' ? undefined : parseInt(v,10)); },
      options: [{ value: 'all', label: 'Todos los grupos' }, ...availableGroups] },
  ];

  const columns: Column<TransformedEmployee>[] = [
    { key: 'noNomina', label: 'No nómina', sortable: true, render: v => <span className="font-bold">{String(v)}</span> },
    { key: 'nombre', label: 'Nombre', sortable: true },
    { key: 'area', label: 'Área', sortable: true },
    { key: 'grupo', label: 'Grupo', sortable: true },
    { key: 'antiguedad', label: 'Antigüedad', sortable: true },
      {
          key: 'acciones', label: 'Acciones', sortable: false, render: (_, row) => (
              <div className="flex gap-2">
                  <Button variant="continental" size="sm" onClick={() => navigate(`/admin/plantilla/${row.id}`, { state: { from: location.pathname + location.search } })}>Ver empleado</Button>
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
      },
  ];

  const paginationWhenSearch: PaginationConfig = {
    currentPage: 1, totalPages: 1, pageSize: filteredRows.length || 1, totalItems: filteredRows.length,
    onPageChange: () => {}, onPageSizeChange: () => {},
  };

  const paginationConfig: PaginationConfig = searchTerm.trim()
    ? paginationWhenSearch
    : { currentPage, totalPages, pageSize, totalItems: totalUsers, onPageChange: setPage, onPageSizeChange: setPageSize };

  const handleSort = (column: keyof TransformedEmployee) => {
    if (sortColumn === column) setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortColumn(column); setSortDirection('asc'); }
  };

  return (
    <div className="p-6 bg-white min-h-screen">
      <div className="max-w-7xl mx-auto w-full space-y-6">
        <div className="flex justify-end">
          <Button variant="continental" className="h-[45px] w-[150px] rounded-lg" onClick={() => refetch()}>
            Actualizar datos
          </Button>
        </div>
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
              <Button variant="outline" size="sm" onClick={refetch} className="mt-2">Reintentar</Button>
            </div>
          )}
          {!loading && !error && (
            <DataTable<TransformedEmployee>
              columns={columns}
              data={filteredRows}
              keyField="noNomina"
              emptyMessage="No se encontraron empleados que coincidan con la búsqueda."
              onSort={(c) => handleSort(c as keyof TransformedEmployee)}
              pagination={paginationConfig}
            />
          )}
        </ContentContainer>
          </div>
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
    </div>
  );
};
