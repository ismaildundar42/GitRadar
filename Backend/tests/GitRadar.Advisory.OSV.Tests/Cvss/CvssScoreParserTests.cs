using System.Text.Json;
using GitRadar.Advisory.Abstractions.Models;
using GitRadar.Advisory.OSV.Cvss;
using GitRadar.Advisory.OSV.Models;
using Xunit;

namespace GitRadar.Advisory.OSV.Tests.Cvss;

public sealed class CvssScoreParserTests
{
    [Fact]
    public void Scenario1_CriticalCvssV31_CalculatesScore9Point8AndMapsToCritical()
    {
        // Arrange: Classic remote code execution vector (Log4j, etc.)
        const string vector = "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H";
        var severities = new List<OsvSeverity>
        {
            new() { Type = "CVSS_V3", Score = vector }
        };

        // Act
        var (cvss, severity) = CvssScoreParser.ParseCvssAndSeverity(severities, null, null);

        // Assert
        Assert.NotNull(cvss);
        Assert.Equal("3.1", cvss.Version);
        Assert.Equal(vector, cvss.VectorString);
        Assert.Equal(9.8m, cvss.BaseScore);
        Assert.Equal(SeverityLevel.Critical, severity);
    }

    [Fact]
    public void Scenario2_HighCvssV31_CalculatesScore7Point5AndMapsToHigh()
    {
        // Arrange: High severity vector (Availability high, network, no privileges)
        const string vector = "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H";
        var severities = new List<OsvSeverity>
        {
            new() { Type = "CVSS_V3", Score = vector }
        };

        // Act
        var (cvss, severity) = CvssScoreParser.ParseCvssAndSeverity(severities, null, null);

        // Assert
        Assert.NotNull(cvss);
        Assert.Equal("3.1", cvss.Version);
        Assert.Equal(vector, cvss.VectorString);
        Assert.Equal(7.5m, cvss.BaseScore);
        Assert.Equal(SeverityLevel.High, severity);
    }

    [Fact]
    public void Scenario3_MediumAndLowCvss_CalculatesCorrectScoreAndSeverityLevel()
    {
        // Arrange: Medium severity vector
        const string mediumVector = "CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:L/I:N/A:N";
        var mediumSeverities = new List<OsvSeverity>
        {
            new() { Type = "CVSS_V3", Score = mediumVector }
        };

        // Act & Assert Medium
        var (mediumCvss, mediumSeverity) = CvssScoreParser.ParseCvssAndSeverity(mediumSeverities, null, null);
        Assert.NotNull(mediumCvss);
        Assert.Equal(4.3m, mediumCvss.BaseScore);
        Assert.Equal(SeverityLevel.Medium, mediumSeverity);

        // Arrange: Low severity vector (Local, High complexity, High privileges, Required user interaction)
        const string lowVector = "CVSS:3.1/AV:L/AC:H/PR:H/UI:R/S:U/C:L/I:N/A:N";
        var lowSeverities = new List<OsvSeverity>
        {
            new() { Type = "CVSS_V3", Score = lowVector }
        };

        // Act & Assert Low
        var (lowCvss, lowSeverity) = CvssScoreParser.ParseCvssAndSeverity(lowSeverities, null, null);
        Assert.NotNull(lowCvss);
        Assert.True(lowCvss.BaseScore is >= 0.1m and <= 3.9m);
        Assert.Equal(SeverityLevel.Low, lowSeverity);
    }

    [Fact]
    public void Scenario4_Vectorless_ResolvesSeverityFromDatabaseSpecificAndLeavesCvssNull()
    {
        // Arrange: No CVSS in severity array, but database_specific has severity = "CRITICAL"
        var databaseSpecificJson = JsonDocument.Parse("""{"severity": "CRITICAL", "cwe_ids": ["CWE-89"]}""").RootElement;

        // Act
        var (cvss, severity) = CvssScoreParser.ParseCvssAndSeverity(null, databaseSpecificJson, null);

        // Assert: No fake values, Cvss is null, Severity mapped accurately
        Assert.Null(cvss);
        Assert.Equal(SeverityLevel.Critical, severity);

        // Test with "HIGH" in ecosystem_specific
        var ecosystemSpecificJson = JsonDocument.Parse("""{"severity": "HIGH"}""").RootElement;
        var (cvssHigh, severityHigh) = CvssScoreParser.ParseCvssAndSeverity([], null, ecosystemSpecificJson);
        Assert.Null(cvssHigh);
        Assert.Equal(SeverityLevel.High, severityHigh);

        // Test with "MODERATE"
        var moderateJson = JsonDocument.Parse("""{"severity": "MODERATE"}""").RootElement;
        var (cvssMed, severityMed) = CvssScoreParser.ParseCvssAndSeverity([], moderateJson, null);
        Assert.Null(cvssMed);
        Assert.Equal(SeverityLevel.Medium, severityMed);
    }

    [Fact]
    public void Scenario5_InvalidOrMalformedVector_DoesNotCrashAndReturnsSafeFallback()
    {
        // Arrange: Corrupted/incomplete vector string
        var severities = new List<OsvSeverity>
        {
            new() { Type = "CVSS_V3", Score = "CVSS:3.1/AV:CORRUPTED/FOO:BAR" }
        };

        // Act
        var (cvss, severity) = CvssScoreParser.ParseCvssAndSeverity(severities, null, null);

        // Assert: System does not crash
        Assert.NotNull(cvss);
        Assert.Null(cvss.BaseScore); // Cannot compute score from corrupted vector
        Assert.Equal(SeverityLevel.None, severity);
    }

    [Fact]
    public void DirectNumericScore_ParsesCorrectly()
    {
        // Arrange: Direct decimal score instead of vector string
        var severities = new List<OsvSeverity>
        {
            new() { Type = "CVSS_V3", Score = "8.8" }
        };

        // Act
        var (cvss, severity) = CvssScoreParser.ParseCvssAndSeverity(severities, null, null);

        // Assert
        Assert.NotNull(cvss);
        Assert.Equal(8.8m, cvss.BaseScore);
        Assert.Equal(SeverityLevel.High, severity);
    }

    [Fact]
    public void Prompt52_NewtonsoftJsonVector_Calculates7Point5AndMapsToHigh()
    {
        // Arrange: Real Newtonsoft.Json vulnerability vector (CVE-2024-21907 / GHSA-5crp-9r3c-p9vr)
        const string vector = "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H";
        var severities = new List<OsvSeverity>
        {
            new() { Type = "CVSS_V3.1", Score = vector }
        };

        // Act
        var (cvss, severity) = CvssScoreParser.ParseCvssAndSeverity(severities, null, null);

        // Assert
        Assert.NotNull(cvss);
        Assert.Equal("3.1", cvss.Version);
        Assert.Equal(vector, cvss.VectorString);
        Assert.Equal(7.5m, cvss.BaseScore);
        Assert.Equal(SeverityLevel.High, severity);
    }

    [Fact]
    public void Prompt52_SharpZipLibVector_Calculates5Point3Or5Point5AndMapsToMedium()
    {
        // Arrange: Medium availability/integrity vector commonly found in archive handling (e.g. AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:L/A:N = 5.3)
        const string vector = "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:L/A:N";
        var severities = new List<OsvSeverity>
        {
            new() { Type = "CVSS_V3", Score = vector }
        };

        // Act
        var (cvss, severity) = CvssScoreParser.ParseCvssAndSeverity(severities, null, null);

        // Assert
        Assert.NotNull(cvss);
        Assert.Equal(5.3m, cvss.BaseScore);
        Assert.Equal(SeverityLevel.Medium, severity);
    }

    [Fact]
    public void Prompt52_VectorInDatabaseSpecific_CalculatesDynamicScore()
    {
        // Arrange: No severity array, but database_specific has cvss object with vector_string
        var databaseSpecificJson = JsonDocument.Parse("""
        {
            "cvss": {
                "vector_string": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H"
            }
        }
        """).RootElement;

        // Act
        var (cvss, severity) = CvssScoreParser.ParseCvssAndSeverity(null, databaseSpecificJson, null);

        // Assert
        Assert.NotNull(cvss);
        Assert.Equal(9.8m, cvss.BaseScore);
        Assert.Equal(SeverityLevel.Critical, severity);
    }

    [Fact]
    public void Prompt52_DirectScoreInDatabaseSpecific_AssignsScoreAndSeverity()
    {
        // Arrange: Direct numeric score in database_specific
        var databaseSpecificJson = JsonDocument.Parse("""
        {
            "score": 6.5,
            "severity": "MODERATE"
        }
        """).RootElement;

        // Act
        var (cvss, severity) = CvssScoreParser.ParseCvssAndSeverity(null, databaseSpecificJson, null);

        // Assert
        Assert.NotNull(cvss);
        Assert.Equal(6.5m, cvss.BaseScore);
        Assert.Equal(SeverityLevel.Medium, severity);
    }
}

