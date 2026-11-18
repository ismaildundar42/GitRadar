namespace GitRadar.Domain.ValueObjects;

/// <summary>
/// Git commit hash (SHA-1: 40 karakter veya SHA-256: 64 karakter) değer nesnesi.
/// Sınıf tabanlı bir 'record' olarak tasarlanmıştır; böylece varsayılan (uninitialized) boş nesne riski önlenir.
/// </summary>
public sealed record CommitSha
{
    public string Value { get; }

    public CommitSha(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
            throw new ArgumentException("Commit SHA boş veya yalnızca boşluklardan oluşamaz.", nameof(value));

        var trimmed = value.Trim().ToLowerInvariant();

        if (trimmed.Length is not (40 or 64))
            throw new ArgumentException($"Commit SHA uzunluğu 40 (SHA-1) veya 64 (SHA-256) karakter olmalıdır. Verilen uzunluk: {trimmed.Length}", nameof(value));

        if (!IsHexadecimal(trimmed))
            throw new ArgumentException("Commit SHA yalnızca onaltılık (0-9, a-f) karakterler içerebilir.", nameof(value));

        Value = trimmed;
    }

    /// <summary>
    /// Fabrika metodu aracılığıyla doğrulanmış bir CommitSha üretir.
    /// </summary>
    public static CommitSha Create(string value) => new(value);

    private static bool IsHexadecimal(string input)
    {
        foreach (var c in input)
        {
            if (c is not ((>= '0' and <= '9') or (>= 'a' and <= 'f')))
                return false;
        }

        return true;
    }

    public override string ToString() => Value;

    public static implicit operator string(CommitSha commitSha) => commitSha.Value;
}
