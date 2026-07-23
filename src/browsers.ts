export const BROWSER_IDS = [
  "chrome",
  "edge",
  "firefox",
  "safari",
  "chrome_android",
  "firefox_android",
  "safari_ios",
  "webview_android",
  "samsunginternet_android"
] as const;

export type BrowserIdValue = (typeof BROWSER_IDS)[number];

export const DESKTOP_BROWSER_IDS = ["chrome", "edge", "firefox", "safari"] as const;

export const MOBILE_BROWSER_IDS = [
  "chrome_android",
  "firefox_android",
  "safari_ios",
  "webview_android",
  "samsunginternet_android"
] as const;

export const BROWSER_NAMES: Record<BrowserIdValue, string> = {
  chrome: "Chrome",
  edge: "Edge",
  firefox: "Firefox",
  safari: "Safari",
  chrome_android: "Chrome for Android",
  firefox_android: "Firefox for Android",
  safari_ios: "Safari on iOS",
  webview_android: "Android WebView",
  samsunginternet_android: "Samsung Internet"
};
