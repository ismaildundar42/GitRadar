using GitRadar.Domain.Entities;
using GitRadar.Persistence.Converters;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GitRadar.Persistence.Configurations;

public sealed class ScanExecutionConfiguration : IEntityTypeConfiguration<ScanExecution>
{
    public void Configure(EntityTypeBuilder<ScanExecution> builder)
    {
        builder.ToTable("ScanExecutions");

        builder.HasKey(s => s.Id);
        builder.Property(s => s.Id).UseIdentityColumn(1, 1);

        builder.Property(s => s.RepositoryId)
            .IsRequired();

        builder.Property(s => s.CommitSha)
            .HasConversion<CommitShaValueConverter>()
            .HasMaxLength(64)
            .IsRequired();

        builder.HasIndex(s => s.CommitSha);

        builder.Property(s => s.Status)
            .HasConversion<string>()
            .HasMaxLength(50)
            .IsRequired();

        builder.Property(s => s.CreatedAtUtc)
            .IsRequired();

        builder.Property(s => s.StartedAtUtc)
            .IsRequired(false);

        builder.Property(s => s.CompletedAtUtc)
            .IsRequired(false);

        builder.Property(s => s.FailureReason)
            .HasMaxLength(1000)
            .IsRequired(false);

        // Üst Tarama Oturumu İlişkisi (Prompt 101)
        builder.Property(s => s.ScanId)
            .IsRequired(false);

        builder.HasIndex(s => s.ScanId);

        builder.HasOne(s => s.Scan)
            .WithMany(sc => sc.Executions)
            .HasForeignKey(s => s.ScanId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Ignore(s => s.Warnings);

        builder.HasMany(s => s.Packages)
            .WithOne()
            .HasForeignKey(p => p.ScanExecutionId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Navigation(s => s.Packages)
            .UsePropertyAccessMode(PropertyAccessMode.Field);

        builder.HasMany(s => s.VulnerabilityAlerts)
            .WithOne()
            .HasForeignKey(v => v.ScanExecutionId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Navigation(s => s.VulnerabilityAlerts)
            .UsePropertyAccessMode(PropertyAccessMode.Field);
    }
}
