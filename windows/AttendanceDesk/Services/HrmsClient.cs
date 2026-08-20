using System.Net.Http;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

namespace Circuvent.AttendanceDesk.Services;

/// <summary>
/// Triggers the HRMS side of the integration.
///
/// The desk does not push attendance into HRMS itself, and deliberately so.
/// HRMS already pulls the day's register from the control plane and reconciles
/// it into its own records (`POST /api/attendance/device-sync`), applying its
/// grace periods, half-day thresholds and regularisation rules on the way in.
///
/// A second writer bypassing that would produce two sets of attendance that
/// agree until the day somebody edits one — and payroll is downstream of it.
/// So the desk asks HRMS to run the sync it already owns, and lets HRMS remain
/// the only thing that decides what a punch means.
/// </summary>
public sealed class HrmsClient : IDisposable
{
    private static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };

    private readonly HttpClient _http;

    public HrmsClient(string baseUrl)
    {
        _http = new HttpClient
        {
            BaseAddress = new Uri(baseUrl.TrimEnd('/') + "/"),
            // Longer than the control-plane client: this call reconciles a
            // whole site's day and is expected to take a while.
            Timeout = TimeSpan.FromSeconds(60),
        };
        _http.DefaultRequestHeaders.UserAgent.ParseAdd("CircuventAttendanceDesk/1.0");
    }

    /// <summary>
    /// Runs the HRMS device sync for a site and date range.
    /// </summary>
    /// <param name="apiKey">
    /// An HRMS API token. Kept separate from the control-plane session because
    /// they are different systems with different lifetimes — reusing one for
    /// the other is how a token ends up somewhere it was never scoped for.
    /// </param>
    public async Task<HrmsSyncResult> SyncAsync(string apiKey, int siteId, DateOnly from, DateOnly to, CancellationToken ct = default)
    {
        using var req = new HttpRequestMessage(HttpMethod.Post, "api/attendance/device-sync")
        {
            Content = new StringContent(
                JsonSerializer.Serialize(new
                {
                    siteId,
                    from = from.ToString("yyyy-MM-dd"),
                    to = to.ToString("yyyy-MM-dd"),
                }),
                Encoding.UTF8,
                "application/json"),
        };
        req.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);

        using var res = await _http.SendAsync(req, ct).ConfigureAwait(false);
        var text = await res.Content.ReadAsStringAsync(ct).ConfigureAwait(false);

        if (!res.IsSuccessStatusCode)
        {
            var detail = TryReadError(text) ?? $"HRMS refused the sync ({(int)res.StatusCode}).";
            throw new ControlPlaneException(detail);
        }

        try
        {
            return JsonSerializer.Deserialize<HrmsSyncResult>(text, Json) ?? new HrmsSyncResult();
        }
        catch (JsonException)
        {
            // A 200 whose body is not the expected shape usually means a proxy
            // or sign-in page answered instead of HRMS. Saying that is more
            // useful than a deserialisation stack trace.
            throw new ControlPlaneException("HRMS answered, but not with a sync result. Check the HRMS address.");
        }
    }

    private static string? TryReadError(string text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        try
        {
            using var doc = JsonDocument.Parse(text);
            if (doc.RootElement.TryGetProperty("error", out var e) && e.ValueKind == JsonValueKind.String)
                return e.GetString();
        }
        catch (JsonException) { }
        return null;
    }

    public void Dispose() => _http.Dispose();
}

public sealed class HrmsSyncResult
{
    public int Created { get; set; }
    public int Updated { get; set; }
    public int Skipped { get; set; }
    public string? Message { get; set; }

    public string Describe() =>
        Message ?? $"{Created} created, {Updated} updated, {Skipped} unchanged.";
}
