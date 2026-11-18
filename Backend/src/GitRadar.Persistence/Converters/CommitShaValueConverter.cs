using GitRadar.Domain.ValueObjects;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace GitRadar.Persistence.Converters;

/// <summary>
/// Domain CommitSha değer nesnesi ile veritabanındaki 40/64 karakterlik string kolon arasındaki EF Core dönüşümünü sağlar.
/// </summary>
public sealed class CommitShaValueConverter : ValueConverter<CommitSha, string>
{
    public CommitShaValueConverter()
        : base(
            v => v.Value,
            v => new CommitSha(v))
    {
    }
}

