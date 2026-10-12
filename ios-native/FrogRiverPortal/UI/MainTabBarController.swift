import UIKit

final class MainTabBarController: UITabBarController {
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        tabBar.backgroundColor = .systemBackground

        viewControllers = [
            makeTab(title: "Play", systemImage: "gamecontroller.fill", path: AppConfig.homePath)
        ]
    }

    private func makeTab(title: String, systemImage: String, path: String) -> UIViewController {
        let viewController = WebPortalViewController(initialURL: AppConfig.url(for: path))
        let navigationController = PortalNavigationController(rootViewController: viewController)
        navigationController.tabBarItem = UITabBarItem(title: title, image: UIImage(systemName: systemImage), selectedImage: nil)
        viewController.title = title
        return navigationController
    }
}
