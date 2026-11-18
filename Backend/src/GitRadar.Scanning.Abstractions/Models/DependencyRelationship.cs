namespace GitRadar.Scanning.Abstractions.Models;

/// <summary>
/// Bağımlılığın doğrudan veya dolaylı bildirim ilişkisini belirtir.
/// </summary>
public enum DependencyRelationship
{
    /// <summary>
    /// İlişki türü belirlenemedi.
    /// </summary>
    Unknown = 0,

    /// <summary>
    /// Proje manifestosu tarafından doğrudan bildirilen birincil (top-level) bağımlılık.
    /// </summary>
    Direct = 1,

    /// <summary>
    /// Başka bir paketin alt bağımlılığı olarak çekilen dolaylı (transitive) bağımlılık.
    /// </summary>
    Transitive = 2
}

