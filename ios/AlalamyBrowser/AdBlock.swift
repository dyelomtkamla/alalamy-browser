import Foundation
import WebKit

/// مانع الإعلانات (نفس قوائم نسخة الأندرويد): حظر نطاقات الإعلانات بـ WKContentRuleList،
/// وإخفاء أماكن الإعلانات بـ CSS، وتخطي إعلانات يوتيوب. يمكن السماح بالإعلانات لموقع معيّن.
@MainActor
final class AdBlock {
    static let shared = AdBlock()
    nonisolated private static let ruleId = "alalamy-ads-1"

    private(set) var rules: WKContentRuleList?
    private var onReady: [(WKContentRuleList) -> Void] = []
    private lazy var css: String = AdBlock.resource("ad_css", "txt")
    private lazy var ytShield: String = AdBlock.resource("yt_shield", "txt")

    var enabled: Bool {
        get { UserDefaults.standard.object(forKey: "adblock") as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: "adblock") }
    }

    var allowed: Set<String> {
        get { Set(UserDefaults.standard.stringArray(forKey: "adAllow") ?? []) }
        set { UserDefaults.standard.set(Array(newValue), forKey: "adAllow") }
    }

    static func site(_ url: URL?) -> String {
        guard var h = url?.host?.lowercased() else { return "" }
        for p in ["www.", "m."] where h.hasPrefix(p) { h.removeFirst(p.count) }
        return h
    }

    func isAllowed(_ url: URL?) -> Bool {
        let h = AdBlock.site(url)
        return !h.isEmpty && allowed.contains { h == $0 || h.hasSuffix("." + $0) }
    }

    func toggleAllowed(_ url: URL?) {
        let h = AdBlock.site(url)
        guard !h.isEmpty else { return }
        var s = allowed
        if s.contains(h) { s.remove(h) } else { s.insert(h) }
        allowed = s
    }

    private static func resource(_ name: String, _ ext: String) -> String {
        guard let u = Bundle.main.url(forResource: name, withExtension: ext),
              let s = try? String(contentsOf: u, encoding: .utf8) else { return "" }
        return s
    }

    /// يجهّز قائمة الحظر مرة واحدة (تُحفظ مترجمة بعد أول تشغيل).
    func prepare() {
        guard let store = WKContentRuleListStore.default() else { return }
        store.lookUpContentRuleList(forIdentifier: AdBlock.ruleId) { list, _ in
            if let list {
                Task { @MainActor in AdBlock.shared.ready(list) }
                return
            }
            DispatchQueue.global(qos: .utility).async {
                guard let u = Bundle.main.url(forResource: "ad_rules", withExtension: "json"),
                      let json = try? String(contentsOf: u, encoding: .utf8) else { return }
                DispatchQueue.main.async {
                    store.compileContentRuleList(forIdentifier: AdBlock.ruleId, encodedContentRuleList: json) { list, _ in
                        if let list { Task { @MainActor in AdBlock.shared.ready(list) } }
                    }
                }
            }
        }
    }

    private func ready(_ list: WKContentRuleList) {
        rules = list
        let waiting = onReady
        onReady = []
        for f in waiting { f(list) }
    }

    /// يطبّق الحظر على نافذة (يُستدعى عند إنشائها وعند تغيير السماح).
    func apply(to webView: WKWebView, page: URL?) {
        let ucc = webView.configuration.userContentController
        ucc.removeAllUserScripts()
        ucc.removeAllContentRuleLists()
        guard enabled, !isAllowed(page) else { return }
        let allowJSON = (try? String(data: JSONSerialization.data(withJSONObject: Array(allowed)), encoding: .utf8)) ?? "[]"
        let cssJSON = (try? String(data: JSONSerialization.data(withJSONObject: [css]), encoding: .utf8)) ?? "[\"\"]"
        let guardJS = "var __ah=location.hostname.replace(/^(www|m)\\./,'');var __al=\(allowJSON).some(function(d){return __ah===d||__ah.endsWith('.'+d)});"
        let cssJS = "(function(){\(guardJS)if(__al)return;var add=function(){if(document.getElementById('__alalamy_ab'))return;var s=document.createElement('style');s.id='__alalamy_ab';s.textContent=\(cssJSON)[0];(document.head||document.documentElement).appendChild(s);};add();document.addEventListener('DOMContentLoaded',add);})();"
        ucc.addUserScript(WKUserScript(source: cssJS, injectionTime: .atDocumentStart, forMainFrameOnly: false))
        if !ytShield.isEmpty {
            let yt = "(function(){if(!/(^|\\.)youtube\\.com$/.test(location.hostname))return;\(guardJS)if(__al)return;\n\(ytShield)\n})();"
            ucc.addUserScript(WKUserScript(source: yt, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        if let rules {
            ucc.add(rules)
        } else {
            onReady.append { [weak webView] list in webView?.configuration.userContentController.add(list) }
        }
    }
}
