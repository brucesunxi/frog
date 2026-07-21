import UIKit

final class MainTabBarController: UITabBarController {
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        tabBar.backgroundColor = .systemBackground

        viewControllers = [
            makeTab(title: "Home", systemImage: "house.fill", path: AppConfig.homePath, showsReviewLogin: false),
            makeTab(title: "Discover", systemImage: "safari.fill", path: AppConfig.discoverPath, showsReviewLogin: false),
            makeTab(title: "Profile", systemImage: "person.crop.circle.fill", path: AppConfig.profilePath, showsReviewLogin: true)
        ]
    }

    private func makeTab(title: String, systemImage: String, path: String, showsReviewLogin: Bool) -> UIViewController {
        let viewController = WebPortalViewController(initialURL: AppConfig.url(for: path), showsReviewLogin: showsReviewLogin)
        let navigationController = PortalNavigationController(rootViewController: viewController)
        navigationController.tabBarItem = UITabBarItem(title: title, image: UIImage(systemName: systemImage), selectedImage: nil)
        viewController.title = title
        return navigationController
    }
}
