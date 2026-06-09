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

# Book structure: chapters grouped into Parts, sequenced as a user journey
# (set up -> daily use -> commercial -> projects -> documents -> extend -> help).
# NOTE: warranty, passage-planning and new-builds are intentionally excluded
# (hidden from the live Help Center and this PDF). Re-add them to a Part to restore.
PARTS = [
    ("Set Up",
     "Create your account, configure the platform, and set who can do what.",
     ["getting-started", "global-settings", "yacht-settings",
      "personal-settings", "user-management"]),
    ("Daily Operations",
     "The modules your crew use day to day — maintenance, safety and the board.",
     ["pms", "ism", "sms", "in-out-board", "crew-management"]),
    ("Commercial",
     "Charters, finances and your Aquator subscription.",
     ["charter", "accounting", "yacht-plans-subscription"]),
    ("Projects & Yard",
     "Manage refit projects and shipyard work.",
     ["refits", "shipyard"]),
    ("Documents & Fleet",
     "Files, smart documents, fleet management and live vessel tracking.",
     ["file-manager", "smart-documents", "yacht-management", "ais-tracker"]),
    ("Customise & Extend",
     "Make Aquator your own and connect it to the tools you already use.",
     ["theme-customizer", "sidebar-settings", "white-labeling",
      "integrations", "mobile-app"]),
    ("Help",
     "Answers to common questions and how to reach us.",
     ["faq", "customer-support"]),
]
ORDER = [slug for _, _, slugs in PARTS for slug in slugs]
ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"]

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
topics = [(slug, page_title(slug), modules(slug)) for slug in ORDER]
tmap = {slug: (title, mods) for slug, title, mods in topics}
chno = {slug: i for i, slug in enumerate(ORDER, 1)}   # continuous chapter numbers
total_mods = sum(len(m) for _, _, m in topics)

# Ordered list of TOC entries (parts + chapters), in the exact order they appear
# on the contents page. Used after rendering to match internal links 1:1.
toc_entries = []
for pi, (ptitle, _pdesc, slugs) in enumerate(PARTS):
    toc_entries.append(("part", pi, f"Part {ROMAN[pi]} · {ptitle}"))
    for slug in slugs:
        toc_entries.append(("chapter", slug, tmap[slug][0]))

parts = []
# ---- Cover page ----
parts.append(f"""<section class="cover">
  <div class="cover-kicker">Complete Guide &middot; {DATE}</div>
  <h1 class="cover-title">Aquator<br>Help&nbsp;Center</h1>
  <div class="cover-rule"></div>
  <p class="cover-sub">The complete operating manual for Aquator Marine &mdash;
  every module, setting and workflow, organised as a guided journey from first
  set-up through daily operations to customisation and support.</p>
  <div class="cover-stats">
    <div><b>{len(PARTS)}</b><span>Parts</span></div>
    <div><b>{len(topics)}</b><span>Chapters</span></div>
    <div><b>{total_mods}</b><span>Sections</span></div>
  </div>
  <div class="cover-by">Aquator Marine Private Limited</div>
</section>""")

# ---- Table of Contents, grouped into Parts. Part headers and chapter rows are
# internal links; the page number on the right is drawn in post-process. ----
toc_html = ['<section class="book-toc"><div class="toc-h">Table of Contents</div>']
for pi, (ptitle, _pdesc, slugs) in enumerate(PARTS):
    toc_html.append(
        f'<a class="toc-part" href="#part-{pi}">'
        f'<span class="toc-part-k">Part {ROMAN[pi]}</span>'
        f'<span class="toc-part-t">{html.escape(ptitle)}</span>'
        f'<span class="toc-dots"></span><span class="toc-pg"></span></a>')
    for slug in slugs:
        title, mods = tmap[slug]
        toc_html.append(
            f'<a class="toc-row" href="#ch-{slug}">'
            f'<span class="toc-num">{chno[slug]:02d}</span>'
            f'<span class="toc-title">{html.escape(title)}</span>'
            f'<span class="toc-dots"></span><span class="toc-pg"></span></a>')
toc_html.append('</section>')
parts.append("".join(toc_html))

# ---- Parts: a divider page, then the part's chapters. Titles deep-link back to
# the online Help Center so the PDF doubles as a clickable index. ----
for pi, (ptitle, pdesc, slugs) in enumerate(PARTS):
    items = "".join(
        f'<li><span class="pc-num">{chno[s]:02d}</span>'
        f'<span class="pc-t">{html.escape(tmap[s][0])}</span></li>' for s in slugs)
    parts.append(
        f'<section class="part-divider" id="part-{pi}">'
        f'<div class="part-kicker">Part {ROMAN[pi]}</div>'
        f'<h2 class="part-title">{html.escape(ptitle)}</h2>'
        f'<div class="part-rule"></div>'
        f'<p class="part-desc">{html.escape(pdesc)}</p>'
        f'<ol class="part-contents">{items}</ol></section>')
    for slug in slugs:
        title, mods = tmap[slug]
        turl = f"{BASE}{slug}.html"
        parts.append(f'<div class="sec topic-sec" id="ch-{slug}">'
                     f'<a class="label" href="{turl}">{html.escape(title)}</a>'
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

/* ================= BOOK: cover page ================= */
.cover{break-after:page;min-height:900px;display:flex;flex-direction:column;padding:54px 6px 0}
.cover-kicker{font-size:12px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:var(--orange)}
.cover-title{font-family:var(--serif);font-size:66px;line-height:1.03;font-weight:600;
  color:#1C333D;margin:24px 0 0;letter-spacing:0}
.cover-rule{width:92px;height:4px;background:var(--orange);margin:28px 0 26px}
.cover-sub{font-size:15px;line-height:1.62;color:var(--text);max-width:560px;margin:0}
.cover-stats{display:flex;gap:48px;margin:52px 0 0}
.cover-stats>div{display:flex;flex-direction:column}
.cover-stats b{font-family:var(--serif);font-size:32px;font-weight:600;color:#1C333D;line-height:1}
.cover-stats span{font-size:10.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;
  color:var(--muted);margin-top:7px}
.cover-by{margin-top:auto;padding:22px 0 26px;font-size:12px;font-weight:600;
  letter-spacing:.04em;color:var(--muted);border-top:1px solid var(--line)}

/* ================= BOOK: table of contents ================= */
.book-toc{break-after:page;padding-top:6px}
.toc-h{font-family:var(--serif);font-size:32px;font-weight:600;color:#1C333D;
  margin:4px 0 20px;padding-bottom:14px;border-bottom:2px solid var(--orange)}
.toc-row{display:flex;align-items:baseline;gap:12px;text-decoration:none;
  padding:8.5px 2px;border-bottom:1px solid var(--line-soft)}
.toc-num{font-family:var(--sans);font-weight:700;font-size:12.5px;color:var(--orange);
  min-width:24px;flex:none}
.toc-title{font-family:var(--serif);font-size:15.5px;font-weight:600;color:#1C333D;white-space:nowrap}
.toc-dots{flex:1;border-bottom:1px dotted #C4CACE;transform:translateY(-4px);min-width:18px}
.toc-pg{min-width:30px;flex:none}   /* page number drawn here in post-process */
/* TOC part headers (group rows) */
.toc-part{display:flex;align-items:baseline;gap:12px;text-decoration:none;
  margin:22px 0 4px;padding:0 2px 7px;border-bottom:2px solid var(--orange)}
.toc-part:first-of-type{margin-top:6px}
.toc-part-k{font-family:var(--sans);font-weight:700;font-size:10.5px;letter-spacing:.16em;
  text-transform:uppercase;color:var(--orange);flex:none}
.toc-part-t{font-family:var(--serif);font-size:18px;font-weight:600;color:#1C333D;white-space:nowrap}
.toc-part .toc-dots{border-bottom:none}

/* ================= BOOK: part divider page ================= */
.part-divider{break-before:page;break-after:page;min-height:880px;
  display:flex;flex-direction:column;padding:96px 6px 0}
.part-kicker{font-size:13px;font-weight:700;letter-spacing:.30em;text-transform:uppercase;color:var(--orange)}
.part-title{font-family:var(--serif);font-size:52px;font-weight:600;color:#1C333D;
  margin:16px 0 0;line-height:1.05;letter-spacing:0}
.part-rule{width:90px;height:4px;background:var(--orange);margin:26px 0 22px}
.part-desc{font-size:15px;line-height:1.6;color:var(--text);max-width:540px;margin:0 0 30px}
.part-contents{list-style:none;margin:0;padding:0;max-width:560px}
.part-contents li{display:flex;gap:14px;align-items:baseline;padding:9px 0;
  border-bottom:1px solid var(--line-soft)}
.part-contents .pc-num{font-family:var(--sans);font-weight:700;color:var(--orange);
  font-size:12.5px;min-width:24px;flex:none}
.part-contents .pc-t{font-family:var(--serif);font-size:16px;font-weight:600;color:#1C333D}
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

# ---- Book post-process: bookmarks, TOC page numbers, footer page numbers --
# Chrome already turned the TOC's #ch-* anchors into internal GoTo links, so we
# read those to learn each chapter's start page, then (a) print the page number
# on its TOC row, (b) build a chapter/section bookmark outline (the PDF nav
# panel), and (c) stamp "N / total" in every page footer. Done with PyMuPDF so
# the external title links Chrome created are preserved.
import fitz

doc = fitz.open(str(OUT))
N = doc.page_count

# All internal links are the TOC rows (part headers + chapters); body/title
# links are external https. Chrome emits internal links as NAMED links that
# resolve to a page, so match on page>=0. Sorted by (page, y) they line up 1:1
# with toc_entries (the order we wrote the contents page in).
nav_links = []
for pi in range(N):
    for ln in doc[pi].get_links():
        if ln.get("page", -1) >= 0 and not ln.get("uri"):
            nav_links.append((pi, fitz.Rect(ln["from"]), ln["page"]))
nav_links.sort(key=lambda t: (t[0], round(t[1].y0)))

GREY = (0.30, 0.33, 0.35)

def title_page(name, p0, p1):
    """Page of a section, found by its TITLE LINE (a line equal to the name) so
    incidental cross-references in body text don't mislead us."""
    for p in range(p0, p1):
        for blk in doc[p].get_text("dict")["blocks"]:
            for line in blk.get("lines", []):
                if "".join(s["text"] for s in line["spans"]).strip() == name:
                    return p
    return None

if len(nav_links) == len(toc_entries):
    # (a) print the destination page number at the right of every TOC row,
    # aligned to the row's text baseline.
    for (src_pi, rect, dest), entry in zip(nav_links, toc_entries):
        label = str(dest + 1)
        tw = fitz.get_text_length(label, fontname="helv", fontsize=11)
        ys = [s["origin"][1]
              for b in doc[src_pi].get_text("dict", clip=rect)["blocks"]
              for ln in b.get("lines", []) for s in ln["spans"]]
        baseline = min(ys) if ys else rect.y1 - 8
        doc[src_pi].insert_text((rect.x1 - tw, baseline), label,
                                fontname="helv", fontsize=11, color=GREY)

    # (b) three-level outline: Part -> Chapter -> Section.
    dests = [d for _, _, d in nav_links]
    # chapter start pages in reading order (for section search ranges)
    chap_dests = [d for (_, _, d), e in zip(nav_links, toc_entries) if e[0] == "chapter"]
    chap_i = 0
    outline = []
    for (src_pi, rect, dest), entry in zip(nav_links, toc_entries):
        kind, ref, label = entry
        if kind == "part":
            outline.append([1, label, dest + 1])
        else:
            outline.append([2, label, dest + 1])
            cstart = chap_dests[chap_i]
            cend = chap_dests[chap_i + 1] if chap_i + 1 < len(chap_dests) else N
            chap_i += 1
            for m in tmap[ref][1]:
                name = html.unescape(m.get("name", ""))
                pg = title_page(name, cstart, cend)
                outline.append([3, name, (pg if pg is not None else cstart) + 1])
    doc.set_toc(outline)
    print(f"[ok] linked TOC ({len(PARTS)} parts, {len(topics)} chapters) / "
          f"{len(outline)} bookmarks")
else:
    print(f"[warn] nav links {len(nav_links)} != entries {len(toc_entries)} — "
          f"skipped outline")

# (c) footer page numbers on every page except the cover (page 0)
for i in range(1, N):
    pg = doc[i]
    w, h = pg.rect.width, pg.rect.height
    txt = f"{i + 1} / {N}"
    tw = fitz.get_text_length(txt, fontname="helv", fontsize=8)
    pg.insert_text(((w - tw) / 2, h - 17), txt, fontname="helv", fontsize=8, color=GREY)

doc.saveIncr()
print(f"[ok] wrote book PDF: {N} pages")
