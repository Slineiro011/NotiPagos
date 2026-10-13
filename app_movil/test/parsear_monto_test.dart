import 'package:flutter_test/flutter_test.dart';
import 'package:notipagos_app/models/pago.dart';

void main() {
  test('el punto separa miles y la coma los decimales', () {
    expect(parsearMonto('850.000'), 850000);
    expect(parsearMonto('850.000,50'), 850000.5);
    expect(parsearMonto('1.234.567'), 1234567);
  });

  test('acepta montos sin separadores, con signo pesos o espacios', () {
    expect(parsearMonto('850000'), 850000);
    expect(parsearMonto(r'$ 850.000'), 850000);
  });

  test('vacio cuenta como 0 y lo que no es numero es invalido', () {
    expect(parsearMonto(''), 0);
    expect(parsearMonto('abc'), isNull);
  });
}
