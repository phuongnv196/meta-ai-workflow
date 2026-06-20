using Microsoft.Extensions.DependencyInjection;

namespace SIUTeam.MetaAI
{
    internal static class Program
    {
        public static IServiceProvider ServiceProvider { get; private set; } = null!;

        [STAThread]
        static void Main()
        {
            ApplicationConfiguration.Initialize();

            var services = new ServiceCollection();
            ConfigureServices(services);

            ServiceProvider = services.BuildServiceProvider();

            var mainForm = ServiceProvider.GetRequiredService<formMain>();
            Application.Run(mainForm);
        }

        private static void ConfigureServices(IServiceCollection services)
        {
            //services.AddSingleton<IAppLogger, AppLogger>();

            services.AddTransient<formMain>();
        }
    }
}