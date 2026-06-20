using System.Net;
using System.Net.Sockets;

namespace SIUTeam.MetaAI.Domain.Helpers
{
    public class Utilities
    {
        public static int GetAvailableTcpPort()
        {
            TcpListener listener = new TcpListener(IPAddress.Loopback, 0);
            listener.Start();
            int port = ((IPEndPoint)listener.LocalEndpoint).Port;
            listener.Stop();
            return port;
        }
    }
}
