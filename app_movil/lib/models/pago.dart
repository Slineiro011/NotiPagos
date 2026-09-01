class Pago {
  final int id;
  final String empresa;
  final String nombre;
  final String categoria;
  final double monto;
  final String fechaVencimiento; // "YYYY-MM-DD"
  final String recurrencia;
  final int diasAviso;
  final String estado;
  final String notas;

  Pago({
    required this.id,
    required this.empresa,
    required this.nombre,
    required this.categoria,
    required this.monto,
    required this.fechaVencimiento,
    required this.recurrencia,
    required this.diasAviso,
    required this.estado,
    required this.notas,
  });

  factory Pago.fromJson(Map<String, dynamic> json) {
    return Pago(
      id: json['id'] as int,
      empresa: (json['empresa'] ?? 'Sin empresa') as String,
      nombre: json['nombre'] as String,
      categoria: (json['categoria'] ?? 'Otro') as String,
      monto: (json['monto'] is num) ? (json['monto'] as num).toDouble() : double.tryParse('${json['monto']}') ?? 0,
      fechaVencimiento: json['fecha_vencimiento'] as String,
      recurrencia: (json['recurrencia'] ?? 'ninguna') as String,
      diasAviso: (json['dias_aviso'] is num) ? (json['dias_aviso'] as num).toInt() : 3,
      estado: (json['estado'] ?? 'pendiente') as String,
      notas: (json['notas'] ?? '') as String,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'empresa': empresa,
      'nombre': nombre,
      'categoria': categoria,
      'monto': monto,
      'fecha_vencimiento': fechaVencimiento,
      'recurrencia': recurrencia,
      'dias_aviso': diasAviso,
      'notas': notas,
    };
  }

  int get diasRestantes {
    final hoy = DateTime.now();
    final hoySinHora = DateTime(hoy.year, hoy.month, hoy.day);
    final venc = DateTime.parse(fechaVencimiento);
    return venc.difference(hoySinHora).inDays;
  }
}

const List<String> categoriasDisponibles = [
  'SOAT',
  'Póliza',
  'Nómina',
  'Impuestos',
  'Servicios públicos',
  'Arriendo',
  'Proveedores',
  'Otro',
];

const List<String> recurrenciasDisponibles = [
  'ninguna',
  'mensual',
  'bimestral',
  'trimestral',
  'semestral',
  'anual',
];
