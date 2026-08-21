using System.Globalization;
using System.Net.Http;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using Circuvent.AttendanceDesk.Models;
using Circuvent.AttendanceDesk.Services;

namespace Circuvent.AttendanceDesk;

public partial class MainWindow : Window
{
    private readonly DeskSettings _settings = DeskSettings.Load();
    private readonly CardReader _reader = new();
    private ControlPlaneClient _plane;
    private readonly DispatcherTimer _refresh = new();
    private readonly DispatcherTimer _clock = new();
    private CancellationTokenSource _inflight = new();

    private List<AttendanceSite> _sites = new();
    private List<AttendancePerson> _people = new();
    private List<LiveTerminal> _terminals = new();

    public MainWindow()
    {
        InitializeComponent();

        _plane = new ControlPlaneClient(_settings.BaseUrl);
        BaseUrlBox.Text = _settings.BaseUrl;
        HrmsUrlBox.Text = _settings.HrmsBaseUrl;
        EmailBox.Text = _settings.SignedInAs ?? "";

        _reader.CardScanned += OnCardScanned;
        _reader.ScanRejected += msg => ShowScan("Try again", msg, (SolidColorBrush)FindResource("Amber"));

        /*
         * Keys are taken at the window's tunnelling stage rather than from a
         * focused textbox. A wedge reader types into whatever has focus, and on
         * a desk that is usually nothing at all — so the card would be lost.
         * Preview means the scan is seen wherever the caret happens to be.
         */
        PreviewTextInput += OnPreviewTextInput;
        PreviewKeyDown += OnPreviewKeyDown;

        _refresh.Interval = TimeSpan.FromSeconds(10);
        _refresh.Tick += async (_, _) => await RefreshLiveAsync();

        _clock.Interval = TimeSpan.FromSeconds(1);
        _clock.Tick += (_, _) => ClockText.Text = DateTime.Now.ToString("dddd d MMMM · HH:mm:ss");
        _clock.Start();

        ReaderHint.Text = "USB reader: hold a card anywhere on this window";

        Loaded += async (_, _) => await TryResumeSessionAsync();
    }

    // ───────────────────────────── session ─────────────────────────────

    private async Task TryResumeSessionAsync()
    {
        var token = _settings.ReadToken();
        if (string.IsNullOrEmpty(token)) return;

        _plane.UseToken(token, _settings.SignedInAs);
        try
        {
            // The token is verified with a real call rather than trusted for
            // existing. An expired one would otherwise present a working desk
            // that fails on the first card.
            var sites = await _plane.SitesAsync();
            _sites = sites.Sites;
            EnterDesk();
        }
        catch (Exception e) when (e is ControlPlaneException or HttpRequestException or TaskCanceledException)
        {
            _plane.SignOut();
            _settings.StoreToken(null);
            _settings.Save();
        }
    }

    private async void SignIn_Click(object sender, RoutedEventArgs e)
    {
        SignInError.Visibility = Visibility.Collapsed;
        SignInButton.IsEnabled = false;
        try
        {
            var url = string.IsNullOrWhiteSpace(BaseUrlBox.Text) ? "https://api.circuvent.com" : BaseUrlBox.Text.Trim();
            if (!string.Equals(url, _settings.BaseUrl, StringComparison.OrdinalIgnoreCase))
            {
                _plane.Dispose();
                _plane = new ControlPlaneClient(url);
                _settings.BaseUrl = url;
            }

            var res = await _plane.SignInAsync(EmailBox.Text.Trim(), PasswordBox.Password);
            _settings.SignedInAs = res.User?.Email ?? EmailBox.Text.Trim();
            _settings.StoreToken(res.Token);
            _settings.Save();

            var sites = await _plane.SitesAsync();
            _sites = sites.Sites;
            if (_sites.Count == 0)
            {
                // Said explicitly, because an empty desk with no explanation
                // looks like a broken app rather than a system nobody has set
                // up yet.
                SignInError.Text = "Signed in, but this account has no attendance sites. Create one in the console first.";
                SignInError.Visibility = Visibility.Visible;
                return;
            }
            EnterDesk();
        }
        catch (Exception ex) when (ex is ControlPlaneException or HttpRequestException or TaskCanceledException)
        {
            SignInError.Text = ex is TaskCanceledException ? "The control plane did not answer in time." : ex.Message;
            SignInError.Visibility = Visibility.Visible;
        }
        finally
        {
            SignInButton.IsEnabled = true;
            PasswordBox.Clear();
        }
    }

    private void SignOut_Click(object sender, RoutedEventArgs e)
    {
        _refresh.Stop();
        _plane.SignOut();
        _settings.StoreToken(null);
        _settings.Save();
        DeskPane.Visibility = Visibility.Collapsed;
        SignInPane.Visibility = Visibility.Visible;
    }

    private void EnterDesk()
    {
        SignInPane.Visibility = Visibility.Collapsed;
        DeskPane.Visibility = Visibility.Visible;
        WhoText.Text = _plane.SignedInAs ?? "";

        SiteBox.ItemsSource = _sites;
        var remembered = _sites.FindIndex(s => s.Id == _settings.SiteId);
        SiteBox.SelectedIndex = remembered >= 0 ? remembered : 0;

        _refresh.Start();
    }

    // ───────────────────────────── site + refresh ─────────────────────────────

    private AttendanceSite? CurrentSite => SiteBox.SelectedItem as AttendanceSite;

    private async void Site_Changed(object sender, System.Windows.Controls.SelectionChangedEventArgs e)
    {
        if (CurrentSite is null) return;
        _settings.SiteId = CurrentSite.Id;
        _settings.Save();
        await LoadPeopleAsync();
        await RefreshLiveAsync();
    }

    private async Task LoadPeopleAsync()
    {
        if (CurrentSite is null) return;
        try
        {
            var res = await _plane.PeopleAsync(CurrentSite.Id);
            _people = res.People.Where(p => p.Active).OrderBy(p => p.Name).ToList();
            PersonBox.ItemsSource = _people;
            if (_people.Count > 0 && PersonBox.SelectedIndex < 0) PersonBox.SelectedIndex = 0;
        }
        catch (Exception e) when (e is ControlPlaneException or HttpRequestException or TaskCanceledException)
        {
            Status($"Could not load people — {e.Message}", warn: true);
        }
    }

    private async Task RefreshLiveAsync()
    {
        if (CurrentSite is null) return;

        // One request in flight at a time. The timer fires every ten seconds
        // and a slow link would otherwise stack requests that all rewrite the
        // same list, making the board flicker between stale and fresh.
        _inflight.Cancel();
        _inflight = new CancellationTokenSource();
        var ct = _inflight.Token;

        try
        {
            var live = await _plane.LiveAsync(CurrentSite.Id, ct);
            if (ct.IsCancellationRequested) return;

            OnSiteHeading.Text = $"On site · {live.OnSite.Count}";
            OnSiteList.ItemsSource = live.OnSite
                .Select(p => new { p.Name, p.Code, Since = ShortTime(p.Since) })
                .ToList();

            _terminals = live.Terminals;
            TerminalList.ItemsSource = live.Terminals.Select(TerminalRow.From).ToList();
            RecentList.ItemsSource = live.Recent.Take(12).Select(RecentRow.From).ToList();

            var offline = live.Terminals.Count(t => !t.Online);
            var queued = live.Terminals.Sum(t => t.Queued);
            Status(offline > 0
                ? $"{offline} of {live.Terminals.Count} readers offline" + (queued > 0 ? $" · {queued} scans waiting to upload" : "")
                : $"All {live.Terminals.Count} readers online" + (queued > 0 ? $" · {queued} scans waiting to upload" : " · up to date"),
                warn: offline > 0);
        }
        catch (OperationCanceledException) { /* superseded by a newer refresh */ }
        catch (Exception e) when (e is ControlPlaneException or HttpRequestException)
        {
            Status($"Not refreshing — {e.Message}", warn: true);
        }
    }

    // ───────────────────────────── scanning ─────────────────────────────

    private void OnPreviewTextInput(object sender, TextCompositionEventArgs e)
    {
        foreach (var ch in e.Text)
        {
            if (_reader.HandleKey(ch, isEnter: false)) e.Handled = true;
        }
    }

    private void OnPreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key is Key.Enter or Key.Return)
        {
            if (_reader.HandleKey('\n', isEnter: true)) e.Handled = true;
        }
    }

    private async void OnCardScanned(long card)
    {
        if (CurrentSite is null) return;

        if (ModeEnrol.IsChecked == true)
        {
            await AssignCardAsync(card);
            return;
        }

        var direction = DirOut.IsChecked == true ? "out" : "in";
        try
        {
            var res = await _plane.PunchAsync(CurrentSite.Id, card, direction);
            if (res.Admitted)
            {
                var who = _people.FirstOrDefault(p => p.Id == res.PersonId)?.Name;
                ShowScan(who ?? "Recorded", direction == "out" ? "Clocked out" : "Clocked in",
                    (SolidColorBrush)FindResource("Green"));
            }
            else
            {
                /*
                 * A refusal is shown as the reason the server gave, not as a
                 * generic failure. "Unknown card" and "already scanned a moment
                 * ago" need completely different responses from the person at
                 * the desk, and only the server knows which it was.
                 */
                ShowScan("Not accepted", Humanise(res.Reason, card), (SolidColorBrush)FindResource("Red"));
            }
            await RefreshLiveAsync();
        }
        catch (Exception e) when (e is ControlPlaneException or HttpRequestException or TaskCanceledException)
        {
            ShowScan("Not recorded", e.Message, (SolidColorBrush)FindResource("Red"));
        }
    }

    private async Task AssignCardAsync(long card)
    {
        if (PersonBox.SelectedItem is not AttendancePerson person)
        {
            ShowScan("Nobody selected", "Choose who this card belongs to first.", (SolidColorBrush)FindResource("Amber"));
            return;
        }

        try
        {
            await _plane.IssueCardAsync(person.Id, card, $"Issued at desk {DateTime.Now:yyyy-MM-dd}");
            ShowScan(person.Name, $"Card {card} assigned. Push the card list so the doors know.",
                (SolidColorBrush)FindResource("Green"));
            await LoadPeopleAsync();
        }
        catch (Exception e) when (e is ControlPlaneException or HttpRequestException or TaskCanceledException)
        {
            ShowScan("Not assigned", e.Message, (SolidColorBrush)FindResource("Red"));
        }
    }

    private void Mode_Changed(object sender, RoutedEventArgs e)
    {
        // Guard: Checked fires during XAML load, before the panels exist.
        if (EnrolPanel is null || DirectionPanel is null) return;

        var enrolling = ModeEnrol.IsChecked == true;
        EnrolPanel.Visibility = enrolling ? Visibility.Visible : Visibility.Collapsed;
        DirectionPanel.Visibility = enrolling ? Visibility.Collapsed : Visibility.Visible;

        // Any half-read burst belongs to the previous mode.
        _reader.Reset();
        ShowScan("Ready", enrolling ? "Hold the new card on the reader." : "Hold a card on the reader.",
            (SolidColorBrush)FindResource("TextDim"));
    }

    // ───────────────────────────── actions ─────────────────────────────

    private async void PushCards_Click(object sender, RoutedEventArgs e)
    {
        if (_terminals.Count == 0) { Status("No readers to push to.", warn: true); return; }

        PushCardsButton.IsEnabled = false;
        var ok = 0;
        var failed = new List<string>();
        foreach (var t in _terminals)
        {
            try
            {
                var res = await _plane.SyncTerminalAsync(t.DeviceId);
                if (res.Success) ok++;
                else failed.Add(t.Name);
            }
            catch (Exception ex) when (ex is ControlPlaneException or HttpRequestException or TaskCanceledException)
            {
                failed.Add($"{t.Name} ({ex.Message})");
            }
        }
        PushCardsButton.IsEnabled = true;

        // Partial success is reported as partial. "Done" over a reader that
        // refused would leave a door that does not know about a card somebody
        // has just been given.
        Status(failed.Count == 0
            ? $"Card list pushed to {ok} reader{(ok == 1 ? "" : "s")}."
            : $"Pushed to {ok}; {failed.Count} did not take it — {string.Join(", ", failed)}",
            warn: failed.Count > 0);

        await RefreshLiveAsync();
    }

    private async void HrmsSync_Click(object sender, RoutedEventArgs e)
    {
        if (CurrentSite is null) return;
        var token = HrmsTokenBox.Password;
        if (string.IsNullOrWhiteSpace(token))
        {
            HrmsResult.Text = "An HRMS API token is needed. It is a different system from the control plane.";
            HrmsResult.Foreground = (SolidColorBrush)FindResource("Amber");
            return;
        }

        var url = string.IsNullOrWhiteSpace(HrmsUrlBox.Text) ? _settings.HrmsBaseUrl : HrmsUrlBox.Text.Trim();
        _settings.HrmsBaseUrl = url;
        _settings.Save();

        HrmsSyncButton.IsEnabled = false;
        HrmsResult.Text = "Asking HRMS to reconcile today…";
        HrmsResult.Foreground = (SolidColorBrush)FindResource("TextDim");
        try
        {
            using var hrms = new HrmsClient(url);
            var today = DateOnly.FromDateTime(DateTime.Now);
            var res = await hrms.SyncAsync(token, CurrentSite.Id, today, today);
            HrmsResult.Text = res.Describe();
            HrmsResult.Foreground = (SolidColorBrush)FindResource("Green");
        }
        catch (Exception ex) when (ex is ControlPlaneException or HttpRequestException or TaskCanceledException)
        {
            HrmsResult.Text = ex is TaskCanceledException ? "HRMS did not answer in time." : ex.Message;
            HrmsResult.Foreground = (SolidColorBrush)FindResource("Red");
        }
        finally
        {
            HrmsSyncButton.IsEnabled = true;
        }
    }

    // ───────────────────────────── presentation ─────────────────────────────

    private void ShowScan(string big, string sub, SolidColorBrush colour)
    {
        ScanBig.Text = big;
        ScanBig.Foreground = colour;
        ScanSub.Text = sub;
    }

    private void Status(string text, bool warn = false)
    {
        StatusText.Text = text;
        StatusText.Foreground = warn ? (SolidColorBrush)FindResource("Amber") : (SolidColorBrush)FindResource("TextDim");
    }

    /// <summary>Turns the server's refusal code into something a receptionist can act on.</summary>
    private static string Humanise(string reason, long card) => reason switch
    {
        "unknown" or "unknown-card" => $"Card {card} is not assigned to anybody. Switch to \"Assign to a person\" to issue it.",
        "duplicate" or "dedupe" => "That card was already scanned a moment ago.",
        "inactive" => "That person's record is not active.",
        "expired" => "That card is outside its valid dates.",
        "no-site" => "That card belongs to a different site.",
        /*
         * Worth spelling out, because it is the one refusal the person at the
         * desk can actually resolve. The others need a new card or a changed
         * record; this one needs somebody to approve a request that already
         * exists, which takes seconds if you know that is what is being asked.
         */
        "no-access-request" => "No approved office access for today. Approve their request under Office access, then scan again.",
        "no-rule" or "not-allowed" => "That person is not allowed through this door at this time.",
        _ => string.IsNullOrWhiteSpace(reason) ? $"Card {card} was refused." : reason,
    };

    private static string ShortTime(string iso) =>
        DateTime.TryParse(iso, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var dt)
            ? dt.ToLocalTime().ToString("HH:mm")
            : "—";

    private sealed class TerminalRow
    {
        public string Name { get; init; } = "";
        public string StatusLabel { get; init; } = "";
        public Brush StatusBrush { get; init; } = Brushes.Gray;
        public string Detail { get; init; } = "";

        public static TerminalRow From(LiveTerminal t)
        {
            var bits = new List<string> { $"{t.AclCount} card{(t.AclCount == 1 ? "" : "s")}" };
            if (t.Queued > 0) bits.Add($"{t.Queued} waiting to upload");
            if (!string.IsNullOrEmpty(t.LastPunchAt)) bits.Add($"last scan {ShortTime(t.LastPunchAt!)}");
            return new TerminalRow
            {
                Name = string.IsNullOrWhiteSpace(t.Name) ? t.DeviceId : t.Name,
                StatusLabel = t.Online ? "online" : "offline",
                StatusBrush = t.Online ? new SolidColorBrush(Color.FromRgb(0x22, 0xC5, 0x5E))
                                       : new SolidColorBrush(Color.FromRgb(0xEF, 0x44, 0x44)),
                Detail = string.Join(" · ", bits),
            };
        }
    }

    private sealed class RecentRow
    {
        public string Who { get; init; } = "";
        public string Detail { get; init; } = "";
        public string Verdict { get; init; } = "";
        public Brush VerdictBrush { get; init; } = Brushes.Gray;

        public static RecentRow From(RecentPunch p) => new()
        {
            // An unknown card is shown as its number rather than as "unknown",
            // because the number is what somebody needs to type in to find or
            // issue it.
            Who = p.PersonName ?? (p.CardNumber is { } c ? $"Card {c}" : "Unknown card"),
            Detail = $"{ShortTime(p.At)} · {p.Direction} · {p.TerminalName ?? "desk"}",
            Verdict = p.Granted ? "in" : p.Reason,
            VerdictBrush = p.Granted ? new SolidColorBrush(Color.FromRgb(0x22, 0xC5, 0x5E))
                                     : new SolidColorBrush(Color.FromRgb(0xF5, 0x9E, 0x0B)),
        };
    }
}
