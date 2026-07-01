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
# NOTE: warranty, passage-planning, new-builds and refits are intentionally
# excluded (hidden from the live Help Center and this PDF). Re-add them here to
# restore.
ORDER = [
    "getting-started", "pms", "ism", "sms", "crew-management",
    "in-out-board", "user-management", "accounting", "charter",
    "yacht-plans-subscription",
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
# ---- Cover page ----
parts.append(f"""<section class="cover">
  <div class="cover-kicker">Complete Guide &middot; {DATE}</div>
  <h1 class="cover-title">Aquator<br>Help&nbsp;Center</h1>
  <div class="cover-rule"></div>
  <p class="cover-sub">The complete operating manual for Aquator Marine &mdash;
  every module, setting and workflow, from PMS, ISM, SMS, Crew, Charter and
  Accounting through fleet management, settings and support.</p>
  <div class="cover-stats">
    <div><b>{len(topics)}</b><span>Chapters</span></div>
    <div><b>{total_mods}</b><span>Sections</span></div>
    <div><b>{DATE}</b><span>Edition</span></div>
  </div>
  <div class="cover-by">Aquator Marine Private Limited</div>
</section>""")

# ---- Table of Contents (each row links internally to its chapter; the page
# number on the right is drawn in post-process once pagination is known) ----
rows = []
for i, (slug, title, mods) in enumerate(topics, 1):
    rows.append(
        f'<a class="toc-row" href="#ch-{slug}">'
        f'<span class="toc-num">{i:02d}</span>'
        f'<span class="toc-title">{html.escape(title)}</span>'
        f'<span class="toc-dots"></span>'
        f'<span class="toc-pg"></span></a>')
parts.append('<section class="book-toc"><div class="toc-h">Table of Contents</div>'
             + "".join(rows) + '</section>')

# Per-topic chapters. Each chapter is wrapped in a plain block <section> that
# carries the page break and the #ch-* anchor — putting break-before on the flex
# `.sec` header instead makes Chrome emit phantom blank pages. Titles deep-link
# back to the online Help Center (chapter -> page, module -> page#anchor).
for slug, title, mods in topics:
    turl = f"{BASE}{slug}.html"
    chap = [f'<section class="chapter" id="ch-{slug}">'
            f'<div class="sec topic-sec">'
            f'<a class="label" href="{turl}">{html.escape(title)}</a>'
            f'<span class="hint">{len(mods)} sections</span></div>']
    for m in mods:
        name = html.unescape(m.get("name", ""))
        mid = m.get("id", "")
        murl = f"{turl}#{mid}" if mid else turl
        body = clean_body(m.get("body", ""), slug)
        chap.append(f'<div class="modblock"><div class="modtitle">'
                    f'<a href="{murl}">{html.escape(name)}</a></div>'
                    f'<div class="modbody">{body}</div></div>')
    chap.append('</section>')
    parts.append("".join(chap))

body_html = "\n".join(parts)

# ---- Supplementary styles for help-center element classes -----------------
extra_css = """
<style>
/* Each chapter starts on a fresh page; the first one need not. The break lives
   on the block wrapper (not the flex `.sec` header) to avoid phantom blanks. */
.chapter{break-before:page}
.chapter:first-of-type{break-before:auto}
/* Keep the chapter header whole and glued to its first block — letting the flex
   `.sec` header fragment at a page break is what spawned phantom blank pages. */
.topic-sec{margin-top:6px;break-inside:avoid;break-after:avoid}
.modblock{break-inside:avoid;margin:0 0 4px}
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
# Make the masthead logo + AQUATOR wordmark a link to the live Help Center.
full = full.replace(
    '<div class="logo">',
    f'<a class="logo" href="{BASE}" style="text-decoration:none;color:inherit">', 1)
full = full.replace('    </div>\n    <div class="doc">',
                    '    </a>\n    <div class="doc">', 1)
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

# ---- Book post-process: drop blank pages, then bookmarks, TOC page numbers,
# footer page numbers. Chrome turns the TOC's #ch-* anchors into internal links;
# we capture those (rect + destination) BEFORE removing blank pages, then rebuild
# the navigation against the cleaned layout. PyMuPDF keeps the external links.
import fitz, bisect

doc = fitz.open(str(OUT))
GREY = (0.30, 0.33, 0.35)

# Capture TOC internal links (rect + destination) in reading order = chapters.
ch_links = []
for pi in range(doc.page_count):
    for ln in doc[pi].get_links():
        if ln.get("page", -1) >= 0 and not ln.get("uri"):
            ch_links.append([pi, fitz.Rect(ln["from"]), ln["page"]])
ch_links.sort(key=lambda t: (t[0], round(t[1].y0)))

# Phantom blank pages: page breaks between chapters occasionally leave a fully
# empty page (only a stray 1px rule). Find any page (never the cover) with no
# text in the content band. A chapter link landing on a blank really targets the
# next page, so nudge those destinations before we delete.
def is_blank(pi):
    H = doc[pi].rect.height
    return not any(96 < ln["bbox"][1] < H - 46
                   for b in doc[pi].get_text("dict")["blocks"]
                   for ln in b.get("lines", []))
blanks = sorted(pi for pi in range(1, doc.page_count) if is_blank(pi))
for cl in ch_links:
    if cl[2] in blanks:
        cl[2] += 1
for pi in reversed(blanks):
    doc.delete_page(pi)
N = doc.page_count
remap = lambda old: old - bisect.bisect_left(blanks, old)
if blanks:
    print(f"[ok] removed {len(blanks)} blank page(s): {[b + 1 for b in blanks]}")

if len(ch_links) == len(topics):
    # Rebuild the TOC internal links cleanly against the new page layout.
    for pi in range(N):
        for ln in list(doc[pi].get_links()):
            if ln.get("page", -1) >= 0 and not ln.get("uri"):
                doc[pi].delete_link(ln)
    starts = []
    for (src_pi, rect, dest), (slug, title, mods) in zip(ch_links, topics):
        src, dst = remap(src_pi), remap(dest)
        starts.append(dst)
        doc[src].insert_link({"kind": fitz.LINK_GOTO, "from": rect, "page": dst})
        # page number on the TOC row, aligned to its text baseline
        label = str(dst + 1)
        tw = fitz.get_text_length(label, fontname="helv", fontsize=11)
        ys = [s["origin"][1]
              for b in doc[src].get_text("dict", clip=rect)["blocks"]
              for ln in b.get("lines", []) for s in ln["spans"]]
        baseline = min(ys) if ys else rect.y1 - 8
        doc[src].insert_text((rect.x1 - tw, baseline), label,
                             fontname="helv", fontsize=11, color=GREY)

    # Bookmark outline: chapter (level 1) + section (level 2). Locate each
    # section by its TITLE LINE (a line equal to the name) so body cross-refs
    # don't mislead us.
    def title_page(name, p0, p1):
        for p in range(p0, p1):
            for blk in doc[p].get_text("dict")["blocks"]:
                for line in blk.get("lines", []):
                    if "".join(s["text"] for s in line["spans"]).strip() == name:
                        return p
        return None
    outline = []
    for ci, (slug, title, mods) in enumerate(topics):
        cstart = starts[ci]
        cend = starts[ci + 1] if ci + 1 < len(starts) else N
        outline.append([1, title, cstart + 1])
        for m in mods:
            name = html.unescape(m.get("name", ""))
            pg = title_page(name, cstart, cend)
            outline.append([2, name, (pg if pg is not None else cstart) + 1])
    doc.set_toc(outline)
    print(f"[ok] linked TOC + {len(topics)} chapters / {len(outline)} bookmarks")
else:
    print(f"[warn] TOC links {len(ch_links)} != topics {len(topics)} — skipped outline")

# Footer page numbers on every page except the cover (page 0).
for i in range(1, N):
    pg = doc[i]
    w, h = pg.rect.width, pg.rect.height
    txt = f"{i + 1} / {N}"
    tw = fitz.get_text_length(txt, fontname="helv", fontsize=8)
    pg.insert_text(((w - tw) / 2, h - 17), txt, fontname="helv", fontsize=8, color=GREY)

out_tmp = OUT.with_suffix(".tmp.pdf")
doc.save(str(out_tmp), garbage=4, deflate=True)
doc.close()
out_tmp.replace(OUT)
print(f"[ok] wrote book PDF: {N} pages")
