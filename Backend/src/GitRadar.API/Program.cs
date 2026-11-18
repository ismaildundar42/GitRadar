using System.Text;
using GitRadar.Advisory.OSV.DependencyInjection;
using GitRadar.API.Configuration;
using GitRadar.API.Middleware;
using GitRadar.API.Services;
using GitRadar.Application;
using GitRadar.Infrastructure;
using GitRadar.Persistence;
using GitRadar.Persistence.Identity;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi;

var builder = WebApplication.CreateBuilder(args);

// 1. Presentation & API Controller Yapılandırması
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();

// 2. Swagger UI & JWT Bearer Yetkilendirme Entegrasyonu
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "GitRadar SCA & CIS Audit API",
        Version = "v1",
        Description = "GitRadar Enterprise SCA & CIS Controls v8 Compliance API Portal"
    });

    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "Bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "JWT Bearer yetkilendirme belirteci. Örnek kullanım: 'Bearer {token}'"
    });

    c.AddSecurityRequirement(document => new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecuritySchemeReference("Bearer", document, null),
            new List<string>()
        }
    });
});

builder.Services.AddCors(options =>
{
    options.AddPolicy("FrontendPolicy", policy =>
    {
        policy.WithOrigins(
                  "http://localhost:5173",
                  "http://localhost:5174",
                  "http://localhost:3000",
                  "http://127.0.0.1:5173",
                  "http://127.0.0.1:5174")
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

// 3. Katman Servis Kayıtları (Clean Architecture DI Zinciri)
builder.Services.AddHttpClient();
builder.Services.Configure<AzureAdOptions>(builder.Configuration.GetSection(AzureAdOptions.SectionName));
builder.Services.AddPersistenceServices(builder.Configuration);
builder.Services.AddGitHubInfrastructure(builder.Configuration);
builder.Services.AddOsvAdvisoryClient();
builder.Services.AddApplicationServices();
builder.Services.AddScoped<GitRadar.Application.Contracts.Activities.IUserActivityService, UserActivityService>();

// 4. ASP.NET Core Identity Yapılandırması (ApplicationUser & ApplicationRole int PK)
builder.Services.AddIdentity<ApplicationUser, ApplicationRole>(options =>
{
    options.Password.RequireDigit = false;
    options.Password.RequireLowercase = false;
    options.Password.RequireUppercase = false;
    options.Password.RequireNonAlphanumeric = false;
    options.Password.RequiredLength = 6;
    options.User.RequireUniqueEmail = true;
})
.AddEntityFrameworkStores<GitRadarDbContext>()
.AddDefaultTokenProviders();

// 5. JWT Bearer Kimlik Doğrulama (Authentication) & Rol Tabanlı Yetkilendirme (RBAC)
var jwtSettings = builder.Configuration.GetSection("Jwt");
var secretKey = jwtSettings["SecretKey"];

if (string.IsNullOrWhiteSpace(secretKey) || secretKey.Length < 32)
{
    throw new InvalidOperationException("Jwt:SecretKey yapılandırması eksik veya güvenlik standardı gereği 32 karakterden kısa olamaz!");
}

var key = Encoding.UTF8.GetBytes(secretKey);

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.RequireHttpsMetadata = false;
    options.SaveToken = true;
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(key),
        ValidateIssuer = true,
        ValidIssuer = jwtSettings["Issuer"] ?? "GitRadar.API",
        ValidateAudience = true,
        ValidAudience = jwtSettings["Audience"] ?? "GitRadar.Client",
        ValidateLifetime = true,
        ClockSkew = TimeSpan.Zero
    };
});

builder.Services.AddAuthorization();

var app = builder.Build();

// 6. HTTP İstek Boru Hattı (Middleware Pipeline)
app.UseMiddleware<ExceptionHandlingMiddleware>();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "GitRadar SCA API v1");
        c.RoutePrefix = "swagger";
    });
}

app.UseHttpsRedirection();
app.UseCors("FrontendPolicy");

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.MapGet("/api/health", () => Results.Ok(new { status = "Healthy", timestamp = DateTime.UtcNow }));

// 7. Otomatik Kurumsal Kimlik Tohumlama (Seed Data - ApplicationUser & ApplicationRole)
await IdentityDataSeeder.SeedAsync(app.Services);

app.Run();
