import SwiftUI

struct ChatSettingsView: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss
    @State private var localChat: Chat

    init(chat: Chat) {
        _localChat = State(initialValue: chat)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Chat Settings")
                .font(.title2)

            MacTextField(text: $localChat.title, placeholder: "Title")

            Picker("Profile", selection: $localChat.profileId) {
                Text("Default").tag(UUID?.none)
                ForEach(appState.data.settings.profiles) { profile in
                    Text(profile.name).tag(Optional(profile.id))
                }
            }

            MacTextField(text: Binding(
                get: { localChat.modelOverride ?? "" },
                set: { localChat.modelOverride = $0.isEmpty ? nil : $0 }
            ), placeholder: "Model Override")

            Spacer()

            HStack {
                Spacer()
                Button("Cancel") { close() }
                Button("Save") {
                    appState.selectedChat = localChat
                    close()
                }
                .keyboardShortcut(.return, modifiers: [])
            }
        }
        .padding(20)
        .frame(minWidth: 420, minHeight: 240)
    }

    private func close() {
        dismiss()
    }
}
