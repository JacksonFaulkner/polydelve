// UI progression screenshots. For each milestone commit: check out the frontend
// into a throwaway worktree, serve it with vite (node_modules symlinked from the
// current frontend), and screenshot its main screens against the live read API.
//
//   node scripts/history.mjs [commit ...]     # default: all milestones
//
// Output: out/history/<commit>-<screen>.png. Broken or empty screens are expected
// for very old commits; review the output and keep what renders.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

const ROOT = path.resolve(import.meta.dirname, "..");
const REPO = path.resolve(ROOT, "../..");
const OUT = path.join(ROOT, "out", "history");
const WORK = path.join(os.tmpdir(), "polydelve-history");
const PROD_API = process.env.PROD_API ?? "https://polydelve.com/api";

// e30d732 and 2e478b6 are omitted: their UIs need the API shapes of that day and crash on today's.
export const MILESTONES = [
  "d4ad397", // 2026-05-25 first frontend, mock JSON
  "3ed2711", // 2026-06-02 auth, leaderboard, dashboard
  "399dffe", // 2026-06-14 predict redesign, how-it-works
  "2cb22da", // 2026-06-20 mobile overhaul
  "40624a2", // 2026-09-21 hazard pricing, slips
];
// Before 071a52c (2026-06-07) navigation was component state, not URLs: click the tab instead.
const CLICK_NAV = { "3ed2711": { predict: "Predict", pypi: "PyPI", news: "News", leaderboard: "Leaderboard", dashboard: "Dashboard" } };
const MOBILE = ["2cb22da"];
const SCREENS = [["home", "/"], ["predict", "/predict"], ["pypi", "/pypi"], ["news", "/news"], ["leaderboard", "/leaderboard"], ["dashboard", "/dashboard"]];

const guest = await fetch(`${PROD_API}/auth/guest`, { method: "POST" }).then((r) => r.json());
const json = (route, body) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
const handleApi = async (route) => {
  const url = new URL(route.request().url());
  const p = url.pathname.replace(/^\/api/, "");
  if (p === "/users/me") return json(route, { id: "auth0|demo", email: null, username: "jackson", bits: 1000, schmeckles: 1000, avatar_url: null });
  const headers = { ...route.request().headers(), authorization: `Bearer ${guest.token}` };
  delete headers.host; delete headers.origin; delete headers.referer;
  return route.fulfill({ response: await route.fetch({ url: `${PROD_API}${p}${url.search}`, headers }) });
};

async function shoot(commit, port) {
  const dir = path.join(WORK, commit);
  rmSync(dir, { recursive: true, force: true });
  execFileSync("git", ["-C", REPO, "worktree", "prune"]);
  execFileSync("git", ["-C", REPO, "worktree", "add", "--detach", dir, commit], { stdio: "ignore" });
  // Harness-only patch (worktree, never the repo): old skip-auth stubs return a new
  // getAccessTokenSilently every render, which makes their data hooks refetch forever.
  const authTs = path.join(dir, "frontend", "src", "lib", "auth.ts");
  if (existsSync(authTs)) {
    const src = readFileSync(authTs, "utf8")
      .replace('getAccessTokenSilently: () => Promise.resolve("dev-token"),', "getAccessTokenSilently: STABLE_TOKEN,")
      .replace('user: { name: "Dev", picture: null },', "user: STABLE_USER,")
      .replace("export function useAuth()", 'const STABLE_TOKEN = () => Promise.resolve("dev-token")\nconst STABLE_USER = { name: "Dev", picture: null }\nexport function useAuth()');
    writeFileSync(authTs, src);
  }
  symlinkSync(path.join(REPO, "frontend", "node_modules"), path.join(dir, "frontend", "node_modules"));
  const vite = spawn("npx", ["vite", "--port", String(port), "--strictPort"], {
    cwd: path.join(dir, "frontend"),
    env: { ...process.env, VITE_SKIP_AUTH: "true", VITE_API_URL: "/api", VITE_AUTH0_DOMAIN: "x.us.auth0.com", VITE_AUTH0_CLIENT_ID: "x", VITE_AUTH0_AUDIENCE: "x" },
    stdio: "ignore",
    detached: true,
  });
  try {
    for (let i = 0; i < 60; i++) {
      if (await fetch(`http://localhost:${port}`).then((r) => r.ok).catch(() => false)) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, colorScheme: "dark" });
    await ctx.route("**/api/**", (r) => handleApi(r).catch(() => r.abort()));
    // Warm-up: first load makes vite pre-bundle deps and reload; do it before shooting.
    const warm = await ctx.newPage();
    await warm.goto(`http://localhost:${port}/`, { waitUntil: "load", timeout: 60000 }).catch(() => {});
    await warm.waitForTimeout(8000);
    await warm.close();
    for (const [name, route] of SCREENS) {
      const page = await ctx.newPage();
      try {
        const tab = CLICK_NAV[commit]?.[name];
        await page.goto(`http://localhost:${port}${tab ? "/" : route}`, { waitUntil: "load", timeout: 30000 });
        await page.waitForTimeout(3000);
        if (tab) {
          await page.getByText(tab, { exact: true }).first().click();
        }
        await page.waitForFunction(() => !/Loading|skeleton/i.test(document.body.innerText) && !document.querySelector(".animate-pulse"), null, { timeout: 60000 }).catch(() => console.log(`  ${commit} ${name}: still loading`));
        await page.waitForTimeout(1500);
        await page.screenshot({ path: path.join(OUT, `${commit}-${name}.png`) });
      } catch (e) {
        console.log(`  ${commit} ${name}: ${e.message.split("\n")[0]}`);
      }
      await page.close();
    }
    if (MOBILE.includes(commit)) {
      const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, colorScheme: "dark", isMobile: true, hasTouch: true });
      await m.route("**/api/**", (r) => handleApi(r).catch(() => r.abort()));
      for (const [name, route] of [["m-predict", "/predict"], ["m-pypi", "/pypi"]]) {
        const page = await m.newPage();
        await page.goto(`http://localhost:${port}${route}`, { waitUntil: "load", timeout: 30000 });
        await page.waitForTimeout(3000);
        await page.waitForFunction(() => !/Loading/i.test(document.body.innerText), null, { timeout: 60000 }).catch(() => {});
        await page.waitForTimeout(1500);
        await page.screenshot({ path: path.join(OUT, `${commit}-${name}.png`) });
        await page.close();
      }
    }
    await browser.close();
  } finally {
    try { process.kill(-vite.pid); } catch {}
    execFileSync("git", ["-C", REPO, "worktree", "remove", "--force", dir], { stdio: "ignore" });
  }
}

mkdirSync(OUT, { recursive: true });
const wanted = process.argv.slice(2);
let port = 5190;
for (const c of wanted.length ? wanted : MILESTONES) {
  console.log(`shooting ${c} …`);
  await shoot(c, port++);
}
console.log("done");
