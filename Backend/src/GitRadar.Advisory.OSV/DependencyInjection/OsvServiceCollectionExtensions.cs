using GitRadar.Advisory.Abstractions;
using GitRadar.Advisory.OSV;
using Microsoft.Extensions.DependencyInjection;

namespace GitRadar.Advisory.OSV.DependencyInjection;

/// <summary>
/// OSV.dev danışmanlık istemcisi için IServiceCollection genişletme metotları.
/// </summary>
public static class OsvServiceCollectionExtensions
{
    /// <summary>
    /// OSV.dev HTTP istemcisini ve IAdvisoryClient sözleşmesini IServiceCollection içine kaydeder.
    /// </summary>
    /// <param name="services">Hizmet koleksiyonu.</param>
    /// <param name="configureClient">İsteğe bağlı HttpClient yapılandırma eylemi.</param>
    /// <returns>Zincirleme çağrılar için IServiceCollection.</returns>
    public static IServiceCollection AddOsvAdvisoryClient(
        this IServiceCollection services,
        Action<HttpClient>? configureClient = null)
    {
        ArgumentNullException.ThrowIfNull(services);

        services.AddHttpClient(OsvAdvisoryClient.DefaultClientName, client =>
        {
            client.BaseAddress = new Uri(OsvAdvisoryClient.DefaultBaseAddress);
            client.Timeout = TimeSpan.FromSeconds(30);
            configureClient?.Invoke(client);
        });

        services.AddTransient<IAdvisoryClient, OsvAdvisoryClient>(sp =>
        {
            var factory = sp.GetRequiredService<IHttpClientFactory>();
            var logger = sp.GetService<Microsoft.Extensions.Logging.ILogger<OsvAdvisoryClient>>();
            return new OsvAdvisoryClient(factory, logger);
        });

        return services;
    }
}

