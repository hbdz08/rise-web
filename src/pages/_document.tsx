import { Head, Html, Main, NextScript } from "next/document";

const themeInitScript = `
(function () {
  try {
    var key = "rise.themeMode";
    var saved = window.localStorage.getItem(key);
    var mode = saved === "dark" || saved === "light"
      ? saved
      : (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.body && document.body.setAttribute("theme-mode", mode);
  } catch (e) {}
})();
`;

export default function Document() {
  return (
    <Html lang="zh-CN">
      <Head />
      <body theme-mode="light">
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}

