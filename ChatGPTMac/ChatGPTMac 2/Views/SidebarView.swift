import SwiftUI

struct SidebarView: View {
    @EnvironmentObject private var appState: AppState
    @State private var selectedProfileId: UUID? = nil

    var body: some View {
        VStack(spacing: 0) {
            List(selection: $appState.selectedChatId) {
                Section("Chats") {
                    ForEach(appState.data.chats) { chat in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(chat.title)
                                .font(.headline)
                            Text(chat.createdAt, style: .date)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .tag(chat.id)
                        .contextMenu {
                            Button("Delete") {
                                appState.deleteChat(chat)
                            }
                        }
                    }
                    .onDelete { indices in
                        for index in indices {
                            let chat = appState.data.chats[index]
                            appState.deleteChat(chat)
                        }
                    }
                }
            }
            .listStyle(.sidebar)

            Divider()

            HStack {
                Button {
                    appState.newChat(using: selectedProfileId)
                } label: {
                    Label("New Chat", systemImage: "plus")
                }

                Spacer()

                Button {
                    appState.isShowingSettings = true
                } label: {
                    Image(systemName: "gear")
                }
            }
            .padding(12)
        }
        .toolbar {
            ToolbarItem(placement: .navigation) {
                Picker("Profile", selection: $selectedProfileId) {
                    Text("Default").tag(UUID?.none)
                    ForEach(appState.data.settings.profiles) { profile in
                        Text(profile.name).tag(Optional(profile.id))
                    }
                }
                .frame(maxWidth: 220)
            }
        }
    }
}
