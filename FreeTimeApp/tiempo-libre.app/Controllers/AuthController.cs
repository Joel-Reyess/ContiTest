using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.EntityFrameworkCore;
using tiempo_libre.Middlewares;
using tiempo_libre.Models;
using System.ComponentModel.DataAnnotations;
using tiempo_libre.Models.DataAnnotations;
using Microsoft.AspNetCore.Authorization;

[ApiController]
[Route("[controller]")]
public class AuthController : ControllerBase
{
    private readonly FreeTimeDbContext _db;

    public AuthController(FreeTimeDbContext db)
    {
        _db = db;
    }

    [HttpPost("login")]
    
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        var user = await _db.Users
            .Include(u => u.Roles)
            .FirstOrDefaultAsync(u => u.Username == request.Username);

        if (user == null)
            return Unauthorized(new ApiResponse<string>(false, null, "Usuario o contraseña incorrectos"));

        if (!PasswordHasher.VerifyPassword(request.Password, user.PasswordSalt, user.PasswordHash))
            return Unauthorized(new ApiResponse<string>(false, null, "Usuario o contraseña incorrectos"));

        // Guardar el último inicio de sesión anterior antes de actualizarlo
        var ultimoInicioSesionAnterior = user.UltimoInicioSesion;
        
        // Actualizar último inicio de sesión
        user.UltimoInicioSesion = DateTime.UtcNow;
        _db.Users.Update(user);
        await _db.SaveChangesAsync();

        var claims = new List<Claim>
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Name, user.Username),
        };
        // Emitir cada rol en sus variantes de nomenclatura ("Jefe_De_Area",
        // "Jefe De Area", "JefeDeArea") para que los [Authorize(Roles=...)] y
        // User.IsInRole matcheen sin importar cómo esté escrito Roles.Name en
        // la BD del ambiente.
        claims.AddRange(user.Roles
            .SelectMany(r => tiempo_libre.Helpers.RolesHelper.VariantesClaim(r.Name))
            .Distinct()
            .Select(nombre => new Claim(ClaimTypes.Role, nombre)));

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes("jCCAeagAwIBAgIJAJjMBdn72zEjMA0GCSqGSIb3DQEBCwUAMC0CwyW6DQjJSGCqHwe"));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            claims: claims,
            expires: DateTime.Now.AddHours(1),
            signingCredentials: creds
        );

        var tokenString = new JwtSecurityTokenHandler().WriteToken(token);
        var data = new
        {
            Token = tokenString,
            Expiration = token.ValidTo,
            UltimoInicioSesion = ultimoInicioSesionAnterior
        };

        return Ok(new ApiResponse<object>(true, data));
    }

    [HttpPost("refresh-token")]
    [Authorize]
    public async Task<IActionResult> RefreshToken()
    {
        var username = User.Identity?.Name;
        if (string.IsNullOrEmpty(username))
            return Unauthorized(new ApiResponse<string>(false, null, "No hay sesión iniciada."));

        var user = await _db.Users.Include(u => u.Roles).FirstOrDefaultAsync(u => u.Username == username);
        if (user == null)
            return Unauthorized(new ApiResponse<string>(false, null, "Usuario no encontrado."));

        var claims = new List<Claim>
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Name, user.Username),
        };
        claims.AddRange(user.Roles
            .SelectMany(r => tiempo_libre.Helpers.RolesHelper.VariantesClaim(r.Name))
            .Distinct()
            .Select(nombre => new Claim(ClaimTypes.Role, nombre)));

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes("jCCAeagAwIBAgIJAJjMBdn72zEjMA0GCSqGSIb3DQEBCwUAMC0CwyW6DQjJSGCqHwe"));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            claims: claims,
            expires: DateTime.Now.AddHours(1),
            signingCredentials: creds
        );

        var tokenString = new JwtSecurityTokenHandler().WriteToken(token);
        var data = new
        {
            Token = tokenString,
            Expiration = token.ValidTo
        };
        return Ok(new ApiResponse<object>(true, data));
    }

    [HttpPost("logout")]
    [Authorize]
    public IActionResult Logout()
    {
        // Genera un token especial para sesión cerrada
        var claims = new List<Claim>
        {
            new Claim("logout", "true")
        };
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes("jCCAeagAwIBAgIJAJjMBdn72zEjMA0GCSqGSIb3DQEBCwUAMC0CwyW6DQjJSGCqHwe"));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            claims: claims,
            expires: DateTime.Now.AddYears(10),
            signingCredentials: creds
        );
        var tokenString = new JwtSecurityTokenHandler().WriteToken(token);
        var data = new
        {
            Token = tokenString,
            Expiration = token.ValidTo
        };
        return Ok(new ApiResponse<object>(true, data));
    }

    [HttpPost("register")]
    [RolesAllowed("SuperUsuario")]
    public async Task<IActionResult> Register([FromBody] RegisterRequest request)
    {
        var salt = Guid.NewGuid().ToString();
        var hash = PasswordHasher.HashPassword(request.Password, salt);

        var listRolIds = request.Roles.Select(int.Parse).ToList();
        var roles = await _db.Roles.Where(r => listRolIds.Contains(r.Id)).ToListAsync();
        var area = request.AreaId.HasValue ? await _db.Areas.Where(a => a.AreaId == request.AreaId).FirstOrDefaultAsync() : null;
        var grupo = request.GrupoId.HasValue ? await _db.Grupos.Where(g => g.GrupoId == request.GrupoId).FirstOrDefaultAsync() : null;
        var userExists = await _db.Users.AnyAsync(u => u.Username == request.Username);

        if (userExists)
        {
            return BadRequest(new ApiResponse<string>(false, null, "El nombre de usuario ya está en uso."));
        }
        if (roles.Count != listRolIds.Count)
        {
            return BadRequest(new ApiResponse<string>(false, null, "Uno o más roles no existen."));
        }
        if (request.AreaId.HasValue && area == null)
        {
            return BadRequest(new ApiResponse<string>(false, null, "El área especificada no existe."));
        }
        if (request.GrupoId.HasValue && grupo == null)
        {
            return BadRequest(new ApiResponse<string>(false, null, "El grupo especificado no existe."));
        }
        if (grupo != null && area != null && grupo.AreaId != area.AreaId)
        {
            return BadRequest(new ApiResponse<string>(false, null, "El grupo especificado no pertenece al área indicada."));
        }

        var user = new User
        {
            Username = request.Username,
            PasswordHash = hash,
            PasswordSalt = salt,
            FullName = request.FullName,
            Roles = roles,
            AreaId = area?.AreaId,
            GrupoId = grupo?.GrupoId,
            //IsValidated = request.IsValidated
        };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();
        return Ok(new ApiResponse<string>(true, "Usuario creado exitosamente."));
    }

    [HttpPost("change-password")]
    [Authorize]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest request)
    {
        // Obtener usuario actual desde el token
        var username = User.Identity?.Name;
        if (string.IsNullOrEmpty(username))
            return Unauthorized(new ApiResponse<string>(false, null, "No hay sesión iniciada."));

        var user = await _db.Users.FirstOrDefaultAsync(u => u.Username == username);
        if (user == null)
            return Unauthorized(new ApiResponse<string>(false, null, "Usuario no encontrado."));

        // Validar contraseña actual
        if (!PasswordHasher.VerifyPassword(request.CurrentPassword, user.PasswordSalt, user.PasswordHash))
            return BadRequest(new ApiResponse<string>(false, null, "La contraseña actual es incorrecta."));

        // Validar nueva contraseña y confirmación
        if (request.NewPassword != request.ConfirmNewPassword)
            return BadRequest(new ApiResponse<string>(false, null, "La nueva contraseña y la confirmación no coinciden."));

        // Actualizar contraseña y fecha
        var newSalt = Guid.NewGuid().ToString();
        var newHash = PasswordHasher.HashPassword(request.NewPassword, newSalt);
        user.PasswordSalt = newSalt;
        user.PasswordHash = newHash;
        user.UpdatedAt = DateTime.UtcNow;
        _db.Users.Update(user);
        await _db.SaveChangesAsync();
        return Ok(new ApiResponse<string>(true, "Contraseña actualizada correctamente."));
    }

    [HttpPost("change-user-password")]
    [Authorize(Roles = "SuperUsuario,Jefe De Area,Empleado Sindicalizado")]
    public async Task<IActionResult> ChangeUserPassword([FromBody] ChangeUserPasswordRequest request)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == request.UserId);
        if (user == null)
            return NotFound(new ApiResponse<string>(false, null, "Usuario no encontrado."));

        if (request.NewPassword != request.ConfirmNewPassword)
            return BadRequest(new ApiResponse<string>(false, null, "La nueva contraseña y la confirmación no coinciden."));

        var newSalt = Guid.NewGuid().ToString();
        var newHash = PasswordHasher.HashPassword(request.NewPassword, newSalt);
        user.PasswordSalt = newSalt;
        user.PasswordHash = newHash;
        user.UpdatedAt = DateTime.UtcNow;
        _db.Users.Update(user);
        await _db.SaveChangesAsync();
        return Ok(new ApiResponse<string>(true, "Contraseña actualizada correctamente."));
    }
}

public class LoginRequest
{
    public required string Username { get; set; }
    public required string Password { get; set; }
}

public class RegisterRequest
{
    [Username(ErrorMessage = "El nombre de usuario debe ser un entero o un correo electrónico válido.")]
    public required string Username { get; set; }
    public required string Password { get; set; }
    public required string FullName { get; set; }
    public int? AreaId { get; set; }
    public int? GrupoId { get; set; }

    public List<string> Roles { get; set; } = new List<string>();
    //public bool IsValidated { get; set; } = false;
}

public class ChangePasswordRequest
{
    public required string CurrentPassword { get; set; }
    public required string NewPassword { get; set; }
    public required string ConfirmNewPassword { get; set; }
}

public class ChangeUserPasswordRequest
{
    public required int UserId { get; set; }
    public required string NewPassword { get; set; }
    public required string ConfirmNewPassword { get; set; }
}
