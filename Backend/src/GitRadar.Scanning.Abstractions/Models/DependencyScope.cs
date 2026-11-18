namespace GitRadar.Scanning.Abstractions.Models;

/// <summary>
/// Bağımlılığın çalışma zamanı, derleme veya geliştirme kullanım kapsamını belirtir.
/// </summary>
public enum DependencyScope
{
    /// <summary>
    /// Kapsam belirlenemedi veya genel varsayılan.
    /// </summary>
    Unknown = 0,

    /// <summary>
    /// Canlı çalışma zamanında gerekli olan üretim bağımlılığı (Runtime / Compile).
    /// </summary>
    Production = 1,

    /// <summary>
    /// Yalnızca geliştirme aşamasında kullanılan bağımlılık (devDependency, linter, analyzer vb.).
    /// </summary>
    Development = 2,

    /// <summary>
    /// Yalnızca test çalıştırma aşamasında kullanılan bağımlılık (xUnit, NUnit, Jest vb.).
    /// </summary>
    Test = 3,

    /// <summary>
    /// Yalnızca derleme ve paketleme sürecinde kullanılan araçlar (PrivateAssets, build-time tools).
    /// </summary>
    Build = 4
}

