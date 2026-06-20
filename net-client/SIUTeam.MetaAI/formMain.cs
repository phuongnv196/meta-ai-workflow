using SIUTeam.MetaAI.Domain.Helpers;
using System.Diagnostics;
using System.Threading.Tasks;

namespace SIUTeam.MetaAI
{
    public partial class formMain : Form
    {
        private readonly int _availablePort;
        private Process? _nodeProcess;
        private readonly string _nodejsDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "nodejs");
        public formMain() 
        {
            InitializeComponent();
            _availablePort = Utilities.GetAvailableTcpPort();
            StopNodeProcess();
            Start();
        }

        private async void Start()
        {
            ProcessStartInfo processStartInfo = new ProcessStartInfo
            {
                FileName = Path.Combine(_nodejsDir, "node.exe"),
                Arguments = "index.js",
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                WorkingDirectory = _nodejsDir
            };

            processStartInfo.EnvironmentVariables["PORT"] = _availablePort.ToString();

            _nodeProcess = new Process { StartInfo = processStartInfo };

            _nodeProcess.OutputDataReceived += (s, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                    Debug.WriteLine($"[node] {e.Data}");
            };
            _nodeProcess.ErrorDataReceived += (s, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                    Debug.WriteLine($"[node:err] {e.Data}");
            };

            _nodeProcess.Start();
            _nodeProcess.BeginOutputReadLine();
            _nodeProcess.BeginErrorReadLine();

            await Task.Delay(2000);

            webView21.Source = new Uri($"http://localhost:{_availablePort}");
        }

        private void StopNodeProcess()
        {
            if (_nodeProcess != null && !_nodeProcess.HasExited)
            {
                _nodeProcess.Kill();
                _nodeProcess.Dispose();
                _nodeProcess = null;
            }

            Process.GetProcessesByName("node").ToList().Where(p => p.MainModule?.FileName.Contains(_nodejsDir) == true).ToList().ForEach(p => p.Kill());
        }
        private void Form1_FormClosing(object sender, FormClosingEventArgs e)
        {
            StopNodeProcess();
        }
    }
}
