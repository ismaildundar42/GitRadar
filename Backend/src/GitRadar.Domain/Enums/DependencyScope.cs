namespace GitRadar.Domain.Enums;

/// <summary>
/// Bağımlılığın çalışma zamanı, derleme veya geliştirme kullanım kapsamını belirtir.
/// </summary>
public enum DependencyScope
{
    Unknown = 0,
    Production = 1,
    Development = 2,
    Test = 3,
    Build = 4
}

