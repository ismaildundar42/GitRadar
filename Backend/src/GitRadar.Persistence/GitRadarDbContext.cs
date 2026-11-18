using GitRadar.Domain.Entities;
using GitRadar.Persistence.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace GitRadar.Persistence;

/// <summary>
/// GitRadar ana veritabanı bağlamıdır.
/// ASP.NET Core Identity ve Domain varlıklarının SQL Server üzerindeki yapılandırmalarını barındırır.
/// </summary>
public class GitRadarDbContext : IdentityDbContext<ApplicationUser, ApplicationRole, int>
{
    public DbSet<Repository> Repositories => Set<Repository>();
    public DbSet<ScanExecution> ScanExecutions => Set<ScanExecution>();
    public DbSet<DiscoveredPackage> DiscoveredPackages => Set<DiscoveredPackage>();
    public DbSet<VulnerabilityAlert> VulnerabilityAlerts => Set<VulnerabilityAlert>();
    public DbSet<UserActivityLog> UserActivityLogs => Set<UserActivityLog>();
    public DbSet<ScanSession> Scans => Set<ScanSession>();

    public GitRadarDbContext(DbContextOptions<GitRadarDbContext> options)
        : base(options)
    {
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(GitRadarDbContext).Assembly);

        modelBuilder.Entity<ApplicationUser>(b =>
        {
            b.Property(u => u.Id).UseIdentityColumn().ValueGeneratedOnAdd();
        });

        modelBuilder.Entity<ApplicationRole>(b =>
        {
            b.Property(r => r.Id).UseIdentityColumn().ValueGeneratedOnAdd();
        });

        modelBuilder.Entity<UserActivityLog>(b =>
        {
            b.ToTable("UserActivityLogs");
            b.HasKey(s => s.Id);
            b.Property(s => s.UserName).HasMaxLength(250).IsRequired();
            b.Property(s => s.UserRole).HasMaxLength(50).IsRequired();
            b.Property(s => s.ActionType).HasMaxLength(50).IsRequired();
            b.Property(s => s.ActionTitle).HasMaxLength(250).IsRequired();
            b.Property(s => s.Description).HasMaxLength(1000).IsRequired();
            b.Property(s => s.TargetScope).HasMaxLength(500).IsRequired();
            b.Property(s => s.Status).HasMaxLength(50).IsRequired();
            b.Property(s => s.IpAddress).HasMaxLength(100);
            b.HasIndex(s => s.Timestamp);
        });

        modelBuilder.Entity<ScanSession>(b =>
        {
            b.ToTable("Scans");
            b.HasKey(s => s.Id);
            b.Property(s => s.Id).UseIdentityColumn().ValueGeneratedOnAdd();
            b.Property(s => s.ScannedUserName).HasMaxLength(150).IsRequired();
            b.Property(s => s.ScannedUserEmail).HasMaxLength(256).IsRequired();
            b.Property(s => s.ScanType).HasMaxLength(50).IsRequired();
            b.Property(s => s.Status).HasMaxLength(50).IsRequired();

            b.HasMany(s => s.Executions)
                .WithOne(e => e.Scan)
                .HasForeignKey(e => e.ScanId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }
}

