import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';
import 'api_client.dart';

void main() => runApp(const HacApp());

class HacApp extends StatefulWidget {
  const HacApp({super.key});
  @override
  State<HacApp> createState() => _HacAppState();
}
class _HacAppState extends State<HacApp> {
  HacApiClient? api;
  Map<String, dynamic>? user;
  String? configurationError;
  @override
  void initState() {
    super.initState();
    try { api = HacApiClient(const String.fromEnvironment('HAC_API_URL')); }
    catch (error) { configurationError = error.toString(); }
  }
  @override
  void dispose() { api?.dispose(); super.dispose(); }
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'HAC Inspector',
    debugShowCheckedModeBanner: false,
    theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff187b59)), useMaterial3: true),
    home: configurationError != null
      ? Scaffold(body: SafeArea(child: Padding(padding: const EdgeInsets.all(24), child: Text('$configurationError\n\nRun with --dart-define=HAC_API_URL=https://your-authorized-hac-host.example'))))
      : user == null
        ? LoginScreen(api: api!, onLogin: (value) => setState(() => user = value))
        : InspectionList(api: api!, user: user!, onLogout: () async {
            try { await api!.logout(); } finally { if (mounted) setState(() => user = null); }
          }),
  );
}

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.api, required this.onLogin});
  final HacApiClient api;
  final ValueChanged<Map<String, dynamic>> onLogin;
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}
class _LoginScreenState extends State<LoginScreen> {
  final email = TextEditingController();
  final password = TextEditingController();
  bool busy = false;
  String? error;
  @override
  void dispose() { email.dispose(); password.dispose(); super.dispose(); }
  Future<void> submit() async {
    setState(() { busy = true; error = null; });
    try { widget.onLogin(await widget.api.login(email.text, password.text)); }
    catch (failure) { if (mounted) setState(() => error = failure.toString()); }
    finally { if (mounted) setState(() => busy = false); }
  }
  @override
  Widget build(BuildContext context) => Scaffold(body: SafeArea(child: Center(child: SingleChildScrollView(padding: const EdgeInsets.all(24), child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 420), child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
    const Icon(Icons.verified_user_outlined, size: 56, color: Color(0xff187b59)),
    const SizedBox(height: 24),
    Text('HAC Inspector', style: Theme.of(context).textTheme.headlineMedium),
    const Text('Sign in to your assigned inspections.'),
    const SizedBox(height: 24),
    TextField(controller: email, keyboardType: TextInputType.emailAddress, autofillHints: const [AutofillHints.username], decoration: const InputDecoration(labelText: 'Email')),
    TextField(controller: password, obscureText: true, autofillHints: const [AutofillHints.password], decoration: const InputDecoration(labelText: 'Password'), onSubmitted: (_) { if (!busy) submit(); }),
    if (error != null) Padding(padding: const EdgeInsets.symmetric(vertical: 12), child: Text(error!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
    const SizedBox(height: 24),
    FilledButton(onPressed: busy ? null : submit, child: Text(busy ? 'Signing in…' : 'Sign in')),
  ]))))));
}

class InspectionList extends StatefulWidget {
  const InspectionList({super.key, required this.api, required this.user, required this.onLogout});
  final HacApiClient api;
  final Map<String, dynamic> user;
  final Future<void> Function() onLogout;
  @override
  State<InspectionList> createState() => _InspectionListState();
}
class _InspectionListState extends State<InspectionList> {
  late Future<List<dynamic>> visits;
  @override
  void initState() { super.initState(); visits = load(); }
  Future<List<dynamic>> load() async {
    final all = await widget.api.request('inspections?pageSize=100') as List<dynamic>;
    final admin = ['SUPER_ADMIN', 'HAC_ADMIN'].contains(widget.user['role']);
    return all.where((visit) => admin || visit['inspectorId'] == widget.user['id']).toList();
  }
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Assigned inspections'), actions: [IconButton(tooltip: 'Sign out', icon: const Icon(Icons.logout), onPressed: widget.onLogout)]),
    body: FutureBuilder<List<dynamic>>(future: visits, builder: (context, snapshot) {
      if (snapshot.hasError) return Center(child: Padding(padding: const EdgeInsets.all(24), child: Column(mainAxisSize: MainAxisSize.min, children: [Text(snapshot.error.toString()), TextButton(onPressed: () => setState(() => visits = load()), child: const Text('Retry'))])));
      if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
      if (snapshot.data!.isEmpty) return const Center(child: Text('No assigned inspections.'));
      return RefreshIndicator(onRefresh: () async { setState(() => visits = load()); await visits; }, child: ListView.builder(itemCount: snapshot.data!.length, itemBuilder: (context, index) {
        final visit = snapshot.data![index] as Map<String, dynamic>;
        return ListTile(leading: const Icon(Icons.fact_check_outlined), title: Text(visit['company']?['legalName']?.toString() ?? visit['reference'].toString()), subtitle: Text('${visit['reference']} · ${visit['status']}\n${visit['location']?['name'] ?? ''}'), isThreeLine: true, trailing: const Icon(Icons.chevron_right), onTap: () async {
          await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => InspectionScreen(api: widget.api, id: visit['id'].toString())));
          if (mounted) setState(() => visits = load());
        });
      }));
    }),
  );
}

class InspectionScreen extends StatefulWidget {
  const InspectionScreen({super.key, required this.api, required this.id});
  final HacApiClient api;
  final String id;
  @override
  State<InspectionScreen> createState() => _InspectionScreenState();
}
class _InspectionScreenState extends State<InspectionScreen> {
  Map<String, dynamic>? inspection;
  List<dynamic> products = [];
  String? error;
  bool busy = false;
  final search = TextEditingController();
  @override
  void initState() { super.initState(); reload(); }
  @override
  void dispose() { search.dispose(); super.dispose(); }
  Future<void> reload() async {
    try { final value = await widget.api.request('inspections/${widget.id}') as Map<String, dynamic>; if (mounted) setState(() { inspection = value; error = null; }); }
    catch (failure) { if (mounted) setState(() => error = failure.toString()); }
  }
  Future<void> action(Future<void> Function() run) async {
    setState(() { busy = true; error = null; });
    try { await run(); await reload(); }
    catch (failure) { if (mounted) setState(() => error = failure.toString()); }
    finally { if (mounted) setState(() => busy = false); }
  }
  Future<void> find() async {
    try { final value = await widget.api.request('products?q=${Uri.encodeQueryComponent(search.text)}&pageSize=30') as List<dynamic>; if (mounted) setState(() { products = value; error = null; }); }
    catch (failure) { if (mounted) setState(() => error = failure.toString()); }
  }
  @override
  Widget build(BuildContext context) {
    final visit = inspection;
    return Scaffold(appBar: AppBar(title: Text(visit?['reference']?.toString() ?? 'Inspection')), body: visit == null ? Center(child: error == null ? const CircularProgressIndicator() : Text(error!)) : RefreshIndicator(onRefresh: reload, child: ListView(padding: const EdgeInsets.all(20), children: [
      Text(visit['company']['legalName'].toString(), style: Theme.of(context).textTheme.headlineSmall),
      Text('${visit['location']['name']} · ${visit['status']}'),
      if (visit['isDemo'] == true) const Padding(padding: EdgeInsets.symmetric(vertical: 12), child: Text('Fictional demonstration records. No official HAC approval is asserted.')),
      if (error != null) Text(error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
      if (visit['status'] == 'SCHEDULED') FilledButton(onPressed: busy ? null : () => action(() async { await widget.api.request('inspections/${widget.id}/start', method: 'POST', body: {}); }), child: const Text('Start inspection')),
      if (visit['status'] == 'IN_PROGRESS') ...[
        const SizedBox(height: 24),
        Text('Identify a product', style: Theme.of(context).textTheme.titleLarge),
        const Text('Search the central catalogue or enter an exact barcode. Identity and approval are confirmed separately.'),
        TextField(controller: search, decoration: InputDecoration(labelText: 'Product, HAC item code, or barcode', suffixIcon: IconButton(onPressed: find, icon: const Icon(Icons.search))), onSubmitted: (_) => find()),
        ...products.map((dynamic item) { final product = item as Map<String, dynamic>; return ListTile(title: Text(product['name'].toString()), subtitle: Text('${product['brand']['name']} · ${product['itemCode']}'), onTap: () async {
          await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ObservationScreen(api: widget.api, inspection: visit, product: product)));
          await reload();
        }); }),
      ],
      const SizedBox(height: 24),
      Text('Saved observations', style: Theme.of(context).textTheme.titleLarge),
      for (final observation in visit['observations'] as List<dynamic>) Card(child: ListTile(title: Text(observation['observedName']?.toString() ?? observation['product']?['name']?.toString() ?? 'Unknown product'), subtitle: Text('${observation['verification']?['label'] ?? 'Review required'}\n${observation['conclusion']}'))),
      const SizedBox(height: 24),
      const Text('Complete general checklists, evidence, declarations, submission, and report review in the web/PWA workspace. Native camera recognition and offline synchronization are pending implementation.'),
    ])));
  }
}

class ObservationScreen extends StatefulWidget {
  const ObservationScreen({super.key, required this.api, required this.inspection, required this.product});
  final HacApiClient api;
  final Map<String, dynamic> inspection;
  final Map<String, dynamic> product;
  @override
  State<ObservationScreen> createState() => _ObservationScreenState();
}
class _ObservationScreenState extends State<ObservationScreen> {
  late TextEditingController brand;
  late TextEditingController manufacturer;
  final expiry = TextEditingController();
  final batch = TextEditingController();
  final notes = TextEditingController();
  String? variantId;
  bool confirmed = false;
  bool busy = false;
  String? error;
  Map<String, dynamic>? verification;
  final mutationId = const Uuid().v4();
  @override
  void initState() {
    super.initState();
    brand = TextEditingController(text: widget.product['brand']['name'].toString());
    manufacturer = TextEditingController(text: widget.product['manufacturer']['name'].toString());
    final variants = widget.product['variants'] as List<dynamic>; variantId = variants.isEmpty ? null : variants.first['id'].toString();
  }
  @override
  void dispose() { brand.dispose(); manufacturer.dispose(); expiry.dispose(); batch.dispose(); notes.dispose(); super.dispose(); }
  Map<String, dynamic> values() => {
    'productId': widget.product['id'], 'variantId': variantId,
    'companyId': widget.inspection['companyId'], 'locationId': widget.inspection['locationId'],
    'observedBrand': brand.text, 'observedManufacturer': manufacturer.text,
    if (expiry.text.trim().isNotEmpty) 'physicalExpiry': expiry.text.trim(),
    'identityConfirmed': confirmed,
  };
  Future<void> verify() async {
    setState(() { busy = true; error = null; });
    try { final result = await widget.api.request('verification', method: 'POST', body: values()) as Map<String, dynamic>; if (mounted) setState(() => verification = result); }
    catch (failure) { if (mounted) setState(() => error = failure.toString()); }
    finally { if (mounted) setState(() => busy = false); }
  }
  Future<void> save() async {
    setState(() { busy = true; error = null; });
    try {
      final fields = values()..remove('companyId')..remove('locationId');
      await widget.api.request('inspections/${widget.inspection['id']}/observations', method: 'POST', body: {
        ...fields, 'observedName': widget.product['name'], 'clientMutationId': mutationId, 'version': widget.inspection['version'],
        'batch': batch.text, 'notes': notes.text, 'conclusion': 'Inspector confirmed physical observation',
      });
      if (mounted) Navigator.of(context).pop();
    } catch (failure) { if (mounted) setState(() => error = failure.toString()); }
    finally { if (mounted) setState(() => busy = false); }
  }
  @override
  Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: const Text('Verify product')), body: ListView(padding: const EdgeInsets.all(20), children: [
    Text(widget.product['name'].toString(), style: Theme.of(context).textTheme.headlineSmall),
    const Text('The server checks authoritative records. A recognition result is not an approval.'),
    DropdownButtonFormField<String>(value: variantId, decoration: const InputDecoration(labelText: 'Exact SKU / variant'), items: (widget.product['variants'] as List<dynamic>).map((dynamic variant) => DropdownMenuItem<String>(value: variant['id'].toString(), child: Text('${variant['name']} · ${variant['sku']}'))).toList(), onChanged: (value) => setState(() { variantId = value; verification = null; })),
    TextField(controller: brand, decoration: const InputDecoration(labelText: 'Observed brand'), onChanged: (_) => setState(() => verification = null)),
    TextField(controller: manufacturer, decoration: const InputDecoration(labelText: 'Observed manufacturer'), onChanged: (_) => setState(() => verification = null)),
    TextField(controller: expiry, decoration: const InputDecoration(labelText: 'Physical expiry (YYYY-MM-DD)'), onChanged: (_) => setState(() => verification = null)),
    TextField(controller: batch, decoration: const InputDecoration(labelText: 'Batch / lot')),
    TextField(controller: notes, decoration: const InputDecoration(labelText: 'Inspector notes'), maxLines: 3),
    SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('I confirm the physical product identity'), value: confirmed, onChanged: (value) => setState(() { confirmed = value; verification = null; })),
    if (error != null) Text(error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
    OutlinedButton(onPressed: busy ? null : verify, child: const Text('Check HAC records')),
    if (verification != null) ...[
      const SizedBox(height: 16),
      Text(verification!['label'].toString(), style: Theme.of(context).textTheme.titleLarge),
      for (final label in (verification!['labels'] as List<dynamic>)) Text('• $label'),
      if (verification!['certificate'] != null) Text('Certificate: ${verification!['certificate']['number']}\nExpiry: ${verification!['certificate']['expiresAt']}'),
      const SizedBox(height: 16),
      FilledButton(onPressed: busy || !confirmed ? null : save, child: const Text('Confirm and save observation')),
    ],
  ]));
}
