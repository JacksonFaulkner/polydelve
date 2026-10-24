// POV laptop take: Predict → search a PyPI package → add to slip → open the leg →
// drag the CVSS slider → pick stake/duration → click Buy slip. The /contracts
// POST is answered by the local mock, so no login is needed and the balance drops.
// Usage:
//   (frontend) VITE_SKIP_AUTH=true VITE_API_URL=/api npx vite --port 5180
//   node scripts/record-pypi-slip.mjs [package]
//
// Data is real: reads are forwarded to the production API with a guest token;
// only /users/me is answered locally (no real login).
//
// Output: public/pypi-slip.webm + .mp4 (1152×720), public/pypi-slip.json
// (timings, click log, cursor/caret track).
import { execFileSync } from "node:child_process";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const PACKAGE = process.argv[2] ?? "requests";

const ROOT = path.resolve(import.meta.dirname, "..");
const TMP = path.join(ROOT, "out", "pypi-slip-raw");
const OUT = path.join(ROOT, "public", "pypi-slip.webm");
const APP = process.env.APP_URL ?? "http://localhost:5180";
const PROD_API = process.env.PROD_API ?? "https://polydelve.com/api";

rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

// ── API: real reads via a guest token, local answers for account calls ──────
const guest = await fetch(`${PROD_API}/auth/guest`, { method: "POST" }).then((r) => r.json());
const USER_ID = "auth0|demo";
const START_BITS = 1000;
let bits = START_BITS;

const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

const handleApi = async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  const apiPath = url.pathname.replace(/^\/api/, "");
  const method = req.method();

  if (apiPath === "/users/me" && method === "GET") {
    return json(route, { id: USER_ID, email: null, username: "jackson", bits, avatar_url: null });
  }
  if ((apiPath === "/contracts" || apiPath === "/etf") && method === "POST") {
    const body = JSON.parse(req.postData() ?? "{}");
    bits -= body.purchase_price ?? body.price ?? 0;
    return json(route, { id: "demo-contract", status: "active", ...body });
  }
  // Everything else: the real production API, as a guest.
  const headers = { ...req.headers(), authorization: `Bearer ${guest.token}` };
  delete headers.host;
  delete headers.origin;
  delete headers.referer;
  const res = await route.fetch({ url: `${PROD_API}${apiPath}${url.search}`, headers });
  return route.fulfill({ response: res });
};

// Fake cursor: Playwright's recordVideo doesn't draw the pointer. A large SVG arrow whose tip sits
// exactly on the pointer. No CSS transition, so it moves in lockstep with the mouse.
const CURSOR = `
  window.addEventListener('DOMContentLoaded', () => {
    const SIZE = 52;
    const TIP = { x: 4 * SIZE / 24, y: 2 * SIZE / 24 };
    const c = document.createElement('div');
    c.id = '__cursor';
    c.innerHTML = '<svg width="' + SIZE + '" height="' + SIZE + '" viewBox="0 0 24 24"><path d="M4 2 L4 19 L8.5 14.8 L11.6 21.6 L14.6 20.3 L11.5 13.6 L17.6 13.6 Z" fill="#fff" stroke="#000" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, {position:'fixed',left:'0',top:'0',zIndex:'2147483647',pointerEvents:'none',transformOrigin: TIP.x + 'px ' + TIP.y + 'px'});
    document.body.appendChild(c);
    let x = -200, y = -200, pressed = false;
    const place = () => { c.style.transform = 'translate(' + (x - TIP.x) + 'px,' + (y - TIP.y) + 'px)' + (pressed ? ' scale(0.86)' : ''); };
    window.__cursorMove = (nx, ny) => { x = nx; y = ny; place(); };
    window.__cursorPress = (p) => { pressed = p; place(); };
    window.addEventListener('mousemove', e => window.__cursorMove(e.clientX, e.clientY), true);
    window.addEventListener('mousedown', () => window.__cursorPress(true), true);
    window.addEventListener('mouseup', () => window.__cursorPress(false), true);
  });`;

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1152, height: 720 },
  colorScheme: "dark",
  // 1×: Playwright pads (doesn't upscale) the screencast at higher device scale factors.
  recordVideo: { dir: TMP, size: { width: 1152, height: 720 } },
});
await ctx.addInitScript(CURSOR);
await ctx.route("**/api/**", (route) =>
  handleApi(route).catch((e) => {
    console.error("api route failed:", route.request().url(), e.message);
    return route.abort();
  }),
);
const page = await ctx.newPage();
const t0 = Date.now();

// Logs (seconds since recording start, viewport px) that drive the camera:
// `actions` = discrete clicks/drags; `track` = continuous focus path — the
// cursor while it moves, the text caret while typing.
const actions = [];
const track = [];
const now = () => (Date.now() - t0) / 1000;
const log = (label, x, y) => actions.push({ t: now(), label, x: Math.round(x), y: Math.round(y) });
const mark = (mode, x, y) => track.push({ t: now(), mode, x: Math.round(x), y: Math.round(y) });

let mx = 576;
let my = 360;
// Eased cursor move, sampled into the track every step.
const glide = async (x, y, ms = 1000) => {
  const steps = Math.max(12, Math.round(ms / 12));
  const sx = mx;
  const sy = my;
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    const px = sx + (x - sx) * e;
    const py = sy + (y - sy) * e;
    await page.mouse.move(px, py);
    mark("cursor", px, py);
    await page.waitForTimeout(8);
  }
  mx = x;
  my = y;
};
const center = async (loc) => {
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  const b = await loc.boundingBox();
  if (!b) {
    await page.screenshot({ path: path.join(ROOT, "out", "pypi-slip-fail.png") });
    throw new Error("element not visible");
  }
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, b };
};
const click = async (loc, pause = 250, label = "click") => {
  const { x, y } = await center(loc);
  await glide(x, y);
  log(label, x, y);
  await page.waitForTimeout(120);
  await page.mouse.down();
  await page.waitForTimeout(70);
  await page.mouse.up();
  await page.waitForTimeout(pause);
};
// Caret position of the focused input (end of its text), viewport px.
const caret = () =>
  page.evaluate(() => {
    const el = document.activeElement;
    if (!(el instanceof HTMLInputElement)) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const ctx = document.createElement("canvas").getContext("2d");
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const w = ctx.measureText(el.value).width;
    return { x: r.left + parseFloat(cs.paddingLeft) + w, y: r.top + r.height / 2 };
  });
const type = async (text) => {
  for (const ch of text) {
    await page.keyboard.type(ch);
    const c = await caret();
    if (c) mark("type", c.x, c.y);
    await page.waitForTimeout(70 + Math.random() * 50);
  }
};
const visible = (loc) => loc.locator("visible=true").first();

// ── Predict → search package → add to slip ──────────────────────────────────
await page.goto(`${APP}/predict`, { waitUntil: "load", timeout: 60000 });
const search = page.locator('[data-tour="predict-search"]');
await search.waitFor({ timeout: 60000 });
await page.waitForTimeout(1500);
await page.mouse.move(mx, my);
mark("cursor", mx, my);
await page.waitForTimeout(600);

await click(search, 200, "search");
await type(PACKAGE);
await page.waitForTimeout(700);
await click(page.locator('[data-tour="predict-add-result"]', { hasText: PACKAGE }).first(), 0, "add");
const openedSec = now();
await page.waitForTimeout(1500); // slip fills in (chart, odds)

// Drag a range input's thumb to `target` (input's own units).
const drag = async (loc, target, ms = 1800) => {
  const { b } = await center(loc);
  const { min, max, value } = await loc.evaluate((el) => ({
    min: Number(el.min), max: Number(el.max), value: Number(el.value),
  }));
  const at = (v) => b.x + 8 + (b.width - 16) * ((v - min) / (max - min));
  const y = b.y + b.height / 2;
  await glide(at(value), y, 1000);
  log("drag-start", mx, my);
  await page.mouse.down();
  await page.waitForTimeout(80);
  await glide(at(target), y, ms);
  await page.mouse.up();
  log("drag-end", mx, my);
  await page.waitForTimeout(500);
};

// addLeg auto-expands the leg, so the sliders are already showing.
const cvss = page.locator('[data-tour="cvss-slider"]').first();
await drag(cvss, 7.5);
await page.waitForTimeout(600); // let the odds settle

await click(page.locator('[data-tour="stake-chip"]').nth(2), 350, "stake");
await click(page.locator('[data-tour="duration-chip"]').nth(1), 500, "duration");

// ── Submit: glide onto Buy slip and show the press, but never click it ─────
const buy = page.locator('[data-tour="buy-slip-btn"]');
await buy.waitFor();
await page.waitForFunction(() => {
  const b = document.querySelector('[data-tour="buy-slip-btn"]');
  return b && !b.disabled;
});
// Real click: /contracts is answered by the local mock (no login), so the slip clears and the
// balance drops. Then hold on the result so it reads.
await click(buy, 0, "submit");
const submittedSec = now();
await page.waitForTimeout(500);

const raw = await page.video().path();
const durationSec = now();
await ctx.close();
await browser.close();

renameSync(raw, OUT);
// Playwright's webm has no seek index; transcode to a constant-30fps mp4 that Remotion can seek.
execFileSync(
  "npx",
  ["remotion", "ffmpeg", "-loglevel", "error", "-y", "-i", OUT, "-r", "30", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-g", "15", "-crf", "18", "-an", OUT.replace(/\.webm$/, ".mp4")],
  { cwd: ROOT, stdio: "inherit" },
);
// 40% faster take for the demo, high-quality encode.
execFileSync(
  "ffmpeg",
  ["-loglevel", "error", "-y", "-i", OUT.replace(/\.webm$/, ".mp4"), "-filter:v", "setpts=0.6*PTS,fps=30", "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "10", "-pix_fmt", "yuv420p", "-g", "15", path.join(ROOT, "public", "pypi-slip-fast.mp4")],
  { cwd: ROOT, stdio: "inherit" },
);
rmSync(TMP, { recursive: true, force: true });
writeFileSync(
  path.join(ROOT, "public", "pypi-slip.json"),
  JSON.stringify({ package: PACKAGE, durationSec, openedSec, actions, track }),
);
console.log("wrote", OUT, { package: PACKAGE, durationSec, openedSec });
