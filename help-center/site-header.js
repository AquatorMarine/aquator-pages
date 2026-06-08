/*
 * Aquator — shared site header.
 * Self-contained: injects its own styles + markup so any page gets the
 * identical header with a single <script src="site-header.js"></script> tag,
 * regardless of that page's own CSS. Single source of truth for the masthead.
 */
(function () {
  if (document.getElementById("aqh-style")) return; // guard against double-inject

  var HEADER_H = 64; // px — keep in sync with rail offsets in help-center.css
  var SITE = "https://aquatormarine.com";

  var CSS =
    "" +
    ".aqh{position:sticky;top:0;z-index:200;background:#fff;border-bottom:1px solid rgba(47,43,61,.10);" +
    "font-family:'DM Sans',-apple-system,'Segoe UI',Arial,sans-serif}" +
    ".aqh-in{display:flex;align-items:center;gap:28px;height:" + HEADER_H + "px;" +
    "max-width:1480px;margin:0 auto;padding:0 28px}" +
    ".aqh-brand{display:inline-flex;align-items:center;flex:none}" +
    ".aqh-brand img{height:26px;width:auto;display:block}" +
    "@media(max-width:520px){.aqh-in{gap:14px;padding:0 16px}}";

  var html =
    '<header class="aqh"><div class="aqh-in">' +
    '<a class="aqh-brand" href="' + SITE + '/" target="_blank" rel="noopener" aria-label="Aquator">' +
    '<img src="logo-aquator.png" alt="Aquator" /></a>' +
    "</div></header>";

  var style = document.createElement("style");
  style.id = "aqh-style";
  style.textContent = CSS;
  document.head.appendChild(style);

  // This script tag is the first node in <body>; afterbegin places the
  // header above it, so it renders at the very top with no layout shift.
  document.body.insertAdjacentHTML("afterbegin", html);
})();
