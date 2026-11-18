namespace GitRadar.Domain.Enums;

/// <summary>
/// Analiz edilen yazılım bileşeninin ait olduğu paket ekosistemini veya türünü belirtir.
/// </summary>
public enum EcosystemType
{
    NuGet = 1,
    Npm = 2,
    PyPI = 3,
    Maven = 4,
    ContainerImage = 5
}

