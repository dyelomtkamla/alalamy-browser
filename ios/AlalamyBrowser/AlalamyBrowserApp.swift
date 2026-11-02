import SwiftUI

@main
struct AlalamyBrowserApp: App {
    @StateObject private var store = AccountStore()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(store)
                .environment(\.layoutDirection, .rightToLeft)
                .environment(\.locale, Locale(identifier: "ar"))
                .onOpenURL { url in store.pendingURL = url }
        }
    }
}
