namespace GitRadar.Domain.Repositories;

/// <summary>
/// Atomik veritabanı işlemlerini yöneten İş Birimi (Unit of Work) sözleşmesidir.
/// </summary>
public interface IUnitOfWork
{
    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}

