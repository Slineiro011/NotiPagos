import 'dart:async';
import 'dart:io';
import 'package:in_app_purchase/in_app_purchase.dart';
import 'api_service.dart';

/// ID del producto de suscripcion mensual, debe coincidir exactamente con el
/// que se cree en Play Console (Monetiza > Productos > Suscripciones).
const String idProductoSuscripcion = 'activox_suscripcion_mensual';

/// Envuelve in_app_purchase: consulta el precio real de la tienda, lanza la
/// compra y manda el comprobante al servidor para que lo verifique contra
/// Google antes de desbloquear la cuenta.
class SuscripcionService {
  static final InAppPurchase _iap = InAppPurchase.instance;
  static StreamSubscription<List<PurchaseDetails>>? _suscripcionStream;

  static Future<bool> disponible() => _iap.isAvailable();

  static Future<ProductDetails?> obtenerProducto() async {
    final respuesta = await _iap.queryProductDetails({idProductoSuscripcion});
    if (respuesta.notFoundIDs.isNotEmpty) return null;
    return respuesta.productDetails.isEmpty ? null : respuesta.productDetails.first;
  }

  /// Escucha las compras (incluye las que ya estaban en curso al abrir la
  /// app) y llama [onVerificada] cuando el servidor confirma que quedo
  /// activa. Nunca lanza: los errores se reportan via [onError].
  static void escuchar({
    required void Function() onVerificada,
    required void Function(String mensaje) onError,
  }) {
    _suscripcionStream?.cancel();
    _suscripcionStream = _iap.purchaseStream.listen((compras) async {
      for (final compra in compras) {
        if (compra.status == PurchaseStatus.pending) continue;

        if (compra.status == PurchaseStatus.error) {
          onError(compra.error?.message ?? 'No se pudo completar la compra.');
          continue;
        }

        if (compra.status == PurchaseStatus.purchased || compra.status == PurchaseStatus.restored) {
          try {
            final token = compra.verificationData.serverVerificationData;
            await ApiService.verificarCompra(plataforma: Platform.isIOS ? 'ios' : 'android', purchaseToken: token);
            // Solo se cierra la compra en la tienda cuando el servidor ya la
            // acepto: si la verificacion falla, queda abierta para reintentar
            // con "Restaurar compra" (y si nunca se verifica, Google la
            // reembolsa sola a los 3 dias en vez de cobrar sin desbloquear).
            if (compra.pendingCompletePurchase) await _iap.completePurchase(compra);
            onVerificada();
          } catch (e) {
            onError(mensajeError(e));
          }
          continue;
        }

        if (compra.pendingCompletePurchase) await _iap.completePurchase(compra);
      }
    }, onError: (e) => onError(mensajeError(e)));
  }

  static Future<void> comprar(ProductDetails producto) async {
    final parametros = PurchaseParam(productDetails: producto);
    await _iap.buyNonConsumable(purchaseParam: parametros);
  }

  /// Vuelve a pedirle a la tienda las compras de esta cuenta de Google/Apple;
  /// llegan por [escuchar] con estado "restored" y se verifican igual.
  static Future<void> restaurar() => _iap.restorePurchases();

  /// La verificacion de compras de iPhone (App Store) todavia no existe en el
  /// servidor: mientras tanto no se deja comprar desde iOS, para no cobrar
  /// sin poder desbloquear la cuenta.
  static bool get compraDisponibleEnEstaPlataforma => !Platform.isIOS;

  static void detener() => _suscripcionStream?.cancel();
}
