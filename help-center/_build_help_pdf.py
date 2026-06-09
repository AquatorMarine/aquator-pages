#!/usr/bin/env python3
"""Compose a single body fragment for the whole Help Center, then render it
through the pdf-report skill's brand chrome (orange masthead + dark colophon)
using locally-installed Google Chrome (headless) instead of Playwright."""
import re, json, html, pathlib, subprocess, sys

HC = pathlib.Path("/Users/mac/Nirali/aquator/aquator-pages/help-center")
SKILL = pathlib.Path("/Users/mac/Downloads/sales-engine_4/skills/pdf-report")
OUT = HC / "Aquator-Help-Center-Complete-Guide.pdf"
DATE = "June 2026"

# Topic order: Getting Started first, then the index card order.
ORDER = [
    "getting-started", "pms", "ism", "sms", "warranty", "crew-management",
    "in-out-board", "user-management", "accounting", "charter",
    "yacht-plans-subscription", "new-builds", "refits", "shipyard",
    "file-manager", "smart-documents", "yacht-management", "ais-tracker",
    "global-settings", "yacht-settings", "personal-settings",
    "theme-customizer", "white-labeling", "integrations", "customer-support",
]

def page_title(slug):
    s = (HC / f"{slug}.html").read_text(encoding="utf-8")
    m = re.search(r"<title>(.*?)</title>", s, re.S)
    t = m.group(1) if m else slug
    return html.unescape(t).replace("— Aquator Marine", "").replace("— Aquator Marine", "").strip()

def modules(slug):
    s = (HC / f"{slug}.html").read_text(encoding="utf-8")
    m = re.search(r'<script id="kb"[^>]*>(.*?)</script>', s, re.S)
    return json.loads(m.group(1)).get("modules", [])

def clean_body(body):
    # Force all FAQ <details> open so they print expanded.
    body = re.sub(r"<details(?![^>]*\bopen\b)", "<details open", body)
    return body

# ---- Build sections -------------------------------------------------------
topics = []
for slug in ORDER:
    topics.append((slug, page_title(slug), modules(slug)))

total_mods = sum(len(m) for _, _, m in topics)

parts = []
# Intro
parts.append(f"""<div class="intro">
  <div class="eyebrow">Complete Guide &middot; {DATE}</div>
  <h1>Aquator Help Center</h1>
  <p class="lede">The complete Aquator Marine help center in one document &mdash;
  every module, setting, and workflow. Covers <b>{len(topics)} topics</b> across
  <b>{total_mods} sections</b>: from getting started and the operational modules
  (PMS, ISM, SMS, Crew, Charter, Accounting) through fleet management, settings,
  white-labeling, and support.</p>
</div>""")

# Contents
parts.append('<div class="sec"><span class="label">Contents</span>'
             f'<span class="hint">{len(topics)} topics</span></div>')
toc = []
for i, (slug, title, mods) in enumerate(topics, 1):
    sub = ", ".join(html.unescape(m.get("name", "")) for m in mods)
    toc.append(f'<div class="fact"><div class="k">{i:02d} &middot; {html.escape(title)}</div>'
               f'<div class="v" style="font-size:11.5px;font-weight:600;color:#3C3C3C">'
               f'{html.escape(sub)}</div></div>')
parts.append('<div class="facts cols-2">' + "".join(toc) + '</div>')

# Per-topic sections
for slug, title, mods in topics:
    parts.append(f'<div class="sec topic-sec"><span class="label">{html.escape(title)}</span>'
                 f'<span class="hint">{len(mods)} sections</span></div>')
    for m in mods:
        name = html.unescape(m.get("name", ""))
        body = clean_body(m.get("body", ""))
        parts.append(f'<div class="modblock"><div class="modtitle">{html.escape(name)}</div>'
                     f'<div class="modbody">{body}</div></div>')

body_html = "\n".join(parts)

# ---- Supplementary styles for help-center element classes -----------------
extra_css = """
<style>
/* Topic sections start on a fresh page; first one need not. */
.topic-sec{break-before:page;margin-top:6px}
.topic-sec:first-of-type{break-before:auto}
.modblock{break-inside:avoid-page;margin:0 0 4px}
.modtitle{font-family:var(--serif);font-size:18px;font-weight:600;color:var(--ink);
  margin:18px 0 6px;padding-bottom:6px;border-bottom:1px solid var(--line)}
.modbody{font-size:13px;line-height:1.6;color:var(--text)}
.modbody h2{font-family:var(--serif);font-size:14.5px;font-weight:600;color:var(--ink);
  margin:16px 0 7px;letter-spacing:0}
.modbody h3{font-size:12.5px;font-weight:700;color:var(--ink);margin:13px 0 6px}
.modbody p{margin:0 0 9px}
.modbody p.lead{font-size:14px;color:var(--ink);margin:0 0 12px}
.modbody ul.bul,.modbody ol.steps,.modbody ul,.modbody ol{margin:0 0 11px;padding-left:20px}
.modbody li{margin:0 0 5px;line-height:1.55}
.modbody ol.steps{counter-reset:none}
/* Callouts -> note look (grey surface, orange left bar) */
.modbody .callout{background:var(--surface-alt);border:1px solid var(--line);
  border-left:3px solid var(--orange);border-radius:10px;padding:13px 16px;
  margin:0 0 12px;break-inside:avoid}
.modbody .callout.tip{border-left-color:#1F9D55}
.modbody .callout .co-h{font-size:10px;font-weight:700;letter-spacing:.12em;
  text-transform:uppercase;color:var(--orange);margin-bottom:6px}
.modbody .callout.tip .co-h{color:#1F9D55}
.modbody .callout p{margin:0}
/* FAQ */
.modbody .faq{margin:0 0 10px}
.modbody .faq details{border:1px solid var(--line);border-radius:8px;
  padding:10px 14px;margin:0 0 8px;background:var(--surface);break-inside:avoid}
.modbody .faq summary{font-weight:700;color:var(--ink);font-size:12.5px;
  list-style:none;cursor:default}
.modbody .faq summary::-webkit-details-marker{display:none}
.modbody .faq summary::before{content:"Q ";color:var(--orange);font-weight:700}
.modbody .faq .faq-a{margin-top:7px;padding-top:7px;border-top:1px solid var(--line-soft)}
.modbody .faq .faq-a p{margin:0}
/* Tables (.ftab) -> report table look */
.modbody table.ftab,.modbody table{width:100%;border-collapse:collapse;
  margin:0 0 12px;font-size:12px;break-inside:avoid}
.modbody table.ftab thead th,.modbody table thead th{background:#111;color:#fff;
  text-align:left;padding:8px 11px;font-size:10.5px;letter-spacing:.06em;
  text-transform:uppercase;font-weight:700}
.modbody table.ftab td,.modbody table td{padding:8px 11px;
  border-bottom:1px solid var(--line);vertical-align:top}
/* Chips */
.modbody .chip{display:inline-block;padding:2px 9px;border-radius:999px;
  font-size:10.5px;font-weight:700;line-height:1.5}
.modbody .chip.badchip{background:#FDE7E7;color:#B42318}
.modbody .chip.warnchip{background:#FFF3E6;color:#B9560B}
.modbody .chip.okchip{background:#E7F6EC;color:#1F7A3D}
.modbody .chip.accent{background:var(--orange);color:#fff}
</style>
"""

(HC / "_body.html").write_text(extra_css + "\n" + body_html, encoding="utf-8")

# ---- Wrap in brand chrome via the skill's render.py build_html ------------
sys.path.insert(0, str(SKILL / "scripts"))
import render as R  # noqa
R.ASSETS = SKILL / "assets"
R.HERE = SKILL / "scripts"
meta = {
    "eyebrow": "Help Center",
    "company": "Complete Guide",
    "footer_left": "Aquator Marine Private Limited",
    "footer_right_strong": "Help Center",
    "footer_right_sub": DATE,
}
full = R.build_html(extra_css + "\n" + body_html, meta)
tmp = HC / "_full.html"
tmp.write_text(full, encoding="utf-8")
print(f"[ok] composed body: {len(topics)} topics, {total_mods} sections")

# ---- Render with Chrome headless -----------------------------------------
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
subprocess.run([
    CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
    f"--print-to-pdf={OUT}", tmp.resolve().as_uri(),
], check=True, capture_output=True)
print(f"[ok] wrote {OUT}")
