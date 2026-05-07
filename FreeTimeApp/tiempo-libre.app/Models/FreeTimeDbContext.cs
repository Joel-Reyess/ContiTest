using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore;

namespace tiempo_libre.Models;

public partial class FreeTimeDbContext : DbContext
{
    public FreeTimeDbContext()
    {
    }

    public FreeTimeDbContext(DbContextOptions<FreeTimeDbContext> options)
        : base(options)
    {
    }

    public virtual DbSet<Notificaciones> Notificaciones { get; set; }
    public virtual DbSet<EmpleadosXBloquesDeTurnos> EmpleadosXBloquesDeTurnos { get; set; }
    public virtual DbSet<ManningPorMes> ManningPorMes { get; set; }
    public virtual DbSet<ManningPorDia> ManningPorDia { get; set; }
    public virtual DbSet<ReservacionesDeVacacionesPorEmpleado> ReservacionesDeVacacionesPorEmpleado { get; set; }
    public virtual DbSet<ConfiguracionBloquesTurnosAgendarVacaciones> ConfiguracionBloquesTurnosAgendarVacaciones { get; set; }
    public virtual DbSet<SolicitudIntercambiosOReprogramacion> SolicitudIntercambiosOReprogramacion { get; set; }
    public virtual DbSet<IntercambiosDiaFestivoPorDescanso> IntercambiosDiaFestivoPorDescanso { get; set; }
    public virtual DbSet<BloqueDeTurnosAgendarVacaciones> BloqueDeTurnosAgendarVacaciones { get; set; }
    public virtual DbSet<ReprogramacionesDeVacaciones> ReprogramacionesDeVacaciones { get; set; }
    public virtual DbSet<User> Users { get; set; }
    public virtual DbSet<Rol> Roles { get; set; }
    public virtual DbSet<RolInicialPorEmpleado> RolesInicialesPorEmpleado { get; set; }
    public virtual DbSet<Area> Areas { get; set; }
    public virtual DbSet<Empleado> Empleados { get; set; }
    public virtual DbSet<Grupo> Grupos { get; set; }
    public virtual DbSet<PermisosEincapacidade> PermisosEincapacidades { get; set; }
    public virtual DbSet<RolesEmpleado> RolesEmpleados { get; set; }
    public virtual DbSet<Regla> Reglas { get; set; }
    public virtual DbSet<RolSemanal> RolesSemanales { get; set; }
    public virtual DbSet<TurnoXRolSemanalXRegla> TurnosXRolSemanalXRegla { get; set; }
    public virtual DbSet<DiasInhabiles> DiasInhabiles { get; set; }
    public virtual DbSet<IncidenciaOPermiso> IncidenciasOPermisos { get; set; }
    public virtual DbSet<Vacaciones> Vacaciones { get; set; }
    public virtual DbSet<AreaIngeniero> AreaIngenieros { get; set; }
    public virtual DbSet<VacacionesPorAntiguedad> VacacionesPorAntiguedad { get; set; }
    public virtual DbSet<LoggerAcciones> LoggerAcciones { get; set; }
    public virtual DbSet<ProgramacionesAnuales> ProgramacionesAnuales { get; set; }
    public virtual DbSet<DiasFestivosTrabajados> DiasFestivosTrabajados { get; set; }
    public virtual DbSet<DiasFestivosTrabajadosOriginalTable> DiasFestivosTrabajadosOriginalTable { get; set; }
    public virtual DbSet<CalendarioEmpleado> CalendarioEmpleados { get; set; }
    public virtual DbSet<DiasCalendarioEmpleado> DiasCalendarioEmpleado { get; set; }

    // Nuevas tablas del sistema de vacaciones unificado
    public virtual DbSet<ConfiguracionVacaciones> ConfiguracionVacaciones { get; set; }
    public virtual DbSet<ExcepcionesPorcentaje> ExcepcionesPorcentaje { get; set; }
    public virtual DbSet<ExcepcionesManning> ExcepcionesManning { get; set; }
    public virtual DbSet<VacacionesProgramadas> VacacionesProgramadas { get; set; }
    public virtual DbSet<SolicitudesReprogramacion> SolicitudesReprogramacion { get; set; }
    public virtual DbSet<SolicitudesFestivosTrabajados> SolicitudesFestivosTrabajados { get; set; }
    public virtual DbSet<FestivosEmpleadosTrabajadosUpload> FestivosEmpleadosTrabajadosUpload { get; set; }
    public virtual DbSet<SolicitudReprogramacionPostIncapacidad> SolicitudesReprogramacionPostIncapacidad { get; set; } = null!;
    public virtual DbSet<SolicitudReprogramacionDiaEmpresa> SolicitudesReprogramacionDiaEmpresa { get; set; } = null!;

    public DbSet<SuplentePeriodo> SuplentePeriodos { get; set; }
    public DbSet<Permuta> Permutas { get; set; }
    public virtual DbSet<PermisosEIncapacidadesSAP> PermisosEIncapacidadesSAP { get; set; }
    //public DbSet<SolicitudPermiso> SolicitudesPermisos { get; set; }
    public virtual DbSet<RolEmpleadoSAP> RolesEmpleadosSAP { get; set; }

    public virtual DbSet<PermisosEIncapacidadesSAPActualizar> PermisosEIncapacidadesSAPActualizar { get; set; }

    // Sistema de bloques de reservación
    public virtual DbSet<BloquesReservacion> BloquesReservacion { get; set; }
    public virtual DbSet<AsignacionesBloque> AsignacionesBloque { get; set; }
    public virtual DbSet<CambiosBloque> CambiosBloque { get; set; }

    // Sistema de códigos de verificación
    public virtual DbSet<CodigoVerificacion> CodigosVerificacion { get; set; }

    // Transferencias de personal entre grupos
    public virtual DbSet<TransferenciaGrupo> TransferenciasGrupo { get; set; }

    // Sistema de edición de días asignados por empresa
    public virtual DbSet<ConfiguracionEdicionDiasEmpresa> ConfiguracionEdicionDiasEmpresa { get; set; }
    public virtual DbSet<SolicitudEdicionDiaEmpresa> SolicitudesEdicionDiasEmpresa { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {

        // DiasFestivosTrabajadosOriginalTable
        modelBuilder.Entity<DiasFestivosTrabajadosOriginalTable>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Nomina).IsRequired();
            entity.Property(e => e.Nombre).IsRequired().HasMaxLength(150);
            entity.Property(e => e.FestivoTrabajado).IsRequired();
        });

        // Notificaciones
        modelBuilder.Entity<Notificaciones>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TipoDeNotificacion).IsRequired().HasMaxLength(100);
            entity.Property(e => e.Titulo).IsRequired().HasMaxLength(150);
            entity.Property(e => e.Mensaje).IsRequired().HasMaxLength(500);
            entity.HasOne(e => e.UsuarioReceptor)
                .WithMany()
                .HasForeignKey(e => e.IdUsuarioReceptor)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.UsuarioEmisor)
                .WithMany()
                .HasForeignKey(e => e.IdUsuarioEmisor)
                .OnDelete(DeleteBehavior.Restrict);
            // IdSolicitud: relación polimórfica, solo referencia por id
        });

        // ManningPorMes
        modelBuilder.Entity<ManningPorMes>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Anio).IsRequired();
            entity.Property(e => e.Mes).IsRequired();
            entity.Property(e => e.PorcentajeManning).IsRequired().HasColumnType("decimal(5,2)");
            entity.Property(e => e.BorradoLogico).HasDefaultValue(false).IsRequired();
            entity.Property(e => e.Created_At).IsRequired();
            entity.Property(e => e.Updated_At);
            entity.HasOne(e => e.UsuarioModifica)
                .WithMany()
                .HasForeignKey(e => e.IdUsuarioModifica)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.JefeArea)
                .WithMany()
                .HasForeignKey(e => e.IdJefeArea)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.Area)
                .WithMany(a => a.ManningPorMes)
                .HasForeignKey(e => e.IdArea)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // ManningPorDia
        modelBuilder.Entity<ManningPorDia>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Anio).IsRequired();
            entity.Property(e => e.Mes).IsRequired();
            entity.Property(e => e.Dia).IsRequired();
            entity.Property(e => e.Fecha).IsRequired();
            entity.Property(e => e.PorcentajeManning).IsRequired().HasColumnType("decimal(5,2)");
            entity.Property(e => e.BorradoLogico).HasDefaultValue(false).IsRequired();
            entity.Property(e => e.Created_At).IsRequired();
            entity.Property(e => e.Updated_At);
            entity.HasOne(e => e.UsuarioModifica)
                .WithMany()
                .HasForeignKey(e => e.IdUsuarioModifica)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.JefeArea)
                .WithMany()
                .HasForeignKey(e => e.IdJefeArea)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.Area)
                .WithMany(a => a.ManningPorDia)
                .HasForeignKey(e => e.IdArea)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // EmpleadosXBloquesDeTurnos
        modelBuilder.Entity<EmpleadosXBloquesDeTurnos>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.NominaEmpleadoSindicalAgendara).IsRequired();
            entity.Property(e => e.AntiguedadEnAniosAlMomentoDeAgendar).IsRequired();
            entity.Property(e => e.FechaYHoraAgendacion).IsRequired();
            entity.Property(e => e.AgendooVacaciones).IsRequired().HasDefaultValue(false);
            entity.Property(e => e.AgendoTodo).IsRequired().HasDefaultValue(false);
            entity.Property(e => e.Created_At).IsRequired();
            entity.Property(e => e.Updated_At);
            entity.HasOne(e => e.BloqueDeTurnosAgendarVacaciones)
                .WithMany()
                .HasForeignKey(e => e.IdBloqueDeTurnos)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.EmpleadoSindicalAgendara)
                .WithMany()
                .HasForeignKey(e => e.IdEmpleadoSindicalAgendara)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // ReservacionesDeVacacionesPorEmpleado
        modelBuilder.Entity<ReservacionesDeVacacionesPorEmpleado>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.NominaEmpleadoSindical).IsRequired();
            entity.Property(e => e.FechaDiaDeVacacion).IsRequired();
            entity.Property(e => e.Created_At).IsRequired();
            entity.Property(e => e.Updated_At);
            entity.HasOne(e => e.BloqueDeTurnosAgendarVacaciones)
                .WithMany()
                .HasForeignKey(e => e.IdBloqueDeTurnos)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.EmpleadoSindicalizado)
                .WithMany()
                .HasForeignKey(e => e.IdEmpleadoSindicalizado)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.ProgramacionAnual)
                .WithMany()
                .HasForeignKey(e => e.IdProgramacionAnual)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.CalendarioEmpleado)
                .WithMany()
                .HasForeignKey(e => e.IdCalendarioEmpleado)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.DiaCalendarioEmpleado)
                .WithMany()
                .HasForeignKey(e => e.IdDiaCalendarioEmpleado)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // BloqueDeTurnosAgendarVacaciones
        modelBuilder.Entity<BloqueDeTurnosAgendarVacaciones>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.IndiceBloqueDeTurnos).IsRequired();
            entity.Property(e => e.NombreDelBloque).IsRequired().HasMaxLength(50);
            entity.Property(e => e.FechaYHoraInicio).IsRequired();
            entity.Property(e => e.FechaYHoraFin).IsRequired();
            entity.Property(e => e.DuracionEnHoras).IsRequired();
            entity.Property(e => e.Created_At).IsRequired();
            entity.Property(e => e.Updated_At);
            entity.HasOne(e => e.JefeArea)
                .WithMany()
                .HasForeignKey(e => e.IdJefeArea)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.Area)
                .WithMany()
                .HasForeignKey(e => e.IdArea)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.Grupo)
                .WithMany()
                .HasForeignKey(e => e.IdGrupo)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.PeriodoDeProgramacionAnual)
                .WithMany()
                .HasForeignKey(e => e.IdPeriodoDeProgramacionAnual)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex(e => new { e.IndiceBloqueDeTurnos, e.IdPeriodoDeProgramacionAnual }).IsUnique();
        });

        // ConfiguracionBloquesTurnosAgendarVacaciones
        modelBuilder.Entity<ConfiguracionBloquesTurnosAgendarVacaciones>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.MaximoDeEmpleadosQuePuedenAgendar).IsRequired();
            entity.Property(e => e.TiempoEnHorasDelTurno).IsRequired();
            entity.Property(e => e.Created_At).IsRequired();
            entity.Property(e => e.Updated_At);
            entity.HasOne(e => e.Area)
                .WithMany()
                .HasForeignKey(e => e.IdArea)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.Grupo)
                .WithMany()
                .HasForeignKey(e => e.IdGrupo)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // SolicitudIntercambiosOReprogramacion
        modelBuilder.Entity<SolicitudIntercambiosOReprogramacion>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.NominaEmpleadoSindical).IsRequired();
            entity.Property(e => e.TipoDeSolicitud).IsRequired();
            entity.Property(e => e.Justificacion).HasMaxLength(250);
            entity.Property(e => e.Estatus).IsRequired();
            entity.Property(e => e.Created_At).IsRequired();
            entity.Property(e => e.Updated_At);
            entity.Property(e => e.FechaRespuesta);
            entity.HasOne(e => e.JefeArea)
                .WithMany()
                .HasForeignKey(e => e.IdJefeArea)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.LiderGrupo)
                .WithMany()
                .HasForeignKey(e => e.IdLiderGrupo)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.UsuarioComiteSindicalSolicitante)
                .WithMany()
                .HasForeignKey(e => e.IdUsuarioComiteSindicalSolicitante)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.EmpleadoSindicalizadoSolicitante)
                .WithMany()
                .HasForeignKey(e => e.IdEmpleadoSindicalizadoSolicitante)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.JefeLiderAutoriza)
                .WithMany()
                .HasForeignKey(e => e.IdJefeLiderAutoriza)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.Area)
                .WithMany()
                .HasForeignKey(e => e.IdArea)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.Grupo)
                .WithMany()
                .HasForeignKey(e => e.IdGrupo)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.IntercambiosDiaFestivoPorDescanso)
                .WithMany()
                .HasForeignKey(e => e.IdIntercambiosDiaFestivoPorDescanso)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.ReprogramacionesDeVacaciones)
                .WithMany()
                .HasForeignKey(e => e.IdReprogramacionesDeVacaciones)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.PeriodoDeProgramacionAnual)
                .WithMany()
                .HasForeignKey(e => e.IdPeriodoDeProgramacionAnual)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // ReprogramacionesDeVacaciones
        modelBuilder.Entity<ReprogramacionesDeVacaciones>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.NominaEmpleadoSindical).IsRequired();
            entity.Property(e => e.FechaDiasDeVacacionOriginal).IsRequired();
            entity.Property(e => e.FechaDiasDeVacacionReprogramada).IsRequired();
            entity.Property(e => e.Estatus).IsRequired().HasDefaultValue(Enums.EstatusReprogramacionDeVacacionesEnum.Pendiente);
            entity.Property(e => e.Created_At).IsRequired();
            entity.Property(e => e.Updated_At);
            entity.Property(e => e.Detalles).HasMaxLength(250);
            entity.HasOne(e => e.EmpleadoSindicalizadoSolicitante)
                .WithMany()
                .HasForeignKey(e => e.IdEmpleadoSindicalizadoSolicitante)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.UsuarioComiteSindicalSolicitante)
                .WithMany()
                .HasForeignKey(e => e.IdUsuarioComiteSindicalSolicitante)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.PeriodoDeProgramacionAnual)
                .WithMany()
                .HasForeignKey(e => e.IdPeriodoDeProgramacionAnual)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.DiaCalEmpCambiar)
                .WithMany()
                .HasForeignKey(e => e.IdDiaCalEmpCambiar)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.DiaCalEmpNuevo)
                .WithMany()
                .HasForeignKey(e => e.IdDiaCalEmpNuevo)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // SolicitudIntercambiosOReprogramacion
        modelBuilder.Entity<SolicitudIntercambiosOReprogramacion>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.NominaEmpleadoSindical).IsRequired();
            entity.Property(e => e.TipoDeSolicitud).IsRequired();
            entity.Property(e => e.Justificacion).HasMaxLength(250);
            entity.Property(e => e.Estatus).IsRequired();
            entity.Property(e => e.Created_At).IsRequired();
            entity.Property(e => e.Updated_At);
            entity.Property(e => e.FechaRespuesta);
            entity.HasOne(e => e.JefeArea)
                .WithMany()
                .HasForeignKey(e => e.IdJefeArea)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.LiderGrupo)
                .WithMany()
                .HasForeignKey(e => e.IdLiderGrupo)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.UsuarioComiteSindicalSolicitante)
                .WithMany()
                .HasForeignKey(e => e.IdUsuarioComiteSindicalSolicitante)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.EmpleadoSindicalizadoSolicitante)
                .WithMany()
                .HasForeignKey(e => e.IdEmpleadoSindicalizadoSolicitante)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.JefeLiderAutoriza)
                .WithMany()
                .HasForeignKey(e => e.IdJefeLiderAutoriza)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.Area)
                .WithMany()
                .HasForeignKey(e => e.IdArea)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.Grupo)
                .WithMany()
                .HasForeignKey(e => e.IdGrupo)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.IntercambiosDiaFestivoPorDescanso)
                .WithMany()
                .HasForeignKey(e => e.IdIntercambiosDiaFestivoPorDescanso)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.ReprogramacionesDeVacaciones)
                .WithMany()
                .HasForeignKey(e => e.IdReprogramacionesDeVacaciones)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.PeriodoDeProgramacionAnual)
                .WithMany()
                .HasForeignKey(e => e.IdPeriodoDeProgramacionAnual)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // IntercambiosDiaFestivoPorDescanso
        modelBuilder.Entity<IntercambiosDiaFestivoPorDescanso>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.NominaEmpleadoSindical).IsRequired();
            entity.Property(e => e.FechaDiaFestivoTrabajado).IsRequired();
            entity.Property(e => e.FechaDiaDescansoQueTomara).IsRequired();
            entity.Property(e => e.Justificacion).HasMaxLength(250);
            entity.Property(e => e.Estatus).IsRequired();
            entity.Property(e => e.TiposDeCambiosEnum).IsRequired();
            entity.Property(e => e.CambiosAplicados).HasDefaultValue(false).IsRequired();
            entity.Property(e => e.Created_At).IsRequired();
            entity.Property(e => e.Updated_At);
            entity.HasOne(e => e.JefeArea)
                .WithMany()
                .HasForeignKey(e => e.IdJefeArea)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.LiderGrupo)
                .WithMany()
                .HasForeignKey(e => e.IdLiderGrupo)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.JefeAutoriza)
                .WithMany()
                .HasForeignKey(e => e.IdJefeAutoriza)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.UsuarioComiteSindicalSolicitante)
                .WithMany()
                .HasForeignKey(e => e.IdUsuarioComiteSindicalSolicitante)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.Area)
                .WithMany()
                .HasForeignKey(e => e.IdArea)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.Grupo)
                .WithMany()
                .HasForeignKey(e => e.IdGrupo)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.EmpleadoSindicalizadoSolicitante)
                .WithMany()
                .HasForeignKey(e => e.IdEmpleadoSindicalizadoSolicitante)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.DiaFestivoTrabajado)
                .WithMany()
                .HasForeignKey(e => e.IdDiaFestivoTrabajado)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.DiaCalEmpDescansoQueTomara)
                .WithMany()
                .HasForeignKey(e => e.IdDiaCalEmpDescansoQueTomara)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.PeriodoDeProgramacionAnual)
                .WithMany()
                .HasForeignKey(e => e.IdPeriodoDeProgramacionAnual)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // DiasFestivosTrabajados
        modelBuilder.Entity<DiasFestivosTrabajados>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.NominaEmpleadoSindical).IsRequired();
            entity.Property(e => e.FechaDiaFestivoTrabajado).IsRequired();
            entity.Property(e => e.Compensado).HasDefaultValue(false).IsRequired();
            entity.Property(e => e.Created_At).IsRequired();
            entity.Property(e => e.Updated_At);
            entity.HasOne(e => e.User)
                .WithMany()
                .HasForeignKey(e => e.IdUsuarioEmpleadoSindicalizado)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.Area)
                .WithMany()
                .HasForeignKey(e => e.IdArea)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.Grupo)
                .WithMany()
                .HasForeignKey(e => e.IdGrupo)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // ProgramacionesAnuales
        modelBuilder.Entity<ProgramacionesAnuales>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Anio).IsRequired();
            entity.Property(e => e.FechaInicia).IsRequired();
            entity.Property(e => e.FechaTermina).IsRequired();
            entity.Property(e => e.Detalles).HasMaxLength(250);
            entity.Property(e => e.Estatus).IsRequired();
            entity.Property(e => e.BorradoLogico).HasDefaultValue(false).IsRequired();
            entity.Property(e => e.Created_At).IsRequired();
            entity.Property(e => e.Updated_At);
            entity.Property(e => e.Deleted_At);
            entity.HasOne(e => e.User)
                .WithMany()
                .HasForeignKey(e => e.IdSuperUser)
                .OnDelete(DeleteBehavior.Restrict);
        });
        // LoggerAcciones
        modelBuilder.Entity<LoggerAcciones>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.NombreCompletoUsuario).HasMaxLength(150).IsRequired();
            entity.Property(e => e.Modelo).HasMaxLength(100).IsRequired();
            entity.Property(e => e.Detalles).HasMaxLength(250);
            entity.Property(e => e.Created_At).IsRequired();
            entity.Property(e => e.Fecha).IsRequired();
            entity.HasOne(e => e.User)
                .WithMany()
                .HasForeignKey(e => e.IdUsuario)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.Area)
                .WithMany()
                .HasForeignKey(e => e.IdArea)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.Grupo)
                .WithMany()
                .HasForeignKey(e => e.IdGrupo)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<User>()
            .HasMany(u => u.Roles)
            .WithMany()
            .UsingEntity(j => j.ToTable("UserRoles"));
        modelBuilder.Entity<Area>(entity =>
        {
            entity.HasKey(e => e.AreaId).HasName("PK__Areas__70B82048C119927A");

            entity.Property(e => e.NombreGeneral).HasMaxLength(200);
            entity.Property(e => e.UnidadOrganizativaSap).HasMaxLength(300);
            entity.HasOne(a => a.Jefe)
                .WithMany()
                .HasForeignKey(a => a.JefeId)
                .OnDelete(DeleteBehavior.Restrict)
                .HasConstraintName("FK_Area_Jefe");
            entity.HasOne(a => a.JefeSuplente)
                .WithMany()
                .HasForeignKey(a => a.JefeSuplenteId)
                .OnDelete(DeleteBehavior.Restrict)
                .HasConstraintName("FK_Area_JefeSuplente");

            // Configure many-to-many relationship with Users (Ingenieros)
            entity.HasMany(a => a.Ingenieros)
                .WithMany(u => u.AreasAsIngeniero)
                .UsingEntity<AreaIngeniero>(
                    j => j.HasOne(ai => ai.Ingeniero)
                        .WithMany(u => u.AreaIngenieros)
                        .HasForeignKey(ai => ai.IngenieroId)
                        .OnDelete(DeleteBehavior.Restrict),
                    j => j.HasOne(ai => ai.Area)
                        .WithMany(a => a.AreaIngenieros)
                        .HasForeignKey(ai => ai.AreaId)
                        .OnDelete(DeleteBehavior.Restrict),
                    j =>
                    {
                        j.HasKey(ai => ai.Id);
                        j.HasOne(ai => ai.Suplente)
                            .WithMany()
                            .HasForeignKey(ai => ai.SuplenteId)
                            .OnDelete(DeleteBehavior.Restrict)
                            .HasConstraintName("FK_AreaIngeniero_Suplente");
                        j.HasIndex(ai => new { ai.AreaId, ai.IngenieroId })
                            .IsUnique()
                            .HasDatabaseName("IX_AreaIngeniero_Unique");
                        j.ToTable("AreaIngenieros");
                    });
        });

        modelBuilder.Entity<Empleado>(entity =>
        {
            entity.HasKey(e => e.Nomina).HasName("PK__Empleado__765BE2D8758F406A");

            entity.Property(e => e.Nomina).ValueGeneratedNever();
            entity.Property(e => e.EncargadoRegistro).HasMaxLength(100);
            entity.Property(e => e.Nombre).HasMaxLength(100);
            entity.Property(e => e.Posicion).HasMaxLength(100);
            entity.Property(e => e.Rol).HasMaxLength(50);
            entity.Property(e => e.UnidadOrganizativa).HasMaxLength(150);
        });

        modelBuilder.Entity<Grupo>(entity =>
        {
            entity.HasKey(e => e.GrupoId).HasName("PK__Grupos__556BF040AD6A4924");

            entity.Property(e => e.Rol).HasMaxLength(100);

            entity.HasOne(d => d.Area).WithMany(p => p.Grupos)
                .HasForeignKey(d => d.AreaId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Grupos_Areas");

            entity.HasOne(g => g.Lider)
                .WithMany()
                .HasForeignKey(g => g.LiderId)
                .OnDelete(DeleteBehavior.Restrict)
                .HasConstraintName("FK_Grupo_Lider");

            entity.HasOne(g => g.LiderSuplente)
                .WithMany()
                .HasForeignKey(g => g.LiderSuplenteId)
                .OnDelete(DeleteBehavior.Restrict)
                .HasConstraintName("FK_Grupo_LiderSuplente");
        });

        modelBuilder.Entity<PermisosEincapacidade>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("PK__Permisos__3214EC27F814167F");

            entity.ToTable("PermisosEIncapacidades");

            entity.Property(e => e.Id).HasColumnName("ID");
            entity.Property(e => e.ClaseAbsentismo).HasMaxLength(150);
            entity.Property(e => e.Nombre).HasMaxLength(100);
            entity.Property(e => e.Posicion).HasMaxLength(100);
        });

        modelBuilder.Entity<RolesEmpleado>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("PK__RolesEmp__3214EC2740992AEF");

            entity.Property(e => e.Id).HasColumnName("ID");
            entity.Property(e => e.Dia)
                .HasMaxLength(2)
                .IsUnicode(false)
                .IsFixedLength();
            entity.Property(e => e.EncTiempos).HasMaxLength(100);
            entity.Property(e => e.Nombre).HasMaxLength(100);
            entity.Property(e => e.Phtd)
                .HasMaxLength(10)
                .HasColumnName("PHTD");
            entity.Property(e => e.TextoPlanHrTrDia).HasMaxLength(100);
        });

        // Indices para RolInicialPorEmpleado
        modelBuilder.Entity<RolInicialPorEmpleado>().HasIndex(ripe => ripe.Nomina);

        // Indices para DiasInhabiles
        modelBuilder.Entity<DiasInhabiles>().HasIndex(d => d.Fecha);
        modelBuilder.Entity<DiasInhabiles>().HasIndex(d => d.AnioFechaInicial);
        modelBuilder.Entity<DiasInhabiles>().HasIndex(d => d.MesFechaInicial);
        modelBuilder.Entity<DiasInhabiles>().HasIndex(d => d.DiaFechaInicial);
        modelBuilder.Entity<DiasInhabiles>().HasIndex(d => d.AnioFechaFinal);
        modelBuilder.Entity<DiasInhabiles>().HasIndex(d => d.MesFechaFinal);
        modelBuilder.Entity<DiasInhabiles>().HasIndex(d => d.DiaFechaFinal);

        // Indices para IncidenciaOPermiso
        modelBuilder.Entity<IncidenciaOPermiso>().HasIndex(i => i.Fecha);
        modelBuilder.Entity<IncidenciaOPermiso>().HasIndex(i => i.NominaEmpleado);
        modelBuilder.Entity<IncidenciaOPermiso>().HasIndex(i => i.AnioFechaInicial);
        modelBuilder.Entity<IncidenciaOPermiso>().HasIndex(i => i.MesFechaInicial);
        modelBuilder.Entity<IncidenciaOPermiso>().HasIndex(i => i.DiaFechaInicial);

        // Indices para Vacaciones
        modelBuilder.Entity<Vacaciones>().HasIndex(v => v.Fecha);
        modelBuilder.Entity<Vacaciones>().HasIndex(v => v.NominaEmpleado);
        modelBuilder.Entity<Vacaciones>().HasIndex(v => v.AnioFecha);
        modelBuilder.Entity<Vacaciones>().HasIndex(v => v.MesFecha);
        modelBuilder.Entity<Vacaciones>().HasIndex(v => v.DiaFecha);


        modelBuilder.Entity<Regla>(entity =>
        {
            entity.HasIndex(e => e.ReglaEnumId)
            .IsUnique();
        });

        // Relaciones para RolesSemanales
        modelBuilder.Entity<RolSemanal>(entity =>
        {
            entity.HasOne(rs => rs.Regla)
                .WithMany(rs => rs.RolesSemanales)
                .HasForeignKey(rs => rs.IdRegla)
                .OnDelete(DeleteBehavior.Restrict)
                .HasConstraintName("FK_RolSemanal_Regla");
        });

        // Relaciones para TurnosXRolSemanalXRegla
        modelBuilder.Entity<TurnoXRolSemanalXRegla>(entity =>
        {
            entity.HasOne(txrsxr => txrsxr.Regla)
                .WithMany(r => r.TurnosXRolSemanalXRegla)
                .HasForeignKey(txrsxr => txrsxr.IdRegla)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(txrsxr => txrsxr.RolSemanal)
                .WithMany()
                .HasForeignKey(txrsxr => txrsxr.IdRolSemanal)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // Relaciones para Vacaciones
        modelBuilder.Entity<Vacaciones>(entity =>
        {
            entity.HasOne(v => v.UsuarioEmpleadoSindicalizado)
                .WithMany()
                .HasForeignKey(v => v.IdUsuarioEmpleadoSindicalizado)
                .OnDelete(DeleteBehavior.Restrict)
                .HasConstraintName("FK_Vacaciones_UsuarioEmpleadoSindicalizado");
            entity.HasOne(v => v.Grupo)
                .WithMany()
                .HasForeignKey(v => v.IdGrupo)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(v => v.TurnoXRolSemanalXRegla)
                .WithMany()
                .HasForeignKey(v => v.IdTurnoXRolSemanalXRegla)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // Relaciones para User
        modelBuilder.Entity<User>(entity =>
        {
            entity.HasOne(u => u.VacacionesPorAntiguedad)
                .WithMany(vpa => vpa.Users)
                .HasForeignKey(u => u.VacacionesPorAntiguedadId)
                .OnDelete(DeleteBehavior.Restrict)
                .HasConstraintName("FK_User_VacacionesPorAntiguedad");

            entity.HasOne(u => u.Grupo)
                .WithMany()
                .HasForeignKey(u => u.GrupoId)
                .OnDelete(DeleteBehavior.Restrict)
                .HasConstraintName("FK_User_Grupo")
                .IsRequired(false); // Relación opcional

            entity.HasOne(u => u.Area)
                .WithMany()
                .HasForeignKey(u => u.AreaId)
                .OnDelete(DeleteBehavior.Restrict)
                .HasConstraintName("FK_User_Area")
                .IsRequired(false); // Relación opcional
        });

        // Relaciones para CalendarioEmpleado
        modelBuilder.Entity<CalendarioEmpleado>(entity =>
        {
            entity.HasOne(c => c.Regla)
                .WithMany()
                .HasForeignKey(c => c.IdRegla)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(c => c.RolSemanalIniciaGeneracionDeCalendario)
                .WithMany()
                .HasForeignKey(c => c.IdRolSemanalIniciaGeneracionDeCalendario)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(c => c.Area)
                .WithMany()
                .HasForeignKey(c => c.IdArea)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(c => c.Grupo)
                .WithMany()
                .HasForeignKey(c => c.IdGrupo)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(c => c.ProgramacionAnual)
                .WithMany()
                .HasForeignKey(c => c.IdProgramacionAnual)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(c => c.UsuarioEmpleadoSindicalizado)
                .WithMany()
                .HasForeignKey(c => c.IdUsuarioEmpleadoSindicalizado)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(c => c.VacacionesPorAntiguedad)
                .WithMany()
                .HasForeignKey(c => c.IdVacacionesPorAntiguedad)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // Relaciones para DiaCalendarioEmpleado
        modelBuilder.Entity<DiasCalendarioEmpleado>(entity =>
        {
            entity.HasOne(c => c.ProgramacionAnual)
                .WithMany()
                .HasForeignKey(c => c.IdProgramacionAnual)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(c => c.CalendarioEmpleado)
                .WithMany()
                .HasForeignKey(c => c.IdCalendarioEmpleado)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(c => c.Area)
                .WithMany()
                .HasForeignKey(c => c.IdArea)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(c => c.Grupo)
                .WithMany()
                .HasForeignKey(c => c.IdGrupo)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(c => c.Regla)
                .WithMany()
                .HasForeignKey(c => c.IdRegla)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(c => c.RolSemanal)
                .WithMany()
                .HasForeignKey(c => c.IdRolSemanal)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(c => c.TurnoXRolSemanalXRegla)
                .WithMany()
                .HasForeignKey(c => c.IdTurnoXRolSemanalXRegla)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(c => c.UsuarioEmpleadoSindicalizado)
                .WithMany()
                .HasForeignKey(c => c.IdUsuarioEmpleadoSindicalizado)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(c => c.Vacaciones)
                .WithMany()
                .HasForeignKey(c => c.IdVacaciones)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(c => c.IncidenciaOPermiso)
                .WithMany()
                .HasForeignKey(c => c.IdIncidenciaOPermiso)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(c => c.DiaInhabil)
                .WithMany()
                .HasForeignKey(c => c.IdDiaInhabil)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(c => c.IntercambioDiaFestivoPorDescanso)
                .WithMany()
                .HasForeignKey(c => c.IdIntercambioDiaFestivoPorDescanso)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(c => c.ReprogramacionDeVacaciones)
                .WithMany()
                .HasForeignKey(c => c.IdReprogramacionDeVacaciones)
                .OnDelete(DeleteBehavior.Restrict);

            // Nuevas relaciones y propiedades
            entity.Property(c => c.EsDiaFestivo).HasDefaultValue(false);
            entity.Property(c => c.EsDiaDeDescanso).HasDefaultValue(false);
            entity.Property(c => c.EsDiaLaboral).HasDefaultValue(true);
            entity.Property(c => c.EsDiaInhabil).HasDefaultValue(false);
            entity.Property(c => c.EsDiaDeVacaciones).HasDefaultValue(false);
            entity.Property(c => c.EsDiaDePermiso).HasDefaultValue(false);
            entity.Property(c => c.EsDiaReprogramado).HasDefaultValue(false);
            entity.Property(c => c.EsDiaIntercambiado).HasDefaultValue(false);
        });

        // Relaciones para IncidenciaOPermiso
        modelBuilder.Entity<IncidenciaOPermiso>(entity =>
        {
            entity.HasOne(i => i.UsuarioAutoriza)
                .WithMany()
                .HasForeignKey(i => i.IdUsuarioAutoiza)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(i => i.UsuarioSindicato)
                .WithMany()
                .HasForeignKey(i => i.IdUsuarioSindicato)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(i => i.UsuarioEmpleado)
                .WithMany()
                .HasForeignKey(i => i.IdUsuarioEmpleado)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(i => i.Grupo)
                .WithMany()
                .HasForeignKey(i => i.IdGrupo)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(i => i.Regla)
                .WithMany()
                .HasForeignKey(i => i.IdRegla)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // Configuración de las nuevas tablas del sistema de vacaciones
        modelBuilder.Entity<ConfiguracionVacaciones>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.PorcentajeAusenciaMaximo)
                .HasColumnType("decimal(5,2)")
                .HasDefaultValue(4.5m);
            entity.Property(e => e.PeriodoActual)
                .HasMaxLength(20)
                .HasDefaultValue("Cerrado");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("GETDATE()");
        });

        modelBuilder.Entity<ExcepcionesPorcentaje>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.PorcentajeMaximoPermitido)
                .HasColumnType("decimal(5,2)");
            entity.Property(e => e.Motivo)
                .HasMaxLength(200);
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("GETDATE()");

            // Relación con Grupo
            entity.HasOne(e => e.Grupo)
                .WithMany()
                .HasForeignKey(e => e.GrupoId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<ExcepcionesManning>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Motivo)
                .HasMaxLength(500);
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("GETDATE()");

            // Relación con Area
            entity.HasOne(e => e.Area)
                .WithMany()
                .HasForeignKey(e => e.AreaId)
                .OnDelete(DeleteBehavior.Restrict);

            // Relación con Usuario que lo creó
            entity.HasOne(e => e.CreadoPor)
                .WithMany()
                .HasForeignKey(e => e.CreadoPorUserId)
                .OnDelete(DeleteBehavior.Restrict);

            // Índice único para área-año-mes (solo una excepción por combinación)
            entity.HasIndex(e => new { e.AreaId, e.Anio, e.Mes })
                .IsUnique();
        });

        modelBuilder.Entity<VacacionesProgramadas>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.TipoVacacion)
                .HasMaxLength(50);
            entity.Property(e => e.OrigenAsignacion)
                .HasMaxLength(30)
                .HasDefaultValue("Manual");
            entity.Property(e => e.EstadoVacacion)
                .HasMaxLength(20)
                .HasDefaultValue("Activa");
            entity.Property(e => e.PeriodoProgramacion)
                .HasMaxLength(20);
            entity.Property(e => e.FechaProgramacion)
                .HasDefaultValueSql("GETDATE()");
            entity.Property(e => e.PuedeSerIntercambiada)
                .HasDefaultValue(true);
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("GETDATE()");
            entity.Property(e => e.Observaciones)
                .HasMaxLength(500);

            // Relaciones con DeleteBehavior.Restrict para evitar cascadas
            entity.HasOne(e => e.Empleado)
                .WithMany()
                .HasForeignKey(e => e.EmpleadoId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.CreatedByUser)
                .WithMany()
                .HasForeignKey(e => e.CreatedBy)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.UpdatedByUser)
                .WithMany()
                .HasForeignKey(e => e.UpdatedBy)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<SolicitudesReprogramacion>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.EstadoSolicitud)
                .HasMaxLength(20)
                .HasDefaultValue("Pendiente");
            entity.Property(e => e.MotivoRechazo)
                .HasMaxLength(500);
            entity.Property(e => e.FechaSolicitud)
                .HasDefaultValueSql("GETDATE()");
            entity.Property(e => e.PorcentajeCalculado)
                .HasColumnType("decimal(5,2)");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("GETDATE()");
            entity.Property(e => e.ObservacionesEmpleado)
                .HasMaxLength(500);
            entity.Property(e => e.ObservacionesJefe)
                .HasMaxLength(500);

            // Relaciones con DeleteBehavior.Restrict para evitar cascadas múltiples
            entity.HasOne(e => e.Empleado)
                .WithMany()
                .HasForeignKey(e => e.EmpleadoId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.VacacionOriginal)
                .WithMany()
                .HasForeignKey(e => e.VacacionOriginalId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.JefeArea)
                .WithMany()
                .HasForeignKey(e => e.JefeAreaId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // Configuración para PermisosEIncapacidadesSAP
        modelBuilder.Entity<PermisosEIncapacidadesSAP>(entity =>
        {
            entity.HasKey(e => e.Id);

            entity.Property(e => e.Nomina).IsRequired();
            entity.Property(e => e.Nombre).IsRequired().HasMaxLength(200);
            entity.Property(e => e.Posicion).HasMaxLength(200);
            entity.Property(e => e.Desde).IsRequired();
            entity.Property(e => e.Hasta).IsRequired();
            // ClAbPre es int? — la tabla tiene registros legacy con NULL.
            entity.Property(e => e.ClaseAbsentismo).HasMaxLength(200);
            entity.Property(e => e.EsRegistroManual).HasDefaultValue(false);
            entity.Property(e => e.ProtegidoPorExtension).HasDefaultValue(false);
            entity.Property(e => e.FechaRegistro).HasDefaultValueSql("GETDATE()");
            entity.Property(e => e.Observaciones).HasMaxLength(500);
            entity.Property(e => e.EstadoSolicitud).HasMaxLength(20);
            entity.Property(e => e.MotivoRechazo).HasMaxLength(500);

            entity.HasOne(e => e.UsuarioRegistra)
                .WithMany()
                .HasForeignKey(e => e.UsuarioRegistraId)
                .IsRequired(false)
                .OnDelete(DeleteBehavior.Restrict);

            // Índices para mejorar el rendimiento
            entity.HasIndex(e => e.Nomina);
            entity.HasIndex(e => new { e.Desde, e.Hasta });
            entity.HasIndex(e => e.ClAbPre);
        });

        modelBuilder.Entity<RolEmpleadoSAP>(entity =>
        {
            entity.HasKey(e => e.Nomina); // Usar Nomina como PK
            entity.ToTable("RolesEmpleadosSAP");
            entity.Property(e => e.Nomina)
                .ValueGeneratedNever()
                .IsRequired();
            entity.Property(e => e.Nombre).HasMaxLength(200);
            entity.Property(e => e.Regla).HasMaxLength(50);
            entity.Property(e => e.UnidadOrganizativa).HasMaxLength(150);  // ← Agregar
            entity.Property(e => e.EncargadoRegistro).HasMaxLength(100);
            entity.HasIndex(e => e.Nomina);
        });

        // Configuración para PermisosEIncapacidadesSAPActualizar (sin clave primaria)
        modelBuilder.Entity<PermisosEIncapacidadesSAPActualizar>(entity =>
        {
            entity.HasNoKey(); // ⭐ IMPORTANTE: Indica que no tiene clave primaria
            entity.ToTable("PermisosEIncapacidadesSAP_Actualizar");
            entity.Property(e => e.Nomina).HasMaxLength(100);
            entity.Property(e => e.Nombre).HasMaxLength(100);
            entity.Property(e => e.Posicion).HasMaxLength(100);
            entity.Property(e => e.Desde).HasMaxLength(100);
            entity.Property(e => e.Hasta).HasMaxLength(100);
            entity.Property(e => e.ClAbPre).HasMaxLength(100);
            entity.Property(e => e.ClaseAbsentismo).HasMaxLength(150);
            entity.Property(e => e.Dias).HasMaxLength(100);
            entity.Property(e => e.DiaNat).HasMaxLength(100);
        });
        //// Configuración para SolicitudesPermisos
        //modelBuilder.Entity<SolicitudPermiso>(entity =>
        //{
        //    entity.HasKey(e => e.Id);
        //    entity.ToTable("SolicitudesPermisos");

        //    entity.Property(e => e.NominaEmpleado).IsRequired();
        //    entity.Property(e => e.NombreEmpleado).IsRequired().HasMaxLength(200);
        //    entity.Property(e => e.ClAbPre).IsRequired().HasMaxLength(10);
        //    entity.Property(e => e.FechaInicio).IsRequired();
        //    entity.Property(e => e.FechaFin).IsRequired();
        //    entity.Property(e => e.Observaciones).HasMaxLength(500);
        //    entity.Property(e => e.Estado).IsRequired().HasMaxLength(20).HasDefaultValue("Pendiente");
        //    entity.Property(e => e.MotivoRechazo).HasMaxLength(500);
        //    entity.Property(e => e.FechaSolicitud).HasDefaultValueSql("GETDATE()");
        //    entity.Property(e => e.PermisoCreado).HasMaxLength(500);

        //    entity.HasOne(e => e.DelegadoSindicalizado)
        //        .WithMany()
        //        .HasForeignKey(e => e.DelegadoSindicalizadoId)
        //        .OnDelete(DeleteBehavior.Restrict);

        //    entity.HasOne(e => e.JefeArea)
        //        .WithMany()
        //        .HasForeignKey(e => e.JefeAreaId)
        //        .IsRequired(false)
        //        .OnDelete(DeleteBehavior.Restrict);

        //    entity.HasOne(e => e.Area)
        //        .WithMany()
        //        .HasForeignKey(e => e.AreaId)
        //        .IsRequired(false)
        //        .OnDelete(DeleteBehavior.Restrict);

        //    entity.HasOne(e => e.Grupo)
        //        .WithMany()
        //        .HasForeignKey(e => e.GrupoId)
        //        .IsRequired(false)
        //        .OnDelete(DeleteBehavior.Restrict);

        //    entity.HasIndex(e => e.NominaEmpleado);
        //    entity.HasIndex(e => e.Estado);
        //    entity.HasIndex(e => new { e.FechaInicio, e.FechaFin });
        //});

        modelBuilder.Entity<FestivosEmpleadosTrabajadosUpload>(entity =>
        {
            entity.HasNoKey();
            entity.ToTable("FestivosEmpleadosTrabajados_Upload");
            entity.Property(e => e.Nomina).HasMaxLength(50);
            entity.Property(e => e.Nombre).HasMaxLength(200);
            entity.Property(e => e.FechaTrabajada).HasMaxLength(50);
        });

        // Configuración para SolicitudesFestivosTrabajados
        modelBuilder.Entity<SolicitudesFestivosTrabajados>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.EstadoSolicitud)
                .HasMaxLength(20)
                .HasDefaultValue("Pendiente");
            entity.Property(e => e.Motivo)
                .HasMaxLength(500)
                .IsRequired();
            entity.Property(e => e.MotivoRechazo)
                .HasMaxLength(500);
            entity.Property(e => e.FechaSolicitud)
                .HasDefaultValueSql("GETDATE()");
            entity.Property(e => e.PorcentajeCalculado)
                .HasColumnType("decimal(5,2)");

            // Configurar las relaciones para evitar múltiples cascade paths
            entity.HasOne(e => e.Empleado)
                .WithMany()
                .HasForeignKey(e => e.EmpleadoId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.DiaInhabilOriginal)
                .WithMany()
                .HasForeignKey(e => e.FestivoTrabajadoOriginalId)
                .IsRequired(false)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.SolicitadoPor)
                .WithMany()
                .HasForeignKey(e => e.SolicitadoPorId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.JefeArea)
                .WithMany()
                .HasForeignKey(e => e.JefeAreaId)
                .IsRequired(false)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.AprobadoPor)
                .WithMany()
                .HasForeignKey(e => e.AprobadoPorId)
                .IsRequired(false)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.VacacionCreada)
                .WithMany()
                .HasForeignKey(e => e.VacacionCreadaId)
                .IsRequired(false)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // Configuración para SolicitudesReprogramacionPostIncapacidad
        modelBuilder.Entity<SolicitudReprogramacionPostIncapacidad>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.EstadoSolicitud)
                .HasMaxLength(20)
                .HasDefaultValue("Pendiente");
            entity.Property(e => e.Motivo)
                .HasMaxLength(500)
                .IsRequired();
            entity.Property(e => e.MotivoRechazo)
                .HasMaxLength(500);
            entity.Property(e => e.FechaSolicitud)
                .HasDefaultValueSql("GETUTCDATE()");

            entity.HasOne(e => e.Empleado)
                .WithMany()
                .HasForeignKey(e => e.EmpleadoId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.PermisoIncapacidad)
                .WithMany()
                .HasForeignKey(e => e.PermisoIncapacidadId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.VacacionOriginal)
                .WithMany()
                .HasForeignKey(e => e.VacacionOriginalId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.SolicitadoPor)
                .WithMany()
                .HasForeignKey(e => e.SolicitadoPorId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.JefeArea)
                .WithMany()
                .HasForeignKey(e => e.JefeAreaId)
                .IsRequired(false)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.AprobadoPor)
                .WithMany()
                .HasForeignKey(e => e.AprobadoPorId)
                .IsRequired(false)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => new { e.EmpleadoId, e.EstadoSolicitud });
            entity.HasIndex(e => e.JefeAreaId);
        });

        // Configuración para SolicitudesReprogramacionDiaEmpresa (punto 9 del PDF)
        modelBuilder.Entity<SolicitudReprogramacionDiaEmpresa>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.EstadoSolicitud).HasMaxLength(20).HasDefaultValue("Pendiente");
            entity.Property(e => e.MotivoTipo).HasMaxLength(40).IsRequired();
            entity.Property(e => e.Justificacion).HasMaxLength(500);
            entity.Property(e => e.MotivoRechazo).HasMaxLength(500);
            entity.Property(e => e.FechaSolicitud).HasDefaultValueSql("GETUTCDATE()");
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("GETUTCDATE()");

            entity.HasOne(e => e.Empleado)
                .WithMany()
                .HasForeignKey(e => e.EmpleadoId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.VacacionOriginal)
                .WithMany()
                .HasForeignKey(e => e.VacacionOriginalId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.JefeArea)
                .WithMany()
                .HasForeignKey(e => e.JefeAreaId)
                .IsRequired(false)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.SolicitadoPor)
                .WithMany()
                .HasForeignKey(e => e.SolicitadoPorId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.AprobadoPor)
                .WithMany()
                .HasForeignKey(e => e.AprobadoPorId)
                .IsRequired(false)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => new { e.EmpleadoId, e.EstadoSolicitud });
            entity.HasIndex(e => e.JefeAreaId);
        });

        // Configuración para TransferenciasGrupo
        //modelBuilder.Entity<TransferenciaGrupo>(entity =>
        //{
        //    entity.HasKey(e => e.Id);

        //    entity.Property(e => e.FechaTransferencia)
        //        .HasDefaultValueSql("GETUTCDATE()");

        //    entity.Property(e => e.Motivo)
        //        .HasMaxLength(500);

        //    entity.Property(e => e.HuboAdvertenciaManning)
        //        .HasDefaultValue(false);

        //    entity.HasOne(e => e.Empleado)
        //        .WithMany()
        //        .HasForeignKey(e => e.EmpleadoId)
        //        .OnDelete(DeleteBehavior.Restrict)
        //        .HasConstraintName("FK_TransferenciaGrupo_Empleado");

        //    entity.HasOne(e => e.GrupoOrigen)
        //        .WithMany()
        //        .HasForeignKey(e => e.GrupoOrigenId)
        //        .OnDelete(DeleteBehavior.Restrict)
        //        .HasConstraintName("FK_TransferenciaGrupo_GrupoOrigen");

        //    entity.HasOne(e => e.GrupoDestino)
        //        .WithMany()
        //        .HasForeignKey(e => e.GrupoDestinoId)
        //        .OnDelete(DeleteBehavior.Restrict)
        //        .HasConstraintName("FK_TransferenciaGrupo_GrupoDestino");

        //    entity.HasOne(e => e.RealizadoPor)
        //        .WithMany()
        //        .HasForeignKey(e => e.RealizadoPorId)
        //        .OnDelete(DeleteBehavior.Restrict)
        //        .HasConstraintName("FK_TransferenciaGrupo_RealizadoPor");

        //    entity.HasIndex(e => e.EmpleadoId)
        //        .HasDatabaseName("IX_TransferenciaGrupo_EmpleadoId");

        //    entity.HasIndex(e => e.FechaTransferencia)
        //        .HasDatabaseName("IX_TransferenciaGrupo_Fecha");
        //});

        // ConfiguracionEdicionDiasEmpresa
        modelBuilder.Entity<ConfiguracionEdicionDiasEmpresa>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Habilitado).IsRequired().HasDefaultValue(false);
            entity.Property(e => e.FechaInicioPeriodo).IsRequired();
            entity.Property(e => e.FechaFinPeriodo).IsRequired();
            entity.Property(e => e.Descripcion).HasMaxLength(300);
            entity.Property(e => e.CreatedAt).IsRequired();
            entity.HasOne(e => e.CreadoPor)
                .WithMany()
                .HasForeignKey(e => e.CreadoPorId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // SolicitudesEdicionDiasEmpresa
        modelBuilder.Entity<SolicitudEdicionDiaEmpresa>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.FechaOriginal).IsRequired();
            entity.Property(e => e.FechaNueva).IsRequired();
            entity.Property(e => e.EstadoSolicitud).IsRequired().HasMaxLength(20);
            entity.Property(e => e.MotivoRechazo).HasMaxLength(500);
            entity.Property(e => e.ObservacionesEmpleado).HasMaxLength(500);
            entity.Property(e => e.ObservacionesJefe).HasMaxLength(500);
            entity.Property(e => e.FechaSolicitud).IsRequired();
            entity.Property(e => e.CreatedAt).IsRequired();
            entity.HasOne(e => e.Empleado)
                .WithMany()
                .HasForeignKey(e => e.EmpleadoId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.VacacionOriginal)
                .WithMany()
                .HasForeignKey(e => e.VacacionOriginalId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.JefeArea)
                .WithMany()
                .HasForeignKey(e => e.JefeAreaId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.SolicitadoPor)
                .WithMany()
                .HasForeignKey(e => e.SolicitadoPorId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
