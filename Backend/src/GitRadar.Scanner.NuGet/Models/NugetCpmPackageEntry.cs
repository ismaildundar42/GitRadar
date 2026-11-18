namespace GitRadar.Scanner.NuGet.Models;

/// <summary>
/// Directory.Packages.props dosyasından ayrıştırılan tek bir merkezi paket sürüm kaydını temsil eder.
/// Değişmezdir (Immutable).
/// </summary>
public sealed class NugetCpmPackageEntry
{
    /// <summary>
    /// Paket kimliği (örn: "Newtonsoft.Json").
    /// </summary>
    public string PackageId { get; }

    /// <summary>
    /// XML manifestodan okunan ham sürüm metni (örn: "13.0.3" veya "$(JsonNetVersion)").
    /// </summary>
    public string RawVersion { get; }

    /// <summary>
    /// Sürüm değerinin bir MSBuild property değişkeni içermeden statik olarak çözümlenebilir bir değer olup olmadığını belirtir.
    /// </summary>
    public bool IsStaticallyResolvable { get; }

    /// <summary>
    /// Bu paket tanımının doğrudan kendisinde veya kapsayıcı ItemGroup üzerinde bir MSBuild Condition özniteliği bulunup bulunmadığı.
    /// </summary>
    public bool HasCondition { get; }

    /// <summary>
    /// Varsa aktif MSBuild koşul ifadesi (örn: "'$(TargetFramework)' == 'net10.0'").
    /// </summary>
    public string? Condition { get; }

    /// <summary>
    /// XML manifestosu içindeki satır numarası.
    /// </summary>
    public int? LineNumber { get; }

    /// <summary>
    /// Aynı paket kimliği için bu katalogda birden fazla merkezi sürüm tanımı bulunup bulunmadığını belirtir.
    /// </summary>
    public bool HasConflict { get; }

    public NugetCpmPackageEntry(
        string packageId,
        string rawVersion,
        bool isStaticallyResolvable,
        bool hasCondition,
        string? condition = null,
        int? lineNumber = null,
        bool hasConflict = false)
    {
        if (string.IsNullOrWhiteSpace(packageId))
            throw new ArgumentException("Paket kimliği boş olamaz.", nameof(packageId));

        if (string.IsNullOrWhiteSpace(rawVersion))
            throw new ArgumentException("Paket sürümü boş olamaz.", nameof(rawVersion));

        PackageId = packageId.Trim();
        RawVersion = rawVersion.Trim();
        IsStaticallyResolvable = isStaticallyResolvable;
        HasCondition = hasCondition;
        Condition = string.IsNullOrWhiteSpace(condition) ? null : condition.Trim();
        LineNumber = lineNumber > 0 ? lineNumber : null;
        HasConflict = hasConflict;
    }

    public override string ToString()
    {
        var cond = HasCondition ? $" [Condition: {Condition}]" : string.Empty;
        var conflict = HasConflict ? " (Conflict)" : string.Empty;
        return $"{PackageId}@{RawVersion}{cond}{conflict}";
    }
}

