namespace GitRadar.Application.Scans;

/// <summary>
/// Hedef GitHub deposunun manifestolarını çeken, ayrıştıran, OSV zafiyet istihbaratıyla
/// zenginleştiren ve veritabanına kaydeden uçtan uca tarama orkestrasyonu sözleşmesidir.
/// </summary>
public interface IRunRepositoryScanUseCase
{
    /// <summary>
    /// Verilen komut parametreleri doğrultusunda uçtan uca depo taramasını yürütür.
    /// </summary>
    Task<RunRepositoryScanResult> ExecuteAsync(
        RunRepositoryScanCommand command,
        CancellationToken cancellationToken = default);
}

