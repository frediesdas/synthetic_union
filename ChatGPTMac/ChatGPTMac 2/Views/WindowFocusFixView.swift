import SwiftUI
import AppKit

struct WindowFocusFixView: NSViewRepresentable {
    func makeNSView(context: Context) -> NSView {
        let view = FocusFixNSView()
        return view
    }

    func updateNSView(_ nsView: NSView, context: Context) {}
}

final class FocusFixNSView: NSView {
    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        window?.makeKey()
        window?.makeFirstResponder(nil)
    }
}
