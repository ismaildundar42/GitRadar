using System.Globalization;
using System.Text.Json;
using GitRadar.Advisory.Abstractions.Models;

namespace GitRadar.Advisory.OSV.Cvss;

/// <summary>
/// Google OSV ve GitHub Advisory API yanıtlarındaki CVSS vektör dizgelerini ve ham önem derecelerini
/// CIS Controls v8 Safeguard 16.6 önceliklendirme standardına uygun 3 aşamalı zincirle çözümleyen sınıftır.
/// </summary>
internal static class CvssScoreParser
{
    /// <summary>
    /// Zafiyetin CVSS skoru ve seviyesini belirler:
    /// Adım 1: OSV severity dizisinde veya database_specific içinde type == "CVSS_V3" / "CVSS_V3.1" vektörünü yakalayıp matematiksel algoritmayla dinamik skor üretir.
    /// Adım 2: Vektör yoksa doğrudan hazır sayısal skoru okur.
    /// Adım 3: Vektör ve sayısal skor yoksa database_specific.severity metinsel değerine ("CRITICAL", "HIGH", "MODERATE", "LOW") geri döner.
    /// </summary>
    public static (CvssMetadata? Cvss, SeverityLevel Severity) ParseCvssAndSeverity(
        IReadOnlyList<Models.OsvSeverity>? osvSeverities,
        JsonElement? databaseSpecific,
        JsonElement? ecosystemSpecific)
    {
        // =========================================================================
        // ADIM 1: Algoritma / Vektör Hesaplama (Öncelikli)
        // =========================================================================
        string? vectorString = null;
        string? vectorTypeHint = null;

        if (osvSeverities is not null && osvSeverities.Count > 0)
        {
            // 1.1 Öncelikli: type == "CVSS_V3", "CVSS_V3.1", "CVSS_V3.0" veya "CVSS_V4" olan ve geçerli vektör içeren öğe
            var prioritizedEntry = osvSeverities.FirstOrDefault(s =>
                !string.IsNullOrWhiteSpace(s.Score) &&
                IsCvssVectorString(s.Score) &&
                (string.Equals(s.Type, "CVSS_V3", StringComparison.OrdinalIgnoreCase) ||
                 string.Equals(s.Type, "CVSS_V3.1", StringComparison.OrdinalIgnoreCase) ||
                 string.Equals(s.Type, "CVSS_V3.0", StringComparison.OrdinalIgnoreCase) ||
                 string.Equals(s.Type, "CVSS_V4", StringComparison.OrdinalIgnoreCase)));

            // 1.2 İkincil: Herhangi bir CVSS type'ı olan veya score'u vektör olan öğe
            prioritizedEntry ??= osvSeverities.FirstOrDefault(s =>
                !string.IsNullOrWhiteSpace(s.Score) && IsCvssVectorString(s.Score));

            if (prioritizedEntry is not null && !string.IsNullOrWhiteSpace(prioritizedEntry.Score))
            {
                vectorString = prioritizedEntry.Score.Trim();
                vectorTypeHint = prioritizedEntry.Type;
            }
        }

        // 1.3 osvSeverities içinde vektör yoksa database_specific / ecosystem_specific kontrol et
        if (string.IsNullOrWhiteSpace(vectorString))
        {
            var (specVector, _) = ExtractCvssFromSpecific(databaseSpecific);
            if (string.IsNullOrWhiteSpace(specVector))
            {
                (specVector, _) = ExtractCvssFromSpecific(ecosystemSpecific);
            }

            if (!string.IsNullOrWhiteSpace(specVector) && IsCvssVectorString(specVector))
            {
                vectorString = specVector.Trim();
                vectorTypeHint = "CVSS_V3.1";
            }
        }

        // 1.4 Vektör dizesi mevcutsa matematiksel CVSS hesaplama motorunu devreye sok
        if (!string.IsNullOrWhiteSpace(vectorString))
        {
            var parsedCvss = ParseCvssScore(vectorString, vectorTypeHint);
            if (parsedCvss is not null)
            {
                if (parsedCvss.BaseScore.HasValue && parsedCvss.BaseScore.Value > 0m)
                {
                    var severity = MapBaseScoreToSeverity(parsedCvss.BaseScore);
                    return (parsedCvss, severity);
                }

                // Vektör dizesi bozuk veya hesaplanamadıysa (Scenario5), güvenli fallback uygula
                var fallbackForMalformed = FallbackSeverityFromSpecific(databaseSpecific, ecosystemSpecific);
                return (parsedCvss, fallbackForMalformed);
            }
        }

        // =========================================================================
        // ADIM 2: Vektör Yoksa - Hazır Sayısal Değer
        // =========================================================================
        decimal? directScore = null;
        string? directScoreTypeHint = null;

        // 2.1 osvSeverities içinde doğrudan sayısal skor var mı?
        if (osvSeverities is not null && osvSeverities.Count > 0)
        {
            foreach (var item in osvSeverities)
            {
                if (!string.IsNullOrWhiteSpace(item.Score) &&
                    decimal.TryParse(item.Score.Trim(), NumberStyles.Number, CultureInfo.InvariantCulture, out var parsed))
                {
                    directScore = parsed;
                    directScoreTypeHint = item.Type;
                    break;
                }
            }
        }

        // 2.2 database_specific veya ecosystem_specific içinde sayısal skor var mı?
        if (!directScore.HasValue)
        {
            var (_, specScore) = ExtractCvssFromSpecific(databaseSpecific);
            specScore ??= ExtractCvssFromSpecific(ecosystemSpecific).Score;
            directScore = specScore;
            directScoreTypeHint = "3.1";
        }

        if (directScore.HasValue)
        {
            var version = !string.IsNullOrWhiteSpace(directScoreTypeHint) && directScoreTypeHint.Contains('4') ? "4.0" : "3.1";
            var parsedCvss = new CvssMetadata(VectorString: null, BaseScore: directScore.Value, Version: version);
            var severity = MapBaseScoreToSeverity(directScore.Value);
            if (severity == SeverityLevel.None)
            {
                severity = FallbackSeverityFromSpecific(databaseSpecific, ecosystemSpecific);
            }
            return (parsedCvss, severity);
        }

        // =========================================================================
        // ADIM 3: Fallback - Sadece Vektör ve Skor Yoksa
        // =========================================================================
        var fallbackSeverity = FallbackSeverityFromSpecific(databaseSpecific, ecosystemSpecific);
        return (null, fallbackSeverity);
    }

    public static CvssMetadata? ParseCvssScore(string scoreOrVector, string? typeHint)
    {
        if (string.IsNullOrWhiteSpace(scoreOrVector))
            return null;

        scoreOrVector = scoreOrVector.Trim();

        // 1. Doğrudan ondalık sayı (ör. "7.5") ise
        if (decimal.TryParse(scoreOrVector, NumberStyles.Number, CultureInfo.InvariantCulture, out var directScore))
        {
            var version = !string.IsNullOrWhiteSpace(typeHint) && typeHint.Contains('4') ? "4.0" : "3.1";
            return new CvssMetadata(VectorString: null, BaseScore: directScore, Version: version);
        }

        // 2. CVSS Vektör Dizgesi (ör. "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H" veya "AV:N/...")
        if (IsCvssVectorString(scoreOrVector))
        {
            var version = "3.1";
            if (scoreOrVector.StartsWith("CVSS:", StringComparison.OrdinalIgnoreCase))
            {
                var slashIndex = scoreOrVector.IndexOf('/');
                if (slashIndex > 5)
                {
                    version = scoreOrVector[5..slashIndex];
                }
            }
            else if (!string.IsNullOrWhiteSpace(typeHint))
            {
                if (typeHint.Contains('4')) version = "4.0";
                else if (typeHint.Contains("3.0")) version = "3.0";
            }

            decimal? computedBaseScore = null;

            if (version.StartsWith("3.", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(version, "3", StringComparison.OrdinalIgnoreCase) ||
                (!version.StartsWith("2.") && !version.StartsWith("4.")))
            {
                computedBaseScore = CalculateCvssV3BaseScore(scoreOrVector);
            }

            return new CvssMetadata(
                VectorString: scoreOrVector,
                BaseScore: computedBaseScore,
                Version: version);
        }

        return null;
    }

    public static SeverityLevel MapBaseScoreToSeverity(decimal? baseScore)
    {
        if (!baseScore.HasValue || baseScore.Value <= 0m)
            return SeverityLevel.None;

        var score = baseScore.Value;

        if (score >= 9.0m)
            return SeverityLevel.Critical;

        if (score >= 7.0m)
            return SeverityLevel.High;

        if (score >= 4.0m)
            return SeverityLevel.Medium;

        if (score >= 0.1m)
            return SeverityLevel.Low;

        return SeverityLevel.None;
    }

    public static SeverityLevel FallbackSeverityFromSpecific(JsonElement? databaseSpecific, JsonElement? ecosystemSpecific)
    {
        var rawSeverity = ExtractSeverityString(databaseSpecific) ?? ExtractSeverityString(ecosystemSpecific);
        if (string.IsNullOrWhiteSpace(rawSeverity))
            return SeverityLevel.None;

        return rawSeverity.Trim().ToUpperInvariant() switch
        {
            "CRITICAL" => SeverityLevel.Critical,
            "HIGH" => SeverityLevel.High,
            "MODERATE" or "MEDIUM" => SeverityLevel.Medium,
            "LOW" => SeverityLevel.Low,
            _ => SeverityLevel.None
        };
    }

    private static bool IsCvssVectorString(string input)
    {
        if (string.IsNullOrWhiteSpace(input))
            return false;

        var trimmed = input.Trim();
        return trimmed.StartsWith("CVSS:", StringComparison.OrdinalIgnoreCase) ||
               trimmed.Contains("/AV:", StringComparison.OrdinalIgnoreCase) ||
               trimmed.StartsWith("AV:", StringComparison.OrdinalIgnoreCase);
    }

    private static (string? Vector, decimal? Score) ExtractCvssFromSpecific(JsonElement? specific)
    {
        if (specific is null || specific.Value.ValueKind != JsonValueKind.Object)
            return (null, null);

        var root = specific.Value;

        // 1. "cvss" nesnesi: {"cvss": {"score": 7.5, "vector_string": "CVSS:3.1/..."}}
        if (root.TryGetProperty("cvss", out var cvssObj))
        {
            string? vector = null;
            decimal? score = null;

            if (cvssObj.ValueKind == JsonValueKind.Object)
            {
                if ((cvssObj.TryGetProperty("vector_string", out var vProp) ||
                     cvssObj.TryGetProperty("vectorString", out vProp)) &&
                    vProp.ValueKind == JsonValueKind.String)
                {
                    vector = vProp.GetString();
                }

                if (cvssObj.TryGetProperty("score", out var sProp))
                {
                    if (sProp.ValueKind == JsonValueKind.Number && sProp.TryGetDecimal(out var sNum))
                        score = sNum;
                    else if (sProp.ValueKind == JsonValueKind.String &&
                             decimal.TryParse(sProp.GetString(), NumberStyles.Number, CultureInfo.InvariantCulture, out var sParsed))
                        score = sParsed;
                }
            }
            else if (cvssObj.ValueKind == JsonValueKind.String)
            {
                var str = cvssObj.GetString();
                if (!string.IsNullOrWhiteSpace(str))
                {
                    if (IsCvssVectorString(str))
                        vector = str;
                    else if (decimal.TryParse(str, NumberStyles.Number, CultureInfo.InvariantCulture, out var sParsed))
                        score = sParsed;
                }
            }

            if (!string.IsNullOrWhiteSpace(vector) || score.HasValue)
                return (vector, score);
        }

        // 2. cvss_v3 / cvss_v31 / vector_string / cvssVector
        foreach (var propName in new[] { "cvss_v3", "cvss_v31", "cvss_v3_vector", "vector_string", "vectorString", "cvssVector" })
        {
            if (root.TryGetProperty(propName, out var vProp) && vProp.ValueKind == JsonValueKind.String)
            {
                var str = vProp.GetString();
                if (!string.IsNullOrWhiteSpace(str))
                    return (str, null);
            }
        }

        // 3. Doğrudan sayısal skor: score, cvss_score, base_score
        foreach (var propName in new[] { "score", "cvss_score", "cvssScore", "base_score", "baseScore" })
        {
            if (root.TryGetProperty(propName, out var sProp))
            {
                if (sProp.ValueKind == JsonValueKind.Number && sProp.TryGetDecimal(out var sNum))
                    return (null, sNum);
                if (sProp.ValueKind == JsonValueKind.String &&
                    decimal.TryParse(sProp.GetString(), NumberStyles.Number, CultureInfo.InvariantCulture, out var sParsed))
                    return (null, sParsed);
            }
        }

        return (null, null);
    }

    private static string? ExtractSeverityString(JsonElement? element)
    {
        if (element is null || element.Value.ValueKind != JsonValueKind.Object)
            return null;

        if (element.Value.TryGetProperty("severity", out var severityProp) &&
            severityProp.ValueKind == JsonValueKind.String)
        {
            return severityProp.GetString();
        }

        return null;
    }

    private static decimal? CalculateCvssV3BaseScore(string vectorString)
    {
        try
        {
            var parts = vectorString.Split('/', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            var metrics = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

            foreach (var part in parts)
            {
                var kv = part.Split(':', 2);
                if (kv.Length == 2)
                {
                    metrics[kv[0].Trim()] = kv[1].Trim();
                }
            }

            if (!metrics.TryGetValue("AV", out var avVal) ||
                !metrics.TryGetValue("AC", out var acVal) ||
                !metrics.TryGetValue("PR", out var prVal) ||
                !metrics.TryGetValue("UI", out var uiVal) ||
                !metrics.TryGetValue("S", out var sVal) ||
                !metrics.TryGetValue("C", out var cVal) ||
                !metrics.TryGetValue("I", out var iVal) ||
                !metrics.TryGetValue("A", out var aVal))
            {
                return null;
            }

            var av = avVal.ToUpperInvariant() switch
            {
                "N" => 0.85,
                "A" => 0.62,
                "L" => 0.55,
                "P" => 0.20,
                _ => 0.85
            };

            var ac = acVal.ToUpperInvariant() switch
            {
                "L" => 0.77,
                "H" => 0.44,
                _ => 0.77
            };

            var scopeChanged = string.Equals(sVal, "C", StringComparison.OrdinalIgnoreCase);

            var pr = prVal.ToUpperInvariant() switch
            {
                "N" => 0.85,
                "L" => scopeChanged ? 0.68 : 0.62,
                "H" => scopeChanged ? 0.50 : 0.27,
                _ => 0.85
            };

            var ui = uiVal.ToUpperInvariant() switch
            {
                "N" => 0.85,
                "R" => 0.62,
                _ => 0.85
            };

            var c = cVal.ToUpperInvariant() switch
            {
                "H" => 0.56,
                "L" => 0.22,
                _ => 0.0
            };

            var i = iVal.ToUpperInvariant() switch
            {
                "H" => 0.56,
                "L" => 0.22,
                _ => 0.0
            };

            var a = aVal.ToUpperInvariant() switch
            {
                "H" => 0.56,
                "L" => 0.22,
                _ => 0.0
            };

            var iss = 1.0 - ((1.0 - c) * (1.0 - i) * (1.0 - a));
            double impact;
            if (scopeChanged)
            {
                impact = 7.52 * (iss - 0.029) - 3.25 * Math.Pow(iss - 0.02, 15.0);
            }
            else
            {
                impact = 6.42 * iss;
            }

            var exploitability = 8.22 * av * ac * pr * ui;

            if (impact <= 0)
                return 0.0m;

            double rawScore;
            if (scopeChanged)
            {
                rawScore = Math.Min(1.08 * (impact + exploitability), 10.0);
            }
            else
            {
                rawScore = Math.Min(impact + exploitability, 10.0);
            }

            return CvssRoundup(rawScore);
        }
        catch
        {
            return null;
        }
    }

    private static decimal CvssRoundup(double input)
    {
        var intInput = (int)Math.Round(input * 100000.0);
        if (intInput % 10000 == 0)
        {
            return (decimal)(intInput / 100000.0);
        }

        return (decimal)(Math.Floor(intInput / 10000.0) + 1.0) / 10.0m;
    }
}
