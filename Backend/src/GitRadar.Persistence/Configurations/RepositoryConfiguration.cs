using GitRadar.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GitRadar.Persistence.Configurations;

public sealed class RepositoryConfiguration : IEntityTypeConfiguration<Repository>
{
    public void Configure(EntityTypeBuilder<Repository> builder)
    {
        builder.ToTable("Repositories");

        builder.HasKey(r => r.Id);
        builder.Property(r => r.Id).UseIdentityColumn(1, 1);

        builder.Property(r => r.Name)
            .HasMaxLength(200)
            .IsRequired();

        builder.HasIndex(r => r.Name);

        builder.Property(r => r.Owner)
            .HasMaxLength(200)
            .IsRequired();

        builder.Property(r => r.RemoteUrl)
            .HasMaxLength(500)
            .IsRequired();

        builder.Property(r => r.DefaultBranch)
            .HasMaxLength(100)
            .IsRequired();

        builder.Property(r => r.GitHubRepositoryId)
            .IsRequired();

        builder.Property(r => r.IsPrivate)
            .IsRequired();

        builder.Property(r => r.Status)
            .HasConversion<string>()
            .HasMaxLength(50)
            .IsRequired();

        builder.Property(r => r.CreatedAtUtc)
            .IsRequired();

        builder.Property(r => r.UpdatedAtUtc)
            .IsRequired(false);

        builder.Ignore(r => r.FullName);

        builder.HasMany(r => r.ScanExecutions)
            .WithOne()
            .HasForeignKey(s => s.RepositoryId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Navigation(r => r.ScanExecutions)
            .UsePropertyAccessMode(PropertyAccessMode.Field);
    }
}
