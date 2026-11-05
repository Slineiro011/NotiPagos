import 'package:flutter/material.dart';
import '../models/pago.dart' show recurrenciasDisponibles;
import '../models/tarea.dart';
import '../services/api_service.dart';

class TareaFormScreen extends StatefulWidget {
  final Tarea? tarea;

  const TareaFormScreen({super.key, this.tarea});

  @override
  State<TareaFormScreen> createState() => _TareaFormScreenState();
}

class _TareaFormScreenState extends State<TareaFormScreen> {
  final _formKey = GlobalKey<FormState>();
  late TextEditingController _nombreCtrl;
  late TextEditingController _diasAvisoCtrl;
  late TextEditingController _notasCtrl;
  String _recurrencia = 'ninguna';
  DateTime _fecha = DateTime.now();
  bool _guardando = false;

  bool get _esEdicion => widget.tarea != null;

  @override
  void initState() {
    super.initState();
    final t = widget.tarea;
    _nombreCtrl = TextEditingController(text: t?.nombre ?? '');
    _diasAvisoCtrl = TextEditingController(text: (t?.diasAviso ?? 1).toString());
    _notasCtrl = TextEditingController(text: t?.notas ?? '');
    _recurrencia = t?.recurrencia ?? 'ninguna';
    _fecha = t != null ? DateTime.parse(t.fechaVencimiento) : DateTime.now();
  }

  @override
  void dispose() {
    _nombreCtrl.dispose();
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
      final tarea = Tarea(
        id: widget.tarea?.id ?? 0,
        nombre: _nombreCtrl.text.trim(),
        fechaVencimiento: _fechaFormateada,
        recurrencia: _recurrencia,
        diasAviso: int.tryParse(_diasAvisoCtrl.text) ?? 1,
        estado: widget.tarea?.estado ?? 'pendiente',
        notas: _notasCtrl.text.trim(),
      );

      if (_esEdicion) {
        await ApiService.actualizarTarea(widget.tarea!.id, tarea);
      } else {
        await ApiService.crearTarea(tarea);
      }

      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error al guardar: ${mensajeError(e)}')));
      }
    } finally {
      if (mounted) setState(() => _guardando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(_esEdicion ? 'Editar tarea' : 'Nueva tarea')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            TextFormField(
              controller: _nombreCtrl,
              decoration: const InputDecoration(
                labelText: 'Nombre de la tarea',
                hintText: 'Ej: Mandar a hacer el corte de caja',
                border: OutlineInputBorder(),
              ),
              validator: (v) => (v == null || v.trim().isEmpty) ? 'Obligatorio' : null,
            ),
            const SizedBox(height: 14),
            InkWell(
              onTap: _elegirFecha,
              child: InputDecorator(
                decoration: const InputDecoration(labelText: 'Fecha', border: OutlineInputBorder()),
                child: Text(_fechaFormateada),
              ),
            ),
            const SizedBox(height: 14),
            DropdownButtonFormField<String>(
              initialValue: _recurrencia,
              decoration: const InputDecoration(labelText: 'Se repite', border: OutlineInputBorder()),
              items: [
                if (!recurrenciasDisponibles.contains(_recurrencia)) _recurrencia,
                ...recurrenciasDisponibles,
              ].map((r) => DropdownMenuItem(value: r, child: Text(_etiquetaRecurrencia(r)))).toList(),
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

String _etiquetaRecurrencia(String r) {
  switch (r) {
    case 'ninguna':
      return 'No se repite';
    case 'semanal':
      return 'Cada semana';
    case 'mensual':
      return 'Cada mes';
    case 'bimestral':
      return 'Cada 2 meses';
    case 'trimestral':
      return 'Cada 3 meses';
    case 'semestral':
      return 'Cada 6 meses';
    case 'anual':
      return 'Cada año';
    default:
      return r;
  }
}
