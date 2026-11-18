using GitRadar.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace GitRadar.Persistence.Configurations;

public sealed class DiscoveredPackageConfiguration : IEntityTypeConfiguration<DiscoveredPackage>
{
    public void Configure(EntityTypeBuilder<DiscoveredPackage> builder)
    {
        builder.ToTable("DiscoveredPackages");

        builder.HasKey(p => p.Id);
        builder.Property(p => p.Id).UseIdentityColumn(1, 1);

        builder.Property(p => p.ScanExecutionId)
            .IsRequired();

        builder.Property(p => p.Name)
            .HasColumnName("PackageName")
            .HasMaxLength(250)
            .IsRequired();

        builder.HasIndex(p => p.Name);

        builder.Property(p => p.Version)
            .HasColumnName("PackageVersion")
            .HasMaxLength(100)
            .IsRequired();

        builder.Property(p => p.PackageUrl)
            .HasMaxLength(500)
            .IsRequired();

        builder.Property(p => p.Ecosystem)
            .HasConversion<string>()
            .HasMaxLength(50)
            .IsRequired();

        builder.Property(p => p.ManifestPath)
            .HasColumnName("ManifestRelativePath")
            .HasMaxLength(500)
            .IsRequired();

        builder.Property(p => p.DeclaredTargetFramework)
            .HasMaxLength(100)
            .IsRequired(false);

        builder.Property(p => p.IsDirectDependency)
            .HasColumnName("DirectDependency")
            .IsRequired();

        builder.Property(p => p.Scope)
            .HasConversion<string>()
            .HasMaxLength(50)
            .IsRequired();

        builder.Property(p => p.IsSealed)
            .IsRequired();

        builder.HasMany(p => p.Vulnerabilities)
            .WithOne()
            .HasForeignKey(v => v.DiscoveredPackageId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Navigation(p => p.Vulnerabilities)
            .UsePropertyAccessMode(PropertyAccessMode.Field);
    }
}
