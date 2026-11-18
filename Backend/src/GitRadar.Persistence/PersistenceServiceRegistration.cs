using GitRadar.Domain.Repositories;
using GitRadar.Persistence.Repositories;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace GitRadar.Persistence;

/// <summary>
/// Persistence katmanı bağımlılıklarını IServiceCollection üzerine kaydeden uzantı sınıfıdır.
/// </summary>
public static class PersistenceServiceRegistration
{
    public static IServiceCollection AddPersistenceServices(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("DefaultConnection")
            ?? GitRadarDbContextFactory.DefaultConnectionString;

        return services.AddPersistenceServices(connectionString);
    }

    public static IServiceCollection AddPersistenceServices(
        this IServiceCollection services,
        string connectionString)
    {
        services.AddDbContext<GitRadarDbContext>(options =>
            options.UseSqlServer(connectionString));

        services.AddScoped<IScanExecutionRepository, ScanExecutionRepository>();
        services.AddScoped<IRepositoryRepository, RepositoryRepository>();
        services.AddScoped<IUnitOfWork, UnitOfWork>();

        return services;
    }
}

