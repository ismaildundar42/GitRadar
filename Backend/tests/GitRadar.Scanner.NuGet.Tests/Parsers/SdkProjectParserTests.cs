using GitRadar.Scanning.Abstractions.Models;
using GitRadar.Scanner.NuGet.Models;
using GitRadar.Scanner.NuGet.Parsers;
using GitRadar.Scanner.NuGet.Tests.TestHelpers;
using Xunit;

namespace GitRadar.Scanner.NuGet.Tests.Parsers;

public sealed class SdkProjectParserTests
{
    private readonly SdkProjectParser _parser = new();

    [Fact]
    public void Scenario1_AttributeVersion_ExtractsPackageNameAndVersionCorrectly()
    {
        // Arrange
        const string xml = """
            <Project Sdk="Microsoft.NET.Sdk">
              <ItemGroup>
                <PackageReference Include="Newtonsoft.Json" Version="13.0.3" />
              </ItemGroup>
            </Project>
            """;

        var (manifest, stream) = TestManifestFactory.Create("src/Services/OrderService.csproj", xml);

        // Act
        var result = _parser.Parse(manifest, stream, CancellationToken.None);

        // Assert
        Assert.Equal(ScannerStatus.Success, result.Status);
        var dependency = Assert.Single(result.Dependencies);
        Assert.Equal("Newtonsoft.Json", dependency.Name);
        Assert.Equal("13.0.3", dependency.Version);
        Assert.Equal("13.0.3", dependency.RequestedVersion);
        Assert.Null(dependency.ResolvedVersion);
        Assert.Equal(DependencyRelationship.Direct, dependency.Relationship);
        Assert.Equal(ScannerEcosystem.NuGet, dependency.Ecosystem);
        Assert.Equal("pkg:nuget/Newtonsoft.Json@13.0.3", dependency.PackageCoordinate);
    }

    [Fact]
    public void Scenario2_ChildElementVersion_ExtractsPackageNameAndVersionCorrectly()
    {
        // Arrange
        const string xml = """
            <Project Sdk="Microsoft.NET.Sdk">
              <ItemGroup>
                <PackageReference Include="Serilog">
                  <Version>4.0.0</Version>
                </PackageReference>
              </ItemGroup>
            </Project>
            """;

        var (manifest, stream) = TestManifestFactory.Create("src/Services/LoggingService.csproj", xml);

        // Act
        var result = _parser.Parse(manifest, stream, CancellationToken.None);

        // Assert
        Assert.Equal(ScannerStatus.Success, result.Status);
        var dependency = Assert.Single(result.Dependencies);
        Assert.Equal("Serilog", dependency.Name);
        Assert.Equal("4.0.0", dependency.Version);
        Assert.Equal("4.0.0", dependency.RequestedVersion);
        Assert.Equal("pkg:nuget/Serilog@4.0.0", dependency.PackageCoordinate);
        Assert.Equal(DependencyRelationship.Direct, dependency.Relationship);
    }

    [Fact]
    public void Scenario3_MissingVersion_MarksVersionAsUnspecifiedAndEmitsWarning()
    {
        // Arrange (No CPM catalog provided)
        const string xml = """
            <Project Sdk="Microsoft.NET.Sdk">
              <ItemGroup>
                <PackageReference Include="Microsoft.Extensions.Logging" />
              </ItemGroup>
            </Project>
            """;

        var (manifest, stream) = TestManifestFactory.Create("src/Worker.csproj", xml);

        // Act
        var result = _parser.Parse(manifest, stream, CancellationToken.None, cpmCatalog: null);

        // Assert
        Assert.Equal(ScannerStatus.Success, result.Status);
        var dependency = Assert.Single(result.Dependencies);
        Assert.Equal("Microsoft.Extensions.Logging", dependency.Name);
        Assert.Equal(SdkProjectParser.UnspecifiedVersion, dependency.Version);
        Assert.Null(dependency.RequestedVersion);
        // Canonical PURL for unversioned package must NOT contain @Unspecified
        Assert.Equal("pkg:nuget/Microsoft.Extensions.Logging", dependency.PackageCoordinate);

        // Warning diagnostic indicating missing version
        var warning = Assert.Single(result.Diagnostics);
        Assert.Equal(DiagnosticSeverity.Warning, warning.Severity);
        Assert.Contains("Microsoft.Extensions.Logging", warning.Message);
    }

    [Fact]
    public void Scenario4_VersionOverride_PrecedenceWhenCpmEnabled_EmitsWarningDiagnostic()
    {
        // Arrange: Directory.Packages.props with CPM enabled and centralized version 1.0.0
        const string propsXml = """
            <Project>
              <PropertyGroup>
                <ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>
              </PropertyGroup>
              <ItemGroup>
                <PackageVersion Include="Dapper" Version="1.0.0" />
              </ItemGroup>
            </Project>
            """;

        var propsParser = new DirectoryPackagesPropsParser();
        var (_, propsStream) = TestManifestFactory.Create("Directory.Packages.props", propsXml, manifestType: "props");
        var cpmCatalog = propsParser.Parse("Directory.Packages.props", propsStream, CancellationToken.None);

        // Project declares both Version and VersionOverride
        const string projectXml = """
            <Project Sdk="Microsoft.NET.Sdk">
              <ItemGroup>
                <PackageReference Include="Dapper" Version="1.0.0" VersionOverride="2.1.28" />
              </ItemGroup>
            </Project>
            """;

        var (manifest, projectStream) = TestManifestFactory.Create("src/Repo.csproj", projectXml);

        // Act
        var result = _parser.Parse(manifest, projectStream, CancellationToken.None, cpmCatalog);

        // Assert
        Assert.Equal(ScannerStatus.Success, result.Status);
        var dependency = Assert.Single(result.Dependencies);
        Assert.Equal("Dapper", dependency.Name);
        Assert.Equal("2.1.28", dependency.Version);
        Assert.Equal("2.1.28", dependency.RequestedVersion);
        Assert.Equal("pkg:nuget/Dapper@2.1.28", dependency.PackageCoordinate);

        // Diagnostic verification: Warning for both Version and VersionOverride defined
        Assert.Contains(result.Diagnostics, d =>
            d.Severity == DiagnosticSeverity.Warning &&
            d.Message.Contains("Dapper") &&
            d.Message.Contains("VersionOverride"));
    }

    [Fact]
    public void Scenario5_XmlSecurity_DtdProcessingProhibited_RejectsSecurelyWithoutPathLeakage()
    {
        // Arrange: Malicious XML with DTD definition
        const string xmlWithDtd = """
            <?xml version="1.0" encoding="utf-8"?>
            <!DOCTYPE project [
              <!ENTITY ext SYSTEM "file:///c:/windows/win.ini">
            ]>
            <Project Sdk="Microsoft.NET.Sdk">
              <ItemGroup>
                <PackageReference Include="&ext;" Version="1.0.0" />
              </ItemGroup>
            </Project>
            """;

        var (manifest, stream) = TestManifestFactory.Create("src/Malicious.csproj", xmlWithDtd);

        // Act
        var result = _parser.Parse(manifest, stream, CancellationToken.None);

        // Assert
        Assert.Equal(ScannerStatus.Failed, result.Status);
        Assert.Empty(result.Dependencies);

        var diagnostic = Assert.Single(result.Diagnostics);
        Assert.Equal(DiagnosticSeverity.Error, diagnostic.Severity);
        Assert.Equal("XML_PARSE_ERROR", diagnostic.ErrorCode);

        // Security check: Must not leak local system file paths or unhandled raw stack trace
        Assert.DoesNotContain("win.ini", diagnostic.Message, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("at System.Xml", diagnostic.Message, StringComparison.OrdinalIgnoreCase);
    }
}
