import Foundation
import StoreKit

enum IAPPlaceholderService {
    // TODO: Add App Store Connect product identifiers for virtual memberships,
    // recharge credits, or digital goods. Keep third-party web payments disabled
    // for these product types inside WKWebView.
    static let productIdentifiers: Set<String> = []

    static func loadProducts() async throws -> [Product] {
        guard !productIdentifiers.isEmpty else { return [] }
        return try await Product.products(for: productIdentifiers)
    }
}
