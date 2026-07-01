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
} = process.env;

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

function getDateRange() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // current month (0-indexed)

  // Previous month range
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59); // last day of prev month

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  return {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    monthName: monthNames[month - 1 < 0 ? 11 : month - 1],
    year: month - 1 < 0 ? year - 1 : year,
  };
}

// ─── Step 1: Fetch Asana Tasks ────────────────────────────────────────
async function fetchAsanaTasks(startDate, endDate) {
  console.log("📋 Fetching completed Asana tasks...");

  // Get all sections in the project
  const sectionsRes = await request({
    hostname: "app.asana.com",
    path: `/api/1.0/projects/${ASANA_PROJECT_GID}/sections`,
    method: "GET",
    headers: { Authorization: `Bearer ${ASANA_PAT}` },
  });

  const sections = sectionsRes.data.data || [];
  const tasksBySection = {};

  for (const section of sections) {
    // Fetch completed tasks in each section
    const tasksRes = await request({
      hostname: "app.asana.com",
      path: `/api/1.0/sections/${section.gid}/tasks?opt_fields=name,notes,completed,completed_at&completed_since=${startDate}`,
      method: "GET",
      headers: { Authorization: `Bearer ${ASANA_PAT}` },
    });

    const tasks = (tasksRes.data.data || []).filter((task) => {
      if (!task.completed || !task.completed_at) return false;
      const completedAt = new Date(task.completed_at);
      return completedAt >= new Date(startDate) && completedAt <= new Date(endDate);
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
  console.log(`   Found ${totalTasks} completed tasks across ${Object.keys(tasksBySection).length} sections`);

  return tasksBySection;
}

// ─── Step 2: Generate Changelog with Claude ───────────────────────────
async function generateChangelog(tasksBySection, monthName, year) {
  console.log("✨ Generating changelog with Claude...");

  const taskSummary = Object.entries(tasksBySection)
    .map(
      ([section, tasks]) =>
        `## ${section}\n${tasks
          .map((t) => `- **${t.name}**: ${t.description}`)
          .join("\n")}`
    )
    .join("\n\n");

  const prompt = `You are a product changelog writer for Aquator Marine, a yacht/superyacht fleet management SaaS platform.

Given the following completed Asana tasks grouped by section, generate a professional, user-facing changelog entry for ${monthName} ${year}.

TASKS:
${taskSummary}

RULES:
- Write in a friendly, professional tone
- Focus on user value, not technical implementation details
- Group items under clear categories: New Features, Improvements, Bug Fixes
- Each item should be 1-2 sentences max
- Skip internal/admin tasks that don't affect end users
- Use present tense ("You can now..." not "We added...")
- Output as clean HTML that fits in a static HTML page
- Include a header with the month and year
- Keep it concise — users scan, they don't read

OUTPUT FORMAT:
Return ONLY the HTML content (no markdown, no code fences). Start with an <h2> tag for the month header.`;

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
      model: "claude-sonnet-4-5",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    }
  );

  if (!res.data.content) {
    throw new Error(`Claude API error: ${JSON.stringify(res.data)}`);
  }
  const changelog = res.data.content[0].text;
  console.log("   Changelog generated successfully");
  return changelog;
}

// ─── Step 3: Create GitHub PR ─────────────────────────────────────────
async function createGitHubPR(changelogContent, monthName, year) {
  console.log("🔀 Creating GitHub PR...");

  const [owner, repo] = HELP_SITE_REPO.split("/");
  const branchName = `changelog/${monthName.toLowerCase()}-${year}`;
  const filePath = CHANGELOG_FILE_PATH || "change-log/index.html";

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
  if (!mainRef.data.object) {
    throw new Error(`GitHub API error getting main branch: ${JSON.stringify(mainRef.data)}`);
  }
  const mainSha = mainRef.data.object.sha;

  // 2. Create a new branch
  await request(
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

  // 3. Get current file content (to get its SHA for update)
  const fileRes = await request({
    hostname: "api.github.com",
    path: `/repos/${owner}/${repo}/contents/${filePath}?ref=${branchName}`,
    method: "GET",
    headers: {
      Authorization: `token ${GH_PAT}`,
      "User-Agent": "changelog-bot",
    },
  });

  let existingContent = "";
  let fileSha = null;

  if (fileRes.status === 200) {
    existingContent = Buffer.from(fileRes.data.content, "base64").toString("utf-8");
    fileSha = fileRes.data.sha;
  }

  // 4. Insert new changelog at the top of existing content
  // Find the insertion point (after the page header, before existing entries)
  const insertionMarker = "<!-- CHANGELOG_ENTRIES -->";
  let updatedContent;

  if (existingContent.includes(insertionMarker)) {
    updatedContent = existingContent.replace(
      insertionMarker,
      `${insertionMarker}\n\n${changelogContent}`
    );
  } else {
    // Fallback: prepend to body content
    updatedContent = existingContent
      ? existingContent.replace(
          "</body>",
          `\n${changelogContent}\n</body>`
        )
      : changelogContent;
  }

  // 5. Commit the updated file
  const commitBody = {
    message: `docs: add ${monthName} ${year} changelog`,
    content: Buffer.from(updatedContent).toString("base64"),
    branch: branchName,
  };
  if (fileSha) commitBody.sha = fileSha;

  await request(
    {
      hostname: "api.github.com",
      path: `/repos/${owner}/${repo}/contents/${filePath}`,
      method: "PUT",
      headers: {
        Authorization: `token ${GH_PAT}`,
        "User-Agent": "changelog-bot",
        "Content-Type": "application/json",
      },
    },
    commitBody
  );

  // 6. Create the PR
  const reviewers = (REVIEWERS || "").split(",").map((r) => r.trim()).filter(Boolean);

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
      title: `📝 ${monthName} ${year} Changelog`,
      body: `## Auto-generated changelog for ${monthName} ${year}\n\nThis changelog was automatically generated from completed Asana tasks.\n\n**Please review and approve to publish.**`,
      head: branchName,
      base: "main",
    }
  );

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

  // 8. Enable auto-merge
  await request(
    {
      hostname: "api.github.com",
      path: `/repos/${owner}/${repo}/pulls/${prNumber}/merge`,
      method: "PUT",
      headers: {
        Authorization: `token ${GH_PAT}`,
        "User-Agent": "changelog-bot",
        "Content-Type": "application/json",
      },
    },
    { merge_method: "squash" }
  );

  console.log(`   PR created: ${prUrl}`);
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

    const { startDate, endDate, monthName, year } = getDateRange();
    console.log(`   Period: ${monthName} ${year}`);
    console.log(`   Range: ${startDate} → ${endDate}\n`);

    // Step 1: Fetch tasks
    const tasksBySection = await fetchAsanaTasks(startDate, endDate);

    if (Object.keys(tasksBySection).length === 0) {
      console.log("⚠️  No completed tasks found for this period. Skipping.");
      return;
    }

    // Step 2: Generate changelog
    const changelog = await generateChangelog(tasksBySection, monthName, year);

    // Step 3: Create PR
    const { prUrl } = await createGitHubPR(changelog, monthName, year);

    // Step 4: Notify
    await notifySlack(prUrl, monthName, year);

    console.log("\n✅ Done! Changelog PR created and reviewer notified.");
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

main();
