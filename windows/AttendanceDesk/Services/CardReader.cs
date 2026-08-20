using System.Diagnostics;
using System.Text;

namespace Circuvent.AttendanceDesk.Services;

/// <summary>
/// Reads a card from a USB RFID reader.
///
/// Almost every USB reader in this class is a keyboard wedge: it does not
/// present as a card reader at all, it presents as a keyboard and "types" the
/// card number followed by Enter. There is no device to open and no driver to
/// query — the card arrives as keystrokes in whatever control has focus.
///
/// That leaves one real problem: telling a scan from somebody typing. The
/// answer is timing. A wedge emits its digits in a burst, typically 5–15 ms
/// apart, because it is replaying a buffer; a person cannot sustain that, and
/// the fastest human typing is still an order of magnitude slower and far more
/// irregular. So a run of digits that arrives faster than <see cref="MaxGapMs"/>
/// per character and ends in Enter is a card. Anything slower is discarded.
///
/// Getting this wrong in the lenient direction is the expensive one: a
/// receptionist typing a name into a search box would silently punch somebody
/// in. So the check is deliberately strict, and a rejected burst simply does
/// nothing rather than guessing.
/// </summary>
public sealed class CardReader
{
    /// <summary>
    /// Longest gap between characters that still counts as machine input.
    ///
    /// 35 ms rather than something tighter: cheap readers are not metronomes,
    /// and a USB hub or a busy machine can stretch a gap. Measured human
    /// typing sits above 80 ms per character even at speed, so there is room
    /// between the two without either overlapping.
    /// </summary>
    private const int MaxGapMs = 35;

    /// <summary>
    /// Shortest run of digits accepted as a card.
    ///
    /// Wiegand-26 cards carry an eight-digit number and most readers emit at
    /// least six. Accepting fewer would let a stray keypress pair look like a
    /// credential.
    /// </summary>
    private const int MinDigits = 4;

    private const int MaxDigits = 20;

    private readonly StringBuilder _buffer = new();
    private readonly Stopwatch _sinceLastKey = new();

    /// <summary>Raised when a complete card number has been read.</summary>
    public event Action<long>? CardScanned;

    /// <summary>
    /// Raised when a burst looked like a scan but could not be used, so the
    /// desk can say so rather than appearing to ignore the card.
    /// </summary>
    public event Action<string>? ScanRejected;

    /// <summary>
    /// Feed a keystroke. Returns true when the key was consumed as part of a
    /// scan, so the caller can stop it reaching the focused control.
    /// </summary>
    public bool HandleKey(char c, bool isEnter)
    {
        var gap = _sinceLastKey.IsRunning ? _sinceLastKey.ElapsedMilliseconds : long.MaxValue;
        _sinceLastKey.Restart();

        if (isEnter)
        {
            // Enter only terminates a burst that was still plausibly machine
            // speed. A slow Enter after slow digits is a person pressing return.
            if (_buffer.Length > 0 && gap <= MaxGapMs)
            {
                Complete();
                return true;
            }
            _buffer.Clear();
            return false;
        }

        if (!char.IsDigit(c))
        {
            // Readers in this class emit digits only. Anything else means this
            // was a person, so the buffer is abandoned rather than filtered —
            // filtering would turn "abc123456" into a card.
            _buffer.Clear();
            return false;
        }

        // A gap longer than the threshold starts a new burst rather than
        // extending the old one, so two slow keypresses never accumulate into
        // a card number over several seconds.
        if (gap > MaxGapMs) _buffer.Clear();

        if (_buffer.Length >= MaxDigits)
        {
            _buffer.Clear();
            return false;
        }

        _buffer.Append(c);
        // Not consumed yet: until Enter arrives this may still be a person
        // typing, and swallowing their keystrokes would break every text box
        // on the screen.
        return false;
    }

    private void Complete()
    {
        var text = _buffer.ToString();
        _buffer.Clear();
        _sinceLastKey.Reset();

        if (text.Length < MinDigits)
        {
            ScanRejected?.Invoke($"Read only {text.Length} digits — hold the card flat on the reader and try again.");
            return;
        }

        if (!long.TryParse(text, out var card) || card <= 0)
        {
            // A number too large for Int64 is not a card this system can store,
            // and silently truncating it would issue a credential that never
            // matches the card that produced it.
            ScanRejected?.Invoke("That card number could not be read. Try the card again.");
            return;
        }

        CardScanned?.Invoke(card);
    }

    /// <summary>Drops any partial burst. Called when the desk changes mode.</summary>
    public void Reset()
    {
        _buffer.Clear();
        _sinceLastKey.Reset();
    }
}
