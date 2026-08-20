using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Circuvent.AttendanceDesk.Services;

/// <summary>
/// Remembers the desk's settings and session between launches.
///
/// The session token is encrypted with DPAPI at <see cref="DataProtectionScope.CurrentUser"/>,
/// so the file is only readable by the Windows account that wrote it. A
/// reception PC is a shared, physically accessible machine — a bearer token in
/// a plaintext file there is a token anybody who sits down can copy, and it
/// carries the same access as the person who signed in.
///
/// The password is never stored at all. The desk stays signed in with the
/// token; when that expires somebody types the password again. Storing a
/// reusable credential to save one login a week is not a trade worth making on
/// a machine like this.
/// </summary>
public sealed class DeskSettings
{
    public string BaseUrl { get; set; } = "https://api.circuvent.com";
    public string HrmsBaseUrl { get; set; } = "https://hrms.circuvent.com";
    public int? SiteId { get; set; }
    public string? SignedInAs { get; set; }

    /// <summary>DPAPI-protected token, base64. Null when signed out.</summary>
    public string? ProtectedToken { get; set; }

    private static string Path0 => System.IO.Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "Circuvent", "AttendanceDesk", "settings.json");

    public static DeskSettings Load()
    {
        try
        {
            if (!File.Exists(Path0)) return new DeskSettings();
            var json = File.ReadAllText(Path0);
            return JsonSerializer.Deserialize<DeskSettings>(json) ?? new DeskSettings();
        }
        catch (Exception e) when (e is IOException or JsonException or UnauthorizedAccessException)
        {
            // A corrupt or unreadable settings file must not stop the desk
            // opening. Losing the saved site is an inconvenience; refusing to
            // start is a reception desk that cannot take attendance.
            return new DeskSettings();
        }
    }

    public void Save()
    {
        try
        {
            var dir = System.IO.Path.GetDirectoryName(Path0)!;
            Directory.CreateDirectory(dir);
            File.WriteAllText(Path0, JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true }));
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            // Same reasoning in reverse: failing to persist a preference is not
            // worth interrupting somebody mid-shift for.
        }
    }

    public void StoreToken(string? token)
    {
        if (string.IsNullOrEmpty(token)) { ProtectedToken = null; return; }
        var bytes = ProtectedData.Protect(Encoding.UTF8.GetBytes(token), null, DataProtectionScope.CurrentUser);
        ProtectedToken = Convert.ToBase64String(bytes);
    }

    public string? ReadToken()
    {
        if (string.IsNullOrEmpty(ProtectedToken)) return null;
        try
        {
            var bytes = ProtectedData.Unprotect(Convert.FromBase64String(ProtectedToken), null, DataProtectionScope.CurrentUser);
            return Encoding.UTF8.GetString(bytes);
        }
        catch (Exception e) when (e is CryptographicException or FormatException)
        {
            // Written by a different Windows account, or the profile was
            // rebuilt. Not an error worth showing — it means "sign in again".
            ProtectedToken = null;
            return null;
        }
    }
}
