import { useEffect, useState } from "react";
import { fechaLocalISO } from '@/utils/fechaLocal';
import { Navbar } from "../Navbar/Navbar";
import type { Area } from "@/interfaces/Areas.interface";
import type { AreaByIngenieroItem } from "@/interfaces/Areas.interface";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Label } from "../ui/label";
import { Link, useLocation } from "react-router-dom";
import useAuth from "@/hooks/useAuth";
import { getNavigationItems, getUserRole, formatRole } from "@/utils/navigationUtils";
import { userService } from "@/services/userService";
import { areasService } from "@/services/areasService";
import { useAreas } from "@/hooks/useAreas";
import { UserRole } from "@/interfaces/User.interface";
import { toast } from "sonner";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

interface SuplenteRequest {
    suplenteId?: number | null;
    fechaInicio: string;
    fechaFin: string;
    comentarios: string;
}

export const SolicitarSuplente = () => {
    const { user } = useAuth();
    const location = useLocation();
    const [formData, setFormData] = useState<SuplenteRequest>({
        suplenteId: undefined,
        fechaInicio: '',
        fechaFin: '',
        comentarios: ''
    });
    const [submitting, setSubmitting] = useState(false);
    const [removing, setRemoving] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);

    const userRole = getUserRole(user);
    const navItems = userRole ? getNavigationItems(userRole) : [];

    useAreas();
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [empleadosDisponibles, setEmpleadosDisponibles] = useState<Array<{ id: number; nombre: string }>>([]);
    const [areasLoading, setAreasLoading] = useState(false);
    const [areaOptions, setAreaOptions] = useState<Array<{ id: number; nombre: string }>>([]);
    const [ownedAreas, setOwnedAreas] = useState<Area[]>([]);
    const [engineerAreas, setEngineerAreas] = useState<AreaByIngenieroItem[]>([]);
    const [selectedAreaId, setSelectedAreaId] = useState<number | undefined>(undefined);

    useEffect(() => {
        const loadCandidates = async () => {
            if (!user) return;
            setLoadingUsers(true);
            try {
                const role = getUserRole(user)!;
                const candidates = await userService.getUsersByRole(role);
                const list = (candidates || [])
                    .filter((u: any) => u && typeof u.id === 'number' && u.id !== user?.id)
                    .map((u: any) => ({ id: u.id, nombre: u.fullName || u.username }));
                setEmpleadosDisponibles(list);
            } catch (e) {
                setEmpleadosDisponibles([]);
            } finally {
                setLoadingUsers(false);
            }
        };
        loadCandidates();
    }, [user?.id]);

    useEffect(() => {
        const loadAreas = async () => {
            if (!user) return;
            const role = getUserRole(user);
            if (!role) return;
            // Allow SuperAdmin to load areas too
            if (role !== UserRole.INDUSTRIAL && role !== UserRole.AREA_ADMIN && role !== UserRole.SUPER_ADMIN) return;

            setAreasLoading(true);
            try {
                let engineerItems: { id: number; nombre: string }[] = [];
                let ownedItems: { id: number; nombre: string }[] = [];

                // Check for engineer areas (Industrial OR SuperAdmin)
                if (role === UserRole.INDUSTRIAL || role === UserRole.SUPER_ADMIN) {
                    try {
                        const res = await areasService.getAreasByIngeniero(user.id);
                        const data = (res?.data || []) as AreaByIngenieroItem[];
                        setEngineerAreas(data);
                        engineerItems = data
                            .filter((a) => a && typeof a.areaId === 'number')
                            .map((a) => ({ id: a.areaId, nombre: a.areaNombre }));
                    } catch (e) {
                        console.debug("Not an engineer or error fetching engineer areas", e);
                    }
                }

                // Check for owned areas (AreaAdmin OR SuperAdmin)
                if (role === UserRole.AREA_ADMIN || role === UserRole.SUPER_ADMIN) {
                    try {
                        const all = await areasService.getAreas();
                        const owned = (all || []).filter((a: any) => a?.jefeId === user.id) as Area[];
                        setOwnedAreas(owned);
                        ownedItems = owned.map((a: Area) => ({ id: a.areaId, nombre: a.nombreGeneral }));
                    } catch (e) {
                        console.debug("Not an area admin or error fetching owned areas", e);
                    }
                }

                // Combine and deduplicate
                const allItems = [...ownedItems, ...engineerItems];
                const uniqueItems = Array.from(new Map(allItems.map(item => [item.id, item])).values());
                
                setAreaOptions(uniqueItems);
                if (uniqueItems.length === 1) setSelectedAreaId(uniqueItems[0].id);

            } catch (e) {
                setAreaOptions([]);
            } finally {
                setAreasLoading(false);
            }
        };
        loadAreas();
    }, [user?.id]);

    const resolveAreaIdForRole = async (role: string): Promise<number | undefined> => {
        if (!user?.id) return undefined;

        try {
            if (role === UserRole.INDUSTRIAL) {
                const res = await areasService.getAreasByIngeniero(user.id);
                const areas = res?.data || [];
                const first = areas.find(a => a.activo) || areas[0];
                const areaId = first?.areaId;
                return areaId;
            }

            if (role === UserRole.AREA_ADMIN) {
                const allAreas = await areasService.getAreas();
                const owned = (allAreas || []).filter(a => a?.jefeId === user.id);
                const areaId = owned[0]?.areaId;
                return areaId;
            }
        } catch (err) {
            console.debug('[Suplente] resolveAreaIdForRole -> error buscando AreaId', err);
        }
        return undefined;
    };

    const buildPayload = async (suplenteId: number | null | undefined) => {
        const userRole = getUserRole(user);
        if (!userRole) throw new Error('Rol de usuario no disponible');

        // Default payload with userRole, might be overridden
        const payload: { Rol: string; GrupoId?: number; AreaId?: number; SuplenteId?: number | null } = {
            Rol: userRole,
            SuplenteId: suplenteId ?? null,
        };

        if (userRole === UserRole.LEADER) {
            if (!user?.grupo?.grupoId) {
                throw new Error('No se encontró GrupoId del usuario');
            }
            payload.GrupoId = user.grupo.grupoId;
        } 
        else {
            // For INDUSTRIAL, AREA_ADMIN, or SUPER_ADMIN acting as one of them
            let areaId = selectedAreaId;
            
            // If no area selected, try to resolve one
            if (!areaId && (userRole === UserRole.INDUSTRIAL || userRole === UserRole.AREA_ADMIN)) {
                areaId = await resolveAreaIdForRole(userRole) ?? user?.area?.areaId;
            }

            if (areaId) {
                payload.AreaId = areaId;
                
                // Determine the role context based on the area
                const isOwned = ownedAreas.some(a => a.areaId === areaId);
                const isEngineer = engineerAreas.some(a => a.areaId === areaId);

                if (isOwned) {
                    payload.Rol = UserRole.AREA_ADMIN;
                } else if (isEngineer) {
                    payload.Rol = UserRole.INDUSTRIAL;
                } else if (userRole === UserRole.SUPER_ADMIN) {
                     // Fallback for superadmin if area found but not in specific lists (shouldn't happen with correct logic)
                     // Try to guess or default to AreaAdmin if they have permissions
                     payload.Rol = UserRole.AREA_ADMIN; 
                }
            } else if (userRole !== UserRole.SUPER_ADMIN) {
                 // Only throw if not SuperAdmin (SuperAdmin might not have area selected but logic shouldn't reach here if blocked by UI)
                 throw new Error('No se encontró AreaId del usuario');
            }
        }
        return payload;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.suplenteId) {
            toast.error('Selecciona un suplente');
            return;
        }
        if (!formData.fechaInicio || !formData.fechaFin) {
            toast.error('Selecciona el periodo de tiempo');
            return;
        }

        // Validar que fecha fin sea mayor a fecha inicio
        if (new Date(formData.fechaFin) <= new Date(formData.fechaInicio)) {
            toast.error('La fecha de fin debe ser posterior a la fecha de inicio');
            return;
        }

        const role = getUserRole(user);
        const requiresArea = role === UserRole.INDUSTRIAL || role === UserRole.AREA_ADMIN;
        if (requiresArea && areaOptions.length > 1 && !selectedAreaId) {
            toast.error('Selecciona un área');
            return;
        }

        try {
            setSubmitting(true);
            const payload = await buildPayload(formData.suplenteId);

            const finalPayload = {
                ...payload,
                FechaInicio: formData.fechaInicio,
                FechaFin: formData.fechaFin,
                Comentarios: formData.comentarios
            };
            await userService.requestSuplente(finalPayload);
            toast.success(`Solicitud de suplente enviada exitosamente`);

            if (payload.AreaId && getUserRole(user) === UserRole.AREA_ADMIN) {
                try {
                    const updated = await areasService.getAreaById(payload.AreaId);
                    setOwnedAreas(prev => {
                        const idx = prev.findIndex(a => a.areaId === updated.areaId);
                        if (idx === -1) return prev;
                        const copy = prev.slice();
                        copy[idx] = updated;
                        return copy;
                    });
                } catch (e) {
                    console.debug('[Suplente] refresh area after create -> error', e);
                }
            }
            if (getUserRole(user) === UserRole.INDUSTRIAL) {
                try {
                    const res = await areasService.getAreasByIngeniero(user!.id);
                    setEngineerAreas((res?.data || []) as AreaByIngenieroItem[]);
                } catch (e) {
                    console.debug('[Suplente] refresh engineer areas after create -> error', e);
                }
            }

            setFormData({
                suplenteId: undefined,
                fechaInicio: '',
                fechaFin: '',
                comentarios: ''
            });
        } catch (error) {
            console.error('Error al enviar solicitud de suplente:', error);
            toast.error('Error al enviar la solicitud');
        } finally {
            setSubmitting(false);
        }
    };

    const handleInputChange = (field: keyof SuplenteRequest, value: string | number) => {
        setFormData(prev => ({
            ...prev,
            [field]: value as any
        }));
    };

    const handleRemove = async () => {
        try {
            setRemoving(true);
            const payload = await buildPayload(null);

            const finalPayload = {
                ...payload,
                FechaInicio: fechaLocalISO(new Date()),
                FechaFin: fechaLocalISO(new Date()),
                Comentarios: 'Remoción de suplente'
            };

            await userService.requestSuplente(finalPayload);
            toast.success('Suplente removido');

            if (payload.AreaId && getUserRole(user) === UserRole.AREA_ADMIN) {
                try {
                    const updated = await areasService.getAreaById(payload.AreaId);
                    setOwnedAreas(prev => {
                        const idx = prev.findIndex(a => a.areaId === updated.areaId);
                        if (idx === -1) return prev;
                        const copy = prev.slice();
                        copy[idx] = updated;
                        return copy;
                    });
                } catch (e) {
                    console.debug('[Suplente] refresh area after remove -> error', e);
                }
            }
            if (getUserRole(user) === UserRole.INDUSTRIAL) {
                try {
                    const res = await areasService.getAreasByIngeniero(user!.id);
                    setEngineerAreas((res?.data || []) as AreaByIngenieroItem[]);
                } catch (e) {
                    console.debug('[Suplente] refresh engineer areas after remove -> error', e);
                }
            }
            setFormData(prev => ({ ...prev, suplenteId: undefined }));
        } catch (error) {
            console.error('Error al remover suplente:', error);
            toast.error('No se pudo remover el suplente');
        } finally {
            setRemoving(false);
            setConfirmOpen(false);
        }
    };

    return (
        <div className="flex flex-col h-screen">
            <Navbar>
                <nav className="flex gap-2">
                    {navItems.map((item) => {
                        const isActive = location.pathname === item.to;

                        return (
                            <Link
                                key={item.to}
                                to={item.to}
                                className={`rounded-lg flex items-center gap-2 px-4 py-2 transition-colors ${isActive
                                    ? 'bg-continental-yellow text-continental-black'
                                    : 'hover:bg-continental-yellow hover:text-continental-black'
                                    }`}
                            >
                                {item.icon}
                                <span>{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>
            </Navbar>

            <div className="flex-1 bg-gray-100 p-6">
                <div className="max-w-4xl mx-auto">
                    <Card className="p-6 bg-white shadow-sm">
                        <div className="mb-6 text-center">
                            <h1 className="text-2xl font-semibold text-continental-black mb-2">
                                Solicitar suplente
                            </h1>

                            <div className="bg-continental-gray-4 rounded-lg p-4 mb-6">
                                <div className="text-lg font-medium text-continental-black">
                                    {user?.fullName || user?.username || 'Usuario'}
                                </div>
                                <div className="text-sm text-continental-gray-1">
                                    {formatRole(user) || 'usuario@continental.com'}
                                </div>
                            </div>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-6">
                            {(areaOptions.length > 0 || userRole === UserRole.INDUSTRIAL || userRole === UserRole.AREA_ADMIN) && (
                                <div className="space-y-2">
                                    <Label htmlFor="area" className="text-sm font-medium text-continental-black">
                                        Área {areaOptions.length > 1 ? '*' : ''}
                                    </Label>
                                    <Select
                                        value={selectedAreaId ? String(selectedAreaId) : ''}
                                        onValueChange={(value) => setSelectedAreaId(parseInt(value))}
                                        disabled={areasLoading || areaOptions.length <= 1}
                                    >
                                        <SelectTrigger className="w-full cursor-pointer">
                                            <SelectValue
                                                placeholder={
                                                    areasLoading ? 'Cargando áreas…' : (areaOptions.length <= 1 ? 'Área única seleccionada' : 'Selecciona un área')
                                                }
                                            />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {areasLoading && (
                                                <div className="py-2 px-3 text-sm text-continental-gray-1">Cargando…</div>
                                            )}
                                            {!areasLoading && areaOptions.length === 0 && (
                                                <div className="py-2 px-3 text-sm text-continental-gray-1">No se encontraron áreas</div>
                                            )}
                                            {!areasLoading && areaOptions.length > 0 && areaOptions.map((a) => (
                                                <SelectItem key={a.id} value={String(a.id)} className="cursor-pointer">
                                                    {a.nombre}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {userRole === UserRole.AREA_ADMIN && selectedAreaId && (
                                        (() => {
                                            const area = ownedAreas.find(a => a.areaId === selectedAreaId);
                                            const supl = area?.jefeSuplente;
                                            return (
                                                <div className="mt-2 text-sm text-continental-gray-1">
                                                    {supl ? (
                                                        <span>Suplente actual: <span className="font-medium text-continental-black">{supl.fullName || supl.username}</span></span>
                                                    ) : (
                                                        <span>No hay suplente asignado para esta área</span>
                                                    )}
                                                </div>
                                            );
                                        })()
                                    )}
                                    {userRole === UserRole.INDUSTRIAL && selectedAreaId && (
                                        (() => {
                                            const area = engineerAreas.find(a => a.areaId === selectedAreaId);
                                            const suplName = area?.suplenteFullName || area?.suplenteUsername || null;
                                            return (
                                                <div className="mt-2 text-sm text-continental-gray-1">
                                                    {suplName ? (
                                                        <span>Suplente actual: <span className="font-medium text-continental-black">{suplName}</span></span>
                                                    ) : (
                                                        <span>No hay suplente asignado para esta área</span>
                                                    )}
                                                </div>
                                            );
                                        })()
                                    )}
                                </div>
                            )}

                            <div className="space-y-2">
                                <Label htmlFor="suplente" className="text-sm font-medium text-continental-black">
                                    Suplente *
                                </Label>
                                <Select value={formData.suplenteId ? String(formData.suplenteId) : ''} onValueChange={(value) => handleInputChange('suplenteId', parseInt(value))}>
                                    <SelectTrigger className="w-full cursor-pointer">
                                        <SelectValue placeholder="Selecciona un suplente" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {loadingUsers && (
                                            <div className="py-2 px-3 text-sm text-continental-gray-1">Cargando…</div>
                                        )}
                                        {!loadingUsers && empleadosDisponibles.length === 0 && (
                                            <div className="py-2 px-3 text-sm text-continental-gray-1">No hay candidatos disponibles para tu rol</div>
                                        )}
                                        {!loadingUsers && empleadosDisponibles.length > 0 && empleadosDisponibles.map((empleado) => (
                                            <SelectItem key={empleado.id} value={String(empleado.id)} className="cursor-pointer">
                                                {empleado.nombre}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-sm font-medium text-continental-black">Fecha inicio *</Label>
                                    <input
                                        type="date"
                                        value={formData.fechaInicio}
                                        onChange={(e) => handleInputChange("fechaInicio", e.target.value)}
                                        className="w-full p-2 border rounded-md"
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-sm font-medium text-continental-black">Fecha fin *</Label>
                                    <input
                                        type="date"
                                        value={formData.fechaFin}
                                        onChange={(e) => handleInputChange("fechaFin", e.target.value)}
                                        className="w-full p-2 border rounded-md"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-sm font-medium text-continental-black">Comentarios</Label>
                                <textarea
                                    rows={4}
                                    value={formData.comentarios}
                                    onChange={(e) => handleInputChange("comentarios", e.target.value)}
                                    className="w-full p-2 border rounded-md resize-none"
                                    placeholder="Agregar comentarios opcionales…"
                                />
                            </div>

                            <div className="flex gap-4 justify-end pt-4">
                                <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                                    <AlertDialogTrigger asChild>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="px-6 py-2 border-continental-red text-continental-red hover:bg-continental-red hover:text-white"
                                            disabled={removing}
                                        >
                                            {removing ? 'Removiendo…' : 'Remover suplente'}
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>¿Remover suplente actual?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                Esta acción no se puede deshacer, además dejará sin suplente el área seleccionada.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                            <AlertDialogAction onClick={handleRemove} className="bg-continental-yellow" disabled={removing}>
                                                Continuar
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>

                                <Button
                                    type="submit"
                                    variant="continental"
                                    className="px-8 py-2"
                                    disabled={submitting}
                                >
                                    {submitting ? 'Enviando…' : 'Crear'}
                                </Button>
                            </div>
                        </form>
                    </Card>
                </div>
            </div>
        </div>
    );
};