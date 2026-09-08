// Regenerates the PROJECT STATUS and CURRENTLY BUILDING sections of README.md
// from projects.json. Public repos get their last-updated date pulled live
// from the GitHub API instead of being hand-typed, so the table can't drift
// from what a visitor actually sees when they click in.
import { readFile, writeFile } from "node:fs/promises";

const README_PATH = new URL("../README.md", import.meta.url);
const PROJECTS_PATH = new URL("../projects.json", import.meta.url);

const STATUS_LABEL = {
  "shipped": "Shipped",
  "in-progress": "In progress",
  "planned": "Planned",
};

async function fetchLastUpdated(repo) {
  const res = await fetch(`https://api.github.com/repos/${repo}`, {
    headers: { "User-Agent": "readme-status-bot", Accept: "application/vnd.github+json" },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.pushed_at ? data.pushed_at.slice(0, 10) : null;
}

function replaceBetween(source, marker, replacement) {
  const start = `<!-- ${marker}:START -->`;
  const end = `<!-- ${marker}:END -->`;
  const startIdx = source.indexOf(start);
  const endIdx = source.indexOf(end);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(`Markers ${start} / ${end} not found in README.md`);
  }
  return (
    source.slice(0, startIdx + start.length) +
    "\n" + replacement + "\n" +
    source.slice(endIdx)
  );
}

async function main() {
  const projects = JSON.parse(await readFile(PROJECTS_PATH, "utf8"));
  const publicProjects = projects.filter((p) => p.visibility === "public");
  const privateInProgress = projects.filter(
    (p) => p.visibility !== "public" && p.status === "in-progress"
  );

  let statusBlock;
  if (publicProjects.length === 0) {
    statusBlock =
      "_Nothing public yet — actively cleaning up private repos before they ship here. " +
      'See "Currently building" below for what\'s in progress._';
  } else {
    const rows = await Promise.all(
      publicProjects.map(async (p) => {
        const updated = (await fetchLastUpdated(p.repo)) ?? "—";
        return `| [${p.name}](https://github.com/${p.repo}) | ${STATUS_LABEL[p.status] ?? p.status} | ${updated} |`;
      })
    );
    statusBlock =
      "| Project | Status | Last updated |\n" +
      "|---|---|---|\n" +
      rows.join("\n");
  }

  let buildingBlock;
  if (privateInProgress.length === 0) {
    buildingBlock = "_Nothing actively in progress right now._";
  } else {
    buildingBlock = privateInProgress
      .map((p) => `- **${p.name}** _(private)_ — ${p.description}`)
      .join("\n");
  }

  let readme = await readFile(README_PATH, "utf8");
  readme = replaceBetween(readme, "PROJECT-STATUS", statusBlock);
  readme = replaceBetween(readme, "CURRENTLY-BUILDING", buildingBlock);
  await writeFile(README_PATH, readme, "utf8");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
