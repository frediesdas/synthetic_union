import SwiftUI
import UniformTypeIdentifiers

struct ChatDetailView: View {
    @EnvironmentObject private var appState: AppState
    @State private var draft: String = ""
    @State private var draftAttachments: [Attachment] = []
    @State private var isShowingChatSettings: Bool = false
    @State private var editingMessage: Message? = nil

    var body: some View {
        VStack(spacing: 0) {
            if let chat = appState.selectedChat {
                ChatHeaderView(chat: chat, isShowingChatSettings: $isShowingChatSettings)
                Divider()
                ChatMessagesView(chat: chat) { message in
                    editingMessage = message
                }
                Divider()
                ChatComposerView(draft: $draft, attachments: $draftAttachments) {
                    let text = draft
                    let attachments = draftAttachments
                    draft = ""
                    draftAttachments = []
                    Task { await appState.sendMessage(text: text, attachments: attachments) }
                }
            } else {
                Text("Select a chat to begin.")
                    .foregroundStyle(.secondary)
            }
        }
        .sheet(isPresented: $isShowingChatSettings) {
            if let chat = appState.selectedChat {
                ChatSettingsView(chat: chat)
                    .environmentObject(appState)
            }
        }
        .alert("Error", isPresented: Binding(get: {
            appState.lastError != nil
        }, set: { newValue in
            if !newValue {
                appState.lastError = nil
            }
        })) {
            Button("OK") { appState.lastError = nil }
        } message: {
            Text(appState.lastError ?? "")
        }
        .sheet(item: $editingMessage) { message in
            MessageEditView(chatId: appState.selectedChatId, message: message)
                .environmentObject(appState)
        }
    }
}

private struct ChatHeaderView: View {
    let chat: Chat
    @Binding var isShowingChatSettings: Bool

    var body: some View {
        HStack {
            VStack(alignment: .leading) {
                Text(chat.title)
                    .font(.title2)
                Text(chat.createdAt, style: .date)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button("Chat Settings") {
                isShowingChatSettings = true
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }
}

private struct ChatMessagesView: View {
    let chat: Chat
    let onEditMessage: (Message) -> Void

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 16) {
                    ForEach(chat.messages) { message in
                        MessageBubbleView(message: message, onEditMessage: onEditMessage)
                            .id(message.id)
                    }
                }
                .padding(20)
            }
            .onChange(of: chat.messages.count) { _ in
                if let last = chat.messages.last {
                    withAnimation {
                        proxy.scrollTo(last.id, anchor: .bottom)
                    }
                }
            }
        }
    }
}

private struct MessageBubbleView: View {
    let message: Message
    let onEditMessage: (Message) -> Void

    var body: some View {
        HStack {
            if message.role == .assistant {
                bubble
                Spacer(minLength: 60)
            } else {
                Spacer(minLength: 60)
                bubble
            }
        }
    }

    private var bubble: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(message.role == .assistant ? "Assistant" : "You")
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(message.content)
                .textSelection(.enabled)
            if !message.attachments.isEmpty {
                Divider()
                ForEach(message.attachments) { attachment in
                    HStack {
                        Text(attachment.type == .image ? "Image" : "PDF")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                        Text(attachment.filename)
                            .font(.caption2)
                    }
                }
            }
        }
        .padding(12)
        .background(message.role == .assistant ? Color(.windowBackgroundColor) : Color.accentColor.opacity(0.15))
        .cornerRadius(12)
        .contextMenu {
            if message.role == .user {
                Button("Edit & Regenerate") {
                    onEditMessage(message)
                }
            }
        }
    }
}

private struct ChatComposerView: View {
    @EnvironmentObject private var appState: AppState
    @Binding var draft: String
    @Binding var attachments: [Attachment]
    let onSend: () -> Void
    @State private var isShowingFilePicker: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if !attachments.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(attachments) { attachment in
                            HStack(spacing: 6) {
                                Text(attachment.type == .image ? "Image" : "PDF")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                Text(attachment.filename)
                                    .font(.caption2)
                                Button {
                                    attachments.removeAll { $0.id == attachment.id }
                                } label: {
                                    Image(systemName: "xmark.circle.fill")
                                }
                                .buttonStyle(.plain)
                            }
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Color.secondary.opacity(0.15))
                            .cornerRadius(6)
                        }
                    }
                }
            }

            TextEditor(text: $draft)
                .frame(minHeight: 80)
                .foregroundStyle(.primary)
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(Color.secondary.opacity(0.3))
                        .allowsHitTesting(false)
                )

            HStack {
                if appState.isSending {
                    ProgressView()
                }
                Button("Attach") {
                    isShowingFilePicker = true
                }
                Spacer()
                Button("Send") {
                    onSend()
                }
                .keyboardShortcut(.return, modifiers: [.command])
                .disabled(appState.isSending || (draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && attachments.isEmpty))
            }
        }
        .padding(16)
        .fileImporter(isPresented: $isShowingFilePicker, allowedContentTypes: [.image, .pdf], allowsMultipleSelection: true) { result in
            switch result {
            case .success(let urls):
                let newAttachments = urls.compactMap { AttachmentBuilder.build(from: $0) }
                attachments.append(contentsOf: newAttachments)
            case .failure:
                break
            }
        }
    }
}

private struct MessageEditView: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss
    let chatId: UUID?
    let message: Message
    @State private var draft: String

    init(chatId: UUID?, message: Message) {
        self.chatId = chatId
        self.message = message
        _draft = State(initialValue: message.content)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Edit Message")
                .font(.title2)
            TextEditor(text: $draft)
                .frame(minHeight: 160)
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(Color.secondary.opacity(0.3))
                        .allowsHitTesting(false)
                )
            HStack {
                Spacer()
                Button("Cancel") { dismiss() }
                Button("Save & Regenerate") {
                    if let chatId {
                        Task { await appState.editMessageAndRegenerate(chatId: chatId, messageId: message.id, newContent: draft) }
                    }
                    dismiss()
                }
            }
        }
        .padding(20)
        .frame(minWidth: 520, minHeight: 320)
    }
}
