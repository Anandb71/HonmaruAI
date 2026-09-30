import SwiftUI

struct AppLogo: View {
    var size: CGFloat = 56

    var body: some View {
        Image("AppMark")
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
            .accessibilityLabel("Honmaru AI")
    }
}

/// The launch screen, carried on. iOS draws the first frame itself — the
/// mark on the brand's dark ground (UILaunchScreen in Info.plist) — and this
/// starts from exactly that frame: the mark settles, a soft light and the
/// name arrive, then the mark grows and everything fades into the app. It
/// waits for the app to be ready, but never long, and it takes no taps.
struct SplashView: View {
    /// The app has what its first screen needs.
    var ready: Bool
    var onFinished: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var settled = false
    @State private var leaving = false
    @State private var shownLongEnough = false

    var body: some View {
        ZStack {
            Color("LaunchBackground")
            Circle()
                .fill(RadialGradient(colors: [Color.white.opacity(0.16), .clear], center: .center, startRadius: 0, endRadius: 170))
                .frame(width: 340, height: 340)
                .scaleEffect(settled ? 1 : 0.5)
                .opacity(settled && !leaving ? 1 : 0)
            Image("LaunchMark")
                .resizable()
                .interpolation(.high)
                .frame(width: 96, height: 96)
                .shadow(color: .white.opacity(settled ? 0.10 : 0), radius: 20)
                .scaleEffect(leaving ? (reduceMotion ? 1 : 1.4) : (settled ? 0.92 : 1))
            Text(verbatim: "Honmaru AI")
                .font(.system(size: 22, weight: .semibold, design: .rounded))
                .tracking(0.6)
                .foregroundStyle(.white)
                .offset(y: settled ? 82 : 94)
                .opacity(settled && !leaving ? 1 : 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .ignoresSafeArea()
        .opacity(leaving ? 0 : 1)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        .task {
            // The first frame is the launch screen's own; let it land.
            try? await Task.sleep(for: .milliseconds(150))
            withAnimation(reduceMotion ? .easeOut(duration: 0.25) : .spring(response: 0.65, dampingFraction: 0.78)) { settled = true }
            try? await Task.sleep(for: .milliseconds(850))
            if Task.isCancelled { return }
            shownLongEnough = true
            if ready { leave() }
            // Never hold the app back for long.
            try? await Task.sleep(for: .seconds(2))
            if !Task.isCancelled { leave() }
        }
        .onChange(of: ready) { _, now in if now && shownLongEnough { leave() } }
    }

    private func leave() {
        guard !leaving else { return }
        withAnimation(.easeIn(duration: reduceMotion ? 0.2 : 0.42)) { leaving = true }
        Task {
            try? await Task.sleep(for: .milliseconds(450))
            onFinished()
        }
    }
}

#Preview {
    ZStack {
        Theme.Colors.background.ignoresSafeArea()
        AppLogo(size: 72)
    }
}

#Preview("Splash") {
    SplashView(ready: true) {}
}
