using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using Microsoft.EntityFrameworkCore;
using tiempo_libre.Models;
using Swashbuckle.AspNetCore.SwaggerUI;
using Swashbuckle.AspNetCore.Swagger;
using Microsoft.IdentityModel.Logging;
using Serilog;

var builder = WebApplication.CreateBuilder(args);

// Configuración global de Serilog
Log.Logger = new LoggerConfiguration()
    .ReadFrom.Configuration(builder.Configuration)
    .Enrich.FromLogContext()
    .CreateLogger();
builder.Host.UseSerilog();

// Add services to the container.
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles;
        options.JsonSerializerOptions.DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull;
    });
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddDbContext<FreeTimeDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));
// builder.Services.AddScoped<IRepository<WeatherForecast>, WeatherForecastRepository>();

// Register services
builder.Services.AddScoped<tiempo_libre.Services.GeneraReservacionTurnosService>();
builder.Services.AddScoped<tiempo_libre.Services.CalendariosEmpleadosService>();
builder.Services.AddScoped<tiempo_libre.Services.CalendarioGrupoService>();
builder.Services.AddScoped<tiempo_libre.Services.VacacionesService>();
builder.Services.AddScoped<tiempo_libre.Services.AusenciaService>();
builder.Services.AddScoped<tiempo_libre.Services.ConfiguracionVacacionesService>();
builder.Services.AddScoped<tiempo_libre.Services.AsignacionAutomaticaService>();
builder.Services.AddScoped<tiempo_libre.Services.NotificacionesService>();
builder.Services.AddScoped<tiempo_libre.Services.ReservaVacacionesService>();
builder.Services.AddScoped<tiempo_libre.Services.BloquesReservacionService>();
builder.Services.AddScoped<tiempo_libre.Services.EstadosBloquesService>();
builder.Services.AddScoped<tiempo_libre.Services.ValidadorPorcentajeService>();
builder.Services.AddScoped<tiempo_libre.Services.ReprogramacionService>();
builder.Services.AddScoped<tiempo_libre.Services.FestivoTrabajadoService>();
builder.Services.AddScoped<tiempo_libre.Services.VacacionesExportService>();
builder.Services.AddScoped<tiempo_libre.Services.ReportesVacacionesService>();
builder.Services.AddScoped<tiempo_libre.Services.PermutaService>();
builder.Services.AddScoped<tiempo_libre.Services.PermisosIncapacidadesService>();
builder.Services.AddScoped<tiempo_libre.Services.SolicitudesPermisosService>();
builder.Services.AddScoped<tiempo_libre.Services.SincronizacionRolesService>();
// Email Service con configuración SMTP
builder.Services.AddSingleton<tiempo_libre.Services.IEmailService, tiempo_libre.Services.EmailService>();

// Servicio de recuperación de contraseña
builder.Services.AddScoped<tiempo_libre.Services.IRecuperacionPasswordService, tiempo_libre.Services.RecuperacionPasswordService>();

// Background service para actualizar estados automáticamente
builder.Services.AddHostedService<tiempo_libre.Services.ActualizacionEstadosBackgroundService>();

//Background para actualizar roles automaticamente
builder.Services.AddHostedService<tiempo_libre.Services.SincronizacionRolesBackgroundService>();
// Background service para sincronizar permisos desde tabla de staging
builder.Services.AddHostedService<tiempo_libre.Services.SincronizacionPermisosBackgroundService>();

// Configuración CORS para permitir peticiones desde el frontend
var allowedOrigins = new[] {
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://slas052a:5173",
    "https://x5xc1dsr-5173.usw3.devtunnels.ms",
    // Agrega aquí otros orígenes permitidos
};
builder.Services.AddCors(options =>
{
    options.AddPolicy("FrontendPolicy", policy =>
        policy.WithOrigins(allowedOrigins)
                .AllowAnyHeader()
                .AllowAnyMethod()
    );
});

// JWT Authentication
builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.RequireHttpsMetadata = false;
    options.SaveToken = true;
    options.UseSecurityTokenValidators = true;
    options.TokenValidationParameters = new Microsoft.IdentityModel.Tokens.TokenValidationParameters
    {
        ValidateIssuer = false,
        ValidateAudience = false,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = false,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes("jCCAeagAwIBAgIJAJjMBdn72zEjMA0GCSqGSIb3DQEBCwUAMC0CwyW6DQjJSGCqHwe"))
        /*{ 
            KeyId = "FreeTimeApp" // Aquí puedes agregar un "kid" si es necesario
        },*/
    };
});

builder.Services.AddAuthorization();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// app.UseHttpsRedirection();
// Se comenta esta línea. Causa el error "Failed to determine the https port for redirect" 
// porque el contenedor está configurado para escuchar solo en HTTP. 
// En un entorno de producción real, un reverse proxy (como Nginx o un Load Balancer) se encargaría del HTTPS.


// Habilita CORS antes de autenticación/autorización
app.UseCors("FrontendPolicy");

// Middleware para rechazar tokens de sesión cerrada
app.UseMiddleware<tiempo_libre.Middlewares.LogoutTokenMiddleware>();

// Middleware de autorización por roles personalizado
app.UseAuthentication();
app.UseAuthorization();
app.UseMiddleware<tiempo_libre.Middlewares.RoleAuthorizationMiddleware>();

app.MapControllers();

// Database initialization removed - using .bak restore instead of migrations and seeders

IdentityModelEventSource.ShowPII = true;
IdentityModelEventSource.LogCompleteSecurityArtifact = true;

app.Run();
