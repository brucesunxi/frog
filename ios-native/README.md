# Frog Frenzy iOS App

这是一个 Swift + UIKit + WKWebView 的 iOS 工程。游戏内容与 Android 共用，平台能力通过原生桥接隔离。

## 发布配置

- `FrogRiverPortal/Config/AppConfig.swift`
  - `baseURL`: 已设置为 `https://frog-omega-rose.vercel.app`。
- `FrogRiverPortal/Resources/Info.plist`
  - `CFBundleDisplayName`: `Frog Frenzy`。
- Xcode Target
  - `PRODUCT_BUNDLE_IDENTIFIER`: `com.jianrongyishu.frogriver`。
  - Team / Signing Certificate: 替换为 Beijing Jianrong Yishu Technology Co., Ltd. 的开发者账号。
- `Assets.xcassets/AppIcon.appiconset`
  - 当前已使用仓库里的青蛙图标生成占位 App Icon；上架前建议替换为最终品牌图标。

## 打开与运行

1. 使用 Xcode 打开 `ios-native/FrogRiverPortal.xcodeproj`。
2. 选择 `FrogRiverPortal` Target，进入 `Signing & Capabilities`。
3. 设置 Team，并确认 Bundle ID 可用。
4. 选择 iOS 16.0 或更高的真机 / 模拟器运行。
5. 真机测试相机、相册、本地通知和分享面板；模拟器无法完整验证相机。

## Web 侧 JS Bridge

网页可通过以下接口调用原生能力：

```js
window.NativeApp.share({ title: "Frog Frenzy", text: "Try this challenge", url: location.href })
window.NativeApp.notify({ title: "Frog Frenzy", body: "Your next run is ready", delay: 1 })
window.NativeApp.haptic("success")
```

## App Store Connect 审核备注

This app does not include user registration, user login, or account-based features. All gameplay is available without signing in. Progress is associated with a device-scoped installation identifier. The iOS premium edition contains no advertising or additional in-app purchases.

## Vercel + Neon 上架避坑

1. iOS 首发为付费完整版，不显示广告，也不提供金币充值。
2. Android 广告与 Google Play Billing 只能从 Android 原生桥接调用。
3. 未来若在 iOS 销售虚拟货币，必须先接入 StoreKit 并在 App Store Connect 创建对应内购商品。
