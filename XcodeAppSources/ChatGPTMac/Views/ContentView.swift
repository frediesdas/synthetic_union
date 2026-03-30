import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        NavigationSplitView {
            SidebarView()
        } detail: {
            ChatDetailView()
        }
        .sheet(isPresented: $appState.isShowingSettings) {
            SettingsView()
                .environmentObject(appState)
        }
    }
}
