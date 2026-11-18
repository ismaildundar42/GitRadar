using GitRadar.Application.Contracts.GitHub;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace GitRadar.Infrastructure.GitHub;

/// <summary>
/// GitHub altyapı servislerini (Tree & Blob Client) IServiceCollection üzerine kaydeden bağımlılık enjeksiyonu uzantısıdır.
/// </summary>
public static class GitHubInfrastructureServiceRegistration
{
    /// <summary>
    /// GitHub ağaç ve akış istemcisini (IGitHubTreeClient) yapılandırarak DI konteynerine ekler.
    /// </summary>
    public static IServiceCollection AddGitHubInfrastructure(
        this IServiceCollection services,
        IConfiguration? configuration = null,
        Action<GitHubClientOptions>? configureOptions = null)
    {
        services.AddOptions<GitHubClientOptions>();

        if (configuration is not null)
        {
            services.Configure<GitHubClientOptions>(
                configuration.GetSection(GitHubClientOptions.SectionName));
        }

        if (configureOptions is not null)
        {
            services.Configure(configureOptions);
        }

        services.AddHttpClient<IGitHubTreeClient, GitHubTreeClient>();
        services.AddHttpClient<IGitHubService, GitHubService>();

        return services;
    }
}

