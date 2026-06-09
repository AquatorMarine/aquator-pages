#!/usr/bin/env python3
"""Compose a single body fragment for the whole Help Center, then render it
through the pdf-report skill's brand chrome (orange masthead + dark colophon)
using locally-installed Google Chrome (headless) instead of Playwright."""
import re, json, html, pathlib, subprocess, sys

HC = pathlib.Path("/Users/mac/Nirali/aquator/aquator-pages/help-center")
SKILL = pathlib.Path("/Users/mac/Downloads/sales-engine_4/skills/pdf-report")
OUT = HC / "Aquator-Help-Center-Complete-Guide.pdf"
DATE = "June 2026"
# Online Help Center — topic/module titles in the PDF link back here.
BASE = "https://help.aquatormarine.com/help-center/"

# Topic order: Getting Started first, then the index card order.
# NOTE: warranty, passage-planning and new-builds are intentionally excluded
# (hidden from the live Help Center and this PDF). Re-add them here to restore.
ORDER = [
    "getting-started", "pms", "ism", "sms", "crew-management",
    "in-out-board", "user-management", "accounting", "charter",
    "yacht-plans-subscription", "refits",
    "shipyard", "file-manager", "smart-documents", "yacht-management",
    "ais-tracker", "global-settings", "yacht-settings", "personal-settings",
    "theme-customizer", "sidebar-settings", "white-labeling", "integrations",
    "mobile-app", "faq", "customer-support",
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

def clean_body(body, slug):
    # Force all FAQ <details> open so they print expanded.
    body = re.sub(r"<details(?![^>]*\bopen\b)", "<details open", body)

    # Rewrite relative links to the online Help Center so the PDF never carries
    # local file:// links (Chrome would otherwise absolutise them against disk).
    def fix(m):
        href = m.group(1)
        if href.startswith(("http://", "https://", "mailto:", "tel:")):
            return m.group(0)
        if href.startswith("#"):
            href = f"{slug}.html{href}"
        return f'href="{BASE}{href}"'

    return re.sub(r'href="([^"]+)"', fix, body)

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

# Per-topic sections. Titles deep-link back to the online Help Center so the
# PDF doubles as a clickable index (topic header -> page, module -> page#anchor).
for slug, title, mods in topics:
    turl = f"{BASE}{slug}.html"
    parts.append(f'<div class="sec topic-sec"><a class="label" href="{turl}">{html.escape(title)}</a>'
                 f'<span class="hint">{len(mods)} sections</span></div>')
    for m in mods:
        name = html.unescape(m.get("name", ""))
        mid = m.get("id", "")
        murl = f"{turl}#{mid}" if mid else turl
        body = clean_body(m.get("body", ""), slug)
        parts.append(f'<div class="modblock"><div class="modtitle">'
                     f'<a href="{murl}">{html.escape(name)}</a></div>'
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

/* ================================================================
   PRINT-FRIENDLY BRAND CHROME  (overrides the skill's heavy CSS)
   Mostly white; orange #FF6500 + brand slate #1C333D as accents only,
   matched to the Aquator website palette. No full-bleed ink bands.
   ================================================================ */
/* Re-tone the whole document to the website's slate instead of black */
:root{--ink:#1C333D;--orange-2:#E55B00}
/* Masthead: white with orange wordmark + thin orange rule (was solid orange) */
.hdr{background:#fff;color:#1C333D;border-bottom:2.5px solid var(--orange);padding:15px 36px}
.word{color:var(--orange)}
.tag{color:var(--muted);opacity:1}
.kicker{color:var(--orange-2);opacity:1}
.who{color:#1C333D}
.mark img{height:40px}
/* Footer: white with a hairline top rule (was solid black band) */
.ftr{background:#fff;color:#1C333D;border-top:1px solid var(--line);padding:11px 36px}
.ftr .r{color:var(--muted)}
/* Section badge: outline the number instead of an orange fill block */
.sec{border-bottom:1.5px solid var(--orange)}
.sec::before{background:#fff;color:var(--orange);border:1.5px solid var(--orange)}
/* Table headers: light surface + dark slate text + orange underline (was black) */
.modbody table.ftab thead th,.modbody table thead th,.table thead th{
  background:var(--surface-alt);color:#1C333D;
  border-bottom:2px solid var(--orange)}
/* Keep dark chips readable as a slate, not pure black */
.modbody .chip.dark,.chip.dark{background:#1C333D}
/* Title links back to the online Help Center: keep the title look, drop link chrome */
.sec a.label{color:var(--orange);text-decoration:none}
.modtitle a{color:inherit;text-decoration:none}
.modtitle a:hover,.sec a.label:hover{text-decoration:none}
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
# Masthead is now white, so the white header logo would be invisible —
# swap it for the orange anchor (the same logo the footer already uses).
full = full.replace(R.png_data_uri("aquator-white.png"),
                    R.png_data_uri("aquator-orange.png"))
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

# ---- Stamp page numbers into the footer band -----------------------------
# Chrome's --print-to-pdf can't render CSS paged-media margin boxes, so we
# overlay "N / total" centred in the white footer band as a post-process.
# merge_page keeps the page's link annotations, so the title hyperlinks survive.
import io
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4

reader = PdfReader(str(OUT))
n = len(reader.pages)
buf = io.BytesIO()
c = canvas.Canvas(buf, pagesize=A4)
PWpt, PHpt = A4
for i in range(n):
    c.setFont("Helvetica", 8)
    c.setFillColorRGB(0.42, 0.45, 0.47)   # muted slate-grey, matches footer text
    c.drawCentredString(PWpt / 2, 15, f"{i + 1} / {n}")
    c.showPage()
c.save()
buf.seek(0)
overlay = PdfReader(buf)
writer = PdfWriter()
for i, pg in enumerate(reader.pages):
    pg.merge_page(overlay.pages[i])
    writer.add_page(pg)
with open(OUT, "wb") as f:
    writer.write(f)
print(f"[ok] stamped page numbers on {n} pages")
