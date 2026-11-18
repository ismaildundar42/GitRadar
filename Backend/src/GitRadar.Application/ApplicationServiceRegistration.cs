using GitRadar.Application.Pipelines;
using GitRadar.Application.Scans;
using GitRadar.Scanner.NuGet;
using GitRadar.Scanning.Abstractions.Providers;
using GitRadar.Scanning.Core.Enrichment;
using GitRadar.Scanning.Core.Orchestration;
using GitRadar.Scanning.Core.Registry;
using Microsoft.Extensions.DependencyInjection;

namespace GitRadar.Application;

/// <summary>
/// Application katmanı servislerini IServiceCollection üzerine kaydeden uzantı sınıfıdır.
/// </summary>
public static class ApplicationServiceRegistration
{
    public static IServiceCollection AddApplicationServices(this IServiceCollection services)
    {
        // Pipeline ve Use Case servisleri
        services.AddScoped<IScanExecutionSavePipeline, ScanExecutionSavePipeline>();
        services.AddScoped<IRunRepositoryScanUseCase, RunRepositoryScanUseCase>();

        // Scanning Motoru ve Sağlayıcılar
        services.AddScoped<IScannerProvider, NuGetScannerProvider>();
        services.AddScoped<IScannerRegistry, ScannerRegistry>();
        services.AddScoped<IScannerOrchestrator, ScannerOrchestrator>();
        services.AddScoped<IVulnerabilityEnricher, VulnerabilityEnricher>();

        return services;
    }
}
