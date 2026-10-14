import Foundation

enum AppConfig {
    static let appDisplayName = "Frog Frenzy"

    static let baseURL = URL(string: "https://frog-omega-rose.vercel.app")!

    static let homePath = "/"
    static var gameURL: URL {
        guard let url = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "Game") else {
            preconditionFailure("The offline game must be prepared before building.")
        }
        return url
    }

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
