using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GitRadar.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class Initial_SCA_BigInt_Schema : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Repositories",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    GitHubRepositoryId = table.Column<long>(type: "bigint", nullable: false),
                    Owner = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    RemoteUrl = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    DefaultBranch = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    IsPrivate = table.Column<bool>(type: "bit", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Repositories", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ScanExecutions",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    RepositoryId = table.Column<long>(type: "bigint", nullable: false),
                    CommitSha = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    Status = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    StartedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CompletedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    FailureReason = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ScanExecutions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ScanExecutions_Repositories_RepositoryId",
                        column: x => x.RepositoryId,
                        principalTable: "Repositories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "DiscoveredPackages",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    ScanExecutionId = table.Column<long>(type: "bigint", nullable: false),
                    PackageName = table.Column<string>(type: "nvarchar(250)", maxLength: 250, nullable: false),
                    PackageVersion = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    PackageUrl = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    Ecosystem = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    ManifestRelativePath = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    DeclaredTargetFramework = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    DirectDependency = table.Column<bool>(type: "bit", nullable: false),
                    Scope = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    IsSealed = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DiscoveredPackages", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DiscoveredPackages_ScanExecutions_ScanExecutionId",
                        column: x => x.ScanExecutionId,
                        principalTable: "ScanExecutions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "VulnerabilityAlerts",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    ScanExecutionId = table.Column<long>(type: "bigint", nullable: false),
                    DiscoveredPackageId = table.Column<long>(type: "bigint", nullable: false),
                    AdvisoryId = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Severity = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    CvssScore = table.Column<decimal>(type: "decimal(3,1)", precision: 3, scale: 1, nullable: true),
                    Status = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    Title = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    AffectedVersions = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    FixedInVersion = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    Source = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    ResolvedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ResolutionComment = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_VulnerabilityAlerts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_VulnerabilityAlerts_DiscoveredPackages_DiscoveredPackageId",
                        column: x => x.DiscoveredPackageId,
                        principalTable: "DiscoveredPackages",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_VulnerabilityAlerts_ScanExecutions_ScanExecutionId",
                        column: x => x.ScanExecutionId,
                        principalTable: "ScanExecutions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DiscoveredPackages_PackageName",
                table: "DiscoveredPackages",
                column: "PackageName");

            migrationBuilder.CreateIndex(
                name: "IX_DiscoveredPackages_ScanExecutionId",
                table: "DiscoveredPackages",
                column: "ScanExecutionId");

            migrationBuilder.CreateIndex(
                name: "IX_Repositories_Name",
                table: "Repositories",
                column: "Name");

            migrationBuilder.CreateIndex(
                name: "IX_ScanExecutions_CommitSha",
                table: "ScanExecutions",
                column: "CommitSha");

            migrationBuilder.CreateIndex(
                name: "IX_ScanExecutions_RepositoryId",
                table: "ScanExecutions",
                column: "RepositoryId");

            migrationBuilder.CreateIndex(
                name: "IX_VulnerabilityAlerts_AdvisoryId",
                table: "VulnerabilityAlerts",
                column: "AdvisoryId");

            migrationBuilder.CreateIndex(
                name: "IX_VulnerabilityAlerts_DiscoveredPackageId",
                table: "VulnerabilityAlerts",
                column: "DiscoveredPackageId");

            migrationBuilder.CreateIndex(
                name: "IX_VulnerabilityAlerts_ScanExecutionId",
                table: "VulnerabilityAlerts",
                column: "ScanExecutionId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "VulnerabilityAlerts");

            migrationBuilder.DropTable(
                name: "DiscoveredPackages");

            migrationBuilder.DropTable(
                name: "ScanExecutions");

            migrationBuilder.DropTable(
                name: "Repositories");
        }
    }
}
