const List<String> _diasSemana = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const List<String> _meses = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/// Ej: "jueves".
String nombreDiaSemana(DateTime fecha) => _diasSemana[fecha.weekday - 1];

/// Ej: "jueves 12 de noviembre".
String fechaLegible(DateTime fecha) => '${nombreDiaSemana(fecha)} ${fecha.day} de ${_meses[fecha.month - 1]}';

/// Primera fecha desde [desde] (incluida) que cae en [diaSemana]
/// (DateTime.monday..DateTime.sunday).
DateTime proximoDiaSemana(int diaSemana, DateTime desde) {
  final base = DateTime(desde.year, desde.month, desde.day);
  return DateTime(base.year, base.month, base.day + (diaSemana - base.weekday + 7) % 7);
}

class Tarea {
  final int id;
  final String nombre;
  final String fechaVencimiento; // "YYYY-MM-DD"
  final String recurrencia;
  final int diasAviso;
  final String estado;
  final String notas;
  final String? creadoPor;
  final String? creadoPorNombre;

  Tarea({
    required this.id,
    required this.nombre,
    required this.fechaVencimiento,
    required this.recurrencia,
    required this.diasAviso,
    required this.estado,
    required this.notas,
    this.creadoPor,
    this.creadoPorNombre,
  });

  factory Tarea.fromJson(Map<String, dynamic> json) {
    return Tarea(
      id: json['id'] as int,
      nombre: json['nombre'] as String,
      fechaVencimiento: json['fecha_vencimiento'] as String,
      recurrencia: (json['recurrencia'] ?? 'ninguna') as String,
      diasAviso: (json['dias_aviso'] is num) ? (json['dias_aviso'] as num).toInt() : 1,
      estado: (json['estado'] ?? 'pendiente') as String,
      notas: (json['notas'] ?? '') as String,
      creadoPor: json['creado_por'] as String?,
      creadoPorNombre: json['creado_por_nombre'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'nombre': nombre,
      'fecha_vencimiento': fechaVencimiento,
      'recurrencia': recurrencia,
      'dias_aviso': diasAviso,
      'notas': notas,
    };
  }

  /// Ej: "jueves 12 de noviembre".
  String get fechaTexto => fechaLegible(DateTime.parse(fechaVencimiento));

  /// Texto de la lista y del recordatorio. Ej: "Cada jueves · próximo: jueves
  /// 12 de noviembre" o "Vence martes 3 de marzo".
  String get resumenFecha {
    if (recurrencia == 'semanal') {
      return 'Cada ${nombreDiaSemana(DateTime.parse(fechaVencimiento))} · próximo: $fechaTexto';
    }
    if (recurrencia != 'ninguna') return 'Próximo: $fechaTexto · se repite';
    return 'Vence $fechaTexto';
  }

  int get diasRestantes {
    final hoy = DateTime.now();
    final hoySinHora = DateTime(hoy.year, hoy.month, hoy.day);
    final venc = DateTime.parse(fechaVencimiento);
    return venc.difference(hoySinHora).inDays;
  }
}
