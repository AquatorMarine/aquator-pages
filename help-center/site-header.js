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
  var CONTACT = SITE + "/contact";
  var CHANGELOG = "../change-log/"; // help-center pages are siblings of change-log/

  var CSS =
    "" +
    ".aqh{position:sticky;top:0;z-index:200;background:#fff;border-bottom:1px solid rgba(47,43,61,.10);" +
    "font-family:'DM Sans',-apple-system,'Segoe UI',Arial,sans-serif}" +
    ".aqh-in{display:flex;align-items:center;gap:28px;height:" + HEADER_H + "px;" +
    "max-width:1480px;margin:0 auto;padding:0 28px}" +
    ".aqh-brand{display:inline-flex;align-items:center;flex:none}" +
    ".aqh-brand img{height:26px;width:auto;display:block}" +
    ".aqh-center{flex:1;display:flex;justify-content:center}" +
    ".aqh-link{font-size:14px;font-weight:500;color:#8A8A8A;text-decoration:none;" +
    "letter-spacing:.01em;padding:8px 14px;border-radius:8px;" +
    "transition:color .15s ease,background .15s ease}" +
    ".aqh-link:hover{color:#FF6500;background:#FEF0E6}" +
    ".aqh-actions{flex:none;display:flex;gap:10px;align-items:center}" +
    ".aqh-btn{display:inline-flex;align-items:center;padding:10px 22px;border-radius:8px;" +
    "font-size:14px;font-weight:600;letter-spacing:.01em;text-decoration:none;" +
    "transition:opacity .15s ease,border-color .15s ease;cursor:pointer;border:none}" +
    ".aqh-btn--primary{background:#FF6500;color:#fff}" +
    ".aqh-btn--primary:hover{opacity:.9}" +
    ".aqh-btn--ghost{background:#fff;color:#1C333D;border:1px solid #E8E8E8}" +
    ".aqh-btn--ghost:hover{border-color:#1C333D}" +
    "@media(max-width:640px){.aqh-center{display:none}.aqh-actions{margin-left:auto}}" +
    "@media(max-width:520px){.aqh-in{gap:14px;padding:0 16px}.aqh-btn{padding:8px 16px;font-size:13px}}";

  var html =
    '<header class="aqh"><div class="aqh-in">' +
    '<a class="aqh-brand" href="' + SITE + '/" target="_blank" rel="noopener" aria-label="Aquator">' +
    '<img src="logo-aquator.png" alt="Aquator" /></a>' +
    '<nav class="aqh-center" aria-label="Related">' +
    '<a class="aqh-link" href="' + CHANGELOG + '">Change Log <span aria-hidden="true">&rarr;</span></a>' +
    "</nav>" +
    '<div class="aqh-actions">' +
    '<a class="aqh-btn aqh-btn--ghost" href="' + CONTACT + '" target="_blank" rel="noopener">Contact</a>' +
    '<a class="aqh-btn aqh-btn--primary" href="' + SITE + '" target="_blank" rel="noopener">Website</a>' +
    "</div>" +
    "</div></header>";

  var style = document.createElement("style");
  style.id = "aqh-style";
  style.textContent = CSS;
  document.head.appendChild(style);

  // This script tag is the first node in <body>; afterbegin places the
  // header above it, so it renders at the very top with no layout shift.
  document.body.insertAdjacentHTML("afterbegin", html);
})();
