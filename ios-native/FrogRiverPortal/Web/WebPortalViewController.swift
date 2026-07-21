import SafariServices
import UIKit
import WebKit

final class WebPortalViewController: UIViewController {
    private let initialURL: URL
    private let showsReviewLogin: Bool
    private let bridge = WebBridge()
    private let uploadCoordinator = FileUploadCoordinator()
    private let progressView = UIProgressView(progressViewStyle: .bar)
    private let errorView = NativeErrorView()
    private let launchOverlay = UIView()
    private let refreshControl = UIRefreshControl()
    private var webView: WKWebView!
    private var loadingTimeoutWorkItem: DispatchWorkItem?
    private var estimatedProgressObservation: NSKeyValueObservation?
    private var titleObservation: NSKeyValueObservation?

    init(initialURL: URL, showsReviewLogin: Bool) {
        self.initialURL = initialURL
        self.showsReviewLogin = showsReviewLogin
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        setupWebView()
        setupProgressView()
        setupErrorView()
        setupLaunchOverlay()
        setupReviewLoginButtonIfNeeded()
        setupNavigationItems()
        load(initialURL)
    }

    deinit {
        loadingTimeoutWorkItem?.cancel()
        WebBridge.messageNames.forEach { webView?.configuration.userContentController.removeScriptMessageHandler(forName: $0) }
    }

    private func setupWebView() {
        bridge.delegate = self

        let contentController = WKUserContentController()
        WebBridge.messageNames.forEach { contentController.add(bridge, name: $0) }
        contentController.addUserScript(WKUserScript(source: WebBridge.injectedJavaScript, injectionTime: .atDocumentEnd, forMainFrameOnly: false))

        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = true
        configuration.userContentController = contentController
        configuration.allowsInlineMediaPlayback = true

        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.scrollView.delegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.bounces = true
        webView.scrollView.alwaysBounceVertical = true
        webView.scrollView.alwaysBounceHorizontal = false
        webView.scrollView.contentInsetAdjustmentBehavior = .automatic

        refreshControl.addTarget(self, action: #selector(refreshRequested), for: .valueChanged)
        webView.scrollView.refreshControl = refreshControl

        view.addSubview(webView)

        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor)
        ])

        estimatedProgressObservation = webView.observe(\.estimatedProgress, options: [.new]) { [weak self] webView, _ in
            self?.progressView.setProgress(Float(webView.estimatedProgress), animated: true)
            self?.progressView.isHidden = webView.estimatedProgress >= 1
        }

        titleObservation = webView.observe(\.title, options: [.new]) { [weak self] webView, _ in
            if let pageTitle = webView.title, !pageTitle.isEmpty {
                self?.title = pageTitle
            }
        }
    }

    private func setupProgressView() {
        progressView.translatesAutoresizingMaskIntoConstraints = false
        progressView.progressTintColor = .systemGreen
        progressView.trackTintColor = .clear
        progressView.isHidden = true
        view.addSubview(progressView)

        NSLayoutConstraint.activate([
            progressView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            progressView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            progressView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            progressView.heightAnchor.constraint(equalToConstant: 2)
        ])
    }

    private func setupErrorView() {
        errorView.translatesAutoresizingMaskIntoConstraints = false
        errorView.onRetry = { [weak self] in
            self?.errorView.isHidden = true
            self?.webView.reload()
        }
        view.addSubview(errorView)

        NSLayoutConstraint.activate([
            errorView.topAnchor.constraint(equalTo: view.topAnchor),
            errorView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            errorView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            errorView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
    }

    private func setupLaunchOverlay() {
        launchOverlay.translatesAutoresizingMaskIntoConstraints = false
        launchOverlay.backgroundColor = UIColor(red: 0.94, green: 0.99, blue: 0.94, alpha: 1)

        let titleLabel = UILabel()
        titleLabel.text = AppConfig.appDisplayName
        titleLabel.font = .boldSystemFont(ofSize: 32)
        titleLabel.textColor = UIColor(red: 0.0, green: 0.45, blue: 0.18, alpha: 1)

        let subtitleLabel = UILabel()
        subtitleLabel.text = "Frog River Portal"
        subtitleLabel.font = .systemFont(ofSize: 15)
        subtitleLabel.textColor = .secondaryLabel

        let stack = UIStackView(arrangedSubviews: [titleLabel, subtitleLabel])
        stack.axis = .vertical
        stack.spacing = 10
        stack.alignment = .center
        stack.translatesAutoresizingMaskIntoConstraints = false

        launchOverlay.addSubview(stack)
        view.addSubview(launchOverlay)

        NSLayoutConstraint.activate([
            launchOverlay.topAnchor.constraint(equalTo: view.topAnchor),
            launchOverlay.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            launchOverlay.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            launchOverlay.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            stack.centerXAnchor.constraint(equalTo: launchOverlay.safeAreaLayoutGuide.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: launchOverlay.safeAreaLayoutGuide.centerYAnchor, constant: -18)
        ])
    }

    private func setupReviewLoginButtonIfNeeded() {
        guard showsReviewLogin else { return }

        let button = UIButton(type: .system)
        button.setTitle("Review Account Login", for: .normal)
        button.setImage(UIImage(systemName: "person.badge.key.fill"), for: .normal)
        button.configuration = .filled()
        button.translatesAutoresizingMaskIntoConstraints = false
        button.addTarget(self, action: #selector(reviewLoginTapped), for: .touchUpInside)
        view.addSubview(button)

        NSLayoutConstraint.activate([
            button.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 16),
            button.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -16),
            button.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -12),
            button.heightAnchor.constraint(equalToConstant: 44)
        ])

        webView.scrollView.contentInset.bottom = 68
        webView.scrollView.verticalScrollIndicatorInsets.bottom = 68
    }

    private func setupNavigationItems() {
        navigationItem.leftBarButtonItem = UIBarButtonItem(
            image: UIImage(systemName: "chevron.backward"),
            style: .plain,
            target: self,
            action: #selector(backTapped)
        )
        navigationItem.leftBarButtonItem?.isEnabled = false
    }

    private func load(_ url: URL) {
        webView.load(URLRequest(url: url, cachePolicy: .returnCacheDataElseLoad, timeoutInterval: 15))
    }

    private func startLoadingTimeout() {
        loadingTimeoutWorkItem?.cancel()
        let workItem = DispatchWorkItem { [weak self] in
            guard let self = self, self.webView.isLoading else { return }
            self.webView.stopLoading()
            self.showError(title: "Loading Timed Out", message: "The page took more than 15 seconds to load. Please try again later.")
        }
        loadingTimeoutWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + 15, execute: workItem)
    }

    private func finishLoading() {
        loadingTimeoutWorkItem?.cancel()
        refreshControl.endRefreshing()
        progressView.setProgress(0, animated: false)
        progressView.isHidden = true
        navigationItem.leftBarButtonItem?.isEnabled = webView.canGoBack
        if !launchOverlay.isHidden {
            UIView.animate(withDuration: 0.25, delay: 0.05, options: [.curveEaseOut]) {
                self.launchOverlay.alpha = 0
            } completion: { _ in
                self.launchOverlay.isHidden = true
            }
        }
    }

    private func showError(title: String, message: String) {
        Haptics.warning()
        errorView.configure(title: title, message: message)
        errorView.isHidden = false
    }

    @objc private func backTapped() {
        Haptics.selection()
        if webView.canGoBack {
            webView.goBack()
        }
    }

    @objc private func refreshRequested() {
        Haptics.selection()
        errorView.isHidden = true
        webView.reload()
    }

    @objc private func reviewLoginTapped() {
        Haptics.impact()
        webView.evaluateJavaScript(AppConfig.reviewLoginScript) { [weak self] _, error in
            if let error = error {
                self?.showError(title: "Review Login Failed", message: "Check the login form selectors or JS bridge setup: \(error.localizedDescription)")
            } else {
                Haptics.success()
            }
        }
    }
}

extension WebPortalViewController: WKNavigationDelegate {
    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        errorView.isHidden = true
        progressView.isHidden = false
        startLoadingTimeout()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        finishLoading()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        finishLoading()
        showError(title: "Page Load Failed", message: error.localizedDescription)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        finishLoading()
        showError(title: "Network Error", message: error.localizedDescription)
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }

        if ["tel", "mailto", "sms"].contains(url.scheme?.lowercased() ?? "") {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
            return
        }

        guard url.scheme == "http" || url.scheme == "https" else {
            decisionHandler(.allow)
            return
        }

        if AppConfig.isInternalURL(url) {
            decisionHandler(.allow)
        } else {
            let safari = SFSafariViewController(url: url)
            present(safari, animated: true)
            decisionHandler(.cancel)
        }
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationResponse: WKNavigationResponse,
        decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
    ) {
        if let response = navigationResponse.response as? HTTPURLResponse,
           [403, 404, 500, 502, 503, 504].contains(response.statusCode) {
            showError(title: "Service Unavailable", message: "The server returned \(response.statusCode). Please try again later.")
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }
}

extension WebPortalViewController: WKUIDelegate {
    func webView(
        _ webView: WKWebView,
        runJavaScriptAlertPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping () -> Void
    ) {
        let alert = UIAlertController(title: title ?? AppConfig.appDisplayName, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        present(alert, animated: true)
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptConfirmPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (Bool) -> Void
    ) {
        let alert = UIAlertController(title: title ?? AppConfig.appDisplayName, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        present(alert, animated: true)
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptTextInputPanelWithPrompt prompt: String,
        defaultText: String?,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (String?) -> Void
    ) {
        let alert = UIAlertController(title: title ?? AppConfig.appDisplayName, message: prompt, preferredStyle: .alert)
        alert.addTextField { textField in textField.text = defaultText }
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(nil) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(alert.textFields?.first?.text) })
        present(alert, animated: true)
    }

    @available(iOS 18.4, *)
    func webView(
        _ webView: WKWebView,
        runOpenPanelWith parameters: WKOpenPanelParameters,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping ([URL]?) -> Void
    ) {
        uploadCoordinator.presentOptions(from: self, completion: completionHandler)
    }
}

extension WebPortalViewController: WebBridgeDelegate {
    func webBridgeDidRequestShare(_ payload: [String: Any]) {
        Haptics.selection()
        SharePresenter.present(from: self, payload: payload)
    }

    func webBridgeDidRequestNotification(_ payload: [String: Any]) {
        let title = payload["title"] as? String ?? AppConfig.appDisplayName
        let body = payload["body"] as? String ?? "You have a new in-app message."
        let delay = payload["delay"] as? TimeInterval ?? 1
        LocalNotificationService.schedule(title: title, body: body, delay: delay)
        Haptics.success()
    }

    func webBridgeDidRequestHaptic(_ type: String) {
        switch type {
        case "success":
            Haptics.success()
        case "warning":
            Haptics.warning()
        case "selection":
            Haptics.selection()
        default:
            Haptics.impact()
        }
    }
}

extension WebPortalViewController: UIScrollViewDelegate {
    func viewForZooming(in scrollView: UIScrollView) -> UIView? {
        nil
    }
}
