import SwiftUI

/// يسأل سيرفر المتصفح عن آخر إصدار والإعلان (لوحة التحكم /admin تتحكم فيهما).
enum Updater {
    /// اكتب هنا رابط السيرفر بعد النشر ليعمل تلقائيًا (أو من الإعدادات داخل التطبيق).
    static let defaultServer = "https://alalamy-browser.a7medxml.workers.dev"

    struct Info: Decodable {
        struct Ann: Decodable { let text: String; let link: String? }
        let version: String?
        let versionCode: Int?
        let url: String?
        let notes: String?
        let announcement: Ann?
    }

    @MainActor
    static func check(store: AccountStore, manual: Bool) async {
        var server = store.serverURL.isEmpty ? defaultServer : store.serverURL
        while server.hasSuffix("/") { server.removeLast() }
        guard !server.isEmpty, let url = URL(string: server + "/api/app?platform=ios") else {
            if manual { Alerts.show(message: "اكتب عنوان السيرفر أولًا", cancel: false) { _ in } }
            return
        }
        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            let info = try JSONDecoder().decode(Info.self, from: data)
            if let a = info.announcement { store.announcement = (a.text, a.link ?? "") } else { store.announcement = nil }
            let current = Int(Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1") ?? 1
            if let code = info.versionCode, code > current, let link = info.url, let dl = URL(string: link), !link.isEmpty {
                Alerts.show(message: "تحديث جديد \(info.version ?? ""):\n\(info.notes ?? "")", cancel: true) { ok in
                    if ok { UIApplication.shared.open(dl) }
                }
            } else if manual {
                Alerts.show(message: "أنت تستخدم أحدث إصدار", cancel: false) { _ in }
            }
        } catch {
            if manual { Alerts.show(message: "تعذر الاتصال بالسيرفر", cancel: false) { _ in } }
        }
    }
}
