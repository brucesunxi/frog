import Foundation
import WebKit

protocol WebBridgeDelegate: AnyObject {
    func webBridgeDidRequestShare(_ payload: [String: Any])
    func webBridgeDidRequestNotification(_ payload: [String: Any])
    func webBridgeDidRequestHaptic(_ type: String)
}

final class WebBridge: NSObject, WKScriptMessageHandler {
    weak var delegate: WebBridgeDelegate?

    static let messageNames = ["nativeShare", "nativeNotify", "nativeHaptic"]

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
      if (window.NativeApp) return;
      window.NativeApp = {
        share: function(payload) { window.webkit.messageHandlers.nativeShare.postMessage(payload || {}); },
        notify: function(payload) { window.webkit.messageHandlers.nativeNotify.postMessage(payload || {}); },
        haptic: function(type) { window.webkit.messageHandlers.nativeHaptic.postMessage(type || 'impact'); },
        fillReviewAccount: function() { return 'native-review-button'; }
      };
      document.addEventListener('click', function(event) {
        var target = event.target && event.target.closest ? event.target.closest('button, a, input, [role="button"]') : null;
        if (target) window.webkit.messageHandlers.nativeHaptic.postMessage('impact');
      }, true);
    })();
    """

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
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
}
