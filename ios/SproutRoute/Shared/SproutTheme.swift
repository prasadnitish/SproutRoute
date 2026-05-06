import SwiftUI
import UIKit

enum SproutTheme {
    static let canvas = adaptive(light: UIColor(red: 0.97, green: 0.94, blue: 0.88, alpha: 1), dark: UIColor(red: 0.08, green: 0.09, blue: 0.10, alpha: 1))
    static let surface = adaptive(light: UIColor(red: 1.00, green: 0.98, blue: 0.94, alpha: 1), dark: UIColor(red: 0.14, green: 0.15, blue: 0.16, alpha: 1))
    static let elevatedSurface = adaptive(light: UIColor(red: 0.94, green: 0.90, blue: 0.83, alpha: 1), dark: UIColor(red: 0.19, green: 0.20, blue: 0.21, alpha: 1))
    static let primaryText = adaptive(light: UIColor(red: 0.10, green: 0.13, blue: 0.16, alpha: 1), dark: UIColor(red: 0.96, green: 0.94, blue: 0.88, alpha: 1))
    static let secondaryText = adaptive(light: UIColor(red: 0.31, green: 0.36, blue: 0.40, alpha: 1), dark: UIColor(red: 0.76, green: 0.73, blue: 0.66, alpha: 1))
    static let tertiaryText = adaptive(light: UIColor(red: 0.47, green: 0.50, blue: 0.52, alpha: 1), dark: UIColor(red: 0.58, green: 0.58, blue: 0.56, alpha: 1))
    static let accent = Color(red: 0.11, green: 0.45, blue: 0.53)
    static let accentWarm = Color(red: 0.78, green: 0.37, blue: 0.26)
    static let accentSoft = adaptive(light: UIColor(red: 0.82, green: 0.92, blue: 0.91, alpha: 1), dark: UIColor(red: 0.10, green: 0.28, blue: 0.31, alpha: 1))
    static let warning = Color(red: 0.84, green: 0.54, blue: 0.18)
    static let danger = Color(red: 0.82, green: 0.23, blue: 0.24)

    static let sproutDark = accent
    static let sproutBase = accent
    static let sproutLight = accentSoft
    static let warmWhite = canvas
    static let slateText = primaryText
    static let muted = secondaryText

    static let cardRadius: CGFloat = 18
    static let compactRadius: CGFloat = 12

    private static func adaptive(light: UIColor, dark: UIColor) -> Color {
        Color(UIColor { traits in
            traits.userInterfaceStyle == .dark ? dark : light
        })
    }
}

struct NativeCard<Content: View>: View {
    let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        content
            .padding(16)
            .background(SproutTheme.surface, in: RoundedRectangle(cornerRadius: SproutTheme.cardRadius, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: SproutTheme.cardRadius, style: .continuous)
                    .stroke(SproutTheme.primaryText.opacity(0.08), lineWidth: 1)
            }
            .shadow(color: .black.opacity(0.10), radius: 14, y: 6)
    }
}

struct NativeGlassSurface: ViewModifier {
    let isInteractive: Bool

    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content
                .glassEffect(
                    isInteractive ? .regular.interactive() : .regular,
                    in: .rect(cornerRadius: SproutTheme.cardRadius)
                )
        } else {
            content
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: SproutTheme.cardRadius, style: .continuous))
        }
    }
}

extension View {
    func sproutGlass(interactive: Bool = false) -> some View {
        modifier(NativeGlassSurface(isInteractive: interactive))
    }
}
