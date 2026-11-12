using System;
using System.IO;
using System.Diagnostics;
using System.Windows.Forms;

internal static class CrosspostLauncher {
    [STAThread]
    static void Main() {
        string root = AppDomain.CurrentDomain.BaseDirectory;
        string node = Path.Combine(root, "runtime", "node.exe");
        string script = Path.Combine(root, "scripts", "portable-launch.mjs");
        try {
            if (!File.Exists(node) || !File.Exists(script))
                throw new Exception("Extract the entire Crosspost ZIP before opening Crosspost.exe.");
            var start = new ProcessStartInfo(node, "\"" + script + "\"") {
                WorkingDirectory = root,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardError = true
            };
            using (var child = Process.Start(start)) {
                string error = child.StandardError.ReadToEnd();
                child.WaitForExit();
                if (child.ExitCode != 0)
                    throw new Exception(String.IsNullOrWhiteSpace(error)
                        ? "Crosspost's included runtime could not start. Windows error: 0x" + unchecked((uint)child.ExitCode).ToString("X8") + ". No app log may have been created. Keep this error code with your report."
                        : error);
            }
        } catch (Exception error) {
            Environment.ExitCode = 1;
            if (Environment.GetEnvironmentVariable("CROSSPOST_NO_OPEN") == "1")
                Console.Error.WriteLine(error.Message);
            else
                MessageBox.Show(error.Message, "Crosspost", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}
