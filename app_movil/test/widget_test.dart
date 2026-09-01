import 'package:flutter_test/flutter_test.dart';

import 'package:notipagos_app/main.dart';

void main() {
  testWidgets('La app carga y muestra la barra de navegacion', (WidgetTester tester) async {
    await tester.pumpWidget(const NotiPagosApp());
    await tester.pump();

    expect(find.text('Pagos'), findsWidgets);
    expect(find.text('Historial'), findsWidgets);
  });
}
