import Foundation

struct OpenAIClient {
    enum ClientError: Error, LocalizedError {
        case missingAPIKey
        case invalidResponse
        case apiError(String)

        var errorDescription: String? {
            switch self {
            case .missingAPIKey:
                return "API key is missing."
            case .invalidResponse:
                return "Invalid response from API."
            case .apiError(let message):
                return message
            }
        }
    }

    private let baseURL = URL(string: "https://api.openai.com/v1")!

    func sendChat(model: String, instructions: String, messages: [Message], apiKey: String) async throws -> String {
        guard !apiKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw ClientError.missingAPIKey
        }

        var request = URLRequest(url: baseURL.appendingPathComponent("responses"))
        request.httpMethod = "POST"
        request.addValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")

        let inputMessages: [[String: Any]] = messages.map { message in
            var content: [[String: Any]] = []

            switch message.role {
            case .user:
                let trimmed = message.content.trimmingCharacters(in: .whitespacesAndNewlines)
                let safeText = trimmed.isEmpty ? " " : message.content
                content.append(["type": "input_text", "text": safeText])

                for attachment in message.attachments {
                    switch attachment.type {
                    case .image:
                        let dataURL = "data:\(attachment.mimeType);base64,\(attachment.base64Data)"
                        content.append([
                            "type": "input_image",
                            "image_url": dataURL
                        ])
                    case .pdf:
                        content.append([
                            "type": "input_file",
                            "file_data": attachment.base64Data,
                            "filename": attachment.filename
                        ])
                    }
                }
            case .assistant:
                content.append(["type": "output_text", "text": message.content])
            }

            return [
                "type": "message",
                "role": message.role.rawValue,
                "content": content
            ]
        }

        let body: [String: Any] = [
            "model": model,
            "instructions": instructions,
            "input": inputMessages
        ]

        request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw ClientError.invalidResponse
        }

        if !(200...299).contains(httpResponse.statusCode) {
            if let message = parseAPIError(data: data) {
                throw ClientError.apiError(message)
            }
            throw ClientError.invalidResponse
        }

        if let text = parseOutputText(data: data) {
            return text
        }

        throw ClientError.invalidResponse
    }

    func fetchModels(apiKey: String) async throws -> [String] {
        guard !apiKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw ClientError.missingAPIKey
        }

        var request = URLRequest(url: baseURL.appendingPathComponent("models"))
        request.httpMethod = "GET"
        request.addValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse, (200...299).contains(httpResponse.statusCode) else {
            if let message = parseAPIError(data: data) {
                throw ClientError.apiError(message)
            }
            throw ClientError.invalidResponse
        }

        let decoded = try JSONDecoder().decode(ModelsResponse.self, from: data)
        return decoded.data.map { $0.id }.sorted()
    }

    private func parseOutputText(data: Data) -> String? {
        if let response = try? JSONDecoder().decode(ResponsesAPIResponse.self, from: data) {
            return response.output
                .filter { $0.type == "message" && $0.role == "assistant" }
                .flatMap { $0.content }
                .filter { $0.type == "output_text" }
                .compactMap { $0.text }
                .joined(separator: "\n")
        }
        return nil
    }

    private func parseAPIError(data: Data) -> String? {
        if let error = try? JSONDecoder().decode(APIErrorResponse.self, from: data) {
            return error.error.message
        }
        return nil
    }
}

private struct APIErrorResponse: Decodable {
    struct APIError: Decodable {
        let message: String
    }
    let error: APIError
}

private struct ModelsResponse: Decodable {
    struct Model: Decodable {
        let id: String
    }
    let data: [Model]
}

private struct ResponsesAPIResponse: Decodable {
    struct Output: Decodable {
        let type: String
        let role: String?
        let content: [Content]
    }

    struct Content: Decodable {
        let type: String
        let text: String?
    }

    let output: [Output]
}
