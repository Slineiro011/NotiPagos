import 'package:flutter/material.dart';
import 'screens/pagos_screen.dart';
import 'screens/historial_screen.dart';
import 'screens/configuracion_screen.dart';
import 'screens/login_screen.dart';
import 'services/api_service.dart';
import 'services/notificaciones_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    await NotificacionesService.inicializar();
  } catch (e) {
    // Si Firebase falla al iniciar (sin conexion, etc.) la app sigue
    // funcionando normal, solo sin notificaciones push por ahora.
    debugPrint('No se pudo inicializar las notificaciones push: $e');
  }
  runApp(const NotiPagosApp());
}

class NotiPagosApp extends StatelessWidget {
  const NotiPagosApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'NotiPagos',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorSchemeSeed: const Color(0xFF2563EB),
        useMaterial3: true,
        appBarTheme: const AppBarTheme(centerTitle: false),
      ),
      home: const AuthGate(),
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
      return LoginScreen(onLoginExitoso: () => setState(() => _autenticado = true));
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

  static const _titulos = ['💳 Pagos', 'Historial', 'WhatsApp / Configuración'];

  @override
  Widget build(BuildContext context) {
    final pantallas = [
      const PagosScreen(),
      const HistorialScreen(),
      ConfiguracionScreen(onSalir: widget.onSalir),
    ];
    return Scaffold(
      appBar: AppBar(
        title: Text(_titulos[_indice]),
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
        destinations: const [
          NavigationDestination(icon: Icon(Icons.payments_outlined), selectedIcon: Icon(Icons.payments), label: 'Pagos'),
          NavigationDestination(icon: Icon(Icons.history_outlined), selectedIcon: Icon(Icons.history), label: 'Historial'),
          NavigationDestination(icon: Icon(Icons.settings_outlined), selectedIcon: Icon(Icons.settings), label: 'Config'),
        ],
      ),
    );
  }
}
