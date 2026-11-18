using GitRadar.Scanning.Abstractions.Models;
using GitRadar.Scanner.NuGet.Parsers;
using GitRadar.Scanner.NuGet.Tests.TestHelpers;
using Xunit;

namespace GitRadar.Scanner.NuGet.Tests.Parsers;

public sealed class PackagesConfigParserTests
{
    private readonly PackagesConfigParser _parser = new();

    [Fact]
    public void Scenario1_StandardRead_ParsesPackageAttributesAndCoordinatesCorrectly()
    {
        // Arrange
        const string xml = """
            <?xml version="1.0" encoding="utf-8"?>
            <packages>
              <package id="EntityFramework" version="6.4.4" targetFramework="net48" />
            </packages>
            """;

        var (manifest, stream) = TestManifestFactory.Create(
            manifestPath: "legacy/packages.config",
            content: xml,
            manifestType: "packages.config");

        // Act
        var result = _parser.Parse(manifest, stream, CancellationToken.None);

        // Assert
        Assert.Equal(ScannerStatus.Success, result.Status);
        var dependency = Assert.Single(result.Dependencies);
        Assert.Equal("EntityFramework", dependency.Name);
        Assert.Equal("6.4.4", dependency.Version);
        Assert.Equal("6.4.4", dependency.RequestedVersion);
        Assert.Null(dependency.ResolvedVersion);
        Assert.Equal(ScannerEcosystem.NuGet, dependency.Ecosystem);
        Assert.Equal(DependencyRelationship.Unknown, dependency.Relationship);
        Assert.Equal(DependencyScope.Unknown, dependency.Scope);
        Assert.Equal("pkg:nuget/EntityFramework@6.4.4?target_framework=net48", dependency.PackageCoordinate);
    }

    [Fact]
    public void Scenario2_EmptyRoot_ReturnsSuccessWithZeroDependencies()
    {
        // Arrange: Empty <packages /> self-closing element
        const string xml = """
            <?xml version="1.0" encoding="utf-8"?>
            <packages />
            """;

        var (manifest, stream) = TestManifestFactory.Create(
            manifestPath: "legacy/packages.config",
            content: xml,
            manifestType: "packages.config");

        // Act
        var result = _parser.Parse(manifest, stream, CancellationToken.None);

        // Assert
        Assert.Equal(ScannerStatus.Success, result.Status);
        Assert.Empty(result.Dependencies);
        Assert.Empty(result.Diagnostics);
    }

    [Fact]
    public void Scenario3_InvalidRootElement_ReturnsFailureWithInvalidRootElementCode()
    {
        // Arrange: Root element is <configuration> instead of <packages>
        const string xml = """
            <?xml version="1.0" encoding="utf-8"?>
            <configuration>
              <package id="Dapper" version="2.0.0" />
            </configuration>
            """;

        var (manifest, stream) = TestManifestFactory.Create(
            manifestPath: "legacy/packages.config",
            content: xml,
            manifestType: "packages.config");

        // Act
        var result = _parser.Parse(manifest, stream, CancellationToken.None);

        // Assert
        Assert.Equal(ScannerStatus.Failed, result.Status);
        Assert.Empty(result.Dependencies);

        var diagnostic = Assert.Single(result.Diagnostics);
        Assert.Equal(DiagnosticSeverity.Error, diagnostic.Severity);
        Assert.Equal("INVALID_ROOT_ELEMENT", diagnostic.ErrorCode);
        Assert.Contains("packages", diagnostic.Message);
        Assert.Contains("configuration", diagnostic.Message);
    }

    [Fact]
    public void Scenario4_MalformedXml_ReturnsFailureWithXmlParseErrorCodeWithoutRawLeakage()
    {
        // Arrange: Corrupted/truncated XML
        const string malformedXml = """
            <?xml version="1.0" encoding="utf-8"?>
            <packages>
              <package id="Newtonsoft.Json" version="13.0.1"
            """;

        var (manifest, stream) = TestManifestFactory.Create(
            manifestPath: "legacy/packages.config",
            content: malformedXml,
            manifestType: "packages.config");

        // Act
        var result = _parser.Parse(manifest, stream, CancellationToken.None);

        // Assert
        Assert.Equal(ScannerStatus.Failed, result.Status);
        Assert.Empty(result.Dependencies);

        var diagnostic = Assert.Single(result.Diagnostics);
        Assert.Equal(DiagnosticSeverity.Error, diagnostic.Severity);
        Assert.Equal("XML_PARSE_ERROR", diagnostic.ErrorCode);

        // Security assertion: No raw exception message or stack trace leakage
        Assert.DoesNotContain("Exception:", diagnostic.Message, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("at System.Xml", diagnostic.Message, StringComparison.OrdinalIgnoreCase);
    }
}
