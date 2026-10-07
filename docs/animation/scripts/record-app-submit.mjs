// POV laptop take: Predict → search "axios" → add to slip → open the leg →
// drag the CVSS + EPSS sliders → pick stake/duration → Buy slip. Not logged
// in, so POST /contracts is answered locally with a canned success and the
// balance returned by /users/me drops by the stake afterwards.
// Usage:
//   (frontend) VITE_SKIP_AUTH=true VITE_API_URL=/api npx vite --port 5180
//   node scripts/record-app-submit.mjs [playwright-core path]
//
// Data is real: reads are forwarded to the production API with a guest token;
// only /users/me is answered locally (no real login).
//
// Output: public/app-submit.webm + .mp4 (1152×720), public/app-submit.json
// (timings, click log, cursor/caret track).
import { execFileSync } from "node:child_process";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const PW =
  process.argv[2] ?? "/Users/jacksonfaulkner/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core/index.mjs";
const { chromium } = await import(PW);

const ROOT = path.resolve(import.meta.dirname, "..");
const TMP = path.join(ROOT, "out", "app-submit-raw");
const OUT = path.join(ROOT, "public", "app-submit.webm");
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

// Fake cursor: Playwright's recordVideo doesn't draw the pointer.
const CURSOR = `
  window.addEventListener('DOMContentLoaded', () => {
    const c = document.createElement('div');
    c.id = '__cursor';
    c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2 L4 19 L8.5 14.8 L11.6 21.6 L14.6 20.3 L11.5 13.6 L17.6 13.6 Z" fill="#fff" stroke="#000" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, {position:'fixed',left:'0',top:'0',zIndex:'2147483647',pointerEvents:'none',transition:'transform 60ms',transform:'translate(-100px,-100px)'});
    document.body.appendChild(c);
    let x=-100,y=-100;
    window.addEventListener('mousemove', e => { x=e.clientX; y=e.clientY; c.style.transform='translate('+(x-4)+'px,'+(y-2)+'px)'; }, true);
    window.addEventListener('mousedown', () => { c.style.transform='translate('+(x-4)+'px,'+(y-2)+'px) scale(0.82)'; }, true);
    window.addEventListener('mouseup', () => { c.style.transform='translate('+(x-4)+'px,'+(y-2)+'px)'; }, true);
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
const glide = async (x, y, ms = 450) => {
  const steps = Math.max(8, Math.round(ms / 16));
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
    await page.screenshot({ path: path.join(ROOT, "out", "app-submit-fail.png") });
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

// ── Predict → search axios → add to slip ────────────────────────────────────
await page.goto(`${APP}/predict`, { waitUntil: "load", timeout: 60000 });
const search = page.locator('[data-tour="predict-search"]');
await search.waitFor({ timeout: 60000 });
await page.waitForTimeout(1500);
await page.mouse.move(mx, my);
mark("cursor", mx, my);
await page.waitForTimeout(600);

await click(search, 200, "search");
await type("axios");
await page.waitForTimeout(700);
await click(page.locator('[data-tour="predict-add-result"]', { hasText: "axios" }).first(), 0, "add");
const openedSec = now();
await page.waitForTimeout(1500); // slip fills in (chart, odds)

// Drag a range input's thumb to `target` (input's own units).
const drag = async (loc, target, ms = 900) => {
  const { b } = await center(loc);
  const { min, max, value } = await loc.evaluate((el) => ({
    min: Number(el.min), max: Number(el.max), value: Number(el.value),
  }));
  const at = (v) => b.x + 8 + (b.width - 16) * ((v - min) / (max - min));
  const y = b.y + b.height / 2;
  await glide(at(value), y, 450);
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
const epss = page.locator('[data-tour="leg-row"]').first().locator("xpath=..").locator('input[type="range"]').nth(1);
const epssMax = await epss.evaluate((el) => Number(el.max));
await drag(epss, epssMax * 0.7, 1100);
await page.waitForTimeout(600); // let the odds settle

await click(page.locator('[data-tour="stake-chip"]').nth(2), 350, "stake");
await click(page.locator('[data-tour="duration-chip"]').nth(1), 500, "duration");

const buy = page.locator('[data-tour="buy-slip-btn"]');
await buy.waitFor();
await page.waitForFunction(() => {
  const b = document.querySelector('[data-tour="buy-slip-btn"]');
  return b && !b.disabled;
});
await click(buy, 0, "submit");
const submittedSec = now();
await page.waitForTimeout(2500); // slip clears / success state

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
rmSync(TMP, { recursive: true, force: true });
writeFileSync(
  path.join(ROOT, "public", "app-submit.json"),
  JSON.stringify({ durationSec, openedSec, submittedSec, actions, track }),
);
console.log("wrote", OUT, { durationSec, openedSec, submittedSec });
