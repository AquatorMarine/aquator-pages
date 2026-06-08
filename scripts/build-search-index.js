#!/usr/bin/env node
/*
 * Rebuilds the inlined search index in home.html.
 *
 * The help pages keep their real content inside <script id="kb"> JSON that is
 * only rendered at runtime, so home.html can't index them from the DOM. And
 * fetching each page fails when home.html is opened via file://. To make search
 * work everywhere, this script reads every module's kb JSON, flattens it into a
 * search index, and inlines it into home.html as <script id="search-index">.
 *
 * Run it from the repo root after editing any module page:
 *   node scripts/build-search-index.js
 */
const fs = require("fs");
const path = require("path");

// Help pages and home.html live in the help-center folder, one level up.
const DIR = path.join(__dirname, "..", "help-center");

// page label -> file (must match the modules shown on home.html)
const FILES = [
  ["Accounting", "accounting.html"],
  ["Crew Management", "crew-management.html"],
  ["PMS", "pms.html"],
  ["Yacht Plans & Subscription", "yacht-plans-subscription.html"],
  ["Warranty", "warranty.html"],
  ["Refits", "refits.html"],
  ["Charter", "charter.html"],
  ["ISM", "ism.html"],
  ["SMS", "sms.html"],
  ["File Manager", "file-manager.html"],
  ["New Builds", "new-builds.html"],
  ["Shipyard", "shipyard.html"],
  ["Smart Documents", "smart-documents.html"],
  ["Yacht Management", "yacht-management.html"],
  ["In/Out Board", "in-out-board.html"],
  ["AIS Tracker", "ais-tracker.html"],
  ["User Management", "user-management.html"],
];

function stripHtml(h) {
  return h
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;|&#\d+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function headings(body) {
  const out = [];
  const re = /<(?:h2|h3|summary)[^>]*>([\s\S]*?)<\/(?:h2|h3|summary)>/gi;
  let m;
  while ((m = re.exec(body))) out.push(stripHtml(m[1]));
  return out;
}

function buildIndex() {
  const index = [];
  for (const [name, url] of FILES) {
    const file = path.join(DIR, url);
    let html;
    try {
      html = fs.readFileSync(file, "utf8");
    } catch (e) {
      console.warn("! skipping missing file:", url);
      continue;
    }
    const m = html.match(/<script id="kb"[^>]*>([\s\S]*?)<\/script>/);
    if (!m) {
      console.warn("! no kb JSON in:", url);
      continue;
    }
    let data;
    try {
      data = JSON.parse(m[1]);
    } catch (e) {
      console.warn("! bad kb JSON in:", url, "-", e.message);
      continue;
    }
    (data.modules || []).forEach((mod) => {
      index.push({
        collection: name,
        title: mod.name,
        headings: headings(mod.body || ""),
        text: stripHtml(mod.body || ""),
        url: url + "#" + mod.id,
      });
    });
  }
  return index;
}

function inject(index) {
  const homePath = path.join(DIR, "home.html");
  let html = fs.readFileSync(homePath, "utf8");

  let json = JSON.stringify(index)
    .replace(/</g, "\\u003c")
    .replace(new RegExp(String.fromCharCode(0x2028), "g"), "\\u2028")
    .replace(new RegExp(String.fromCharCode(0x2029), "g"), "\\u2029");

  const block =
    '    <script id="search-index" type="application/json">\n' +
    json +
    "\n    </script>\n";

  const existing =
    /    <script id="search-index" type="application\/json">[\s\S]*?<\/script>\n/;
  if (existing.test(html)) {
    html = html.replace(existing, block);
  } else {
    const marker = '    <script>\n      const FILES = [';
    if (html.indexOf(marker) === -1) {
      throw new Error("Could not find insertion marker in home.html");
    }
    html = html.replace(marker, block + marker);
  }
  fs.writeFileSync(homePath, html);
}

const index = buildIndex();
inject(index);
console.log("Search index rebuilt:", index.length, "articles inlined into home.html");
