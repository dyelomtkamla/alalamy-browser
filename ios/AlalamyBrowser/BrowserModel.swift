import SwiftUI
import WebKit

/// نافذة تصفح لحساب واحد. كل حساب له WKWebsiteDataStore(forIdentifier:) منفصل (iOS 17+)،
/// والتصفح الخفي يستخدم مخزنًا غير دائم يُمسح عند الإغلاق.
@MainActor
final class BrowserModel: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate {
    let account: Account?
    let incognito: Bool
    let webView: WKWebView
    @Published var urlText = ""
    @Published var title = ""
    @Published var progress: Double = 0
    @Published var canGoBack = false
    @Published var canGoForward = false
    @Published var isLoading = false
    @Published var desktopMode = false
    @Published var adsAllowed = false
    private var observers: [NSKeyValueObservation] = []
    private weak var store: AccountStore?

    init(account: Account?, store: AccountStore, incognito: Bool = false) {
        self.account = account
        self.incognito = incognito
        self.store = store
        let config = WKWebViewConfiguration()
        if incognito || account == nil {
            config.websiteDataStore = .nonPersistent()
        } else {
            config.websiteDataStore = WKWebsiteDataStore(forIdentifier: account!.id)
        }
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.defaultWebpagePreferences.allowsContentJavaScript = true
        webView = WKWebView(frame: .zero, configuration: config)
        webView.allowsBackForwardNavigationGestures = true
        webView.isInspectable = false
        super.init()
        webView.navigationDelegate = self
        webView.uiDelegate = self
        observers = [
            webView.observe(\.estimatedProgress) { [weak self] w, _ in Task { @MainActor in self?.progress = w.estimatedProgress } },
            webView.observe(\.url) { [weak self] w, _ in Task { @MainActor in self?.urlText = w.url?.absoluteString ?? "" } },
            webView.observe(\.title) { [weak self] w, _ in Task { @MainActor in self?.title = w.title ?? "" } },
            webView.observe(\.canGoBack) { [weak self] w, _ in Task { @MainActor in self?.canGoBack = w.canGoBack } },
            webView.observe(\.canGoForward) { [weak self] w, _ in Task { @MainActor in self?.canGoForward = w.canGoForward } },
            webView.observe(\.isLoading) { [weak self] w, _ in Task { @MainActor in self?.isLoading = w.isLoading } }
        ]
        let home = account?.homeURL ?? URL(string: "https://duckduckgo.com/")!
        refreshAdBlock(for: home, force: true)
        load(home)
    }

    /// يعيد تطبيق مانع الإعلانات لو الموقع الجديد مسموح له بالإعلانات أو العكس.
    func refreshAdBlock(for url: URL?, force: Bool = false) {
        let allowed = AdBlock.shared.isAllowed(url)
        if force || allowed != adsAllowed {
            adsAllowed = allowed
            AdBlock.shared.apply(to: webView, page: url)
        }
    }

    func toggleAdsHere() {
        AdBlock.shared.toggleAllowed(webView.url)
        refreshAdBlock(for: webView.url, force: true)
        webView.reload()
    }

    func load(_ url: URL) { webView.load(URLRequest(url: url)) }

    func go(_ input: String) {
        guard let store else { return }
        load(store.url(from: input))
    }

    func translate() {
        guard let u = webView.url, u.scheme?.hasPrefix("http") == true else { return }
        let enc = u.absoluteString.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? ""
        load(URL(string: "https://translate.google.com/translate?sl=auto&tl=ar&hl=ar&u=\(enc)")!)
    }

    func toggleDesktop() {
        desktopMode.toggle()
        webView.customUserAgent = desktopMode
            ? "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
            : nil
        webView.reload()
    }

    // روابط target=_blank تفتح في نفس النافذة
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if navigationAction.targetFrame == nil { webView.load(navigationAction.request) }
        return nil
    }

    // الروابط الخاصة (tel:, mailto:, whatsapp:, ...) تفتح في تطبيقاتها
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = navigationAction.request.url, let scheme = url.scheme?.lowercased(),
           !["http", "https", "about", "data", "blob", "file"].contains(scheme) {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        if navigationAction.shouldPerformDownload { decisionHandler(.download); return }
        if navigationAction.targetFrame?.isMainFrame == true { refreshAdBlock(for: navigationAction.request.url) }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        decisionHandler(navigationResponse.canShowMIMEType ? .allow : .download)
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = DownloadHandler.shared
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = DownloadHandler.shared
    }

    // نوافذ JavaScript
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        Alerts.show(message: message, cancel: false) { _ in completionHandler() }
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        Alerts.show(message: message, cancel: true, completion: completionHandler)
    }
}

/// يحفظ الملفات المنزّلة في مجلد "الملفات" الخاص بالتطبيق (يظهر في تطبيق الملفات).
final class DownloadHandler: NSObject, WKDownloadDelegate {
    static let shared = DownloadHandler()

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse,
                  suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        var dest = dir.appendingPathComponent(suggestedFilename)
        var i = 1
        while FileManager.default.fileExists(atPath: dest.path) {
            dest = dir.appendingPathComponent("\(i)-\(suggestedFilename)"); i += 1
        }
        completionHandler(dest)
    }

    func downloadDidFinish(_ download: WKDownload) {
        Task { @MainActor in Alerts.show(message: "تم التنزيل. ستجده في تطبيق الملفات ← على الـ iPhone ← متصفح العالمي", cancel: false) { _ in } }
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        Task { @MainActor in Alerts.show(message: "فشل التنزيل: \(error.localizedDescription)", cancel: false) { _ in } }
    }
}

@MainActor
enum Alerts {
    static func show(message: String, cancel: Bool, completion: @escaping (Bool) -> Void) {
        let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "حسنًا", style: .default) { _ in completion(true) })
        if cancel { a.addAction(UIAlertAction(title: "إلغاء", style: .cancel) { _ in completion(false) }) }
        guard let root = UIApplication.shared.connectedScenes.compactMap({ ($0 as? UIWindowScene)?.keyWindow }).first?.rootViewController else {
            completion(false); return
        }
        var top = root
        while let p = top.presentedViewController { top = p }
        top.present(a, animated: true)
    }
}
