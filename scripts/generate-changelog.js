const https = require("https");

// ─── Config ───────────────────────────────────────────────────────────
const {
  ASANA_PAT,
  ANTHROPIC_API_KEY,
  GH_PAT,
  HELP_SITE_REPO,
  ASANA_PROJECT_GID,
  SLACK_WEBHOOK_URL,
  CHANGELOG_FILE_PATH,
  REVIEWERS,
  // ─── Local testing overrides ──────────────────────────────────────
  // DRY_RUN=1     → fetch Asana + build the release block, then print it
  //                 and stop. Skips the GitHub PR and Slack steps.
  // SKIP_DATE_GUARD=1 → bypass the "last day of the month" guard.
  // OVERRIDE_MONTH=YYYY-MM → generate the changelog for a specific month
  //                 instead of the current one (e.g. 2026-05). Implies the
  //                 date guard is skipped.
  DRY_RUN,
  SKIP_DATE_GUARD,
  OVERRIDE_MONTH,
} = process.env;

const isDryRun = DRY_RUN === "1" || DRY_RUN === "true";

const DEFAULT_FILE_PATH = "change-log/index.html";

// ─── DESIGN CONTRACT ────────────────────────────────────────────────────
// The live page (change-log/index.html) is a hand-designed layout. This
// script NEVER rewrites or removes existing markup — it only INSERTS:
//   • a new <article class="release"> inside the matching <section
//     class="year-section">  (or a brand-new year-section when the year
//     does not exist yet),
//   • the matching "Browse by month" sidebar entry,
//   • a new year tab + sidebar year block when a new year starts.
// The ONLY existing text it edits are two metadata values that would
// otherwise go stale: the year-section "<b>N</b> releases shipped" count
// and the hero "Latest version · …" label. Everything else is purely added.
//
// To keep the generated block structurally identical to the existing ones,
// the model returns STRUCTURED JSON (headline/summary/entries) and this
// script assembles the exact HTML — so classes, ids, counters, tab counts
// and data-search strings can never drift from the design.

// ─── Validate required secrets ────────────────────────────────────────
function validateSecrets() {
  const required = {
    ASANA_PAT,
    ANTHROPIC_API_KEY,
    GH_PAT,
    HELP_SITE_REPO,
    ASANA_PROJECT_GID,
  };

  const missing = Object.entries(required)
    .filter(([, value]) => !value || !value.trim())
    .map(([key]) => key);

  if (missing.length > 0) {
    console.error("❌ Missing required secrets/environment variables:");
    missing.forEach((key) => console.error(`   - ${key}`));
    console.error(
      "\nPlease configure the secrets above before running the changelog pipeline."
    );
    process.exit(1);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────
function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// HTML-escape text destined for element content or an attribute value.
function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Returns true when `date` is the last day of its month.
function isLastDayOfMonth(date) {
  const tomorrow = new Date(date);
  tomorrow.setDate(date.getDate() + 1);
  return tomorrow.getMonth() !== date.getMonth();
}

function getDateRange() {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth(); // current month (0-indexed)

  // Local testing: target a specific month, e.g. OVERRIDE_MONTH=2026-05
  if (OVERRIDE_MONTH) {
    const [y, m] = OVERRIDE_MONTH.split("-").map(Number);
    if (!y || !m || m < 1 || m > 12) {
      console.error(
        `❌ Invalid OVERRIDE_MONTH "${OVERRIDE_MONTH}". Expected YYYY-MM (e.g. 2026-05).`
      );
      process.exit(1);
    }
    year = y;
    month = m - 1; // convert to 0-indexed
  }

  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0, 23, 59, 59); // last day of month
  const lastDay = new Date(year, month + 1, 0).getDate();

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  const monthNum = month + 1; // 1-indexed
  const MM = String(monthNum).padStart(2, "0");
  const DD = String(lastDay).padStart(2, "0");

  return {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    monthName: monthNames[month],
    year,
    monthNum,
    ym: `${year}-${MM}`, // dedup key (matches data-iso prefix)
    iso: `${year}-${MM}-${DD}`, // data-iso for the release (last day of month)
    displayDate: `${lastDay} ${monthNames[month]} ${year}`, // e.g. "31 May 2026"
  };
}

// ─── Step 1: Fetch Asana Tasks ────────────────────────────────────────
async function fetchAsanaTasks(startDate, endDate) {
  console.log("📋 Fetching completed Asana tasks...");

  const sectionsRes = await request({
    hostname: "app.asana.com",
    path: `/api/1.0/projects/${ASANA_PROJECT_GID}/sections`,
    method: "GET",
    headers: { Authorization: `Bearer ${ASANA_PAT}` },
  });

  const sections = sectionsRes.data.data || [];
  const tasksBySection = {};

  for (const section of sections) {
    const tasksRes = await request({
      hostname: "app.asana.com",
      path: `/api/1.0/sections/${section.gid}/tasks?opt_fields=name,notes,completed,completed_at&completed_since=${startDate}`,
      method: "GET",
      headers: { Authorization: `Bearer ${ASANA_PAT}` },
    });

    const tasks = (tasksRes.data.data || []).filter((task) => {
      if (!task.completed || !task.completed_at) return false;
      const completedAt = new Date(task.completed_at);
      return (
        completedAt >= new Date(startDate) && completedAt <= new Date(endDate)
      );
    });

    if (tasks.length > 0) {
      tasksBySection[section.name] = tasks.map((t) => ({
        name: t.name,
        description: t.notes || "",
      }));
    }
  }

  const totalTasks = Object.values(tasksBySection).reduce(
    (sum, tasks) => sum + tasks.length,
    0
  );
  console.log(
    `   Found ${totalTasks} completed tasks across ${Object.keys(tasksBySection).length} sections`
  );

  return tasksBySection;
}

const GH_HEADERS = () => ({
  Authorization: `token ${GH_PAT}`,
  "User-Agent": "changelog-bot",
});

// ─── Read a file's content + blob sha from GitHub ─────────────────────
// The Contents API only returns the body for files ≤ 1 MB. Our page is
// larger, so for those it returns the metadata (incl. the blob sha) with an
// empty body — we then fetch the actual bytes via the Git Blobs API, which
// supports files up to 100 MB.
async function fetchFileContent(owner, repo, filePath, ref) {
  const res = await request({
    hostname: "api.github.com",
    path: `/repos/${owner}/${repo}/contents/${filePath}?ref=${ref}`,
    method: "GET",
    headers: GH_HEADERS(),
  });

  if (res.status !== 200 || !res.data || !res.data.sha) {
    return { content: "", sha: null };
  }

  // Small file: body is inline.
  if (res.data.content && res.data.encoding === "base64") {
    return {
      content: Buffer.from(res.data.content, "base64").toString("utf-8"),
      sha: res.data.sha,
    };
  }

  // Large file (> 1 MB): fetch the blob by sha.
  const blob = await request({
    hostname: "api.github.com",
    path: `/repos/${owner}/${repo}/git/blobs/${res.data.sha}`,
    method: "GET",
    headers: GH_HEADERS(),
  });
  if (blob.status !== 200 || !blob.data || !blob.data.content) {
    return { content: "", sha: res.data.sha };
  }
  return {
    content: Buffer.from(blob.data.content, "base64").toString("utf-8"),
    sha: res.data.sha,
  };
}

// ─── Commit a file via the Git Data API ───────────────────────────────
// Used instead of the Contents API PUT because that endpoint also caps at
// 1 MB. Builds blob → tree → commit → moves the branch ref.
async function commitViaGitData(owner, repo, branch, filePath, content, message) {
  const base = `/repos/${owner}/${repo}`;

  // a. Latest commit on the branch + its tree.
  const refRes = await request({
    hostname: "api.github.com",
    path: `${base}/git/ref/heads/${branch}`,
    method: "GET",
    headers: GH_HEADERS(),
  });
  if (refRes.status !== 200 || !refRes.data || !refRes.data.object) {
    throw new Error(
      `GitHub: could not read ref for "${branch}" (HTTP ${refRes.status}) — ${
        (refRes.data && refRes.data.message) || JSON.stringify(refRes.data)
      }`
    );
  }
  const headSha = refRes.data.object.sha;

  const commitInfo = await request({
    hostname: "api.github.com",
    path: `${base}/git/commits/${headSha}`,
    method: "GET",
    headers: GH_HEADERS(),
  });
  if (commitInfo.status !== 200 || !commitInfo.data || !commitInfo.data.tree) {
    throw new Error(
      `GitHub: could not read commit ${headSha} (HTTP ${commitInfo.status}).`
    );
  }
  const baseTree = commitInfo.data.tree.sha;

  const postJson = (path, body) =>
    request(
      {
        hostname: "api.github.com",
        path: `${base}${path}`,
        method: "POST",
        headers: { ...GH_HEADERS(), "Content-Type": "application/json" },
      },
      body
    );

  // b. New blob with the updated file bytes.
  const blobRes = await postJson("/git/blobs", {
    content: Buffer.from(content).toString("base64"),
    encoding: "base64",
  });
  if (blobRes.status >= 300 || !blobRes.data || !blobRes.data.sha) {
    throw new Error(
      `GitHub: failed to create blob (HTTP ${blobRes.status}) — ${
        (blobRes.data && blobRes.data.message) || JSON.stringify(blobRes.data)
      }. A 403 "Resource not accessible" means the GH_PAT lacks "Contents: Read and write".`
    );
  }

  // c. New tree pointing the file path at the new blob.
  const treeRes = await postJson("/git/trees", {
    base_tree: baseTree,
    tree: [{ path: filePath, mode: "100644", type: "blob", sha: blobRes.data.sha }],
  });
  if (treeRes.status >= 300 || !treeRes.data || !treeRes.data.sha) {
    throw new Error(
      `GitHub: failed to create tree (HTTP ${treeRes.status}) — ${
        (treeRes.data && treeRes.data.message) || JSON.stringify(treeRes.data)
      }`
    );
  }

  // d. New commit on top of the branch head.
  const commitRes = await postJson("/git/commits", {
    message,
    tree: treeRes.data.sha,
    parents: [headSha],
  });
  if (commitRes.status >= 300 || !commitRes.data || !commitRes.data.sha) {
    throw new Error(
      `GitHub: failed to create commit (HTTP ${commitRes.status}) — ${
        (commitRes.data && commitRes.data.message) || JSON.stringify(commitRes.data)
      }`
    );
  }

  // e. Move the branch ref to the new commit.
  const updateRes = await request(
    {
      hostname: "api.github.com",
      path: `${base}/git/refs/heads/${branch}`,
      method: "PATCH",
      headers: { ...GH_HEADERS(), "Content-Type": "application/json" },
    },
    { sha: commitRes.data.sha, force: false }
  );
  if (updateRes.status >= 300) {
    throw new Error(
      `GitHub: failed to update ref "${branch}" (HTTP ${updateRes.status}) — ${
        (updateRes.data && updateRes.data.message) || JSON.stringify(updateRes.data)
      }`
    );
  }
}

// ─── Decide the version number + where the release belongs ────────────
// Auto-increment rule (chosen by the team): take the newest version on the
// page and add 1 to the minor. A NEW year bumps the major and resets to .1.
//   newest v7.5  →  same year:  v7.6        (June 2026)
//   newest v7.5  →  new year:   v8.1        (January 2027)
function computeVersionAndPlacement(content, year) {
  const hasYearSection = content.includes(
    `<section class="year-section" data-year="${year}"`
  );

  // The newest release sits just below the CHANGELOG_ENTRIES marker.
  const markerIdx = content.indexOf("<!-- CHANGELOG_ENTRIES -->");
  const region = markerIdx === -1 ? content : content.slice(markerIdx);
  const vMatch = region.match(/release__version">v(\d+)\.(\d+)/);

  let major;
  let minor;
  if (!vMatch) {
    // Fallback if the page has no parsable version yet.
    major = year - 2019;
    minor = 1;
  } else {
    const M = Number(vMatch[1]);
    const m = Number(vMatch[2]);
    if (hasYearSection) {
      major = M;
      minor = m + 1;
    } else {
      major = M + 1;
      minor = 1;
    }
  }

  return {
    hasYearSection,
    version: `v${major}.${minor}`,
    id: `r-${major}-${minor}-${year}`,
  };
}

// ─── Step 2: Generate structured changelog content with Claude ─────────
async function generateChangelogData(tasksBySection, monthName, year) {
  console.log("✨ Generating changelog content with Claude...");

  const taskSummary = Object.entries(tasksBySection)
    .map(
      ([section, tasks]) =>
        `## ${section}\n${tasks
          .map(
            (t) =>
              `- **${t.name}**: ${
                t.description && t.description.trim()
                  ? t.description.trim()
                  : "(no description provided — infer the user-facing change from the task title)"
              }`
          )
          .join("\n")}`
    )
    .join("\n\n");

  const systemPrompt = `You are the product changelog writer for Aquator Marine, a yacht/superyacht fleet management SaaS platform.

You convert completed engineering tasks into a concise, user-facing changelog for ${monthName} ${year}, returned as STRUCTURED DATA via the emit_changelog tool.

GROUNDING (accuracy over completeness):
- Describe ONLY what is supported by a task's name/description. Never invent
  features, numbers, percentages, dates, or product names.
- Many tasks have NO description. In that case, write a short, plausible
  user-facing sentence based on the task TITLE alone — do NOT output a
  placeholder.
- Do not merge unrelated tasks into a single item, and do not embellish.
- Prefer fewer, accurate items over padded ones.

EXCLUDE — only user-facing changes belong in the changelog. OMIT a task entirely
when a customer would not notice or benefit from it in the product, including:
- Internal/admin-only changes, internal tooling, or back-office workflows.
- Refactors, code cleanup, renames, or restructuring with no behavior change.
- Infrastructure, DevOps, CI/CD, build, deployment, or dependency upgrades.
- Database migrations, logging, monitoring, or perf work with no visible effect.
- Tests, QA automation, or test-data changes.
- Documentation, internal notes, research/spikes, or planning tasks.
- Reverted, no-op, or duplicate work, or anything too vague to describe in user
  terms even from its title.
The test for every task: "Would a customer notice or benefit from this in the
product?" If no — or if you are unsure — OMIT it.

ABSOLUTELY FORBIDDEN:
- Never output placeholder text such as "<UNKNOWN>", "UNKNOWN", "N/A", "TBD",
  "TODO", "none", or empty strings in ANY field. Every field must be real,
  human-readable copy. If you cannot write a real description for a task, drop
  that task instead of emitting a placeholder.

CLASSIFICATION (entry "type"):
- "feature"     — capabilities users could not do before.
- "improvement" — existing things made faster, clearer, or easier.
- "fix"         — corrections to broken behavior.

PER ENTRY:
- module: a short product area label, Title Case, e.g. "Dashboard", "Finance",
  "Crew", "Security", "Billing", "Fleet", "Inventory", "Documents", "Platform".
  Pick the single most relevant area; use "Platform" if it spans many.
- title: a short noun phrase (e.g. "Two-Factor Authentication").
- what: 1–2 sentences describing the change in user terms. Present tense,
  user value: "You can now…", "[X] is now faster" — not "We added…".
- use: OPTIONAL one-sentence "when you'd use this" scenario. Include only when
  it is clearly inferable from the task; otherwise omit it.

TOP LEVEL:
- headline: a short summary line; separate distinct themes with "; ".
- summary: ONE short paragraph (2–4 sentences) summarizing the release.`;

  const userPrompt = `Generate the ${monthName} ${year} changelog from these completed tasks (the only source of truth — do not go beyond them):

${taskSummary}`;

  const tools = [
    {
      name: "emit_changelog",
      description: "Emit the structured changelog content for the month.",
      input_schema: {
        type: "object",
        properties: {
          headline: { type: "string" },
          summary: { type: "string" },
          entries: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  enum: ["feature", "improvement", "fix"],
                },
                module: { type: "string" },
                title: { type: "string" },
                what: { type: "string" },
                use: { type: "string" },
              },
              required: ["type", "module", "title", "what"],
            },
          },
        },
        required: ["headline", "summary", "entries"],
      },
    },
  ];

  const res = await request(
    {
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
    },
    {
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      temperature: 0,
      system: systemPrompt,
      tools,
      tool_choice: { type: "tool", name: "emit_changelog" },
      messages: [{ role: "user", content: userPrompt }],
    }
  );

  if (res.status !== 200 || !res.data || !Array.isArray(res.data.content)) {
    const detail =
      res.data && res.data.error
        ? `${res.data.error.type}: ${res.data.error.message}`
        : JSON.stringify(res.data);
    throw new Error(
      `Anthropic API request failed (HTTP ${res.status}) — ${detail}`
    );
  }

  const toolUse = res.data.content.find((b) => b.type === "tool_use");
  if (!toolUse || !toolUse.input) {
    throw new Error("Anthropic returned no structured changelog content.");
  }

  const data = sanitizeChangelogData(toolUse.input, monthName, year);
  console.log(`   Generated ${data.entries.length} changelog entries`);
  return data;
}

// ─── Content sanitation — never let placeholders reach the page ───────
// The model is told to derive copy from the task title when a description is
// missing, but as a hard safety net we strip placeholders here and fall back
// to a title-based sentence so "<UNKNOWN>", "N/A", empty, etc. can never ship.
const PLACEHOLDER_RE =
  /^\s*<?\s*(unknown|n\/?a|tbd|todo|none|null|undefined|pending|placeholder|\.{2,}|-{1,})\s*>?\s*$/i;

function cleanText(s) {
  if (s == null) return "";
  const t = String(s).replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (PLACEHOLDER_RE.test(t)) return "";
  if (/unknown/i.test(t)) return ""; // catches "<UNKNOWN>" embedded anywhere
  return t;
}

function fallbackWhat(type, title) {
  if (type === "fix") return `An issue with ${title} has been resolved.`;
  if (type === "improvement") return `${title} has been improved.`;
  return `${title} is now available.`;
}

function sanitizeChangelogData(data, monthName, year) {
  data = data || {};
  const validTypes = new Set(["feature", "improvement", "fix"]);

  const entries = (data.entries || [])
    .map((e) => {
      if (!e || !validTypes.has(e.type)) return null;
      const title = cleanText(e.title);
      if (!title) return null; // no usable title → drop the entry entirely
      const module = cleanText(e.module) || "Platform";
      const what = cleanText(e.what) || fallbackWhat(e.type, title);
      const use = cleanText(e.use); // optional
      return { type: e.type, module, title, what, use: use || undefined };
    })
    .filter(Boolean);

  const titles = entries.map((e) => e.title);
  const headline =
    cleanText(data.headline) ||
    titles.slice(0, 4).join("; ") ||
    `${monthName} ${year} update`;
  const summary =
    cleanText(data.summary) ||
    (titles.length
      ? `This release brings ${titles.length} update${
          titles.length > 1 ? "s" : ""
        }: ${titles.join(", ")}.`
      : `Updates shipped in ${monthName} ${year}.`);

  return { headline, summary, entries };
}

// ─── Assemble the exact <article class="release"> markup ──────────────
const TAG_LABEL = { feature: "New", improvement: "Improved", fix: "Fix" };
const COUNTER_LABEL = { feature: "New", improvement: "Improved", fix: "Fixed" };
const TAB_LABEL = { feature: "New", improvement: "Improved", fix: "Fixed" };
const DOT_COLOR = {
  feature: "var(--orange)",
  improvement: "var(--primary)",
  fix: "var(--text-grey)",
};
const TYPE_ORDER = ["feature", "improvement", "fix"];

function buildReleaseArticle(meta, data) {
  const { version, id, year, iso, displayDate } = meta;

  const counts = { feature: 0, improvement: 0, fix: 0 };
  data.entries.forEach((e) => counts[e.type]++);
  const total = counts.feature + counts.improvement + counts.fix;

  // Counters — only non-zero types, fixed order. Concatenated with no
  // whitespace between spans (matches the existing inline layout).
  const counters = TYPE_ORDER.filter((t) => counts[t] > 0)
    .map(
      (t) =>
        `<span class="counter counter--${t}"><span class="counter__dot"></span>${counts[t]} ${COUNTER_LABEL[t]}</span>`
    )
    .join("");

  // Tabs — always render All + the three types (JS dims empty ones).
  const dot = (t) =>
    `<span style="width: 7px; height: 7px; border-radius: 50%; background: ${DOT_COLOR[t]}; display: inline-block;"></span>`;
  const tabs =
    `<button class="release__tab active" data-tab="all">All <span class="tab-count">${total}</span></button>` +
    TYPE_ORDER.map(
      (t) =>
        `<button class="release__tab" data-tab="${t}">${dot(t)}${TAB_LABEL[t]} <span class="tab-count">${counts[t]}</span></button>`
    ).join("");

  const entriesHtml = data.entries
    .map((e) => {
      const search = esc(
        [e.module, e.title, e.what, e.use]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
      );
      const useBlock = e.use
        ? `
                      <div class="entry__use">
                        <b>When you'd use this</b>${esc(e.use)}
                      </div>`
        : "";
      return `                  <div
                    class="entry"
                    data-type="${e.type}"
                    data-search="${search}"
                  >
                    <div class="entry__meta">
                      <span class="entry__tag entry__tag--${e.type}">${TAG_LABEL[e.type]}</span>
                      <span class="entry__module">${esc(e.module)}</span>
                    </div>
                    <div class="entry__content">
                      <h4 class="entry__title">${esc(e.title)}</h4>
                      <p class="entry__what">${esc(e.what)}</p>${useBlock}
                    </div>
                  </div>`;
    })
    .join("\n\n");

  const releaseSearch = esc(
    [
      version,
      displayDate,
      data.headline,
      data.summary,
      ...data.entries.flatMap((e) => [e.module, e.title, e.what, e.use]),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
  );

  return `              <article
                class="release"
                id="${id}"
                data-year="${year}"
                data-iso="${iso}"
                data-search="${releaseSearch}"
              >
                <header class="release__header">
                  <div class="release__header-left">
                    <span class="release__version">${version}</span>
                    <span class="release__date">${displayDate}</span>
                    <span class="release__year-tag">${year}</span>
                  </div>
                  <div class="release__counters">${counters}</div>
                </header>
                <div class="release__body">
                  <h3 class="release__headline">${esc(data.headline)}</h3>
                  <p class="release__summary">${esc(data.summary)}</p>
                  <nav class="release__tabs">${tabs}</nav>
                  <div class="entries">
${entriesHtml}
                  </div>
                </div>
              </article>`;
}

// ─── Apply additive transforms to the page content ────────────────────
// Returns the updated HTML. NEVER removes or rewrites existing release
// markup — only inserts, plus two metadata touch-ups (year count + hero).
function applyAdditions(content, meta, articleHtml) {
  let out = content;
  const { year, monthName, version, id, hasYearSection } = meta;

  const sidebarLink = `                <li class="sidebar__item">
                  <a
                    href="#${id}"
                    class="sidebar__link"
                    data-target="${id}"
                    data-year="${year}"
                    ><span>${monthName} ${year}</span><span class="ver">${version}</span></a
                  >
                </li>`;

  if (hasYearSection) {
    // ── Existing year: insert the article right after the year-section
    //    header so it becomes the newest entry of that year. ──
    const secStart = out.indexOf(
      `<section class="year-section" data-year="${year}"`
    );
    if (secStart === -1) {
      throw new Error(
        `Expected year-section for ${year} but could not find it.`
      );
    }
    const headerClose = out.indexOf("</header>", secStart);
    if (headerClose === -1) {
      throw new Error(`Could not find year-section header close for ${year}.`);
    }
    const insertAt = headerClose + "</header>".length;
    out = out.slice(0, insertAt) + "\n\n" + articleHtml + "\n" + out.slice(insertAt);

    // Bump "<b>N</b> releases shipped" for THIS section (first match at/after
    // secStart is this section's header; the inserted article has no such text).
    const head = out.slice(0, secStart);
    const tail = out
      .slice(secStart)
      .replace(
        /<b>(\d+)<\/b> releases shipped/,
        (_m, n) => `<b>${Number(n) + 1}</b> releases shipped`
      );
    out = head + tail;

    // Sidebar: add the month link at the top of the year's list.
    const syStart = out.indexOf(
      `<div class="sidebar__year" data-year="${year}"`
    );
    if (syStart !== -1) {
      const ulTag = `<ul class="sidebar__list">`;
      const ulOpen = out.indexOf(ulTag, syStart);
      if (ulOpen !== -1) {
        const at = ulOpen + ulTag.length;
        out = out.slice(0, at) + "\n" + sidebarLink + out.slice(at);
      }
    }
  } else {
    // ── New year: build a fresh year-section, year tab and sidebar block. ──
    const yearSection = `            <section class="year-section" data-year="${year}" id="year-${year}">
              <header class="year-section__header">
                <div class="year-section__year">${year}</div>
                <div class="year-section__meta">
                  <b>1</b> releases shipped<br />
                  Newest first
                </div>
              </header>

${articleHtml}
            </section>

`;
    const firstSec = out.indexOf(`<section class="year-section"`);
    if (firstSec === -1) {
      throw new Error("No existing year-section found to anchor the new year.");
    }
    out = out.slice(0, firstSec) + yearSection + out.slice(firstSec);

    // Year tab — newest year first, right after the "All releases" tab.
    out = out.replace(
      /(<button class="year-tab year-tab--all active"[\s\S]*?<\/button>)/,
      `$1\n              <button class="year-tab" data-year="${year}">${year}</button>`
    );

    // Sidebar year block — at the top of "Browse by month".
    const sidebarYear = `            <div class="sidebar__year" data-year="${year}">
              <div class="sidebar__year-label">${year}</div>
              <ul class="sidebar__list">
${sidebarLink}
              </ul>
            </div>`;
    out = out.replace(
      /(<div class="sidebar__title">[^<]*<\/div>)/,
      `$1\n${sidebarYear}`
    );
  }

  // Metadata touch-up: keep the hero "Latest version · …" label accurate.
  out = out.replace(/(Latest version · )[^<]+/, `$1${meta.displayDate}`);

  return out;
}

// ─── Step 3: Create GitHub PR ─────────────────────────────────────────
async function createGitHubPR(meta, articleHtml) {
  console.log("🔀 Creating GitHub PR...");

  const [owner, repo] = HELP_SITE_REPO.split("/");
  const branchName = `changelog/${meta.monthName.toLowerCase()}-${meta.year}`;
  const filePath = CHANGELOG_FILE_PATH || DEFAULT_FILE_PATH;

  // 1. Get the current main branch SHA
  const mainRef = await request({
    hostname: "api.github.com",
    path: `/repos/${owner}/${repo}/git/ref/heads/main`,
    method: "GET",
    headers: {
      Authorization: `token ${GH_PAT}`,
      "User-Agent": "changelog-bot",
    },
  });
  if (mainRef.status !== 200 || !mainRef.data || !mainRef.data.object) {
    const detail =
      mainRef.data && mainRef.data.message
        ? mainRef.data.message
        : JSON.stringify(mainRef.data);
    throw new Error(
      `GitHub: could not read "main" branch of ${owner}/${repo} (HTTP ${mainRef.status}) — ${detail}`
    );
  }
  const mainSha = mainRef.data.object.sha;

  // 2. Create a new branch (ignore "already exists", fail on anything else)
  const branchRes = await request(
    {
      hostname: "api.github.com",
      path: `/repos/${owner}/${repo}/git/refs`,
      method: "POST",
      headers: {
        Authorization: `token ${GH_PAT}`,
        "User-Agent": "changelog-bot",
        "Content-Type": "application/json",
      },
    },
    { ref: `refs/heads/${branchName}`, sha: mainSha }
  );
  const branchAlreadyExists =
    branchRes.status === 422 &&
    branchRes.data &&
    /already exists/i.test(branchRes.data.message || "");
  if (branchRes.status >= 300 && !branchAlreadyExists) {
    const detail =
      (branchRes.data && branchRes.data.message) ||
      JSON.stringify(branchRes.data);
    throw new Error(
      `GitHub: failed to create branch "${branchName}" (HTTP ${branchRes.status}) — ${detail}. ` +
        `If this is a 403 "Resource not accessible", the GH_PAT is missing "Contents: Read and write" permission.`
    );
  }

  // 3. Get current file content + sha from the branch
  const { content: existingContent, sha: fileSha } = await fetchFileContent(
    owner,
    repo,
    filePath,
    branchName
  );
  if (!existingContent || fileSha === null) {
    throw new Error(
      `GitHub: could not read "${filePath}" on "${branchName}". Refusing to write, ` +
        `since that would overwrite the page instead of adding to it.`
    );
  }

  // Idempotency guard: if this branch already carries the month (e.g. a
  // previous run committed it), do NOT insert it again — that would duplicate
  // the release on the branch.
  if (meta.ym && existingContent.includes(`data-iso="${meta.ym}-`)) {
    throw new Error(
      `"${branchName}" already contains a ${meta.monthName} ${meta.year} release ` +
        `(data-iso="${meta.ym}-…"). Delete that branch to regenerate cleanly, then re-run.`
    );
  }

  // 4. Additively insert the new release (never rewrites existing entries)
  const updatedContent = applyAdditions(existingContent, meta, articleHtml);

  // 5. Commit via the Git Data API (the page exceeds the Contents API's 1 MB cap)
  await commitViaGitData(
    owner,
    repo,
    branchName,
    filePath,
    updatedContent,
    `docs: add ${meta.monthName} ${meta.year} changelog (${meta.version})`
  );

  // 6. Create the PR
  const reviewers = (REVIEWERS || "")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);

  const prRes = await request(
    {
      hostname: "api.github.com",
      path: `/repos/${owner}/${repo}/pulls`,
      method: "POST",
      headers: {
        Authorization: `token ${GH_PAT}`,
        "User-Agent": "changelog-bot",
        "Content-Type": "application/json",
      },
    },
    {
      title: `📝 ${meta.monthName} ${meta.year} Changelog (${meta.version})`,
      body: `## Auto-generated changelog for ${meta.monthName} ${meta.year}\n\nThis changelog was automatically generated from completed Asana tasks and **added** to the existing page (no existing entries were modified).\n\n- New release: \`${meta.version}\` (${meta.id})\n- ${meta.hasYearSection ? `Added into the existing ${meta.year} section` : `Created a new ${meta.year} section + year tab`}\n\n**Please review and approve to publish.**`,
      head: branchName,
      base: "main",
    }
  );

  if (prRes.status >= 300 || !prRes.data || !prRes.data.html_url) {
    const detail =
      prRes.data && prRes.data.errors
        ? prRes.data.errors.map((e) => e.message || JSON.stringify(e)).join("; ")
        : (prRes.data && prRes.data.message) || JSON.stringify(prRes.data);
    throw new Error(
      `GitHub: failed to create PR for branch "${branchName}" (HTTP ${prRes.status}) — ${detail}`
    );
  }

  const prNumber = prRes.data.number;
  const prUrl = prRes.data.html_url;

  // 7. Request reviewers
  if (reviewers.length > 0) {
    await request(
      {
        hostname: "api.github.com",
        path: `/repos/${owner}/${repo}/pulls/${prNumber}/requested_reviewers`,
        method: "POST",
        headers: {
          Authorization: `token ${GH_PAT}`,
          "User-Agent": "changelog-bot",
          "Content-Type": "application/json",
        },
      },
      { reviewers }
    );
  }

  // NOTE: We intentionally do NOT merge the PR here — a human reviews the
  // auto-generated changelog and merges it manually once approved.
  console.log(
    `   PR created (open for review — merge manually after approval): ${prUrl}`
  );
  return { prUrl, prNumber };
}

// ─── Step 4: Notify via Slack ─────────────────────────────────────────
async function notifySlack(prUrl, monthName, year) {
  if (!SLACK_WEBHOOK_URL) {
    console.log("⏭️  Slack webhook not configured, skipping notification");
    return;
  }

  console.log("💬 Sending Slack notification...");

  const webhookUrl = new URL(SLACK_WEBHOOK_URL);

  await request(
    {
      hostname: webhookUrl.hostname,
      path: webhookUrl.pathname,
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    {
      text: `📝 *${monthName} ${year} Changelog* is ready for review!\n\n<${prUrl}|Review the PR here>\n\nThis was auto-generated from completed Asana tasks. Please review, edit if needed, and approve to publish.`,
    }
  );

  console.log("   Slack notification sent");
}

// ─── Main ─────────────────────────────────────────────────────────────
async function main() {
  try {
    console.log("🚀 Starting monthly changelog generation...\n");

    validateSecrets();

    if (isDryRun) {
      console.log(
        "🧪 DRY_RUN enabled — will print the release block and skip GitHub + Slack.\n"
      );
    }

    // The "last day of the month" guard exists ONLY to stop the scheduled
    // cron (which fires on days 28-31) from running more than once a month.
    const isScheduledRun = process.env.GITHUB_EVENT_NAME === "schedule";
    const forceSkipGuard =
      SKIP_DATE_GUARD === "1" ||
      SKIP_DATE_GUARD === "true" ||
      !!OVERRIDE_MONTH ||
      isDryRun;

    if (isScheduledRun && !forceSkipGuard && !isLastDayOfMonth(new Date())) {
      console.log(
        "⏭️  Not the last day of the month yet. Skipping (scheduled run)."
      );
      return;
    }

    const { startDate, endDate, monthName, year, ym, iso, displayDate } =
      getDateRange();
    console.log(`   Period: ${monthName} ${year}`);
    console.log(`   Range: ${startDate} → ${endDate}\n`);

    const [owner, repo] = HELP_SITE_REPO.split("/");
    const filePath = CHANGELOG_FILE_PATH || DEFAULT_FILE_PATH;

    // Read the live page once (used for dedup + version + placement).
    const { content: pageContent } = await fetchFileContent(
      owner,
      repo,
      filePath,
      "main"
    );

    // Dedup guard: skip if this month is already published. Keyed on the real
    // data-iso prefix (e.g. data-iso="2026-05-"), which is how the page marks
    // each release — there is no data-changelog attribute.
    const alreadyPublished =
      pageContent && pageContent.includes(`data-iso="${ym}-`);
    if (alreadyPublished && !isDryRun) {
      console.log(
        `⏭️  ${monthName} ${year} is already published (data-iso="${ym}-…" found). Nothing to do.`
      );
      return;
    }
    if (alreadyPublished && isDryRun) {
      console.warn(
        `⚠️  ${monthName} ${year} is already published — continuing for preview only.`
      );
    }

    // Decide version number + whether the year section already exists.
    const { hasYearSection, version, id } = computeVersionAndPlacement(
      pageContent || "",
      year
    );
    console.log(
      `   Version: ${version}  (${hasYearSection ? "existing" : "NEW"} ${year} section)\n`
    );

    // Step 1: Fetch tasks
    const tasksBySection = await fetchAsanaTasks(startDate, endDate);
    if (Object.keys(tasksBySection).length === 0) {
      console.log("⚠️  No completed tasks found for this period. Skipping.");
      return;
    }

    // Step 2: Generate structured content + assemble the release markup
    const data = await generateChangelogData(tasksBySection, monthName, year);
    if (data.entries.length === 0) {
      console.log(
        "⚠️  No user-facing changes qualified for the changelog. Skipping."
      );
      return;
    }

    const meta = {
      monthName,
      year,
      ym,
      iso,
      displayDate,
      version,
      id,
      hasYearSection,
    };
    const articleHtml = buildReleaseArticle(meta, data);

    // if (isDryRun) {
    //   console.log(
    //     "\n──────── DRY RUN: generated release HTML ────────\n"
    //   );
    //   console.log(articleHtml);
    //   console.log(
    //     `\n────────────────────────────────────────────────`
    //   );
    //   console.log(
    //     `\nPlacement: ${
    //       hasYearSection
    //         ? `inserted into existing ${year} year-section`
    //         : `NEW ${year} year-section + year tab + sidebar block`
    //     }`
    //   );
    //   console.log("✅ Dry run complete. No PR created, no Slack sent.");
    //   return;
    // }

    // Step 3: Create PR (applies the additive transforms to the live file)
    const { prUrl } = await createGitHubPR(meta, articleHtml);

    // Step 4: Notify
    await notifySlack(prUrl, monthName, year);

    console.log("\n✅ Done! Changelog PR created and reviewer notified.");
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  buildReleaseArticle,
  applyAdditions,
  computeVersionAndPlacement,
  getDateRange,
  sanitizeChangelogData,
};
