import Foundation
import SwiftUI

@MainActor
final class AppState: ObservableObject {
    @Published var data: AppData {
        didSet {
            storage.save(data)
        }
    }
    @Published var selectedChatId: UUID?
    @Published var isShowingSettings: Bool = false
    @Published var isSending: Bool = false
    @Published var lastError: String? = nil
    @Published var models: [String] = []

    private let storage = AppStorageManager()
    private let keychain = KeychainStore()
    private let client = OpenAIClient()

    init() {
        let loaded = storage.load()
        self.data = loaded
        if loaded.chats.isEmpty {
            let chat = Chat(title: "New Chat")
            self.data.chats = [chat]
            self.selectedChatId = chat.id
        } else {
            self.selectedChatId = loaded.chats.first?.id
        }
    }

    var selectedChat: Chat? {
        get {
            guard let id = selectedChatId else { return nil }
            return data.chats.first { $0.id == id }
        }
        set {
            guard let updated = newValue else { return }
            if let index = data.chats.firstIndex(where: { $0.id == updated.id }) {
                data.chats[index] = updated
            }
        }
    }

    func apiKey() -> String? {
        keychain.read()
    }

    func updateAPIKey(_ value: String) {
        _ = keychain.write(value)
    }

    func deleteAPIKey() {
        keychain.delete()
    }

    func newChat(using profileId: UUID? = nil) {
        let chat = Chat(title: "New Chat", profileId: profileId)
        data.chats.insert(chat, at: 0)
        selectedChatId = chat.id
    }

    func deleteChat(_ chat: Chat) {
        data.chats.removeAll { $0.id == chat.id }
        if selectedChatId == chat.id {
            selectedChatId = data.chats.first?.id
        }
    }

    func updateChatTitle(_ chatId: UUID, title: String) {
        if let index = data.chats.firstIndex(where: { $0.id == chatId }) {
            data.chats[index].title = title
        }
    }

    func appendMessage(_ message: Message, to chatId: UUID) {
        if let index = data.chats.firstIndex(where: { $0.id == chatId }) {
            data.chats[index].messages.append(message)
            if data.chats[index].messages.count == 1 {
                let prefix = String(message.content.prefix(40))
                let suffix = message.content.count > 40 ? "…" : ""
                data.chats[index].title = prefix + suffix
            }
        }
    }

    func profile(for chat: Chat) -> Profile? {
        guard let id = chat.profileId else { return nil }
        return data.settings.profiles.first { $0.id == id }
    }

    func instructions(for chat: Chat) -> String {
        var parts: [String] = []

        let personalization = data.settings.personalization
        parts.append("Base style and tone: \(personalization.baseTone.rawValue).")

        parts.append("Warm: \(personalization.warm.rawValue).")
        parts.append("Enthusiastic: \(personalization.enthusiastic.rawValue).")
        parts.append("Headers & Lists: \(personalization.headersAndLists.rawValue).")
        parts.append("Emoji: \(personalization.emoji.rawValue).")

        if !personalization.customInstructions.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            parts.append("Custom instructions:\n\(personalization.customInstructions)")
        }

        if let profile = profile(for: chat) {
            if !profile.instructions.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                parts.append("Profile instructions (\(profile.name)):\n\(profile.instructions)")
            }
        }

        return parts.joined(separator: "\n\n")
    }

    private func messagesWithProfileAttachments(for chat: Chat) -> [Message] {
        var messages = chat.messages
        if let profile = profile(for: chat), !profile.attachments.isEmpty {
            let reference = Message(
                role: .user,
                content: "Reference materials attached for this profile.",
                attachments: profile.attachments
            )
            messages.insert(reference, at: 0)
        }
        return messages
    }

    func sendMessage(text: String, attachments: [Attachment]) async {
        guard let chatId = selectedChatId else { return }
        guard var chat = selectedChat else { return }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty && attachments.isEmpty { return }

        let content = trimmed.isEmpty ? " " : trimmed
        let userMessage = Message(role: .user, content: content, attachments: attachments)
        appendMessage(userMessage, to: chatId)
        isSending = true
        lastError = nil

        chat = selectedChat ?? chat

        let model = chat.modelOverride ?? data.settings.selectedModel
        let instructions = instructions(for: chat)
        let allMessages = messagesWithProfileAttachments(for: chat)

        do {
            let responseText = try await client.sendChat(model: model, instructions: instructions, messages: allMessages, apiKey: apiKey() ?? "")
            let assistantMessage = Message(role: .assistant, content: responseText)
            appendMessage(assistantMessage, to: chatId)
        } catch {
            lastError = error.localizedDescription
        }

        isSending = false
    }

    func editMessageAndRegenerate(chatId: UUID, messageId: UUID, newContent: String) async {
        guard let index = data.chats.firstIndex(where: { $0.id == chatId }) else { return }
        guard let messageIndex = data.chats[index].messages.firstIndex(where: { $0.id == messageId }) else { return }

        let trimmed = newContent.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return }

        data.chats[index].messages[messageIndex].content = trimmed
        let keep = Array(data.chats[index].messages.prefix(messageIndex + 1))
        data.chats[index].messages = keep
        selectedChatId = data.chats[index].id

        let chat = data.chats[index]
        let model = chat.modelOverride ?? data.settings.selectedModel
        let instructions = instructions(for: chat)
        let allMessages = messagesWithProfileAttachments(for: chat)

        isSending = true
        lastError = nil

        do {
            let responseText = try await client.sendChat(model: model, instructions: instructions, messages: allMessages, apiKey: apiKey() ?? "")
            let assistantMessage = Message(role: .assistant, content: responseText)
            appendMessage(assistantMessage, to: chatId)
        } catch {
            lastError = error.localizedDescription
        }

        isSending = false
    }

    func refreshModels() async {
        do {
            let apiKey = apiKey() ?? ""
            let fetched = try await client.fetchModels(apiKey: apiKey)
            models = fetched
        } catch {
            lastError = error.localizedDescription
        }
    }
}
