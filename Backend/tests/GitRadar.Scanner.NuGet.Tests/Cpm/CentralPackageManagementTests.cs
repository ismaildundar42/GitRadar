using System.Text;
using GitRadar.Scanning.Abstractions.Models;
using GitRadar.Scanner.NuGet.Models;
using GitRadar.Scanner.NuGet.Parsers;
using GitRadar.Scanner.NuGet.Tests.TestHelpers;
using Xunit;

namespace GitRadar.Scanner.NuGet.Tests.Cpm;

public sealed class CentralPackageManagementTests
{
    private readonly DirectoryPackagesPropsParser _propsParser = new();
    private readonly SdkProjectParser _sdkParser = new();

    [Fact]
    public void Scenario1_CpmEnabled_AppliesCentralPackageVersions()
    {
        // Arrange
        const string propsXml = """
            <Project>
              <PropertyGroup>
                <ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>
              </PropertyGroup>
              <ItemGroup>
                <PackageVersion Include="FluentValidation" Version="11.9.0" />
                <PackageVersion Include="MediatR" Version="12.2.0" />
              </ItemGroup>
            </Project>
            """;

        var (propsManifest, propsStream) = TestManifestFactory.Create("Directory.Packages.props", propsXml, manifestType: "props");
        var catalog = _propsParser.Parse(propsManifest, propsStream, CancellationToken.None);

        Assert.Equal(CpmManagementState.Enabled, catalog.State);
        Assert.True(catalog.TryGetSinglePackage("FluentValidation", out var fluentValidationEntry));
        Assert.Equal("11.9.0", fluentValidationEntry.RawVersion);

        // Project references packages without specifying Version attribute
        const string projectXml = """
            <Project Sdk="Microsoft.NET.Sdk">
              <ItemGroup>
                <PackageReference Include="FluentValidation" />
                <PackageReference Include="MediatR" />
              </ItemGroup>
            </Project>
            """;

        var (projManifest, projStream) = TestManifestFactory.Create("src/Core/Core.csproj", projectXml);

        // Act
        var result = _sdkParser.Parse(projManifest, projStream, CancellationToken.None, catalog);

        // Assert
        Assert.Equal(ScannerStatus.Success, result.Status);
        Assert.Equal(2, result.Dependencies.Count);

        var fluentDep = Assert.Single(result.Dependencies, d => d.Name == "FluentValidation");
        Assert.Equal("11.9.0", fluentDep.Version);
        Assert.Equal("11.9.0", fluentDep.RequestedVersion);
        Assert.Equal("pkg:nuget/FluentValidation@11.9.0", fluentDep.PackageCoordinate);

        var mediatrDep = Assert.Single(result.Dependencies, d => d.Name == "MediatR");
        Assert.Equal("12.2.0", mediatrDep.Version);
        Assert.Equal("12.2.0", mediatrDep.RequestedVersion);
        Assert.Equal("pkg:nuget/MediatR@12.2.0", mediatrDep.PackageCoordinate);
    }

    [Fact]
    public void Scenario2_CpmDisabled_CentralVersionsAreNotEnforced()
    {
        // Arrange
        const string propsXml = """
            <Project>
              <PropertyGroup>
                <ManagePackageVersionsCentrally>false</ManagePackageVersionsCentrally>
              </PropertyGroup>
              <ItemGroup>
                <PackageVersion Include="Polly" Version="8.3.0" />
              </ItemGroup>
            </Project>
            """;

        var (propsManifest, propsStream) = TestManifestFactory.Create("Directory.Packages.props", propsXml, manifestType: "props");
        var catalog = _propsParser.Parse(propsManifest, propsStream, CancellationToken.None);

        Assert.Equal(CpmManagementState.Disabled, catalog.State);

        const string projectXml = """
            <Project Sdk="Microsoft.NET.Sdk">
              <ItemGroup>
                <PackageReference Include="Polly" />
              </ItemGroup>
            </Project>
            """;

        var (projManifest, projStream) = TestManifestFactory.Create("src/Gateway/Gateway.csproj", projectXml);

        // Act
        var result = _sdkParser.Parse(projManifest, projStream, CancellationToken.None, catalog);

        // Assert
        Assert.Equal(ScannerStatus.Success, result.Status);
        var dependency = Assert.Single(result.Dependencies);
        Assert.Equal("Polly", dependency.Name);
        // Because CPM is disabled, version must NOT be taken from Directory.Packages.props
        Assert.Equal(SdkProjectParser.UnspecifiedVersion, dependency.Version);
        Assert.Null(dependency.RequestedVersion);
        Assert.Equal("pkg:nuget/Polly", dependency.PackageCoordinate);

        Assert.Contains(result.Diagnostics, d =>
            d.Severity == DiagnosticSeverity.Warning &&
            d.Message.Contains("Polly") &&
            d.Message.Contains("ManagePackageVersionsCentrally=false"));
    }

    [Fact]
    public async Task Scenario3_HierarchicalResolution_SelectsNearestAncestorDirectoryPackagesProps()
    {
        // Arrange
        // Root Directory.Packages.props defines Serilog = 3.0.0
        const string rootPropsXml = """
            <Project>
              <PropertyGroup>
                <ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>
              </PropertyGroup>
              <ItemGroup>
                <PackageVersion Include="Serilog" Version="3.0.0" />
              </ItemGroup>
            </Project>
            """;

        // Nested Directory.Packages.props in src/FeatureA defines Serilog = 4.1.0
        const string nestedPropsXml = """
            <Project>
              <PropertyGroup>
                <ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>
              </PropertyGroup>
              <ItemGroup>
                <PackageVersion Include="Serilog" Version="4.1.0" />
              </ItemGroup>
            </Project>
            """;

        // Project A inside src/FeatureA/Sub/ProjectA.csproj
        const string projectAXml = """
            <Project Sdk="Microsoft.NET.Sdk">
              <ItemGroup>
                <PackageReference Include="Serilog" />
              </ItemGroup>
            </Project>
            """;

        // Project B in src/FeatureB/ProjectB.csproj (no local props, should resolve to root props)
        const string projectBXml = """
            <Project Sdk="Microsoft.NET.Sdk">
              <ItemGroup>
                <PackageReference Include="Serilog" />
              </ItemGroup>
            </Project>
            """;

        var rootPropsManifest = new DiscoveredManifest("Directory.Packages.props", "props", ScannerEcosystem.NuGet, rootPropsXml.Length);
        var nestedPropsManifest = new DiscoveredManifest("src/FeatureA/Directory.Packages.props", "props", ScannerEcosystem.NuGet, nestedPropsXml.Length);
        var projectAManifest = new DiscoveredManifest("src/FeatureA/Sub/ProjectA.csproj", "csproj", ScannerEcosystem.NuGet, projectAXml.Length);
        var projectBManifest = new DiscoveredManifest("src/FeatureB/ProjectB.csproj", "csproj", ScannerEcosystem.NuGet, projectBXml.Length);

        var manifests = new List<DiscoveredManifest>
        {
            rootPropsManifest,
            nestedPropsManifest,
            projectAManifest,
            projectBManifest
        };

        var streamMap = new Dictionary<string, string>
        {
            [rootPropsManifest.ManifestPath] = rootPropsXml,
            [nestedPropsManifest.ManifestPath] = nestedPropsXml,
            [projectAManifest.ManifestPath] = projectAXml,
            [projectBManifest.ManifestPath] = projectBXml
        };

        Task<Stream> StreamProvider(DiscoveredManifest m, CancellationToken ct)
        {
            var bytes = Encoding.UTF8.GetBytes(streamMap[m.ManifestPath]);
            return Task.FromResult<Stream>(new MemoryStream(bytes));
        }

        var provider = new NuGetScannerProvider();

        // Act
        var batchResults = await provider.ScanBatchAsync(manifests, StreamProvider, CancellationToken.None);

        // Assert
        Assert.Equal(4, batchResults.Count);

        var resultA = Assert.Single(batchResults, r => r.Manifest.ManifestPath == projectAManifest.ManifestPath);
        var depA = Assert.Single(resultA.Dependencies);
        Assert.Equal("Serilog", depA.Name);
        // Deepest ancestor (src/FeatureA/Directory.Packages.props) must take precedence
        Assert.Equal("4.1.0", depA.Version);
        Assert.Equal("pkg:nuget/Serilog@4.1.0", depA.PackageCoordinate);

        var resultB = Assert.Single(batchResults, r => r.Manifest.ManifestPath == projectBManifest.ManifestPath);
        var depB = Assert.Single(resultB.Dependencies);
        Assert.Equal("Serilog", depB.Name);
        // Fallback to nearest ancestor, which is root Directory.Packages.props
        Assert.Equal("3.0.0", depB.Version);
        Assert.Equal("pkg:nuget/Serilog@3.0.0", depB.PackageCoordinate);
    }
}
