import 'package:flutter_test/flutter_test.dart';
import 'package:notipagos_app/models/tarea.dart';

Tarea _tarea(String fecha, String recurrencia) =>
    Tarea(id: 1, nombre: 'X', fechaVencimiento: fecha, recurrencia: recurrencia, diasAviso: 1, estado: 'pendiente', notas: '');

void main() {
  test('fecha legible con dia de la semana', () {
    expect(fechaLegible(DateTime(2026, 11, 12)), 'jueves 12 de noviembre');
    expect(fechaLegible(DateTime(2027, 3, 3)), 'miércoles 3 de marzo');
  });

  test('proximo dia de la semana incluye hoy y salta cambios de mes', () {
    final viernes = DateTime(2026, 11, 6);
    expect(proximoDiaSemana(DateTime.friday, viernes), DateTime(2026, 11, 6));
    expect(proximoDiaSemana(DateTime.thursday, viernes), DateTime(2026, 11, 12));
    expect(proximoDiaSemana(DateTime.monday, DateTime(2026, 11, 30)), DateTime(2026, 11, 30));
    expect(proximoDiaSemana(DateTime.sunday, DateTime(2026, 12, 28)), DateTime(2027, 1, 3));
  });

  test('resumen de la fecha segun la recurrencia', () {
    expect(_tarea('2026-11-12', 'semanal').resumenFecha, 'Cada jueves · próximo: jueves 12 de noviembre');
    expect(_tarea('2027-03-03', 'ninguna').resumenFecha, 'Vence miércoles 3 de marzo');
    expect(_tarea('2026-12-15', 'mensual').resumenFecha, 'Próximo: martes 15 de diciembre · se repite');
  });
}
