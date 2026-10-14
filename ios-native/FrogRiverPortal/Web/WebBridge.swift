import Foundation
import WebKit

protocol WebBridgeDelegate: AnyObject {
    func webBridgeDidRequestShare(_ payload: [String: Any])
    func webBridgeDidRequestNotification(_ payload: [String: Any])
    func webBridgeDidRequestHaptic(_ type: String)
}

final class WebBridge: NSObject, WKScriptMessageHandler, WKScriptMessageHandlerWithReply {
    weak var delegate: WebBridgeDelegate?

    static let messageNames = ["nativeShare", "nativeNotify", "nativeHaptic"]
    static let requestMessageName = "nativeRequest"

    static func permitsRequest(path: String, method: String) -> Bool {
        // Only the bundled game's session, progress and friend-challenge APIs are exposed.
        let routes: [String: [String]] = [
            "GET": ["^/api/config$", "^/api/player/state$",
                    "^/api/challenge-rooms/[A-Za-z0-9_-]+(?:/status)?$", "^/api/challenges/[A-Za-z0-9_-]+$"],
            "POST": ["^/api/play/session$", "^/api/events$", "^/api/referrals/resolve$",
                     "^/api/challenge-rooms$", "^/api/challenge-rooms/[A-Za-z0-9_-]+/(?:join|start|finish)$",
                     "^/api/challenges$", "^/api/challenges/[A-Za-z0-9_-]+/attempts$",
                     "^/api/challenge-attempts/[A-Za-z0-9_-]+/finish$", "^/api/levels/attempt/finish$"],
            "PUT": ["^/api/progress$"]
        ]
        return routes[method]?.contains { path.range(of: $0, options: .regularExpression) != nil } ?? false
    }

    static let platformJavaScript = """
    window.NativeApp = window.NativeApp || {};
    window.NativeApp.platform = 'ios';
    window.NativeApp.capabilities = { ads: false, purchases: false };
    window.NativeApp.request = function(payload) { return window.webkit.messageHandlers.nativeRequest.postMessage(payload); };
    """

    static let injectedJavaScript = """
    (function() {
      var style = document.createElement('style');
      style.textContent = 'html, body, * { -webkit-touch-callout: none; -webkit-user-select: none; } input, textarea, [contenteditable="true"] { -webkit-user-select: text; }';
      document.documentElement.appendChild(style);
      var viewport = document.querySelector('meta[name="viewport"]');
      if (!viewport) {
        viewport = document.createElement('meta');
        viewport.name = 'viewport';
        document.head.appendChild(viewport);
      }
      viewport.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
      window.NativeApp = window.NativeApp || {};
      window.NativeApp.platform = 'ios';
      window.NativeApp.capabilities = { ads: false, purchases: false };
      window.NativeApp.share = function(payload) { window.webkit.messageHandlers.nativeShare.postMessage(payload || {}); };
      window.NativeApp.notify = function(payload) { window.webkit.messageHandlers.nativeNotify.postMessage(payload || {}); };
      window.NativeApp.haptic = function(type) { window.webkit.messageHandlers.nativeHaptic.postMessage(type || 'impact'); };
      document.addEventListener('click', function(event) {
        var target = event.target && event.target.closest ? event.target.closest('button, a, input, [role="button"]') : null;
        if (target) window.webkit.messageHandlers.nativeHaptic.postMessage('impact');
      }, true);
    })();
    """

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame else { return }
        switch message.name {
        case "nativeShare":
            delegate?.webBridgeDidRequestShare(message.body as? [String: Any] ?? [:])
        case "nativeNotify":
            delegate?.webBridgeDidRequestNotification(message.body as? [String: Any] ?? [:])
        case "nativeHaptic":
            delegate?.webBridgeDidRequestHaptic(message.body as? String ?? "impact")
        default:
            break
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        guard message.frameInfo.isMainFrame,
              message.webView?.url?.isFileURL == true,
              let payload = message.body as? [String: Any],
              let path = payload["path"] as? String,
              Self.permitsRequest(path: path, method: payload["method"] as? String ?? "GET"),
              let url = URL(string: path, relativeTo: AppConfig.baseURL)?.absoluteURL,
              url.scheme == "https", url.host == AppConfig.baseURL.host else {
            replyHandler(nil, "Request not allowed")
            return
        }
        let method = payload["method"] as? String ?? "GET"
        guard ["GET", "POST", "PUT"].contains(method) else {
            replyHandler(nil, "Method not allowed")
            return
        }
        var request = URLRequest(url: url, timeoutInterval: 15)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let headers = payload["headers"] as? [String: String], let auth = headers["Authorization"],
           auth.hasPrefix("Bearer "), auth.count < 4096 {
            request.setValue(auth, forHTTPHeaderField: "Authorization")
        }
        if let body = payload["body"] as? String {
            guard body.utf8.count <= 131072 else { replyHandler(nil, "Request too large"); return }
            request.httpBody = body.data(using: .utf8)
        }
        URLSession.shared.dataTask(with: request) { data, response, error in
            let value = data.flatMap { try? JSONSerialization.jsonObject(with: $0) }
            DispatchQueue.main.async {
                if let error = error { replyHandler(nil, error.localizedDescription); return }
                guard let response = response as? HTTPURLResponse, let value = value else {
                    replyHandler(nil, "Invalid server response")
                    return
                }
                replyHandler(["status": response.statusCode, "data": value], nil)
            }
        }.resume()
    }
}
