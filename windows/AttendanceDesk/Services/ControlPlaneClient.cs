using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Circuvent.AttendanceDesk.Models;

namespace Circuvent.AttendanceDesk.Services;

/// <summary>
/// Talks to the Circuvent control plane (api.circuvent.com).
///
/// One instance for the life of the app: HttpClient holds the connection pool,
/// and creating one per call is the standard way to exhaust sockets on a
/// machine that stays open all day — which a reception terminal does.
/// </summary>
public sealed class ControlPlaneClient : IDisposable
{
    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    private readonly HttpClient _http;
    private string? _token;

    public ControlPlaneClient(string baseUrl)
    {
        _http = new HttpClient
        {
            BaseAddress = new Uri(baseUrl.TrimEnd('/') + "/"),
            // Long enough for a slow link, short enough that the desk does not
            // appear frozen when the network has gone.
            Timeout = TimeSpan.FromSeconds(20),
        };
        _http.DefaultRequestHeaders.UserAgent.ParseAdd("CircuventAttendanceDesk/1.0");
    }

    public bool IsSignedIn => !string.IsNullOrEmpty(_token);
    public string? SignedInAs { get; private set; }

    public void UseToken(string token, string? email)
    {
        _token = token;
        SignedInAs = email;
        _http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
    }

    public void SignOut()
    {
        _token = null;
        SignedInAs = null;
        _http.DefaultRequestHeaders.Authorization = null;
    }

    public async Task<LoginResponse> SignInAsync(string email, string password, CancellationToken ct = default)
    {
        var body = new { email, password };
        using var res = await _http.PostAsJsonAsync("auth/login", body, ct).ConfigureAwait(false);
        if (!res.IsSuccessStatusCode)
        {
            /*
             * 401 is said plainly rather than as a status code. This screen is
             * used by reception staff, and "Unauthorized" reads like a fault in
             * the app rather than a typed password.
             */
            var detail = res.StatusCode == HttpStatusCode.Unauthorized
                ? "That email and password were not accepted."
                : await DescribeFailureAsync(res).ConfigureAwait(false);
            throw new ControlPlaneException(detail);
        }

        var parsed = await res.Content.ReadFromJsonAsync<LoginResponse>(Json, ct).ConfigureAwait(false)
                     ?? throw new ControlPlaneException("The sign-in response could not be read.");
        if (string.IsNullOrEmpty(parsed.Token)) throw new ControlPlaneException("The sign-in response carried no token.");
        UseToken(parsed.Token, parsed.User?.Email ?? email);
        return parsed;
    }

    public Task<SitesResponse> SitesAsync(CancellationToken ct = default) =>
        GetAsync<SitesResponse>("attendance/sites", ct);

    public Task<AttendanceLive> LiveAsync(int siteId, CancellationToken ct = default) =>
        GetAsync<AttendanceLive>($"attendance/live?siteId={siteId}", ct);

    public Task<PeopleResponse> PeopleAsync(int siteId, CancellationToken ct = default) =>
        GetAsync<PeopleResponse>($"attendance/people?siteId={siteId}", ct);

    /// <summary>Issues a card to a person. The card number is the value the reader emits.</summary>
    public Task<CredentialResult> IssueCardAsync(int personId, long cardNumber, string? label, CancellationToken ct = default) =>
        PostAsync<CredentialResult>("attendance/credentials", new { personId, cardNumber, label }, ct);

    /// <summary>
    /// Records a punch taken at this desk.
    ///
    /// `method: "desk"` rather than "card" is deliberate: it is true, and it
    /// keeps a scan taken at reception distinguishable from one taken at the
    /// door. An attendance record that cannot say where it came from is one
    /// nobody can dispute or verify later.
    /// </summary>
    public Task<PunchResult> PunchAsync(int siteId, long cardNumber, string direction, CancellationToken ct = default) =>
        PostAsync<PunchResult>("attendance/punches", new
        {
            siteId,
            cardNumber,
            direction,
            method = "desk",
        }, ct);

    /// <summary>Pushes the current card list down to a reader.</summary>
    public Task<SyncResult> SyncTerminalAsync(string deviceId, CancellationToken ct = default) =>
        PostAsync<SyncResult>($"attendance/terminals/{Uri.EscapeDataString(deviceId)}/sync", null, ct);

    /// <summary>Releases a door from the desk.</summary>
    public Task<SyncResult> OpenDoorAsync(string deviceId, CancellationToken ct = default) =>
        PostAsync<SyncResult>($"attendance/terminals/{Uri.EscapeDataString(deviceId)}/open", null, ct);

    private async Task<T> GetAsync<T>(string path, CancellationToken ct)
    {
        using var res = await _http.GetAsync(path, ct).ConfigureAwait(false);
        await ThrowIfFailedAsync(res).ConfigureAwait(false);
        return await res.Content.ReadFromJsonAsync<T>(Json, ct).ConfigureAwait(false)
               ?? throw new ControlPlaneException($"The response to {path} was empty.");
    }

    private async Task<T> PostAsync<T>(string path, object? body, CancellationToken ct)
    {
        using var content = new StringContent(
            body is null ? "{}" : JsonSerializer.Serialize(body),
            Encoding.UTF8,
            "application/json");
        using var res = await _http.PostAsync(path, content, ct).ConfigureAwait(false);
        await ThrowIfFailedAsync(res).ConfigureAwait(false);
        return await res.Content.ReadFromJsonAsync<T>(Json, ct).ConfigureAwait(false)
               ?? throw new ControlPlaneException($"The response to {path} was empty.");
    }

    private static async Task ThrowIfFailedAsync(HttpResponseMessage res)
    {
        if (res.IsSuccessStatusCode) return;
        throw new ControlPlaneException(await DescribeFailureAsync(res).ConfigureAwait(false));
    }

    /// <summary>
    /// Reads the server's own error message when it sent one.
    ///
    /// The control plane returns `{ "error": "..." }` on refusal, and that text
    /// is written for a person. Replacing it with the status code throws away
    /// the only useful part of the response.
    /// </summary>
    private static async Task<string> DescribeFailureAsync(HttpResponseMessage res)
    {
        try
        {
            var text = await res.Content.ReadAsStringAsync().ConfigureAwait(false);
            if (!string.IsNullOrWhiteSpace(text))
            {
                using var doc = JsonDocument.Parse(text);
                if (doc.RootElement.TryGetProperty("error", out var err) && err.ValueKind == JsonValueKind.String)
                    return err.GetString() ?? $"Request failed ({(int)res.StatusCode}).";
                if (doc.RootElement.TryGetProperty("message", out var msg) && msg.ValueKind == JsonValueKind.String)
                    return msg.GetString() ?? $"Request failed ({(int)res.StatusCode}).";
            }
        }
        catch (JsonException) { /* not JSON — fall through to the status line */ }
        catch (HttpRequestException) { /* body unreadable — same */ }

        return res.StatusCode switch
        {
            HttpStatusCode.Unauthorized => "The session has expired. Sign in again.",
            HttpStatusCode.Forbidden => "This account is not allowed to do that.",
            HttpStatusCode.NotFound => "The server does not have that.",
            _ => $"The server refused the request ({(int)res.StatusCode}).",
        };
    }

    public void Dispose() => _http.Dispose();
}

public sealed class ControlPlaneException : Exception
{
    public ControlPlaneException(string message) : base(message) { }
}
