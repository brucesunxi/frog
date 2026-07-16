import Foundation

enum AppConfig {
    static let appDisplayName = "青蛙冲刺"

    static let baseURL = URL(string: "https://frog-omega-rose.vercel.app")!

    static let homePath = "/"
    static let discoverPath = "/discover"
    static let profilePath = "/me"

    // TODO: Replace with the real App Store review account.
    static let reviewEmail = "review@example.com"
    static let reviewPassword = "ReplaceWithReviewPassword123"

    // TODO: Match your web app's login form selectors or expose window.NativeReviewLogin.login.
    static let reviewLoginScript = """
    (function() {
      const account = { email: '\(reviewEmail)', password: '\(reviewPassword)' };
      if (window.NativeReviewLogin && typeof window.NativeReviewLogin.login === 'function') {
        window.NativeReviewLogin.login(account);
        return 'bridge-login';
      }
      const email = document.querySelector('input[type="email"], input[name="email"], input[name="username"]');
      const password = document.querySelector('input[type="password"], input[name="password"]');
      if (email) {
        email.value = account.email;
        email.dispatchEvent(new Event('input', { bubbles: true }));
        email.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (password) {
        password.value = account.password;
        password.dispatchEvent(new Event('input', { bubbles: true }));
        password.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const button = document.querySelector('button[type="submit"], input[type="submit"], button[data-native-review-login]');
      if (button) {
        button.click();
        return 'submitted';
      }
      return 'filled';
    })();
    """

    static func url(for path: String) -> URL {
        URL(string: path, relativeTo: baseURL)!.absoluteURL
    }

    static func isInternalURL(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased(), let baseHost = baseURL.host?.lowercased() else {
            return false
        }
        return host == baseHost || host.hasSuffix("." + baseHost)
    }
}
