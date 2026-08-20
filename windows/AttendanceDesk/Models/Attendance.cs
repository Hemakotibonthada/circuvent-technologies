using System.Text.Json.Serialization;

namespace Circuvent.AttendanceDesk.Models;

/*
 * These mirror the control plane's attendance shapes (src/lib/control-plane.ts).
 * Field names match the wire format so no custom naming policy is needed —
 * a rename on either side then fails loudly at deserialisation rather than
 * quietly producing a record full of nulls.
 */

public sealed class AttendanceSite
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Kind { get; set; } = "";
    public string Timezone { get; set; } = "";
    public int People { get; set; }
    public int Terminals { get; set; }
    public override string ToString() => Name;
}

public sealed class SitesResponse
{
    public List<AttendanceSite> Sites { get; set; } = new();
}

public sealed class OnSitePerson
{
    public int PersonId { get; set; }
    public string Name { get; set; } = "";
    public string Code { get; set; } = "";
    public string? GroupName { get; set; }
    /** ISO instant of the punch that put them on site. */
    public string Since { get; set; } = "";
}

public sealed class RecentPunch
{
    public string At { get; set; } = "";
    public string Direction { get; set; } = "";
    public bool Granted { get; set; }
    public string Reason { get; set; } = "";
    public long? CardNumber { get; set; }
    public string? PersonName { get; set; }
    public string? PersonCode { get; set; }
    public string? TerminalName { get; set; }
}

public sealed class LiveTerminal
{
    public string DeviceId { get; set; } = "";
    public string Name { get; set; } = "";
    public bool Online { get; set; }
    public string? LastPunchAt { get; set; }
    public int AclCount { get; set; }
    public int Queued { get; set; }
}

public sealed class AttendanceLive
{
    public string Day { get; set; } = "";
    public string Timezone { get; set; } = "";
    public Dictionary<string, int> Totals { get; set; } = new();
    public List<OnSitePerson> OnSite { get; set; } = new();
    public List<RecentPunch> Recent { get; set; } = new();
    public List<LiveTerminal> Terminals { get; set; } = new();
}

public sealed class AttendancePerson
{
    public int Id { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public string Role { get; set; } = "";
    public string? Email { get; set; }
    public bool Active { get; set; }
    public int Cards { get; set; }
    public override string ToString() => string.IsNullOrWhiteSpace(Code) ? Name : $"{Name} ({Code})";
}

public sealed class PeopleResponse
{
    public List<AttendancePerson> People { get; set; } = new();
}

public sealed class LoginResponse
{
    public string Token { get; set; } = "";
    public string? RefreshToken { get; set; }
    public LoginUser? User { get; set; }
}

public sealed class LoginUser
{
    public int Id { get; set; }
    public string Email { get; set; } = "";
    public string Name { get; set; } = "";
}

/// <summary>Result of storing a punch. `stored:false` is a refusal, not an error.</summary>
public sealed class PunchResult
{
    public bool Stored { get; set; }
    public string Reason { get; set; } = "";
    public int? PersonId { get; set; }
}

public sealed class CredentialResult
{
    [JsonPropertyName("credential")]
    public CredentialRow? Credential { get; set; }
}

public sealed class CredentialRow
{
    public int Id { get; set; }
    public int PersonId { get; set; }
    public long CardNumber { get; set; }
    public string? Label { get; set; }
}

public sealed class SyncResult
{
    public bool Success { get; set; }
    public int Cards { get; set; }
    public int Version { get; set; }
}
