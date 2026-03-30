import Foundation
import UniformTypeIdentifiers

enum AttachmentBuilder {
    static func build(from url: URL) -> Attachment? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        let ext = url.pathExtension.lowercased()
        let type = UTType(filenameExtension: ext)

        if type?.conforms(to: .image) == true {
            let mime = type?.preferredMIMEType ?? defaultImageMime(for: ext)
            return Attachment(type: .image, filename: url.lastPathComponent, mimeType: mime, base64Data: data.base64EncodedString())
        }

        if type?.conforms(to: .pdf) == true || ext == "pdf" {
            return Attachment(type: .pdf, filename: url.lastPathComponent, mimeType: "application/pdf", base64Data: data.base64EncodedString())
        }

        return nil
    }

    private static func defaultImageMime(for ext: String) -> String {
        switch ext {
        case "jpg", "jpeg":
            return "image/jpeg"
        case "png":
            return "image/png"
        case "gif":
            return "image/gif"
        case "webp":
            return "image/webp"
        default:
            return "image/png"
        }
    }
}
