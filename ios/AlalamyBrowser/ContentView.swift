import SwiftUI

struct ContentView: View {
    @EnvironmentObject var store: AccountStore
    @State private var open: Account?
    @State private var incognito: BrowserModel?
    @State private var showAdd = false
    @State private var showSettings = false
    @State private var search = ""
    @State private var renaming: Account?
    @State private var newName = ""

    var body: some View {
        NavigationStack {
            List {
                Section {
                    OwnerHeader().listRowBackground(Color.clear)
                }
                Section {
                    TextField("🔍 ابحث أو اكتب عنوانًا", text: $search)
                        .textInputAutocapitalization(.never).autocorrectionDisabled().submitLabel(.go)
                        .onSubmit { openURL(store.url(from: search)); search = "" }
                    HStack {
                        Button { showAdd = true } label: { Label("حساب جديد", systemImage: "plus.circle.fill") }
                            .buttonStyle(.borderedProminent)
                        Spacer()
                        Button { incognito = BrowserModel(account: nil, store: store, incognito: true) } label: {
                            Label("نافذة تصفح متخفي", systemImage: "eyeglasses")
                        }.buttonStyle(.bordered)
                    }
                }
                if let ann = store.announcement {
                    Section {
                        Button { if let u = URL(string: ann.link), !ann.link.isEmpty { UIApplication.shared.open(u) } } label: {
                            Text("📢 " + ann.text)
                        }
                    }
                }
                Section("حساباتك (\(store.accounts.count))") {
                    ForEach(store.accounts) { a in
                        Button { open = a } label: { row(a) }
                            .contextMenu {
                                Button("إعادة تسمية") { newName = a.name; renaming = a }
                                if store.isOpen(a) { Button("إغلاق الحساب") { store.close(a); store.objectWillChange.send() } }
                                Button("مسح بيانات الحساب (تسجيل خروج)") { Task { await store.clearData(a); store.objectWillChange.send() } }
                                Button("حذف الحساب", role: .destructive) { Task { await store.delete(a) } }
                            }
                    }
                    .onDelete { idx in
                        let items = idx.map { store.accounts[$0] }
                        Task { for a in items { await store.delete(a) } }
                    }
                }
                Section {
                    Text("متصفح العالمي \(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "")\nجميع الحقوق محفوظة © Ahmed Gamal Elshafey")
                        .font(.footnote).foregroundStyle(.secondary).frame(maxWidth: .infinity)
                        .multilineTextAlignment(.center)
                }
            }
            .navigationTitle("متصفح العالمي")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { showSettings = true } label: { Image(systemName: "gearshape") }
                }
            }
            .navigationDestination(item: $open) { a in
                BrowserScreen(model: store.browser(for: a), name: a.name, color: a.color)
            }
            .fullScreenCover(item: $incognito) { m in
                BrowserScreen(model: m, name: "خفي", color: .gray)
            }
            .sheet(isPresented: $showAdd) { AddAccountView().environmentObject(store) }
            .sheet(isPresented: $showSettings) { SettingsView().environmentObject(store) }
            .alert("اسم الحساب", isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) {
                TextField("الاسم", text: $newName)
                Button("حفظ") {
                    if let r = renaming, let i = store.accounts.firstIndex(of: r), !newName.isEmpty { store.accounts[i].name = newName }
                    renaming = nil
                }
                Button("إلغاء", role: .cancel) { renaming = nil }
            }
            .onChange(of: store.pendingURL) { _, u in if let u { openURL(u); store.pendingURL = nil } }
            .task { AdBlock.shared.prepare(); await Updater.check(store: store, manual: false) }
        }
    }

    private func row(_ a: Account) -> some View {
        HStack(spacing: 12) {
            Text(String(a.name.prefix(1))).font(.headline).foregroundStyle(.white)
                .frame(width: 40, height: 40).background(Circle().fill(a.color))
            VStack(alignment: .leading) {
                Text(a.name).font(.body.bold()).foregroundStyle(.primary)
                Text(a.service == "custom" ? (a.homeURL.host ?? "") : (Service.named(a.service)?.name ?? ""))
                    .font(.footnote).foregroundStyle(.secondary)
            }
            Spacer()
            if store.isOpen(a) { Text("● مفتوح").font(.caption).foregroundStyle(.green) }
        }
    }

    private func openURL(_ url: URL) {
        guard let first = store.accounts.first else {
            let m = BrowserModel(account: nil, store: store, incognito: true); m.load(url); incognito = m; return
        }
        store.browser(for: first).load(url)
        open = first
    }
}

/// علم مصر بالنسر واسم صاحب المتصفح فوق شعار Google (زي نسخة الكمبيوتر)
struct OwnerHeader: View {
    static let letters = ["G", "o", "o", "g", "l", "e"]
    static let colors: [Color] = [Color(red: 0.26, green: 0.52, blue: 0.96), Color(red: 0.92, green: 0.26, blue: 0.21),
                                  Color(red: 0.98, green: 0.74, blue: 0.02), Color(red: 0.26, green: 0.52, blue: 0.96),
                                  Color(red: 0.20, green: 0.66, blue: 0.33), Color(red: 0.92, green: 0.26, blue: 0.21)]
    var body: some View {
        VStack(spacing: 6) {
            HStack(spacing: 9) {
                Image("EgyptFlag").resizable().scaledToFit().frame(width: 38, height: 25)
                    .clipShape(RoundedRectangle(cornerRadius: 3)).shadow(color: .black.opacity(0.25), radius: 1.5, y: 1)
                Text("Ahmed Gamal Elshafey").font(.headline.weight(.bold))
            }
            .environment(\.layoutDirection, .leftToRight)
            HStack(spacing: 0) {
                ForEach(0..<6, id: \.self) { i in
                    Text(OwnerHeader.letters[i]).foregroundStyle(OwnerHeader.colors[i])
                }
            }
            .font(.system(size: 52, weight: .medium))
            .environment(\.layoutDirection, .leftToRight)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 6)
    }
}

extension BrowserModel: Identifiable {
    nonisolated var id: ObjectIdentifier { ObjectIdentifier(self) }
}

struct AddAccountView: View {
    @EnvironmentObject var store: AccountStore
    @Environment(\.dismiss) private var dismiss
    @State private var service = Service.all[0]
    @State private var name = ""
    @State private var url = ""
    @State private var count = 1

    var body: some View {
        NavigationStack {
            Form {
                Picker("الخدمة", selection: $service) { ForEach(Service.all) { Text($0.name).tag($0) } }
                if service.id == "custom" {
                    TextField("رابط الموقع", text: $url).textInputAutocapitalization(.never).keyboardType(.URL)
                }
                TextField("اسم الحساب (اختياري)", text: $name)
                Stepper("عدد الحسابات: \(count)", value: $count, in: 1...100)
                Text("كل حساب له كوكيز وتخزين منفصل، فتقدر تسجّل دخول بحسابات مختلفة لنفس الموقع.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            .navigationTitle("إضافة حساب")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("إضافة") {
                        let u = service.id == "custom" ? store.url(from: url).absoluteString : ""
                        store.add(service: service, name: name, customURL: u, count: count)
                        dismiss()
                    }.disabled(service.id == "custom" && url.isEmpty)
                }
                ToolbarItem(placement: .cancellationAction) { Button("إلغاء") { dismiss() } }
            }
        }
    }
}

struct SettingsView: View {
    @EnvironmentObject var store: AccountStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Picker("محرك البحث", selection: $store.searchEngine) {
                    Text("Google").tag("google"); Text("Bing").tag("bing"); Text("DuckDuckGo").tag("duck")
                }
                Toggle("منع الإعلانات (يشمل يوتيوب)", isOn: Binding(get: { AdBlock.shared.enabled }, set: { AdBlock.shared.enabled = $0 }))
                Section("السيرفر (للتحديثات والإعلانات)") {
                    TextField("https://example.com", text: $store.serverURL)
                        .textInputAutocapitalization(.never).keyboardType(.URL)
                    Button("البحث عن تحديث") { Task { await Updater.check(store: store, manual: true) } }
                }
            }
            .navigationTitle("الإعدادات")
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("تم") { dismiss() } } }
        }
    }
}
