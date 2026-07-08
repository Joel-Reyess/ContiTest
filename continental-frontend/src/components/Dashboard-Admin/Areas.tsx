import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionButtons } from "@/components/ui/action-buttons";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { GroupsTable } from "./GroupsTable";
import { useAreas } from "@/hooks/useAreas";
import { useAreaIngenieros } from "@/hooks/useAreaIngenieros";
import { areasService } from "@/services/areasService";
import { userService } from "@/services/userService";
import { groupService } from "@/services/groupService";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserRole, type User } from "@/interfaces/User.interface";
import { sortApiGroups } from '@/utils/sort';
import { toast } from "sonner";
import { X } from "lucide-react";

interface AreaFormData {
    nombreArea: string;
    nombreSAP: string;
    nombreJefe: string;
    correoJefe: string;
    default_manning?: number;
}

interface GroupData {
    id: number;
    grupo: string;
    identificadorSAP: string;
    personasPorTurno: string;
    duracionDeturno: string;
    liderGrupo: string;
}

export const Areas = () => {
    const { areas, loading, error, getAreaById, loadingAreaDetails, refetch } = useAreas();
    const [selectedArea, setSelectedArea] = useState<string>("");
    const selectedAreaId = selectedArea ? parseInt(selectedArea) : null;
    const {
        assignedIngenieros: initialAssignedIngenieros,
        availableIngenieros,
        loading: ingenierosLoading,
        assignIngeniero,
        unassignIngeniero
    } = useAreaIngenieros(selectedAreaId);

    const [assignedIngenieros, setAssignedIngenieros] = useState(initialAssignedIngenieros);
    const [pendingAssignments, setPendingAssignments] = useState<number[]>([]);
    const [pendingUnassignments, setPendingUnassignments] = useState<number[]>([]);
    const [formData, setFormData] = useState<AreaFormData>({
        nombreArea: "",
        nombreSAP: "",
        nombreJefe: "",
        correoJefe: "",
        default_manning: 0,
    });
    // Multi-jefes: lista de IDs de jefes asignados al área actual
    const [jefesActuales, setJefesActuales] = useState<number[]>([]);
    const [jefeToAdd, setJefeToAdd] = useState<string>("");
    const [isUpdating, setIsUpdating] = useState(false);
    const [usersByRole, setUsersByRole] = useState<User[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [selectedIngenieroValue, setSelectedIngenieroValue] = useState<string>("");

    // State para líderes de grupo (operadores)
    const [groupLeaders, setGroupLeaders] = useState<User[]>([]);
    const [loadingGroupLeaders, setLoadingGroupLeaders] = useState(false);

    const [groups, setGroups] = useState<GroupData[]>([]);
    const [groupChanges, setGroupChanges] = useState<Map<number, Partial<GroupData>>>(new Map());

    // Handle area selection
    const handleAreaSelection = useCallback(async () => {
        setSelectedIngenieroValue("");
        setPendingAssignments([]);
        setPendingUnassignments([]);

        if (selectedArea) {
            const areaId = parseInt(selectedArea);

            try {
                const areaDetails = await getAreaById(areaId);

                setFormData({
                    nombreArea: areaDetails.nombreGeneral,
                    nombreSAP: areaDetails.unidadOrganizativaSap,
                    nombreJefe: areaDetails?.jefeId?.toString() || "",
                    correoJefe: areaDetails?.jefe?.username || "",
                    default_manning: areaDetails?.manning || 0,
                });

                // Multi-jefes: cargar desde areaDetails.jefes si viene, si no fallback a JefeId + JefeSuplenteId
                const jefesIds: number[] = (areaDetails as any)?.jefes?.length
                    ? ((areaDetails as any).jefes as { id: number }[]).map(j => j.id)
                    : Array.from(new Set([
                        areaDetails?.jefeId,
                        areaDetails?.jefeSuplenteId
                    ].filter((v): v is number => typeof v === "number" && v > 0)));
                setJefesActuales(jefesIds);
                setJefeToAdd("");

                if (areaDetails.grupos && areaDetails.grupos.length > 0) {
                    console.log("areaDetails.grupos", areaDetails.grupos)
                    const sortedApiGroups = sortApiGroups([...areaDetails.grupos]);

                    const mappedGroups = sortedApiGroups.map(grupo => ({
                        id: grupo.grupoId,
                        grupo: grupo.rol,
                        identificadorSAP: grupo.identificadorSAP || "",
                        personasPorTurno: grupo.personasPorTurno ? grupo.personasPorTurno.toString() : "",
                        duracionDeturno: grupo.duracionDeturno ? grupo.duracionDeturno.toString() : "",
                        liderGrupo: grupo.liderId ? grupo.liderId.toString() : ""
                    }));

                    setGroups(mappedGroups);
                } else {
                    setGroups([]);
                }
            } catch (error) {
                console.error('Error fetching area details:', error);
                setGroups([]);
            }
        } else {
            setFormData({
                nombreArea: "",
                nombreSAP: "",
                nombreJefe: "",
                correoJefe: "",
                default_manning: 0,
            });
            setJefesActuales([]);
            setJefeToAdd("");
            setGroups([]);
        }
    }, [selectedArea, getAreaById]);

    // Fetch jefes de área (AREA_ADMIN)
    const fetchUsersByRole = async () => {
        setLoadingUsers(true);
        try {
            const users = await userService.getUsersByRole(UserRole.AREA_ADMIN);
            setUsersByRole(users);
        } catch (error) {
            console.error('Error fetching users by role:', error);
            toast.error("Error al cargar los jefes de área");
        } finally {
            setLoadingUsers(false);
        }
    };

    // Fetch líderes de grupo (LEADER)
    const fetchGroupLeaders = async () => {
        setLoadingGroupLeaders(true);
        try {
            const users = await userService.getUsersByRole(UserRole.LEADER);
            console.log('Loaded group leaders:', users);
            setGroupLeaders(users);
        } catch (error) {
            console.error('Error fetching group leaders:', error);
            toast.error("Error al cargar los líderes de grupo");
        } finally {
            setLoadingGroupLeaders(false);
        }
    };

    useEffect(() => {
        handleAreaSelection();
    }, [handleAreaSelection]);

    useEffect(() => {
        fetchUsersByRole();
        fetchGroupLeaders();
    }, []);

    const handleFormChange = (field: keyof AreaFormData, value: string) => {
        if (field === 'default_manning') {
            const numericValue = parseInt(value, 10);
            if (isNaN(numericValue) || numericValue < 0) {
                value = '0';
            } else {
                value = numericValue.toString();
            }
        }

        if (field === 'nombreJefe') {
            const selectedUser = usersByRole.find(user => user.id.toString() === value);
            const correoJefe = selectedUser?.username || '';

            setFormData(prev => ({
                ...prev,
                [field]: value,
                correoJefe: correoJefe
            }));
            return;
        }

        setFormData(prev => ({
            ...prev,
            [field]: field === 'default_manning' ? parseInt(value) || 0 : value
        }));
    };

    const handleGroupChange = (groupId: number, field: keyof GroupData, value: string) => {
        setGroups(prev => prev.map(group =>
            group.id === groupId ? { ...group, [field]: value } : group
        ));

        setGroupChanges(prev => {
            const newChanges = new Map(prev);
            const existingChanges = newChanges.get(groupId) || {};

            // Normalizar valor vacío a "0" para liderGrupo
            const normalizedValue = (field === 'liderGrupo' && (value === '' || value === null)) ? '0' : value;

            newChanges.set(groupId, { ...existingChanges, [field]: normalizedValue });
            return newChanges;
        });
    };

    const updateGroupChanges = async () => {
        const errors: string[] = [];
        const successes: string[] = [];

        for (const [groupId, changes] of groupChanges.entries()) {
            try {
                // Update group leader if changed
                if (changes.liderGrupo !== undefined) {
                    const liderValue = changes.liderGrupo.toString().trim();
                    console.log(`Processing leader change for group ${groupId}: liderValue="${liderValue}"`);

                    try {
                        // Si el valor es "0", "", o vacío, remover el líder
                        if (liderValue === "0" || liderValue === "" || !liderValue) {
                            await groupService.removeGroupLeader(groupId);
                            successes.push(`Líder del grupo ${groupId} removido`);
                        } else {
                            const userId = parseInt(liderValue);
                            if (!isNaN(userId) && userId > 0) {
                                await groupService.updateGroupLeader(groupId, userId);
                                successes.push(`Líder del grupo ${groupId} actualizado`);
                            }
                        }
                    } catch (err: any) {
                        console.error(`Failed to update leader for group ${groupId}:`, err);
                        if (err?.status !== 204 && err?.response?.status !== 204) {
                            errors.push(`Líder del grupo ${groupId}`);
                        } else {
                            successes.push(`Líder del grupo ${groupId} actualizado`);
                        }
                    }
                }

                // Update shift info if personasPorTurno or duracionDeturno changed
                if (changes.personasPorTurno || changes.duracionDeturno) {
                    const currentGroup = groups.find(g => g.id === groupId);
                    if (currentGroup) {
                        const shiftData = {
                            personasPorTurno: changes.personasPorTurno ? parseInt(changes.personasPorTurno) : parseInt(currentGroup.personasPorTurno),
                            duracionDeturno: changes.duracionDeturno ? parseInt(changes.duracionDeturno) : parseInt(currentGroup.duracionDeturno)
                        };

                        try {
                            await groupService.updateGroupShift(groupId, shiftData);
                            successes.push(`Turno del grupo ${groupId} actualizado`);
                        } catch (err: any) {
                            console.error(`Failed to update shift for group ${groupId}:`, err);
                            if (err?.status !== 204 && err?.response?.status !== 204) {
                                errors.push(`Turno del grupo ${groupId}`);
                            } else {
                                successes.push(`Turno del grupo ${groupId} actualizado`);
                            }
                        }
                    }
                }
            } catch (error) {
                console.error(`Error processing changes for group ${groupId}:`, error);
                errors.push(`Grupo ${groupId}`);
            }
        }

        // Show results
        if (errors.length > 0) {
            console.error('Group update errors:', errors);
            toast.error(`Error actualizando: ${errors.join(', ')}`);
        }

        if (successes.length > 0) {
            console.log('Group updates succeeded:', successes);
            if (errors.length === 0) {
                toast.success("Grupos actualizados exitosamente");
            }
        }
    };

    const handleAssignIngeniero = (ingenieroId: string) => {
        const id = parseInt(ingenieroId);
        setPendingAssignments(prev => [...prev, id]);
        setPendingUnassignments(prev => prev.filter(item => item !== id));
        setSelectedIngenieroValue("");
    };

    const handleUnassignIngeniero = (ingenieroId: number) => {
        setPendingUnassignments(prev => [...prev, ingenieroId]);
        setPendingAssignments(prev => prev.filter(id => id !== ingenieroId));
    };

    useEffect(() => {
        setAssignedIngenieros(initialAssignedIngenieros);
        setPendingAssignments([]);
        setPendingUnassignments([]);
    }, [initialAssignedIngenieros]);

    useEffect(() => {
        let updated = [...initialAssignedIngenieros];

        updated = updated.filter(ing => !pendingUnassignments.includes(ing.id));

        const newAssignments = availableIngenieros.filter(ing =>
            pendingAssignments.includes(ing.id) &&
            !updated.some(assigned => assigned.id === ing.id)
        );
        updated = [...updated, ...newAssignments];

        setAssignedIngenieros(updated);
    }, [pendingAssignments, pendingUnassignments, initialAssignedIngenieros, availableIngenieros]);

    const handleUpdate = async () => {
        if (!selectedArea) {
            toast.error("Por favor selecciona un área para actualizar");
            return;
        }

        if (!formData.nombreArea.trim() || !formData.nombreSAP.trim()) {
            toast.error("Por favor completa los campos Nombre del área y Nombre SAP");
            return;
        }

        setIsUpdating(true);

        try {
            const areaId = parseInt(selectedArea);
            let hasErrors = false;

            // 1. Actualizar datos básicos del área
            try {
                const updateData = {
                    UnidadOrganizativaSap: formData.nombreSAP.trim(),
                    NombreGeneral: formData.nombreArea.trim(),
                    Manning: formData.default_manning || 0
                };

                console.log('=== Updating Area ===');
                console.log('Area ID:', areaId);
                console.log('Update Data:', updateData);

                const updatedArea = await areasService.updateArea(areaId, updateData);
                console.log('Area updated successfully:', updatedArea);

                toast.success("Área actualizada exitosamente");
            } catch (error) {
                console.error('Error updating area:', error);

                // Extract detailed error information
                let errorMessage = 'Error desconocido';
                if (error && typeof error === 'object') {
                    console.log('Error object:', JSON.stringify(error, null, 2));

                    if ('message' in error) {
                        errorMessage = String(error.message);
                    }

                    if ('details' in error) {
                        console.log('Error details:', error.details);
                        try {
                            const details = typeof error.details === 'string'
                                ? JSON.parse(error.details)
                                : error.details;

                            if (details.errors) {
                                console.log('Validation errors:', details.errors);
                                errorMessage = Object.values(details.errors).flat().join(', ');
                            } else if (details.title) {
                                errorMessage = details.title;
                            }
                        } catch (parseError) {
                            console.error('Could not parse error details:', parseError);
                        }
                    }
                }

                toast.error(`Error al actualizar el área: ${errorMessage}`);
                hasErrors = true;
            }

            // 2. Asignar jefes (multi-jefes)
            try {
                const jefeIds = Array.from(new Set(jefesActuales.filter(id => id > 0)));
                await areasService.assignBosses(areaId, jefeIds);
                if (jefeIds.length === 0) {
                    toast.success("Jefes de área desasignados");
                } else {
                    toast.success(`${jefeIds.length} jefe(s) de área asignado(s)`);
                }
            } catch (error) {
                console.error('Error assigning bosses:', error);
                let errorMessage = 'Error desconocido';
                if (error && typeof error === 'object' && 'message' in error) {
                    errorMessage = String(error.message);
                }
                toast.error(`Error al asignar jefes: ${errorMessage}`);
                hasErrors = true;
            }

            // 3. Actualizar asignaciones de ingenieros
            if (pendingAssignments.length > 0 || pendingUnassignments.length > 0) {
                try {
                    await Promise.all(
                        pendingUnassignments.map(ingenieroId =>
                            unassignIngeniero(ingenieroId)
                        )
                    );

                    await Promise.all(
                        pendingAssignments.map(ingenieroId =>
                            assignIngeniero(ingenieroId)
                        )
                    );

                    console.log('Engineer assignments updated successfully');
                    toast.success("Asignaciones de ingenieros actualizadas exitosamente");
                } catch (error) {
                    console.error('Error updating engineer assignments:', error);

                    const errorMessage = error instanceof Error ? error.message : String(error);
                    if (errorMessage.includes('SqlNullValueException') || errorMessage.includes('500')) {
                        toast.error("Error en la base de datos: Hay valores faltantes en el área.");
                    } else {
                        toast.error("Error al actualizar las asignaciones de ingenieros");
                    }

                    hasErrors = true;
                    setPendingAssignments([]);
                    setPendingUnassignments([]);
                }
            }

            // 4. Actualizar grupos
            if (groupChanges.size > 0) {
                try {
                    console.log('Updating groups with changes:', Array.from(groupChanges.entries()));
                    await updateGroupChanges();
                } catch (error) {
                    console.error('Error updating groups:', error);
                    toast.error("Error al actualizar algunos grupos");
                    hasErrors = true;
                }
            }

            // 5. Refrescar datos
            await refetch();

            // 6. Limpiar cambios pendientes
            setGroupChanges(new Map());
            setPendingAssignments([]);
            setPendingUnassignments([]);

            // 7. Mensaje final solo si no hubo errores en ninguna operación
            if (!hasErrors) {
                // Don't show generic success if we already showed specific success messages
                console.log('All updates completed successfully');
            }

        } catch (error) {
            console.error('Error in handleUpdate:', error);
            const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
            toast.error(`Error al actualizar: ${errorMessage}`);
        } finally {
            setIsUpdating(false);
        }
    };

    return (
        <div className="p-6 bg-white min-h-screen h-auto flex flex-col overflow-hidden">
            <div className="max-w-5xl mx-auto w-full flex-1 flex flex-col space-y-6">
                <h1 className="text-3xl font-bold text-continental-black text-left">
                    Áreas
                </h1>

                <div className="w-full max-w-6xl">
                    <SearchableSelect
                        options={areas.map((area) => ({
                            value: area.areaId.toString(),
                            label: area.nombreGeneral,
                            area: area
                        }))}
                        value={selectedArea}
                        onValueChange={setSelectedArea}
                        placeholder={loading ? "Cargando áreas..." : "Selecciona un área"}
                        searchPlaceholder="Buscar área..."
                        disabled={loading}
                        loading={loading}
                        error={error}
                        emptyMessage="No se encontraron áreas"
                        className="w-full"
                    />
                </div>

                {selectedArea ? (
                    <div>
                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="nombreArea" className="text-sm font-medium text-continental-gray-1">
                                    Nombre del área
                                </Label>
                                <Input
                                    id="nombreArea"
                                    value={formData.nombreArea}
                                    onChange={(e) => handleFormChange('nombreArea', e.target.value)}
                                    placeholder="Ingresa el nombre del área"
                                    className="w-full"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="nombreSAP" className="text-sm font-medium text-continental-gray-1">
                                    Nombre SAP
                                </Label>
                                <Input
                                    id="nombreSAP"
                                    value={formData.nombreSAP}
                                    onChange={(e) => handleFormChange('nombreSAP', e.target.value)}
                                    placeholder="Ingresa el nombre SAP"
                                    className="w-full"
                                />
                            </div>

                            <div className="space-y-2 md:col-span-2">
                                <Label className="text-sm font-medium text-continental-gray-1">
                                    Jefes de área <span className="text-xs text-continental-gray-1 font-normal">(múltiples permitidos — todos ven y aprueban las solicitudes del área)</span>
                                </Label>

                                {/* Chips con los jefes actuales */}
                                <div className="flex flex-wrap gap-2 min-h-[38px] p-2 border border-continental-gray-3 rounded bg-white">
                                    {jefesActuales.length === 0 && (
                                        <span className="text-xs text-continental-gray-1 self-center">
                                            Sin jefes asignados. Agrega uno abajo.
                                        </span>
                                    )}
                                    {jefesActuales.map(jefeId => {
                                        const u = usersByRole.find(x => x.id === jefeId);
                                        const label = u?.fullName ?? `#${jefeId}`;
                                        return (
                                            <span
                                                key={jefeId}
                                                className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-continental-yellow/20 border border-continental-yellow text-xs"
                                            >
                                                {label}
                                                <button
                                                    type="button"
                                                    onClick={() => setJefesActuales(prev => prev.filter(id => id !== jefeId))}
                                                    className="text-continental-black hover:text-red-600"
                                                    title="Quitar"
                                                >
                                                    <X className="size-3" />
                                                </button>
                                            </span>
                                        );
                                    })}
                                </div>

                                {/* Select para agregar */}
                                <div className="flex gap-2">
                                    <Select
                                        value={jefeToAdd}
                                        onValueChange={(value) => {
                                            const id = parseInt(value);
                                            if (!isNaN(id) && id > 0 && !jefesActuales.includes(id)) {
                                                setJefesActuales(prev => [...prev, id]);
                                            }
                                            setJefeToAdd("");
                                        }}
                                        disabled={loadingUsers}
                                    >
                                        <SelectTrigger className="w-full">
                                            <SelectValue placeholder={loadingUsers ? "Cargando jefes..." : "Agregar jefe de área"} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {usersByRole
                                                .filter(u => !jefesActuales.includes(u.id))
                                                .map(user => (
                                                    <SelectItem key={user.id} value={user.id.toString()}>
                                                        {user.fullName}
                                                    </SelectItem>
                                                ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </div>

                        {/* Ingenieros Industriales */}
                        <div className="space-y-4 mt-4">
                            <Label className="text-sm font-medium text-continental-gray-1">
                                Ingenieros Industriales
                            </Label>

                            {assignedIngenieros.length > 0 && (
                                <div className="space-y-2">
                                    <Label className="text-xs text-continental-gray-2">Asignados:</Label>
                                    <div className="flex flex-wrap gap-2">
                                        {assignedIngenieros.map((ingeniero) => (
                                            <div
                                                key={ingeniero.id}
                                                className="flex items-center gap-2 bg-continental-yellow/20 text-continental-gray-1 px-3 py-1 rounded-md text-sm"
                                            >
                                                <span>{ingeniero.fullName}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => handleUnassignIngeniero(ingeniero.id)}
                                                    className="text-red-500 hover:text-red-700 transition-colors cursor-pointer"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div>
                                <Select value={selectedIngenieroValue} onValueChange={handleAssignIngeniero}>
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Seleccionar ingeniero para asignar" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {availableIngenieros
                                            .filter(ingeniero => {
                                                const isCurrentlyAssigned = assignedIngenieros.some(assigned =>
                                                    assigned.id === ingeniero.id
                                                );
                                                const isPendingAssignment = pendingAssignments.includes(ingeniero.id);
                                                return !isCurrentlyAssigned && !isPendingAssignment;
                                            })
                                            .map((ingeniero) => (
                                                <SelectItem key={ingeniero.id} value={ingeniero.id.toString()}>
                                                    {ingeniero.fullName}
                                                </SelectItem>
                                            ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {ingenierosLoading && (
                                <div className="text-sm text-continental-gray-2">Cargando ingenieros...</div>
                            )}
                        </div>

                        <div className="space-y-2 mt-4">
                            <Label htmlFor="default_manning" className="text-sm font-medium text-continental-gray-1">
                                Manning por defecto
                            </Label>
                            <Input
                                id="default_manning"
                                type="number"
                                min="0"
                                value={formData.default_manning}
                                onChange={(e) => handleFormChange('default_manning', e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === '-' || e.key === 'e' || e.key === 'E' || e.key === '+' || e.key === '.') {
                                        e.preventDefault();
                                    }
                                }}
                                placeholder="10"
                                className="w-full"
                            />
                        </div>

                        {/* Groups Table */}
                        <div className="relative mt-6">
                            {loadingAreaDetails && (
                                <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10 rounded-md">
                                    <div className="flex items-center gap-2 text-sm text-continental-gray-1">
                                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-continental-yellow border-t-transparent"></div>
                                        Cargando detalles del área...
                                    </div>
                                </div>
                            )}
                            <GroupsTable
                                groups={groups}
                                groupLeaders={groupLeaders}
                                loadingLeaders={loadingGroupLeaders}
                                onGroupChange={handleGroupChange}
                            />
                        </div>

                        <ActionButtons
                            buttons={[
                                {
                                    key: 'create',
                                    label: isUpdating ? 'Guardando...' : 'Guardar',
                                    variant: 'continental',
                                    onClick: handleUpdate,
                                    className: 'w-28 h-10',
                                    disabled: isUpdating || !selectedArea || !formData.nombreArea.trim() || !formData.nombreSAP.trim()
                                }
                            ]}
                        />
                    </div>
                ) : (
                    <p className="text-center text-continental-gray-1">Selecciona un área para ver los detalles</p>
                )}
            </div>
        </div>
    );
};