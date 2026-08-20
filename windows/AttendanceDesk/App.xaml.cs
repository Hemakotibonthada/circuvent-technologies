using System.Windows;

namespace Circuvent.AttendanceDesk;

public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        /*
         * An unhandled exception on a reception desk must not close the window.
         * The machine is often unattended, and a crashed desk is a queue of
         * people who cannot clock in with nobody watching to restart it — so
         * the fault is shown and the app stays up.
         */
        DispatcherUnhandledException += (_, args) =>
        {
            MessageBox.Show(
                args.Exception.Message,
                "Something went wrong",
                MessageBoxButton.OK,
                MessageBoxImage.Warning);
            args.Handled = true;
        };
    }
}
