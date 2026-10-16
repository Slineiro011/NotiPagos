import 'package:flutter/material.dart';
import 'screens/pagos_screen.dart';
import 'screens/historial_screen.dart';
import 'screens/configuracion_screen.dart';
import 'screens/usuarios_screen.dart';
import 'screens/login_screen.dart';
import 'services/api_service.dart';
import 'services/notificaciones_service.dart' show NotificacionesService, navegadorGlobal;
import 'services/tema_service.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  // Las notificaciones se preparan en paralelo: esperar a Firebase/APNs antes
  // de dibujar dejaba la pantalla en blanco varios segundos al abrir.
  NotificacionesService.inicializar().catchError((Object e) {
    // Si Firebase falla al iniciar (sin conexion, etc.) la app sigue
    // funcionando normal, solo sin notificaciones push por ahora.
    debugPrint('No se pudo inicializar las notificaciones push: $e');
  });
  TemaService.cargar();
  runApp(const NotiPagosApp());
}

class NotiPagosApp extends StatelessWidget {
  const NotiPagosApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<ThemeMode>(
      valueListenable: TemaService.modo,
      builder: (context, modo, _) {
        return MaterialApp(
          title: 'NotiPagos',
          navigatorKey: navegadorGlobal,
          debugShowCheckedModeBanner: false,
          themeMode: modo,
          theme: ThemeData(
            colorSchemeSeed: const Color(0xFF2563EB),
            brightness: Brightness.light,
            useMaterial3: true,
            appBarTheme: const AppBarTheme(centerTitle: false),
          ),
          darkTheme: ThemeData(
            colorSchemeSeed: const Color(0xFF2563EB),
            brightness: Brightness.dark,
            useMaterial3: true,
            appBarTheme: const AppBarTheme(centerTitle: false),
          ),
          home: const AuthGate(),
        );
      },
    );
  }
}

class AuthGate extends StatefulWidget {
  const AuthGate({super.key});

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  bool _cargando = true;
  bool _autenticado = false;

  @override
  void initState() {
    super.initState();
    ApiService.onNoAutenticado = () {
      if (mounted) setState(() => _autenticado = false);
    };
    _revisarSesion();
  }

  Future<void> _revisarSesion() async {
    final token = await ApiService.getToken();
    setState(() {
      _autenticado = token != null;
      _cargando = false;
    });
  }

  Future<void> _salir() async {
    await ApiService.cerrarSesion();
    setState(() => _autenticado = false);
  }

  @override
  Widget build(BuildContext context) {
    if (_cargando) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (!_autenticado) {
      return LoginScreen(
        onLoginExitoso: () {
          setState(() => _autenticado = true);
          NotificacionesService.registrarTokenActual();
        },
      );
    }
    return HomeShell(onSalir: _salir);
  }
}

class HomeShell extends StatefulWidget {
  final VoidCallback onSalir;

  const HomeShell({super.key, required this.onSalir});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _indice = 0;
  bool _esJefe = false;
  bool _cargandoRol = true;

  @override
  void initState() {
    super.initState();
    // Al tocar un recordatorio se muestra la pestaña de Pagos, que lo abre.
    NotificacionesService.pagoPorAbrir.addListener(_irAPagos);
    ApiService.esJefe().then((esJefe) {
      if (mounted) setState(() {
        _esJefe = esJefe;
        _cargandoRol = false;
      });
    });
  }

  @override
  void dispose() {
    NotificacionesService.pagoPorAbrir.removeListener(_irAPagos);
    super.dispose();
  }

  void _irAPagos() {
    if (NotificacionesService.pagoPorAbrir.value != null && _indice != 0) {
      setState(() => _indice = 0);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_cargandoRol) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    final titulos = ['💳 Pagos', 'Historial', if (_esJefe) 'Usuarios', 'WhatsApp / Configuración'];
    final pantallas = [
      const PagosScreen(),
      const HistorialScreen(),
      if (_esJefe) const UsuariosScreen(),
      ConfiguracionScreen(onSalir: widget.onSalir),
    ];
    final destinos = [
      const NavigationDestination(icon: Icon(Icons.payments_outlined), selectedIcon: Icon(Icons.payments), label: 'Pagos'),
      const NavigationDestination(icon: Icon(Icons.history_outlined), selectedIcon: Icon(Icons.history), label: 'Historial'),
      if (_esJefe)
        const NavigationDestination(icon: Icon(Icons.people_outline), selectedIcon: Icon(Icons.people), label: 'Usuarios'),
      const NavigationDestination(icon: Icon(Icons.settings_outlined), selectedIcon: Icon(Icons.settings), label: 'Config'),
    ];

    return Scaffold(
      appBar: AppBar(
        title: Text(titulos[_indice]),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Salir',
            onPressed: widget.onSalir,
          ),
        ],
      ),
      body: IndexedStack(index: _indice, children: pantallas),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _indice,
        onDestinationSelected: (i) => setState(() => _indice = i),
        destinations: destinos,
      ),
    );
  }
}
