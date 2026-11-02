import SwiftUI
import WebKit

struct Service: Identifiable, Hashable {
    let id: String
    let name: String
    let url: String

    static let all: [Service] = [
        Service(id: "gmail", name: "Gmail", url: "https://mail.google.com/"),
        Service(id: "outlook", name: "Outlook", url: "https://outlook.live.com/mail/"),
        Service(id: "yahoo", name: "Yahoo", url: "https://mail.yahoo.com/"),
        Service(id: "proton", name: "Proton", url: "https://mail.proton.me/"),
        Service(id: "facebook", name: "Facebook", url: "https://m.facebook.com/"),
        Service(id: "instagram", name: "Instagram", url: "https://www.instagram.com/"),
        Service(id: "tiktok", name: "TikTok", url: "https://www.tiktok.com/"),
        Service(id: "snapchat", name: "Snapchat", url: "https://www.snapchat.com/web"),
        Service(id: "twitter", name: "X (تويتر)", url: "https://x.com/"),
        Service(id: "google", name: "Google", url: "https://accounts.google.com/"),
        Service(id: "youtube", name: "YouTube", url: "https://m.youtube.com/"),
        Service(id: "custom", name: "موقع آخر", url: "")
    ]

    static func named(_ id: String) -> Service? { all.first { $0.id == id } }
}

/// حساب = مخزن بيانات WebKit مستقل (كوكيز + تخزين) بمعرّف UUID خاص به.
struct Account: Identifiable, Codable, Hashable {
    var id: UUID = UUID()
    var name: String
    var service: String
    var url: String
    var colorIndex: Int

    var homeURL: URL {
        if let u = URL(string: url), !url.isEmpty { return u }
        return URL(string: Service.named(service)?.url ?? "https://www.google.com/")!
    }

    static let palette: [Color] = [.blue, .red, .green, .orange, .purple, .pink, .teal, .indigo, .brown, .gray]
    var color: Color { Account.palette[colorIndex % Account.palette.count] }
}

@MainActor
final class AccountStore: ObservableObject {
    @Published var accounts: [Account] = [] { didSet { save() } }
    @Published var pendingURL: URL?
    @Published var announcement: (text: String, link: String)?
    @AppStorage("searchEngine") var searchEngine = "google"
    @AppStorage("serverURL") var serverURL = ""

    /// نوافذ التصفح المفتوحة (تبقى حيّة عند التنقل بين الحسابات).
    private(set) var browsers: [UUID: BrowserModel] = [:]
    private let key = "accounts.v1"

    init() {
        if let data = UserDefaults.standard.data(forKey: key),
           let list = try? JSONDecoder().decode([Account].self, from: data) {
            accounts = list
        } else {
            accounts = [Account(name: "التصفح العادي", service: "google", url: "https://www.google.com/", colorIndex: 0)]
        }
    }

    private func save() {
        if let data = try? JSONEncoder().encode(accounts) { UserDefaults.standard.set(data, forKey: key) }
    }

    func add(service: Service, name: String, customURL: String, count: Int) {
        let existing = accounts.filter { $0.service == service.id }.count
        let base = name.isEmpty ? (service.id == "custom" ? (URL(string: customURL)?.host ?? "موقع") : service.name) : name
        for i in 0..<max(1, count) {
            let n = (count <= 1 && existing == 0) ? base : "\(base) \(existing + i + 1)"
            accounts.append(Account(name: n, service: service.id, url: customURL, colorIndex: accounts.count))
        }
    }

    func browser(for account: Account) -> BrowserModel {
        if let b = browsers[account.id] { return b }
        let b = BrowserModel(account: account, store: self)
        browsers[account.id] = b
        return b
    }

    func isOpen(_ account: Account) -> Bool { browsers[account.id] != nil }

    func close(_ account: Account) { browsers[account.id] = nil }

    /// يمسح بيانات الحساب (تسجيل خروج من كل المواقع فيه فقط).
    func clearData(_ account: Account) async {
        browsers[account.id] = nil
        try? await WKWebsiteDataStore.remove(forIdentifier: account.id)
    }

    func delete(_ account: Account) async {
        await clearData(account)
        accounts.removeAll { $0.id == account.id }
    }

    func url(from input: String) -> URL {
        let s = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if let u = URL(string: s), let scheme = u.scheme, ["http", "https"].contains(scheme.lowercased()) { return u }
        if !s.contains(" "), s.contains("."), let u = URL(string: "https://" + s) { return u }
        let q = s.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? s
        switch searchEngine {
        case "bing": return URL(string: "https://www.bing.com/search?q=\(q)")!
        case "duck": return URL(string: "https://duckduckgo.com/?q=\(q)")!
        default: return URL(string: "https://www.google.com/search?q=\(q)")!
        }
    }
}
