import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:notipagos_app/main.dart';

void main() {
  testWidgets('Sin sesion, la app muestra la pantalla de login', (WidgetTester tester) async {
    SharedPreferences.setMockInitialValues({});
    await tester.pumpWidget(const NotiPagosApp());
    await tester.pumpAndSettle();

    expect(find.text('💳 Pagos de la empresa'), findsOneWidget);
    expect(find.text('Entrar'), findsOneWidget);
  });
}
