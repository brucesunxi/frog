# 青蛙冲刺 iOS 原生容器

这是一个 Swift + UIKit + WKWebView 的原生 iOS 工程，用于把已部署在 Vercel 的 HTTPS Web 应用包装为具备原生导航、Tab、系统能力和审核辅助能力的 App Store 版本。

## 必改内容

- `FrogRiverPortal/Config/AppConfig.swift`
  - `baseURL`: 已设置为 `https://frog-omega-rose.vercel.app`。
  - `reviewEmail` / `reviewPassword`: 替换为 App Store 审核测试账号。
  - `reviewLoginScript`: 按你的登录页表单选择器或 Web JS Bridge 调整。
- `FrogRiverPortal/Resources/Info.plist`
  - `CFBundleDisplayName`: 如需改名，替换“青蛙冲刺”。
- Xcode Target
  - `PRODUCT_BUNDLE_IDENTIFIER`: 当前占位为 `com.jianrongyishu.webportal`。
  - Team / Signing Certificate: 替换为 Beijing Jianrong Yishu Technology Co., Ltd. 的开发者账号。
- `Assets.xcassets/AppIcon.appiconset`
  - 当前已使用仓库里的青蛙图标生成占位 App Icon；上架前建议替换为最终品牌图标。

## 打开与运行

1. 使用 Xcode 打开 `ios-native/FrogRiverPortal.xcodeproj`。
2. 选择 `FrogRiverPortal` Target，进入 `Signing & Capabilities`。
3. 设置 Team，并确认 Bundle ID 可用。
4. 在 `AppConfig.swift` 替换审核账号；Vercel 域名已设置为 `https://frog-omega-rose.vercel.app`。
5. 选择 iOS 16.0 或更高的真机 / 模拟器运行。
6. 真机测试相机、相册、本地通知和分享面板；模拟器无法完整验证相机。

## Web 侧 JS Bridge

网页可通过以下接口调用原生能力：

```js
window.NativeApp.share({ title: "青蛙冲刺", text: "来试试这关", url: location.href })
window.NativeApp.notify({ title: "新消息", body: "你有一条站内提醒", delay: 1 })
window.NativeApp.haptic("success")
```

审核一键登录建议在 Web 侧暴露：

```js
window.NativeReviewLogin = {
  login({ email, password }) {
    // 调用你的登录逻辑
  }
}
```

## App Store Connect 审核备注

本App并非纯网页壳，已集成原生Tab导航、下拉刷新、相机/相册上传、系统分享、本地通知、触感反馈与原生错误页。请使用“我的”页审核账号一键登录体验完整功能。

## Vercel + Neon 上架避坑

1. 登录 Cookie 必须设置 `Secure; SameSite=None/Lax` 且域名与 WebView 主域一致，避免 WKWebView 登录态丢失。
2. 虚拟会员、充值、数字商品必须接 Apple IAP，WebView 内不要保留第三方支付入口。
3. 不要让 App 首屏只显示网页，审核包需展示原生 Tab、导航、错误页和至少 3 个真实可触发的原生能力。
