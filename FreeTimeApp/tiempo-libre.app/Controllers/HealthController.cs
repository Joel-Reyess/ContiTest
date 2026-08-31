using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System;
using System.Reflection;
using System.Threading.Tasks;
using tiempo_libre.Models;

namespace tiempo_libre.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    // [AllowAnonymous] va por endpoint, no en la clase: puesto aqui pisaba el
    // [Authorize] de DetailedHealth (ASP0026) y dejaba publico el health que
    // expone el servidor de base de datos y los conteos de tablas.
    public class HealthController : ControllerBase
    {
        private readonly FreeTimeDbContext _context;
        private readonly IConfiguration _configuration;
        private static readonly DateTime _startupTime = DateTime.Now;

        public HealthController(FreeTimeDbContext context, IConfiguration configuration)
        {
            _context = context;
            _configuration = configuration;
        }

        /// <summary>
        /// Endpoint simple para verificar que el API está funcionando
        /// </summary>
        [HttpGet]
        [HttpGet("ping")]
        [AllowAnonymous]
        public IActionResult Ping()
        {
            return Ok(new
            {
                status = "OK",
                message = "API funcionando correctamente",
                timestamp = DateTime.Now,
                uptime = DateTime.Now - _startupTime
            });
        }

        /// <summary>
        /// Health check detallado con información del sistema
        /// </summary>
        [HttpGet("status")]
        [AllowAnonymous]
        public async Task<IActionResult> Status()
        {
            var response = new
            {
                status = "healthy",
                timestamp = DateTime.Now,
                uptime = DateTime.Now - _startupTime,
                environment = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "Production",
                version = Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "1.0.0",
                services = new
                {
                    database = await CheckDatabase(),
                    smtp = CheckSmtpConfiguration()
                }
            };

            return Ok(response);
        }

        /// <summary>
        /// Health check completo con detalles técnicos (requiere autenticación)
        /// </summary>
        [HttpGet("detailed")]
        [Authorize(Roles = "Super Usuario,SuperUsuario,Ingeniero Industrial")]
        public async Task<IActionResult> DetailedHealth()
        {
            var dbStatus = await CheckDatabaseDetailed();

            var response = new
            {
                status = "healthy",
                timestamp = DateTime.Now,
                uptime = DateTime.Now - _startupTime,
                environment = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "Production",
                version = Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "1.0.0",
                system = new
                {
                    machineName = Environment.MachineName,
                    osVersion = Environment.OSVersion.ToString(),
                    processorCount = Environment.ProcessorCount,
                    is64BitProcess = Environment.Is64BitProcess,
                    workingSet = Environment.WorkingSet / (1024 * 1024), // MB
                    dotnetVersion = Environment.Version.ToString()
                },
                database = dbStatus,
                smtp = new
                {
                    configured = CheckSmtpConfiguration(),
                    host = _configuration["SmtpSettings:Host"],
                    port = _configuration["SmtpSettings:Port"],
                    passwordConfigured = !string.IsNullOrEmpty(_configuration["SmtpSettings:Password"]) ||
                                        !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("SMTP_PASSWORD"))
                },
                endpoints = new
                {
                    totalControllers = GetControllerCount(),
                    authEnabled = true,
                    corsEnabled = true
                }
            };

            return Ok(response);
        }

        private async Task<object> CheckDatabase()
        {
            try
            {
                var canConnect = await _context.Database.CanConnectAsync();
                // Server y base SIN credenciales: es la unica forma de saber, sin
                // entrar a SQL, si el backend de pruebas quedo pegado a produccion.
                var conexion = _context.Database.GetDbConnection();
                return new
                {
                    connected = canConnect,
                    provider = _context.Database.ProviderName,
                    server = conexion.DataSource,
                    database = conexion.Database
                };
            }
            catch (Exception ex)
            {
                return new
                {
                    connected = false,
                    error = ex.Message
                };
            }
        }

        private async Task<object> CheckDatabaseDetailed()
        {
            try
            {
                var canConnect = await _context.Database.CanConnectAsync();

                if (canConnect)
                {
                    // Contar algunas tablas principales
                    var userCount = await _context.Users.CountAsync();
                    var vacacionesCount = await _context.VacacionesProgramadas.CountAsync();
                    var bloquesCount = await _context.BloquesReservacion.CountAsync();

                    return new
                    {
                        connected = true,
                        provider = _context.Database.ProviderName,
                        connectionString = _context.Database.GetConnectionString()?.Split(';')[0], // Solo el servidor
                        statistics = new
                        {
                            users = userCount,
                            vacacionesProgramadas = vacacionesCount,
                            bloquesReservacion = bloquesCount
                        },
                        pendingMigrations = (await _context.Database.GetPendingMigrationsAsync()).Any()
                    };
                }

                return new
                {
                    connected = false,
                    provider = _context.Database.ProviderName
                };
            }
            catch (Exception ex)
            {
                return new
                {
                    connected = false,
                    error = ex.Message
                };
            }
        }

        private bool CheckSmtpConfiguration()
        {
            var host = _configuration["SmtpSettings:Host"];
            var port = _configuration["SmtpSettings:Port"];
            var username = _configuration["SmtpSettings:Username"];

            return !string.IsNullOrEmpty(host) &&
                   !string.IsNullOrEmpty(port) &&
                   !string.IsNullOrEmpty(username);
        }

        private int GetControllerCount()
        {
            var controllerType = typeof(ControllerBase);
            var controllers = Assembly.GetExecutingAssembly()
                .GetTypes()
                .Where(t => controllerType.IsAssignableFrom(t) && !t.IsAbstract)
                .Count();
            return controllers;
        }
    }
}