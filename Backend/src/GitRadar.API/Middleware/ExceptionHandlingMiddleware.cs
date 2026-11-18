using System.Net;
using System.Text.Json;
using GitRadar.API.DTOs.Common;

namespace GitRadar.API.Middleware;

/// <summary>
/// Tüm HTTP isteklerinde meydana gelebilecek yakalanmamış istisnaları merkezi olarak yakalayan,
/// loglayan ve istemciye güvenli, sızıntısız (SEC-02 uyumlu) hata yanıtı dönen ara yazılımdır.
/// </summary>
public sealed class ExceptionHandlingMiddleware
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlingMiddleware> _logger;

    public ExceptionHandlingMiddleware(RequestDelegate next, ILogger<ExceptionHandlingMiddleware> logger)
    {
        _next = next ?? throw new ArgumentNullException(nameof(next));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested)
        {
            _logger.LogInformation("İstemci HTTP isteğini iptal etti.");
            context.Response.StatusCode = 499; // Client Closed Request
        }
        catch (Exception ex)
        {
            await HandleExceptionAsync(context, ex);
        }
    }

    private async Task HandleExceptionAsync(HttpContext context, Exception exception)
    {
        var traceId = context.TraceIdentifier;
        var sanitizedMessage = SanitizeExceptionMessage(exception.Message);

        _logger.LogError(exception, "İşlenmemiş sunucu hatası meydana geldi. TraceId: {TraceId}, Hata: {Message}", traceId, sanitizedMessage);

        context.Response.ContentType = "application/json";
        context.Response.StatusCode = (int)HttpStatusCode.InternalServerError;

        var responseDto = new ErrorResponseDto(
            Message: "Sunucuda beklenmeyen bir hata oluştu. Lütfen sistem yöneticisiyle iletişime geçin.",
            Detail: sanitizedMessage,
            TraceId: traceId);

        var json = JsonSerializer.Serialize(responseDto, JsonOptions);
        await context.Response.WriteAsync(json);
    }

    private static string SanitizeExceptionMessage(string message)
    {
        if (string.IsNullOrWhiteSpace(message))
            return "Bilinmeyen sunucu hatası.";

        // SEC-02: Belirteç veya secret sızıntılarını maskele
        if (message.Contains("ghp_") || message.Contains("Bearer ") || message.Contains("Password=") || message.Contains("pwd="))
        {
            return "Hassas kimlik doğrulama veya bağlantı hatası oluştu. [REDACTED]";
        }

        return message;
    }
}

