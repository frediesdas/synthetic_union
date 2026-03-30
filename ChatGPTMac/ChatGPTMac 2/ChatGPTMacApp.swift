import SwiftUI

@main
struct ChatGPTMacApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(appState)
                .background(WindowFocusFixView())
                .frame(minWidth: 980, minHeight: 680)
        }
        .commands {
            CommandGroup(after: .appInfo) {
                Button("Settings") {
                    appState.isShowingSettings = true
                }
                .keyboardShortcut(",", modifiers: .command)
            }
        }
    }
}
