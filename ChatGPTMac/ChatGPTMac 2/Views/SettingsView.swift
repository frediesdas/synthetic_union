import SwiftUI
import UniformTypeIdentifiers

struct SettingsView: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss

    @State private var apiKeyInput: String = ""
    @State private var isShowingProfileEditor: Bool = false
    @State private var editingProfile: Profile? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack {
                Text("Settings")
                    .font(.title2)
                Spacer()
                Button("Done") { dismiss() }
            }

            Form {
                Section("API Key") {
                    MacTextField(text: $apiKeyInput, placeholder: "OpenAI API Key", isSecure: true)
                        .onAppear { apiKeyInput = appState.apiKey() ?? "" }

                    HStack {
                        Button("Save Key") {
                            appState.updateAPIKey(apiKeyInput)
                        }
                        Button("Delete Key") {
                            appState.deleteAPIKey()
                            apiKeyInput = ""
                        }
                    }
                }

                Section("Model") {
                    MacTextField(text: $appState.data.settings.selectedModel, placeholder: "Default model")

                    HStack {
                        Button("Refresh Models") {
                            Task { await appState.refreshModels() }
                        }
                        Spacer()
                        if !appState.models.isEmpty {
                            Menu("Choose") {
                                ForEach(appState.models, id: \.self) { model in
                                    Button(model) {
                                        appState.data.settings.selectedModel = model
                                    }
                                }
                            }
                        }
                    }
                }

                Section("Personalization") {
                    Picker("Base style and tone", selection: $appState.data.settings.personalization.baseTone) {
                        ForEach(BaseTone.allCases) { tone in
                            Text(tone.rawValue).tag(tone)
                        }
                    }

                    Picker("Warm", selection: $appState.data.settings.personalization.warm) {
                        ForEach(PreferenceLevel.allCases) { level in
                            Text(level.rawValue).tag(level)
                        }
                    }

                    Picker("Enthusiastic", selection: $appState.data.settings.personalization.enthusiastic) {
                        ForEach(PreferenceLevel.allCases) { level in
                            Text(level.rawValue).tag(level)
                        }
                    }

                    Picker("Headers & Lists", selection: $appState.data.settings.personalization.headersAndLists) {
                        ForEach(PreferenceLevel.allCases) { level in
                            Text(level.rawValue).tag(level)
                        }
                    }

                    Picker("Emoji", selection: $appState.data.settings.personalization.emoji) {
                        ForEach(PreferenceLevel.allCases) { level in
                            Text(level.rawValue).tag(level)
                        }
                    }

                    TextEditor(text: $appState.data.settings.personalization.customInstructions)
                        .frame(minHeight: 120)
                        .foregroundStyle(.primary)
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(Color.secondary.opacity(0.3))
                                .allowsHitTesting(false)
                        )
                }

                Section("GPT Profiles") {
                    List {
                        ForEach(appState.data.settings.profiles) { profile in
                            HStack {
                                VStack(alignment: .leading) {
                                    Text(profile.name)
                                        .font(.headline)
                                    Text(profile.instructions)
                                        .lineLimit(2)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                Button("Edit") {
                                    editingProfile = profile
                                    isShowingProfileEditor = true
                                }
                            }
                        }
                        .onDelete { indices in
                            appState.data.settings.profiles.remove(atOffsets: indices)
                        }
                    }

                    Button("Add Profile") {
                        editingProfile = nil
                        isShowingProfileEditor = true
                    }
                }
            }
        }
        .padding(20)
        .frame(minWidth: 720, minHeight: 640)
        .sheet(isPresented: $isShowingProfileEditor) {
            ProfileEditorView(profile: editingProfile) { result in
                if let result {
                    if let index = appState.data.settings.profiles.firstIndex(where: { $0.id == result.id }) {
                        appState.data.settings.profiles[index] = result
                    } else {
                        appState.data.settings.profiles.append(result)
                    }
                }
            }
        }
    }
}

private struct ProfileEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var draft: Profile
    let onSave: (Profile?) -> Void
    @State private var isShowingFilePicker: Bool = false

    init(profile: Profile?, onSave: @escaping (Profile?) -> Void) {
        _draft = State(initialValue: profile ?? Profile(name: "New Profile"))
        self.onSave = onSave
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Profile")
                .font(.title2)
            MacTextField(text: $draft.name, placeholder: "Name")
            TextEditor(text: $draft.instructions)
                .frame(minHeight: 180)
                .foregroundStyle(.primary)
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(Color.secondary.opacity(0.3))
                        .allowsHitTesting(false)
                )
            if !draft.attachments.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Profile Attachments")
                        .font(.headline)
                    ForEach(draft.attachments) { attachment in
                        HStack {
                            Text(attachment.type == .image ? "Image" : "PDF")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                            Text(attachment.filename)
                                .font(.caption2)
                            Spacer()
                            Button {
                                draft.attachments.removeAll { $0.id == attachment.id }
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            Button("Add Profile Attachments") {
                isShowingFilePicker = true
            }

            Spacer()

            HStack {
                Spacer()
                Button("Cancel") {
                    dismiss()
                }
                Button("Save") {
                    onSave(draft)
                    dismiss()
                }
                .keyboardShortcut(.return, modifiers: [])
            }
        }
        .padding(20)
        .frame(minWidth: 520, minHeight: 360)
        .fileImporter(isPresented: $isShowingFilePicker, allowedContentTypes: [.image, .pdf], allowsMultipleSelection: true) { result in
            switch result {
            case .success(let urls):
                let newAttachments = urls.compactMap { AttachmentBuilder.build(from: $0) }
                draft.attachments.append(contentsOf: newAttachments)
            case .failure:
                break
            }
        }
    }
}
