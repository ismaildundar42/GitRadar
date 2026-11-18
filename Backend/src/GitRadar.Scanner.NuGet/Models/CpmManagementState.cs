namespace GitRadar.Scanner.NuGet.Models;

/// <summary>
/// Central Package Management (CPM) özelliğinin Directory.Packages.props
/// manifestosundaki etkinleştirilme durumunu temsil eder.
/// </summary>
public enum CpmManagementState
{
    /// <summary>
    /// ManagePackageVersionsCentrally özelliği açıkça belirtilmemiş (eksik).
    /// </summary>
    Unspecified = 0,

    /// <summary>
    /// ManagePackageVersionsCentrally='true' olarak açıkça etkinleştirilmiş.
    /// </summary>
    Enabled = 1,

    /// <summary>
    /// ManagePackageVersionsCentrally='false' olarak açıkça devre dışı bırakılmış.
    /// </summary>
    Disabled = 2,

    /// <summary>
    /// ManagePackageVersionsCentrally değeri bir MSBuild değişkeni ($(Property))
    /// veya geçersiz bir metin içerdiği için statik olarak doğrulanamıyor (belirsiz).
    /// </summary>
    Ambiguous = 3
}

