import SwiftUI
import UIKit

enum SproutTheme {
    struct DesignLanguage: Equatable {
        let name: String
        let mood: String
        let componentShape: String
        let surfaceStrategy: String
    }

    struct Spacing: Equatable {
        let unit: CGFloat = 4
        let xs: CGFloat = 6
        let sm: CGFloat = 10
        let md: CGFloat = 14
        let lg: CGFloat = 18
        let xl: CGFloat = 24
        let xxl: CGFloat = 32
    }

    struct ContrastPair: Equatable {
        let name: String
        let ratio: Double
    }

    static let designLanguage = DesignLanguage(
        name: "Atlas Journey",
        mood: "premium family travel",
        componentShape: "soft geometric",
        surfaceStrategy: "layered material"
    )

    static let brandAccentNames = ["Lagoon", "Coral", "Violet", "Leaf"]
    static let minimumTouchTarget: CGFloat = 48
    static let spacing = Spacing()

    private static let lightCanvas = UIColor(red: 0.96, green: 0.98, blue: 0.97, alpha: 1)
    private static let darkCanvas = UIColor(red: 0.03, green: 0.05, blue: 0.06, alpha: 1)
    private static let lightSurface = UIColor(red: 1.00, green: 0.99, blue: 0.96, alpha: 1)
    private static let darkSurface = UIColor(red: 0.08, green: 0.10, blue: 0.11, alpha: 1)
    private static let lightElevatedSurface = UIColor(red: 0.91, green: 0.96, blue: 0.94, alpha: 1)
    private static let darkElevatedSurface = UIColor(red: 0.13, green: 0.16, blue: 0.16, alpha: 1)
    private static let lightPrimaryText = UIColor(red: 0.05, green: 0.09, blue: 0.11, alpha: 1)
    private static let darkPrimaryText = UIColor(red: 0.95, green: 0.97, blue: 0.94, alpha: 1)
    private static let lightSecondaryText = UIColor(red: 0.22, green: 0.30, blue: 0.33, alpha: 1)
    private static let darkSecondaryText = UIColor(red: 0.77, green: 0.83, blue: 0.80, alpha: 1)
    private static let lightTertiaryText = UIColor(red: 0.31, green: 0.39, blue: 0.40, alpha: 1)
    private static let darkTertiaryText = UIColor(red: 0.70, green: 0.77, blue: 0.74, alpha: 1)
    private static let lightAccent = UIColor(red: 0.00, green: 0.38, blue: 0.45, alpha: 1)
    private static let darkAccent = UIColor(red: 0.43, green: 0.86, blue: 0.88, alpha: 1)
    private static let lightActionFill = UIColor(red: 0.00, green: 0.39, blue: 0.45, alpha: 1)
    private static let darkActionFill = UIColor(red: 0.00, green: 0.33, blue: 0.38, alpha: 1)
    private static let lightWarmAccent = UIColor(red: 0.66, green: 0.24, blue: 0.14, alpha: 1)
    private static let darkWarmAccent = UIColor(red: 1.00, green: 0.70, blue: 0.55, alpha: 1)
    private static let lightVioletAccent = UIColor(red: 0.30, green: 0.28, blue: 0.64, alpha: 1)
    private static let darkVioletAccent = UIColor(red: 0.72, green: 0.70, blue: 1.00, alpha: 1)
    private static let lightLeafAccent = UIColor(red: 0.11, green: 0.42, blue: 0.27, alpha: 1)
    private static let darkLeafAccent = UIColor(red: 0.55, green: 0.86, blue: 0.65, alpha: 1)
    private static let heroLagoon = UIColor(red: 0.00, green: 0.34, blue: 0.41, alpha: 1)
    private static let heroViolet = UIColor(red: 0.25, green: 0.24, blue: 0.56, alpha: 1)
    private static let heroCoral = UIColor(red: 0.58, green: 0.21, blue: 0.16, alpha: 1)
    private static let lightAccentSoft = UIColor(red: 0.82, green: 0.94, blue: 0.92, alpha: 1)
    private static let darkAccentSoft = UIColor(red: 0.08, green: 0.24, blue: 0.26, alpha: 1)
    private static let lightWarmSoft = UIColor(red: 0.98, green: 0.87, blue: 0.80, alpha: 1)
    private static let darkWarmSoft = UIColor(red: 0.32, green: 0.15, blue: 0.12, alpha: 1)
    private static let lightVioletSoft = UIColor(red: 0.89, green: 0.88, blue: 0.98, alpha: 1)
    private static let darkVioletSoft = UIColor(red: 0.16, green: 0.15, blue: 0.34, alpha: 1)
    private static let lightFieldSurface = UIColor(red: 0.93, green: 0.98, blue: 0.96, alpha: 1)
    private static let darkFieldSurface = UIColor(red: 0.12, green: 0.17, blue: 0.17, alpha: 1)
    private static let lightBorder = UIColor(red: 0.34, green: 0.45, blue: 0.46, alpha: 1)
    private static let darkBorder = UIColor(red: 0.56, green: 0.69, blue: 0.68, alpha: 1)
    private static let lightWarning = UIColor(red: 0.58, green: 0.30, blue: 0.05, alpha: 1)
    private static let darkWarning = UIColor(red: 0.99, green: 0.72, blue: 0.36, alpha: 1)
    private static let lightDanger = UIColor(red: 0.68, green: 0.11, blue: 0.15, alpha: 1)
    private static let darkDanger = UIColor(red: 1.00, green: 0.58, blue: 0.62, alpha: 1)

    static let canvas = adaptive(light: lightCanvas, dark: darkCanvas)
    static let surface = adaptive(light: lightSurface, dark: darkSurface)
    static let elevatedSurface = adaptive(light: lightElevatedSurface, dark: darkElevatedSurface)
    static let primaryText = adaptive(light: lightPrimaryText, dark: darkPrimaryText)
    static let secondaryText = adaptive(light: lightSecondaryText, dark: darkSecondaryText)
    static let tertiaryText = adaptive(light: lightTertiaryText, dark: darkTertiaryText)
    static let accent = adaptive(light: lightAccent, dark: darkAccent)
    static let actionFill = adaptive(light: lightActionFill, dark: darkActionFill)
    static let accentWarm = adaptive(light: lightWarmAccent, dark: darkWarmAccent)
    static let accentViolet = adaptive(light: lightVioletAccent, dark: darkVioletAccent)
    static let accentLeaf = adaptive(light: lightLeafAccent, dark: darkLeafAccent)
    static let accentSoft = adaptive(light: lightAccentSoft, dark: darkAccentSoft)
    static let accentWarmSoft = adaptive(light: lightWarmSoft, dark: darkWarmSoft)
    static let accentVioletSoft = adaptive(light: lightVioletSoft, dark: darkVioletSoft)
    static let fieldSurface = adaptive(light: lightFieldSurface, dark: darkFieldSurface)
    static let border = adaptive(light: lightBorder, dark: darkBorder)
    static let warning = adaptive(light: lightWarning, dark: darkWarning)
    static let danger = adaptive(light: lightDanger, dark: darkDanger)

    static let sproutDark = accent
    static let sproutBase = accent
    static let sproutLight = accentSoft
    static let warmWhite = canvas
    static let slateText = primaryText
    static let muted = secondaryText

    static let cardRadius: CGFloat = 18
    static let compactRadius: CGFloat = 12

    static let primaryTextContrastLight = contrastRatio(foreground: lightPrimaryText, background: lightCanvas)
    static let primaryTextContrastDark = contrastRatio(foreground: darkPrimaryText, background: darkCanvas)
    static let secondaryTextContrastLight = contrastRatio(foreground: lightSecondaryText, background: lightCanvas)
    static let secondaryTextContrastDark = contrastRatio(foreground: darkSecondaryText, background: darkCanvas)
    static let wcagAANormalTextMinimum = 4.5
    static let wcagAANonTextMinimum = 3.0

    static let normalTextContrastPairs: [ContrastPair] = [
        textPair("Light primary on canvas", lightPrimaryText, lightCanvas),
        textPair("Light primary on surface", lightPrimaryText, lightSurface),
        textPair("Light primary on elevated surface", lightPrimaryText, lightElevatedSurface),
        textPair("Light secondary on canvas", lightSecondaryText, lightCanvas),
        textPair("Light secondary on surface", lightSecondaryText, lightSurface),
        textPair("Light secondary on elevated surface", lightSecondaryText, lightElevatedSurface),
        textPair("Light tertiary on canvas", lightTertiaryText, lightCanvas),
        textPair("Light tertiary on surface", lightTertiaryText, lightSurface),
        textPair("Light tertiary on elevated surface", lightTertiaryText, lightElevatedSurface),
        textPair("Light accent text on surface", lightAccent, lightSurface),
        textPair("Light warm accent text on surface", lightWarmAccent, lightSurface),
        textPair("Light warning text on surface", lightWarning, lightSurface),
        textPair("Light danger text on surface", lightDanger, lightSurface),
        textPair("White text on light action fill", .white, lightActionFill),
        textPair("White text on hero lagoon", .white, heroLagoon),
        textPair("White text on hero violet", .white, heroViolet),
        textPair("White text on hero coral", .white, heroCoral),
        textPair("Dark primary on canvas", darkPrimaryText, darkCanvas),
        textPair("Dark primary on surface", darkPrimaryText, darkSurface),
        textPair("Dark primary on elevated surface", darkPrimaryText, darkElevatedSurface),
        textPair("Dark secondary on canvas", darkSecondaryText, darkCanvas),
        textPair("Dark secondary on surface", darkSecondaryText, darkSurface),
        textPair("Dark secondary on elevated surface", darkSecondaryText, darkElevatedSurface),
        textPair("Dark tertiary on canvas", darkTertiaryText, darkCanvas),
        textPair("Dark tertiary on surface", darkTertiaryText, darkSurface),
        textPair("Dark tertiary on elevated surface", darkTertiaryText, darkElevatedSurface),
        textPair("Dark accent text on surface", darkAccent, darkSurface),
        textPair("Dark warm accent text on surface", darkWarmAccent, darkSurface),
        textPair("Dark warning text on surface", darkWarning, darkSurface),
        textPair("Dark danger text on surface", darkDanger, darkSurface),
        textPair("White text on dark action fill", .white, darkActionFill)
    ]

    static let nonTextContrastPairs: [ContrastPair] = [
        textPair("Light border on canvas", lightBorder, lightCanvas),
        textPair("Light border on surface", lightBorder, lightSurface),
        textPair("Light accent glyph on accent soft", lightAccent, lightAccentSoft),
        textPair("Light warm glyph on warm soft", lightWarmAccent, lightWarmSoft),
        textPair("Light violet glyph on violet soft", lightVioletAccent, lightVioletSoft),
        textPair("Dark border on canvas", darkBorder, darkCanvas),
        textPair("Dark border on surface", darkBorder, darkSurface),
        textPair("Dark accent glyph on accent soft", darkAccent, darkAccentSoft),
        textPair("Dark warm glyph on warm soft", darkWarmAccent, darkWarmSoft),
        textPair("Dark violet glyph on violet soft", darkVioletAccent, darkVioletSoft)
    ]

    static let formFieldTextContrastPairs: [ContrastPair] = [
        textPair("Light field primary text", lightPrimaryText, lightFieldSurface),
        textPair("Light field placeholder text", lightTertiaryText, lightFieldSurface),
        textPair("Dark field primary text", darkPrimaryText, darkFieldSurface),
        textPair("Dark field placeholder text", darkTertiaryText, darkFieldSurface)
    ]

    static let formFieldNonTextContrastPairs: [ContrastPair] = [
        textPair("Light field border", lightBorder, lightFieldSurface),
        textPair("Dark field border", darkBorder, darkFieldSurface)
    ]

    static var canvasGradient: LinearGradient {
        LinearGradient(
            colors: [
                canvas,
                accentSoft.opacity(0.82),
                accentVioletSoft.opacity(0.52),
                canvas
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    static var heroGradient: LinearGradient {
        LinearGradient(
            colors: [
                Color(heroLagoon),
                Color(heroViolet),
                Color(heroCoral)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    private static func adaptive(light: UIColor, dark: UIColor) -> Color {
        Color(UIColor { traits in
            traits.userInterfaceStyle == .dark ? dark : light
        })
    }

    private static func contrastRatio(foreground: UIColor, background: UIColor) -> Double {
        let lighter = max(relativeLuminance(foreground), relativeLuminance(background))
        let darker = min(relativeLuminance(foreground), relativeLuminance(background))
        return (lighter + 0.05) / (darker + 0.05)
    }

    private static func textPair(_ name: String, _ foreground: UIColor, _ background: UIColor) -> ContrastPair {
        ContrastPair(name: name, ratio: contrastRatio(foreground: foreground, background: background))
    }

    private static func relativeLuminance(_ color: UIColor) -> Double {
        var red: CGFloat = 0
        var green: CGFloat = 0
        var blue: CGFloat = 0
        var alpha: CGFloat = 0
        color.getRed(&red, green: &green, blue: &blue, alpha: &alpha)

        func channel(_ value: CGFloat) -> Double {
            let normalized = Double(value)
            return normalized <= 0.03928 ? normalized / 12.92 : pow((normalized + 0.055) / 1.055, 2.4)
        }

        return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue)
    }
}

struct SproutScreenBackground: View {
    var body: some View {
        ZStack {
            SproutTheme.canvasGradient
            RouteLinePattern()
                .stroke(SproutTheme.accent.opacity(0.10), style: StrokeStyle(lineWidth: 1.2, lineCap: .round, dash: [7, 9]))
                .padding(.horizontal, -24)
                .padding(.top, 28)
        }
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }
}

struct RouteLinePattern: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.minX - 20, y: rect.minY + rect.height * 0.16))
        path.addCurve(
            to: CGPoint(x: rect.maxX + 20, y: rect.minY + rect.height * 0.28),
            control1: CGPoint(x: rect.minX + rect.width * 0.25, y: rect.minY + rect.height * 0.02),
            control2: CGPoint(x: rect.minX + rect.width * 0.72, y: rect.minY + rect.height * 0.46)
        )
        path.move(to: CGPoint(x: rect.minX - 20, y: rect.minY + rect.height * 0.68))
        path.addCurve(
            to: CGPoint(x: rect.maxX + 20, y: rect.minY + rect.height * 0.56),
            control1: CGPoint(x: rect.minX + rect.width * 0.22, y: rect.minY + rect.height * 0.84),
            control2: CGPoint(x: rect.minX + rect.width * 0.70, y: rect.minY + rect.height * 0.39)
        )
        return path
    }
}

struct NativeCard<Content: View>: View {
    let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        content
            .padding(SproutTheme.spacing.lg)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                RoundedRectangle(cornerRadius: SproutTheme.cardRadius, style: .continuous)
                    .fill(SproutTheme.surface.opacity(0.94))
            }
            .overlay {
                RoundedRectangle(cornerRadius: SproutTheme.cardRadius, style: .continuous)
                    .stroke(SproutTheme.border.opacity(0.42), lineWidth: 1)
            }
            .shadow(color: .black.opacity(0.10), radius: 18, x: 0, y: 10)
    }
}

struct SproutHeroCard<Content: View>: View {
    let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        content
            .padding(SproutTheme.spacing.xl)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                ZStack {
                    RoundedRectangle(cornerRadius: SproutTheme.cardRadius + 4, style: .continuous)
                        .fill(SproutTheme.heroGradient)
                    RouteLinePattern()
                        .stroke(.white.opacity(0.22), style: StrokeStyle(lineWidth: 1.3, lineCap: .round, dash: [7, 9]))
                        .padding(-12)
                }
                .clipShape(RoundedRectangle(cornerRadius: SproutTheme.cardRadius + 4, style: .continuous))
            }
            .overlay {
                RoundedRectangle(cornerRadius: SproutTheme.cardRadius + 4, style: .continuous)
                    .stroke(.white.opacity(0.24), lineWidth: 1)
            }
            .shadow(color: SproutTheme.accent.opacity(0.22), radius: 24, x: 0, y: 12)
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

struct SproutTextFieldSurface: ViewModifier {
    func body(content: Content) -> some View {
        content
            .textFieldStyle(.plain)
            .foregroundStyle(SproutTheme.primaryText)
            .padding(.horizontal, SproutTheme.spacing.md)
            .frame(minHeight: SproutTheme.minimumTouchTarget)
            .background(SproutTheme.fieldSurface, in: RoundedRectangle(cornerRadius: SproutTheme.compactRadius, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: SproutTheme.compactRadius, style: .continuous)
                    .stroke(SproutTheme.border.opacity(0.86), lineWidth: 1)
            }
    }
}

extension View {
    func sproutGlass(interactive: Bool = false) -> some View {
        modifier(NativeGlassSurface(isInteractive: interactive))
    }

    func sproutScreenBackground() -> some View {
        background {
            SproutScreenBackground()
        }
    }

    func sproutTextFieldSurface() -> some View {
        modifier(SproutTextFieldSurface())
    }
}

struct SproutPrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .frame(minHeight: SproutTheme.minimumTouchTarget)
            .padding(.horizontal, SproutTheme.spacing.lg)
            .foregroundStyle(isEnabled ? Color.white : SproutTheme.tertiaryText)
            .background {
                RoundedRectangle(cornerRadius: SproutTheme.compactRadius, style: .continuous)
                    .fill(isEnabled ? SproutTheme.actionFill : SproutTheme.elevatedSurface)
            }
            .overlay {
                RoundedRectangle(cornerRadius: SproutTheme.compactRadius, style: .continuous)
                    .stroke(Color.white.opacity(configuration.isPressed ? 0.30 : 0.12), lineWidth: 1)
            }
            .scaleEffect(configuration.isPressed ? 0.985 : 1)
            .animation(.spring(response: 0.22, dampingFraction: 0.82), value: configuration.isPressed)
    }
}

struct SproutSecondaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .frame(minHeight: SproutTheme.minimumTouchTarget)
            .padding(.horizontal, SproutTheme.spacing.lg)
            .foregroundStyle(isEnabled ? SproutTheme.accent : SproutTheme.tertiaryText)
            .background {
                RoundedRectangle(cornerRadius: SproutTheme.compactRadius, style: .continuous)
                    .fill(SproutTheme.surface.opacity(configuration.isPressed ? 0.78 : 0.96))
            }
            .overlay {
                RoundedRectangle(cornerRadius: SproutTheme.compactRadius, style: .continuous)
                    .stroke(isEnabled ? SproutTheme.accent.opacity(0.32) : SproutTheme.border.opacity(0.24), lineWidth: 1)
            }
            .scaleEffect(configuration.isPressed ? 0.985 : 1)
            .animation(.spring(response: 0.22, dampingFraction: 0.82), value: configuration.isPressed)
    }
}

struct SproutChipButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.caption.weight(.semibold))
            .lineLimit(2)
            .minimumScaleFactor(0.82)
            .frame(minHeight: 44)
            .padding(.horizontal, SproutTheme.spacing.md)
            .foregroundStyle(isEnabled ? SproutTheme.primaryText : SproutTheme.tertiaryText)
            .background {
                Capsule(style: .continuous)
                    .fill(configuration.isPressed ? SproutTheme.accentSoft.opacity(0.80) : SproutTheme.surface.opacity(0.92))
            }
            .overlay {
                Capsule(style: .continuous)
                    .stroke(SproutTheme.border.opacity(0.34), lineWidth: 1)
            }
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.spring(response: 0.20, dampingFraction: 0.86), value: configuration.isPressed)
    }
}
