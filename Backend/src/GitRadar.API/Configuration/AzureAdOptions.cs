namespace GitRadar.API.Configuration;

/// <summary>
/// Microsoft Entra ID (Azure AD) kimlik doğrulama seçenekleridir.
/// appsettings.json üzerindeki "AzureAd" bölümünden beslenir.
/// </summary>
public sealed class AzureAdOptions
{
    public const string SectionName = "AzureAd";

    public string Instance { get; set; } = "https://login.microsoftonline.com/";
    public string TenantId { get; set; } = string.Empty;
    public string ClientId { get; set; } = string.Empty;
    public string ClientSecret { get; set; } = string.Empty;
    public string CallbackPath { get; set; } = "/signin-oidc";

    /// <summary>
    /// TenantId ve ClientId değerlerinin yer tutucu (BURAYA_...) haricinde gerçek bir değerle doldurulup doldurulmadığını denetler.
    /// </summary>
    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(TenantId) &&
        !string.IsNullOrWhiteSpace(ClientId) &&
        !TenantId.StartsWith("BURAYA_") &&
        !ClientId.StartsWith("BURAYA_");
}

