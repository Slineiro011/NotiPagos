import 'package:flutter/material.dart';
import '../models/pago.dart';
import '../services/api_service.dart';

class PagoFormScreen extends StatefulWidget {
  final Pago? pago;
  final List<String> empresasConocidas;

  const PagoFormScreen({super.key, this.pago, required this.empresasConocidas});

  @override
  State<PagoFormScreen> createState() => _PagoFormScreenState();
}

class _PagoFormScreenState extends State<PagoFormScreen> {
  final _formKey = GlobalKey<FormState>();
  late TextEditingController _empresaCtrl;
  late TextEditingController _nombreCtrl;
  late TextEditingController _montoCtrl;
  late TextEditingController _diasAvisoCtrl;
  late TextEditingController _notasCtrl;
  String _categoria = categoriasDisponibles.first;
  String _recurrencia = 'ninguna';
  DateTime _fecha = DateTime.now();
  bool _guardando = false;

  bool get _esEdicion => widget.pago != null;

  @override
  void initState() {
    super.initState();
    final p = widget.pago;
    _empresaCtrl = TextEditingController(text: p?.empresa ?? '');
    _nombreCtrl = TextEditingController(text: p?.nombre ?? '');
    _montoCtrl = TextEditingController(text: p != null ? p.monto.toStringAsFixed(0) : '');
    _diasAvisoCtrl = TextEditingController(text: (p?.diasAviso ?? 3).toString());
    _notasCtrl = TextEditingController(text: p?.notas ?? '');
    _categoria = p?.categoria ?? categoriasDisponibles.first;
    _recurrencia = p?.recurrencia ?? 'ninguna';
    _fecha = p != null ? DateTime.parse(p.fechaVencimiento) : DateTime.now();
  }

  @override
  void dispose() {
    _empresaCtrl.dispose();
    _nombreCtrl.dispose();
    _montoCtrl.dispose();
    _diasAvisoCtrl.dispose();
    _notasCtrl.dispose();
    super.dispose();
  }

  Future<void> _elegirFecha() async {
    final seleccionada = await showDatePicker(
      context: context,
      initialDate: _fecha,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
    );
    if (seleccionada != null) setState(() => _fecha = seleccionada);
  }

  String get _fechaFormateada =>
      '${_fecha.year.toString().padLeft(4, '0')}-${_fecha.month.toString().padLeft(2, '0')}-${_fecha.day.toString().padLeft(2, '0')}';

  Future<void> _guardar() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _guardando = true);
    try {
      final pago = Pago(
        id: widget.pago?.id ?? 0,
        empresa: _empresaCtrl.text.trim(),
        nombre: _nombreCtrl.text.trim(),
        categoria: _categoria,
        monto: double.tryParse(_montoCtrl.text.replaceAll('.', '').replaceAll(',', '')) ?? 0,
        fechaVencimiento: _fechaFormateada,
        recurrencia: _recurrencia,
        diasAviso: int.tryParse(_diasAvisoCtrl.text) ?? 3,
        estado: widget.pago?.estado ?? 'pendiente',
        notas: _notasCtrl.text.trim(),
      );

      if (_esEdicion) {
        await ApiService.actualizarPago(widget.pago!.id, pago);
      } else {
        await ApiService.crearPago(pago);
      }

      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error al guardar: $e')));
      }
    } finally {
      if (mounted) setState(() => _guardando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(_esEdicion ? 'Editar pago' : 'Nuevo pago')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Autocomplete<String>(
              optionsBuilder: (valor) {
                if (valor.text.isEmpty) return widget.empresasConocidas;
                return widget.empresasConocidas.where(
                  (e) => e.toLowerCase().contains(valor.text.toLowerCase()),
                );
              },
              initialValue: TextEditingValue(text: _empresaCtrl.text),
              onSelected: (valor) => _empresaCtrl.text = valor,
              fieldViewBuilder: (context, controller, focusNode, onSubmit) {
                controller.text = _empresaCtrl.text;
                controller.addListener(() => _empresaCtrl.text = controller.text);
                return TextFormField(
                  controller: controller,
                  focusNode: focusNode,
                  decoration: const InputDecoration(labelText: 'Empresa', border: OutlineInputBorder()),
                  validator: (v) => (v == null || v.trim().isEmpty) ? 'Obligatorio' : null,
                );
              },
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _nombreCtrl,
              decoration: const InputDecoration(labelText: 'Nombre del pago', border: OutlineInputBorder()),
              validator: (v) => (v == null || v.trim().isEmpty) ? 'Obligatorio' : null,
            ),
            const SizedBox(height: 14),
            DropdownButtonFormField<String>(
              initialValue: _categoria,
              decoration: const InputDecoration(labelText: 'Categoría', border: OutlineInputBorder()),
              items: categoriasDisponibles
                  .map((c) => DropdownMenuItem(value: c, child: Text(c)))
                  .toList(),
              onChanged: (v) => setState(() => _categoria = v ?? _categoria),
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _montoCtrl,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Monto (COP)', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 14),
            InkWell(
              onTap: _elegirFecha,
              child: InputDecorator(
                decoration: const InputDecoration(labelText: 'Fecha de vencimiento', border: OutlineInputBorder()),
                child: Text(_fechaFormateada),
              ),
            ),
            const SizedBox(height: 14),
            DropdownButtonFormField<String>(
              initialValue: _recurrencia,
              decoration: const InputDecoration(labelText: 'Recurrencia', border: OutlineInputBorder()),
              items: recurrenciasDisponibles
                  .map((r) => DropdownMenuItem(value: r, child: Text(r == 'ninguna' ? 'No se repite' : r)))
                  .toList(),
              onChanged: (v) => setState(() => _recurrencia = v ?? _recurrencia),
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _diasAvisoCtrl,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'Avisar con cuántos días de anticipación',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _notasCtrl,
              maxLines: 2,
              decoration: const InputDecoration(labelText: 'Notas', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: _guardando ? null : _guardar,
              style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
              child: _guardando
                  ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Text('Guardar'),
            ),
          ],
        ),
      ),
    );
  }
}
