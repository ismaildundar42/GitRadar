using System.Text;
using GitRadar.Scanning.Abstractions.Models;

namespace GitRadar.Scanner.NuGet.Tests.TestHelpers;

internal static class TestManifestFactory
{
    public static (DiscoveredManifest Manifest, MemoryStream Stream) Create(
        string manifestPath,
        string content,
        ScannerEcosystem ecosystem = ScannerEcosystem.NuGet,
        string manifestType = "csproj")
    {
        var bytes = Encoding.UTF8.GetBytes(content);
        var manifest = new DiscoveredManifest(
            manifestPath: manifestPath,
            manifestType: manifestType,
            ecosystem: ecosystem,
            sizeBytes: bytes.Length);

        var stream = new MemoryStream(bytes);
        return (manifest, stream);
    }
}

