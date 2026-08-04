using System;
using System.Net;
using System.Net.Mail;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using tiempo_libre.Configuration;

namespace tiempo_libre.Services
{
    public interface IEmailService
    {
        Task<bool> SendEmailAsync(string to, string subject, string body, bool isHtml = true);
        Task<bool> SendEmailAsync(string[] to, string subject, string body, bool isHtml = true);
        Task<bool> SendEmailWithAttachmentAsync(string to, string subject, string body, string attachmentPath, bool isHtml = true);
    }

    public class EmailService : IEmailService
    {
        private readonly SmtpConfiguration _smtpConfiguration;
        private readonly ILogger<EmailService> _logger;
        private readonly IConfiguration _configuration;

        /// <summary>
        /// Modo simulacro: registra el correo en el log y NO lo envía. Es lo que
        /// separa un entorno de pruebas de uno que le manda correos reales a los
        /// jefes cada vez que alguien prueba una solicitud.
        /// Se activa con "SmtpSettings:ModoSimulacro": true.
        /// </summary>
        private readonly bool _modoSimulacro;

        public EmailService(IConfiguration configuration, ILogger<EmailService> logger)
        {
            _configuration = configuration;
            _logger = logger;
            _smtpConfiguration = new SmtpConfiguration();
            configuration.GetSection("SmtpSettings").Bind(_smtpConfiguration);

            _modoSimulacro = configuration.GetValue<bool>("SmtpSettings:ModoSimulacro");
            if (_modoSimulacro)
                _logger.LogWarning("EmailService en MODO SIMULACRO: los correos se registran en el log y no se envían.");

            // Obtener contraseña de variable de entorno si no está en configuración
            if (string.IsNullOrEmpty(_smtpConfiguration.Password))
            {
                var envPassword = Environment.GetEnvironmentVariable("SMTP_PASSWORD");
                if (!string.IsNullOrEmpty(envPassword))
                {
                    _smtpConfiguration.Password = envPassword;
                    _logger.LogInformation("Contraseña SMTP cargada desde variable de entorno");
                }
                else
                {
                    _logger.LogWarning("No se encontró contraseña SMTP en configuración ni en variable de entorno SMTP_PASSWORD");
                }
            }
        }

        public async Task<bool> SendEmailAsync(string to, string subject, string body, bool isHtml = true)
        {
            return await SendEmailAsync(new[] { to }, subject, body, isHtml);
        }

        public async Task<bool> SendEmailAsync(string[] to, string subject, string body, bool isHtml = true)
        {
            try
            {
                if (_modoSimulacro)
                {
                    _logger.LogInformation(
                        "[SIMULACRO] Correo NO enviado. Para: {Destinatarios} | Asunto: {Asunto}",
                        string.Join(", ", to), subject);
                    return true;
                }

                if (string.IsNullOrEmpty(_smtpConfiguration.Password))
                {
                    _logger.LogError("No se puede enviar correo: Contraseña SMTP no configurada");
                    return false;
                }

                using var message = new MailMessage
                {
                    From = new MailAddress(_smtpConfiguration.FromEmail, _smtpConfiguration.FromName),
                    Subject = subject,
                    Body = body,
                    IsBodyHtml = isHtml
                };

                foreach (var recipient in to)
                {
                    message.To.Add(recipient);
                }

                using var smtp = new SmtpClient(_smtpConfiguration.Host, _smtpConfiguration.Port)
                {
                    EnableSsl = _smtpConfiguration.EnableSsl,
                    UseDefaultCredentials = _smtpConfiguration.UseDefaultCredentials
                };

                if (!_smtpConfiguration.UseDefaultCredentials)
                {
                    smtp.Credentials = new NetworkCredential(_smtpConfiguration.Username, _smtpConfiguration.Password);
                }

                await smtp.SendMailAsync(message);

                _logger.LogInformation("Correo enviado exitosamente a {Recipients} con asunto: {Subject}",
                    string.Join(", ", to), subject);

                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al enviar correo a {Recipients}", string.Join(", ", to));
                return false;
            }
        }

        public async Task<bool> SendEmailWithAttachmentAsync(string to, string subject, string body, string attachmentPath, bool isHtml = true)
        {
            try
            {
                if (_modoSimulacro)
                {
                    _logger.LogInformation(
                        "[SIMULACRO] Correo con adjunto NO enviado. Para: {Destinatario} | Asunto: {Asunto}",
                        to, subject);
                    return true;
                }

                if (string.IsNullOrEmpty(_smtpConfiguration.Password))
                {
                    _logger.LogError("No se puede enviar correo: Contraseña SMTP no configurada");
                    return false;
                }

                using var message = new MailMessage
                {
                    From = new MailAddress(_smtpConfiguration.FromEmail, _smtpConfiguration.FromName),
                    Subject = subject,
                    Body = body,
                    IsBodyHtml = isHtml
                };

                message.To.Add(to);

                if (!string.IsNullOrEmpty(attachmentPath) && System.IO.File.Exists(attachmentPath))
                {
                    var attachment = new Attachment(attachmentPath);
                    message.Attachments.Add(attachment);
                }

                using var smtp = new SmtpClient(_smtpConfiguration.Host, _smtpConfiguration.Port)
                {
                    EnableSsl = _smtpConfiguration.EnableSsl,
                    UseDefaultCredentials = _smtpConfiguration.UseDefaultCredentials
                };

                if (!_smtpConfiguration.UseDefaultCredentials)
                {
                    smtp.Credentials = new NetworkCredential(_smtpConfiguration.Username, _smtpConfiguration.Password);
                }

                await smtp.SendMailAsync(message);

                _logger.LogInformation("Correo con adjunto enviado exitosamente a {Recipient} con asunto: {Subject}",
                    to, subject);

                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al enviar correo con adjunto a {Recipient}", to);
                return false;
            }
        }
    }
}