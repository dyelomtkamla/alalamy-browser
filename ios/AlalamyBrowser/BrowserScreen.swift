import SwiftUI
import WebKit

struct WebViewHost: UIViewRepresentable {
    let webView: WKWebView
    func makeUIView(context: Context) -> WKWebView { webView }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

struct BrowserScreen: View {
    @ObservedObject var model: BrowserModel
    let name: String
    let color: Color
    @Environment(\.dismiss) private var dismiss
    @State private var editing = ""
    @FocusState private var focused: Bool
    @State private var showShare = false

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Button { dismiss() } label: {
                    Text(String(name.prefix(1))).font(.headline).foregroundStyle(.white)
                        .frame(width: 32, height: 32).background(Circle().fill(model.incognito ? Color.gray : color))
                }
                TextField("ابحث أو اكتب عنوانًا", text: $editing)
                    .textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.webSearch)
                    .submitLabel(.go).focused($focused)
                    .environment(\.layoutDirection, .leftToRight)
                    .padding(.horizontal, 14).frame(height: 40)
                    .background(Capsule().fill(Color(.secondarySystemBackground)))
                    .onSubmit { model.go(editing); focused = false }
                Button { model.isLoading ? model.webView.stopLoading() : model.webView.reload() } label: {
                    Image(systemName: model.isLoading ? "xmark" : "arrow.clockwise")
                }.frame(width: 36)
            }
            .padding(8)
            .background(model.incognito ? Color(.systemGray5) : Color(.systemBackground))

            ProgressView(value: model.progress).opacity(model.isLoading ? 1 : 0).frame(height: 2)

            WebViewHost(webView: model.webView)

            HStack {
                Button { model.webView.goBack() } label: { Image(systemName: "chevron.left") }.disabled(!model.canGoBack)
                Spacer()
                Button { model.webView.goForward() } label: { Image(systemName: "chevron.right") }.disabled(!model.canGoForward)
                Spacer()
                Button { if let a = model.account { model.load(a.homeURL) } } label: { Image(systemName: "house") }
                Spacer()
                Button { showShare = true } label: { Image(systemName: "square.and.arrow.up") }
                Spacer()
                Menu {
                    Button { model.translate() } label: { Label("ترجمة الصفحة للعربية", systemImage: "globe") }
                    Button { model.toggleDesktop() } label: {
                        Label(model.desktopMode ? "وضع الموبايل" : "وضع سطح المكتب", systemImage: "desktopcomputer")
                    }
                    Button { model.toggleAdsHere() } label: {
                        Label(model.adsAllowed ? "منع الإعلانات في هذا الموقع" : "السماح بالإعلانات في هذا الموقع", systemImage: "shield.lefthalf.filled")
                    }
                    Button { UIPasteboard.general.string = model.urlText } label: { Label("نسخ الرابط", systemImage: "doc.on.doc") }
                    Button { model.webView.reload() } label: { Label("إعادة تحميل", systemImage: "arrow.clockwise") }
                    Button {
                        model.webView.isFindInteractionEnabled = true
                        model.webView.findInteraction?.presentFindNavigator(showingReplace: false)
                    } label: { Label("بحث في الصفحة", systemImage: "doc.text.magnifyingglass") }
                    Button {
                        let pc = UIPrintInteractionController.shared
                        let info = UIPrintInfo(dictionary: nil)
                        info.jobName = model.webView.title ?? "صفحة"
                        pc.printInfo = info
                        pc.printFormatter = model.webView.viewPrintFormatter()
                        pc.present(animated: true)
                    } label: { Label("طباعة / PDF", systemImage: "printer") }
                    Button(role: .destructive) { dismiss() } label: { Label("رجوع للحسابات", systemImage: "square.grid.2x2") }
                } label: { Image(systemName: "ellipsis.circle") }
            }
            .environment(\.layoutDirection, .leftToRight)
            .font(.title3).padding(.horizontal, 24).padding(.vertical, 10)
            .background(Color(.systemBackground))
        }
        .onChange(of: model.urlText) { _, new in if !focused { editing = new } }
        .onAppear { editing = model.urlText }
        .sheet(isPresented: $showShare) {
            if let u = model.webView.url { ShareSheet(items: [u]) }
        }
        .toolbar(.hidden, for: .navigationBar)
    }
}

struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }
    func updateUIViewController(_ vc: UIActivityViewController, context: Context) {}
}
