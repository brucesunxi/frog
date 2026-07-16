import UIKit

enum SharePresenter {
    static func present(from viewController: UIViewController, payload: [String: Any]) {
        var items: [Any] = []

        if let title = payload["title"] as? String, !title.isEmpty {
            items.append(title)
        }
        if let text = payload["text"] as? String, !text.isEmpty {
            items.append(text)
        }
        if let urlString = payload["url"] as? String, let url = URL(string: urlString) {
            items.append(url)
        }

        guard !items.isEmpty else { return }

        let activityController = UIActivityViewController(activityItems: items, applicationActivities: nil)
        if let popover = activityController.popoverPresentationController {
            popover.sourceView = viewController.view
            popover.sourceRect = CGRect(x: viewController.view.bounds.midX, y: viewController.view.bounds.maxY - 80, width: 1, height: 1)
        }
        viewController.present(activityController, animated: true)
    }
}
