import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { User, Briefcase, Edit3, Save, X, ArrowLeft, Key } from "lucide-react";
import { userService } from "@/services/userService";
import type { User as ApiUser, UserAreaWithGroups } from "@/interfaces/User.interface";
import { UserStatus } from "@/interfaces/User.interface";
import { useAreas } from "@/hooks/useAreas";
import { ChangePasswordModal } from "@/components/Empleado/ChangePasswordModal";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DeleteUserModal } from "@/components/Empleado/DeleteUserModal";


// Using the API User interface directly
type UserData = ApiUser;

export const DetallesUsuario = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedData, setEditedData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);

  const currentData = editedData ?? userData;
  const currentAreaId = currentData?.areaId ?? null;
  const { areas, loading: areasLoading } = useAreas();

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  // Fetch user data from API
  useEffect(() => {
    const fetchUserData = async () => {
      if (!id) {
        setError("ID de usuario no proporcionado");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const user = await userService.getUserById(parseInt(id));
        console.log({ user });
        setUserData(user);
        setEditedData(user);
      } catch (error) {
        console.error("Error fetching user:", error);
        setError(
          error instanceof Error ? error.message : "Error al cargar el usuario"
        );
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [id]);

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!editedData || !id) return;

    setSaving(true);
    setError(null);

    try {
      console.log({ editedData });
      // 1. Realizar el PATCH (puede devolver datos parciales)
      await userService.updateUser(parseInt(id), {
        username: editedData.username,
        fullName: editedData.fullName,
        status: editedData.status,
        roles: (editedData.roles || []).map((role: any) =>
          typeof role === "object" ? role?.id : role
        ).filter(id => id !== undefined && id !== null),
        areaId: editedData.areaId ?? null
      });

      const freshUser = await userService.getUserById(parseInt(id));
      setUserData(freshUser);
      setEditedData(freshUser);
      setIsEditing(false);
      toast.success("Usuario actualizado correctamente");
    } catch (error: any) {
      console.error("Error updating user:", error);
      setError(
        error?.message || "Error al actualizar el usuario"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditedData(userData);
    setIsEditing(false);
  };

  const handleInputChange = (
    field: string,
    value: string | number | boolean | number[]
  ) => {
    if (!editedData) return;

    // Handle nested object updates for area and grupo
    if (field === "area" && typeof value === "string") {
      setEditedData({
        ...editedData,
        area: editedData.area
          ? { ...editedData.area, nombreGeneral: value }
          : null,
      });
    } else if (field === "grupo" && typeof value === "string") {
      setEditedData({
        ...editedData,
        grupo: editedData.grupo ? { ...editedData.grupo, rol: value } : null,
      });
    } else if (field === "status" && typeof value === "boolean") {
      setEditedData({
        ...editedData,
        status: value ? UserStatus.Activo : UserStatus.Desactivado,
      });
    } else if (field === "areaId" && typeof value === "string") {
        setEditedData({
            ...editedData,
            areaId: value ? parseInt(value, 10) : null
        });
    } else {
      setEditedData({
        ...editedData,
        [field]: value,
      });
    }
  };

  const getStatusBadge = (status: UserStatus) => {
    return status === UserStatus.Activo
      ? "bg-green-100 text-green-800 border-green-200"
      : "bg-red-100 text-red-800 border-red-200";
  };

  const getStatusText = (status: UserStatus) => {
    return status === UserStatus.Activo ? "Activo" : "Inactivo";
  };

  const handlePasswordChanged = () => {
    toast.success("Contraseña actualizada correctamente");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-continental-yellow"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center max-w-md px-4">
          <User className="mx-auto h-12 w-12 text-destructive mb-4" />
          <h3 className="text-lg font-semibold">Ha ocurrido un error</h3>
          <p className="text-muted-foreground mb-4">{error}</p>
          <div className="flex flex-col gap-2">
            <Button onClick={() => setError(null)} variant="continental">
              Reintentar
            </Button>
            <Button onClick={() => navigate("/admin/usuarios")} variant="outline">
              Regresar a Usuarios
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!userData) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <User className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">Usuario no encontrado</h3>
          <p className="text-muted-foreground">
            No se pudo cargar la información del usuario.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white min-h-screen">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Back Button */}
        <div className="flex items-center gap-4">
          <Button
            onClick={() => navigate("/admin/usuarios")}
            variant="outline"
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Regresar a Usuarios
          </Button>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[25px] font-bold text-continental-black">
              {userData.fullName}
            </h1>
          </div>

          <div className="flex gap-2">
            {!isEditing ? (
              <>
                <Button
                  onClick={handleEdit}
                  variant="continental"
                  className="gap-2"
                >
                  <Edit3 className="w-4 h-4" />
                  Editar
                </Button>
                <Button
                  onClick={() => setShowChangePasswordModal(true)}
                  variant="outline"
                  className="gap-2"
                >
                  <Key className="w-4 h-4" />
                  Restablecer Contraseña
                </Button>
                <Button
                    onClick={() => setShowDeleteModal(true)}
                    variant="destructive"
                    className="gap-2"
                >
                    Eliminar usuario
                </Button>
              </>
            ) : (
              <>
                <Button
                  onClick={handleSave}
                  variant="continental"
                  className="gap-2"
                  disabled={saving}
                >
                  <Save className="w-4 h-4" />
                  {saving ? "Guardando..." : "Guardar"}
                </Button>
                <Button
                  onClick={handleCancel}
                  variant="outline"
                  className="gap-2"
                >
                  <X className="w-4 h-4" />
                  Cancelar
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Formulario */}
        <div className="space-y-6">
          {/* Primera fila: Nombre y Correo */}
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-base font-medium text-continental-black">
                Nombre
              </label>
              {isEditing ? (
                <Input
                  type="text"
                  value={currentData.fullName}
                  onChange={(e) =>
                    handleInputChange("fullName", e.target.value)
                  }
                  placeholder="Ingrese el nombre completo"
                  className="w-full"
                />
              ) : (
                <p className="text-foreground bg-gray-50 p-3 rounded-lg border">
                  {currentData.fullName}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-base font-medium text-continental-black">
                Correo Electrónico
              </label>
              {isEditing ? (
                <Input
                  type="text"
                  value={currentData.username}
                  onChange={(e) =>
                    handleInputChange("username", e.target.value)
                  }
                  placeholder="nombre.usuario"
                  className="w-full"
                />
              ) : (
                <p className="text-foreground bg-gray-50 p-3 rounded-lg border">
                  {currentData.username}
                </p>
              )}
            </div>
          </div>

        {/* Segunda fila: Rol */}
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-base font-medium text-continental-black">
              Roles
            </label>

            {isEditing ? (
              <div className="space-y-2">
                <select
                  multiple
                  className="w-full border rounded-lg p-2"
                  value={
                    (editedData?.roles || []).map((r: any) =>
                      typeof r === "object" ? r?.id : r
                    )
                  }
                  onChange={(e) => {
                    const selected = Array.from(e.target.selectedOptions).map(
                      (opt) => parseInt(opt.value)
                    );
                    handleInputChange(
                      "roles",
                      selected
                    );
                  }}
                >
                  <option value={7}>SuperUsuario</option>
                  <option value={3}>Jefe De Area</option>
                  <option value={4}>Lider De Grupo</option>
                  <option value={5}>Ingeniero Industrial</option>
                  <option value={2}>Empleado Sindicalizado</option>
                  <option value={6}>Delegado Sindical</option>

                </select>
                <p className="text-xs text-muted-foreground">
                  Mantén presionado Ctrl o Cmd para seleccionar varios.
                </p>
              </div>
            ) : (
              <div className="text-foreground bg-gray-50 p-3 rounded-lg border">
                {currentData?.roles?.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {currentData.roles.map((role: any, index) => {
                      const roleName = typeof role === "object" ? role.name : 
                                     role === 7 ? "SuperUsuario" :
                                     role === 3 ? "Jefe De Area" :
                                     role === 4 ? "Lider De Grupo" :
                                     role === 5 ? "Ingeniero Industrial" :
                                     role === 2 ? "Empleado Sindicalizado" :
                                     role === 6 ? "Delegado Sindical" : role;
                      return (
                        <Badge key={index} variant="secondary">
                          {roleName}
                        </Badge>
                      );
                    })}
                  </div>
                ) : (
                  <span className="text-muted-foreground">
                    Sin roles asignados
                  </span>
                )}
              </div>
            )}
          </div>
          <div></div>
        </div>


          {/* Información Laboral */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="w-5 h-5" />
                Información Laboral
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Estado */}
              <div className="space-y-2">
                <label className="text-base font-medium text-continental-black">
                  Estado
                </label>
                {isEditing ? (
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={currentData.status === UserStatus.Activo}
                      onCheckedChange={(checked) =>
                        handleInputChange("status", checked)
                      }
                    />
                    <span className="text-sm text-muted-foreground">
                      {getStatusText(currentData.status)}
                    </span>
                  </div>
                ) : (
                  <Badge className={getStatusBadge(currentData.status)}>
                    {getStatusText(currentData.status)}
                  </Badge>
                )}
              </div>
                          <div className="space-y-2">
                              <label className="text-base font-medium text-continental-black">
                                  Área
                              </label>

                              {isEditing ? (
                                  <Select
                                      value={currentAreaId ? currentAreaId.toString() : "0"}
                                      onValueChange={(value) => handleInputChange("areaId", value === "0" ? null : value)}
                                      disabled={areasLoading}
                                  >
                                      <SelectTrigger>
                                          <SelectValue placeholder="Seleccionar área" />
                                      </SelectTrigger>

                                      <SelectContent>
                                          <SelectItem value="0">Sin área</SelectItem>

                                          {areas.map(area => (
                                              <SelectItem key={area.areaId} value={area.areaId.toString()}>
                                                  {area.nombreGeneral}
                                              </SelectItem>
                                          ))}
                                      </SelectContent>
                                  </Select>
                              ) : (
                                  <p className="text-foreground bg-gray-50 p-3 rounded-lg border">
                                      {userData.area?.nombreGeneral || "Sin área asignada"}
                                  </p>
                              )}
                          </div>
              {/* Áreas y Grupos (multi-área compatible) */}
              {/*{currentData.areas && currentData.areas.length > 0 ? (*/}
              {/*  <div className="space-y-4">*/}
              {/*    <label className="text-base font-medium text-continental-black block">*/}
              {/*      Áreas y Grupos*/}
              {/*    </label>*/}
              {/*    <div className="flex flex-col gap-3 bg-gray-50 p-4 rounded-lg border">*/}
              {/*      {currentData.areas.map((a: UserAreaWithGroups) => {*/}
              {/*        const groupCount = a.grupos?.length || 0;*/}
              {/*        return (*/}
              {/*          <div key={a.areaId} className="flex flex-col text-sm">*/}
              {/*            <div className="font-semibold text-continental-black">{a.nombreGeneral}</div>*/}
              {/*            <div className="text-muted-foreground">*/}
              {/*              {groupCount} grupo{groupCount === 1 ? '' : 's'}*/}
              {/*            </div>*/}
              {/*          </div>*/}
              {/*        );*/}
              {/*      })}*/}
              {/*    </div>*/}
              {/*    {isEditing && (*/}
              {/*      <p className="text-xs text-muted-foreground">* Edición de múltiples áreas/grupos no habilitada en esta vista.</p>*/}
              {/*    )}*/}
              {/*  </div>*/}
              {/*) : (*/}
              {/*  <div className="grid grid-cols-2 gap-6">*/}
              {/*    <div className="space-y-2">*/}
              {/*      <label className="text-base font-medium text-continental-black">*/}
              {/*        Área*/}
              {/*      </label>*/}
              {/*      {isEditing ? (*/}
              {/*        <Input*/}
              {/*          type="text"*/}
              {/*          value={currentData.area?.nombreGeneral || ""}*/}
              {/*          onChange={(e) => handleInputChange("area", e.target.value)}*/}
              {/*          placeholder="Seleccionar área"*/}
              {/*          className="w-full"*/}
              {/*        />*/}
              {/*      ) : (*/}
              {/*        <p className="text-foreground bg-gray-50 p-3 rounded-lg border">*/}
              {/*          {currentData.area?.nombreGeneral || "Sin área"}*/}
              {/*        </p>*/}
              {/*      )}*/}
              {/*    </div>*/}
              {/*    <div className="space-y-2">*/}
              {/*      <label className="text-base font-medium text-continental-black">*/}
              {/*        Grupo*/}
              {/*      </label>*/}
              {/*      {isEditing ? (*/}
              {/*        <Input*/}
              {/*          type="text"*/}
              {/*          value={currentData.grupo?.rol || ""}*/}
              {/*          onChange={(e) => handleInputChange("grupo", e.target.value)}*/}
              {/*          placeholder="Seleccionar grupo"*/}
              {/*          className="w-full"*/}
              {/*        />*/}
              {/*      ) : (*/}
              {/*        <p className="text-foreground bg-gray-50 p-3 rounded-lg border">*/}
              {/*          {currentData.grupo?.rol || "Sin grupo"}*/}
              {/*        </p>*/}
              {/*      )}*/}
              {/*    </div>*/}
              {/*  </div>*/}
              {/*)}*/}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Modal de cambio de contraseña */}
      <ChangePasswordModal
        show={showChangePasswordModal}
        onClose={() => setShowChangePasswordModal(false)}
        userId={userData.id}
        userName={userData.fullName}
        onPasswordChanged={handlePasswordChanged}
      />
      <DeleteUserModal
          show={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
          userId={userData.id}
          userName={userData.fullName}
          onDeleted={() => navigate("/admin/usuarios")}
      />
    </div>
  );
};
