import Foundation

enum Role: String, Codable {
    case user
    case assistant
}

enum AttachmentType: String, Codable {
    case image
    case pdf
}

struct Attachment: Identifiable, Codable, Hashable {
    let id: UUID
    let type: AttachmentType
    let filename: String
    let mimeType: String
    let base64Data: String

    init(id: UUID = UUID(), type: AttachmentType, filename: String, mimeType: String, base64Data: String) {
        self.id = id
        self.type = type
        self.filename = filename
        self.mimeType = mimeType
        self.base64Data = base64Data
    }
}

struct Message: Identifiable, Codable, Hashable {
    let id: UUID
    let role: Role
    var content: String
    var attachments: [Attachment]
    let createdAt: Date

    init(id: UUID = UUID(), role: Role, content: String, attachments: [Attachment] = [], createdAt: Date = Date()) {
        self.id = id
        self.role = role
        self.content = content
        self.attachments = attachments
        self.createdAt = createdAt
    }
}

struct Chat: Identifiable, Codable, Hashable {
    let id: UUID
    var title: String
    var createdAt: Date
    var messages: [Message]
    var profileId: UUID?
    var modelOverride: String?

    init(id: UUID = UUID(), title: String = "New Chat", createdAt: Date = Date(), messages: [Message] = [], profileId: UUID? = nil, modelOverride: String? = nil) {
        self.id = id
        self.title = title
        self.createdAt = createdAt
        self.messages = messages
        self.profileId = profileId
        self.modelOverride = modelOverride
    }
}

enum BaseTone: String, CaseIterable, Codable, Identifiable {
    case `default` = "Default"
    case clear = "Clear"
    case concise = "Concise"
    case friendly = "Friendly"
    case formal = "Formal"

    var id: String { rawValue }
}

enum PreferenceLevel: String, CaseIterable, Codable, Identifiable {
    case `default` = "Default"
    case more = "More"
    case less = "Less"
    case off = "Off"

    var id: String { rawValue }
}

struct Personalization: Codable, Hashable {
    var baseTone: BaseTone = .default
    var warm: PreferenceLevel = .default
    var enthusiastic: PreferenceLevel = .default
    var headersAndLists: PreferenceLevel = .default
    var emoji: PreferenceLevel = .default
    var customInstructions: String = ""
}

struct Profile: Identifiable, Codable, Hashable {
    let id: UUID
    var name: String
    var instructions: String
    var attachments: [Attachment]

    init(id: UUID = UUID(), name: String, instructions: String = "", attachments: [Attachment] = []) {
        self.id = id
        self.name = name
        self.instructions = instructions
        self.attachments = attachments
    }
}

struct AppSettings: Codable, Hashable {
    var selectedModel: String = "gpt-4o"
    var personalization: Personalization = Personalization()
    var profiles: [Profile] = [Profile(name: "Default")]
}

struct AppData: Codable, Hashable {
    var settings: AppSettings = AppSettings()
    var chats: [Chat] = []
}
