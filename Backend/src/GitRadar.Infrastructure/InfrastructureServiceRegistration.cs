using GitRadar.Infrastructure.GitHub;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace GitRadar.Infrastructure;

/// <summary>
/// Infrastructure katmanı bağımlılıklarını IServiceCollection üzerine kaydeden ana uzantı sınıfıdır.
/// </summary>
public static class InfrastructureServiceRegistration
{
    /// <summary>
    /// GitHub altyapı servislerini (IGitHubTreeClient) yapılandırarak DI konteynerine ekler.
    /// </summary>
    public static IServiceCollection AddGitHubInfrastructure(
        this IServiceCollection services,
        IConfiguration? configuration = null,
        Action<GitHubClientOptions>? configureOptions = null)
    {
        return GitHubInfrastructureServiceRegistration.AddGitHubInfrastructure(services, configuration, configureOptions);
    }
}

