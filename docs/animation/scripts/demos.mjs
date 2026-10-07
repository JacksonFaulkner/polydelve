// Docs media pipeline. Every file in scripts/demos/ is one asset:
//
//   export default { kind: "video" | "still", async run(h) { … } }
//
// videos are recorded with Playwright (supersampled), then framed through the
// DocsClip Remotion composition; stills are 2× screenshots, optionally with
// annotation overlays.
//
//   (frontend) VITE_SKIP_AUTH=true VITE_API_URL=/api npx vite --port 5180
//   node scripts/demos.mjs [name ...]        # default: all
//
// Output: out/docs/<name>.mp4 + <name>.png (video poster) or <name>.png (still).
//
// Flows locate elements through data-tour / data-demo attributes only and must
// throw if the UI is not in the expected state. A failure exits non-zero BEFORE
// anything is rendered or uploaded, so docs keep serving the last good media.
//
// Helpers passed to run(h):
//   page                    Playwright page
//   goto(route, readySel)   navigate + wait for readySel; marks the clip start
//   click(locator, pause)   glide the cursor to it and click
//   type(text)              type with a visible caret
//   hold(ms)                wait
//   vis(selector)           first visible match (mobile + desktop variants share tags)
//   focus(targets, pad)     video: aim the camera at the union of these elements
//   annotate(items)         numbered callouts / spotlight drawn into the page
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(ROOT, "out", "docs");
const APP = process.env.APP_URL ?? "http://localhost:5180";
const PROD_API = process.env.PROD_API ?? "https://polydelve.com/api";
// Both videos and stills are captured at 2× device scale. Videos come from a CDP
// screencast (Playwright's recordVideo is low-bitrate VP8 and ignores device
// scale), so a 1600×1000 viewport yields a true 3200×2000 source. DocsClip frames
// it at 1152×720 logical and renders at 2× (2304×1440).
const VIDEO = { w: 1600, h: 1000, scale: 2 };
const STILL = { w: 1280, h: 800, scale: 2 };

// ── In-page helpers ─────────────────────────────────────────────────────────
const PAGE_INIT = `
  const style = document.createElement('style');
  style.textContent = '::-webkit-scrollbar{display:none!important} html{scrollbar-width:none!important}';
  document.documentElement.appendChild(style);
  window.addEventListener('DOMContentLoaded', () => {
    const c = document.createElement('div');
    c.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24"><path d="M4 2 L4 19 L8.5 14.8 L11.6 21.6 L14.6 20.3 L11.5 13.6 L17.6 13.6 Z" fill="#fff" stroke="#000" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, {position:'fixed',left:'0',top:'0',zIndex:'2147483647',pointerEvents:'none',transition:'transform 60ms',transform:'translate(-100px,-100px)'});
    document.body.appendChild(c);
    let x=-100,y=-100;
    const place = (extra='') => { c.style.transform='translate('+(x-4)+'px,'+(y-2)+'px)'+extra; };
    window.addEventListener('mousemove', e => { x=e.clientX; y=e.clientY; place(); }, true);
    window.addEventListener('mouseup', () => place(), true);
    window.addEventListener('mousedown', () => {
      place(' scale(0.82)');
      const r = document.createElement('div');
      Object.assign(r.style, {position:'fixed',left:(x-14)+'px',top:(y-14)+'px',width:'28px',height:'28px',borderRadius:'50%',border:'2px solid rgba(253,232,50,.9)',zIndex:'2147483646',pointerEvents:'none',transition:'transform 450ms ease-out, opacity 450ms ease-out'});
      document.body.appendChild(r);
      requestAnimationFrame(() => { r.style.transform='scale(2.2)'; r.style.opacity='0'; });
      setTimeout(() => r.remove(), 520);
    }, true);
  });`;

function drawOverlays(items) {
  document.getElementById("__annotations")?.remove();
  const root = document.createElement("div");
  root.id = "__annotations";
  Object.assign(root.style, { position: "fixed", inset: "0", zIndex: "2147483645", pointerEvents: "none" });
  document.body.appendChild(root);
  const BRAND = "#fde832";
  for (const it of items) {
    const { x, y, w, h } = it.box;
    const pad = it.pad ?? 6;
    const box = document.createElement("div");
    Object.assign(box.style, {
      position: "absolute",
      left: x - pad + "px",
      top: y - pad + "px",
      width: w + pad * 2 + "px",
      height: h + pad * 2 + "px",
      borderRadius: "10px",
      border: `2px solid ${BRAND}`,
      boxShadow: it.spotlight ? "0 0 0 9999px rgba(10,12,14,.62)" : "0 0 0 3px rgba(253,232,50,.18)",
    });
    root.appendChild(box);
    if (it.label || it.n) {
      const chip = document.createElement("div");
      chip.style.cssText =
        "position:absolute;display:flex;align-items:center;gap:8px;padding:6px 12px 6px 6px;border-radius:999px;background:#15191D;color:#f4f4f5;font:600 14px system-ui,sans-serif;white-space:nowrap;border:1px solid rgba(253,232,50,.55);box-shadow:0 6px 20px rgba(0,0,0,.45)";
      if (it.n) {
        const n = document.createElement("span");
        n.textContent = String(it.n);
        n.style.cssText = `display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:${BRAND};color:#15191D;font-weight:800;font-size:13px`;
        chip.appendChild(n);
      } else chip.style.paddingLeft = "12px";
      if (it.label) chip.appendChild(document.createTextNode(it.label));
      root.appendChild(chip);
      const cw = chip.offsetWidth;
      const ch = chip.offsetHeight;
      const side = it.side ?? "bottom";
      const gap = 12;
      let cx = x;
      let cy = y + h + pad + gap;
      if (side === "top") cy = y - pad - gap - ch;
      if (side === "left") { cx = x - pad - gap - cw; cy = y + h / 2 - ch / 2; }
      if (side === "right") { cx = x + w + pad + gap; cy = y + h / 2 - ch / 2; }
      cx = Math.max(8, Math.min(window.innerWidth - cw - 8, cx));
      cy = Math.max(8, Math.min(window.innerHeight - ch - 8, cy));
      chip.style.left = cx + "px";
      chip.style.top = cy + "px";
    }
  }
}

// ── API: real reads via a guest token; only /users/me is answered locally ───
const guest = await fetch(`${PROD_API}/auth/guest`, { method: "POST" }).then((r) => r.json());
const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
const handleApi = async (route) => {
  const url = new URL(route.request().url());
  const apiPath = url.pathname.replace(/^\/api/, "");
  if (apiPath === "/users/me" && route.request().method() === "GET") {
    return json(route, { id: "auth0|demo", email: null, username: "jackson", bits: 1000, avatar_url: null });
  }
  const headers = { ...route.request().headers(), authorization: `Bearer ${guest.token}` };
  delete headers.host;
  delete headers.origin;
  delete headers.referer;
  return route.fulfill({ response: await route.fetch({ url: `${PROD_API}${apiPath}${url.search}`, headers }) });
};

// ── Recorder ────────────────────────────────────────────────────────────────
async function capture(name, demo, browser) {
  const isVideo = demo.kind === "video";
  const size = isVideo ? { w: VIDEO.w, h: VIDEO.h } : { w: STILL.w, h: STILL.h };
  const tmp = path.join(OUT_DIR, `.raw-${name}`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const ctx = await browser.newContext({
    viewport: { width: size.w, height: size.h },
    colorScheme: "dark",
    deviceScaleFactor: isVideo ? VIDEO.scale : STILL.scale,
  });
  await ctx.addInitScript(PAGE_INIT);
  await ctx.route("**/api/**", (route) => handleApi(route).catch(() => route.abort()));
  const page = await ctx.newPage();
  const frames = [];
  let cdp;
  if (isVideo) {
    cdp = await ctx.newCDPSession(page);
    cdp.on("Page.screencastFrame", (f) => {
      frames.push({ ts: f.metadata.timestamp, data: f.data });
      cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
    });
    await cdp.send("Page.startScreencast", {
      format: "jpeg",
      quality: 95,
      maxWidth: size.w * VIDEO.scale,
      maxHeight: size.h * VIDEO.scale,
      everyNthFrame: 1,
    });
  }
  const epoch0 = Date.now() / 1000;
  const t0 = Date.now();
  const now = () => (Date.now() - t0) / 1000;
  let startSec = 0;
  const focusKeys = [];
  let mx = size.w / 2;
  let my = size.h / 2;

  const glide = async (x, y, ms = 450) => {
    const steps = Math.max(8, Math.round(ms / 16));
    const [sx, sy] = [mx, my];
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      await page.mouse.move(sx + (x - sx) * e, sy + (y - sy) * e);
      await page.waitForTimeout(8);
    }
    [mx, my] = [x, y];
  };
  const hold = (ms) => page.waitForTimeout(ms);
  const asLoc = (t) => (typeof t === "string" ? page.locator(t).locator("visible=true").first() : t);
  const click = async (loc, pause = 250) => {
    await loc.waitFor({ state: "visible", timeout: 15000 });
    await loc.scrollIntoViewIfNeeded().catch(() => {});
    const b = await loc.boundingBox();
    if (!b) throw new Error("element not visible");
    await glide(b.x + b.width / 2, b.y + b.height / 2);
    await page.waitForTimeout(120);
    await page.mouse.down();
    await page.waitForTimeout(70);
    await page.mouse.up();
    await page.waitForTimeout(pause);
  };
  const type = async (text) => {
    for (const ch of text) {
      await page.keyboard.type(ch);
      await page.waitForTimeout(70 + Math.random() * 50);
    }
  };
  const goto = async (route, ready) => {
    await page.goto(`${APP}${route}`, { waitUntil: "load", timeout: 60000 });
    await page.locator(ready).first().waitFor({ state: "attached", timeout: 60000 });
    await page.waitForTimeout(1200);
    await page.mouse.move(mx, my);
    startSec = now(); // everything before this (page load) is trimmed from the clip
  };
  const vis = (sel) => page.locator(sel).locator("visible=true").first();
  const boxes = async (targets) => {
    const out = [];
    for (const t of [].concat(targets)) {
      const l = asLoc(t);
      await l.waitFor({ state: "visible", timeout: 15000 });
      const b = await l.boundingBox();
      if (b) out.push(b);
    }
    if (!out.length) throw new Error("no visible targets");
    const x = Math.min(...out.map((b) => b.x));
    const y = Math.min(...out.map((b) => b.y));
    return { x, y, w: Math.max(...out.map((b) => b.x + b.width)) - x, h: Math.max(...out.map((b) => b.y + b.height)) - y };
  };
  const focus = async (targets, pad = 40) => {
    const b = await boxes(targets);
    focusKeys.push({ t: now(), x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 });
  };
  const annotate = async (items) => {
    const resolved = [];
    for (const it of items) resolved.push({ ...it, box: await boxes(it.target) });
    await page.evaluate(drawOverlays, resolved);
  };

  try {
    await demo.run({ page, click, type, hold, goto, vis, focus, annotate });
  } catch (e) {
    await page.screenshot({ path: path.join(OUT_DIR, `${name}-FAILED.png`) }).catch(() => {});
    await ctx.close();
    throw new Error(`"${name}" failed: ${e.message}`);
  }

  if (!isVideo) {
    await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`) });
    await ctx.close();
    rmSync(tmp, { recursive: true, force: true });
    return { name, kind: "still" };
  }

  const durationSec = now();
  await cdp.send("Page.stopScreencast").catch(() => {});
  await ctx.close();
  if (frames.length < 2) throw new Error(`"${name}": screencast produced ${frames.length} frames`);
  // Screencast only emits on repaint: write each frame with its true on-screen
  // duration, then resample to a constant 30fps mp4 Remotion can seek.
  const lines = [];
  frames.forEach((f, i) => {
    const file = path.join(tmp, `f${String(i).padStart(5, "0")}.jpg`);
    writeFileSync(file, Buffer.from(f.data, "base64"));
    const start = i === 0 ? 0 : Math.max(0, f.ts - epoch0);
    const next = i + 1 < frames.length ? Math.max(0, frames[i + 1].ts - epoch0) : durationSec;
    lines.push(`file '${file}'`, `duration ${Math.max(0.001, next - start).toFixed(4)}`);
  });
  lines.push(`file '${path.join(tmp, `f${String(frames.length - 1).padStart(5, "0")}.jpg`)}'`); // concat quirk: repeat last
  const list = path.join(tmp, "frames.txt");
  writeFileSync(list, lines.join("\n"));
  const mp4 = path.join(ROOT, "public", "docs", `${name}.mp4`);
  mkdirSync(path.dirname(mp4), { recursive: true });
  execFileSync(
    "npx",
    ["remotion", "ffmpeg", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-r", "30", "-vsync", "cfr", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-g", "15", "-crf", "14", "-preset", "slow", "-an", mp4],
    { cwd: ROOT, stdio: "inherit" },
  );
  rmSync(tmp, { recursive: true, force: true });
  return {
    name,
    kind: "video",
    src: `docs/${name}.mp4`,
    srcW: size.w,
    srcH: size.h,
    startSec,
    durationSec: durationSec - startSec,
    // camera keyframes, in clip time (seconds since startSec)
    focus: focusKeys.map((k) => ({ ...k, t: Math.max(0, k.t - startSec) })),
  };
}

// ── Discover + run ──────────────────────────────────────────────────────────
const dir = path.join(import.meta.dirname, "demos");
const registry = {};
for (const f of readdirSync(dir).filter((f) => f.endsWith(".mjs")).sort()) {
  registry[f.replace(/\.mjs$/, "")] = (await import(pathToFileURL(path.join(dir, f)).href)).default;
}
const wanted = process.argv.slice(2);
const names = wanted.length ? wanted : Object.keys(registry);
for (const n of names) if (!registry[n]) throw new Error(`unknown demo "${n}" (have: ${Object.keys(registry).join(", ")})`);

mkdirSync(OUT_DIR, { recursive: true });
const browser = await chromium.launch();
const captured = [];
try {
  for (const n of names) {
    console.log(`capturing ${n} (${registry[n].kind}) …`);
    captured.push(await capture(n, registry[n], browser));
  }
} finally {
  await browser.close();
}

// Every capture passed its assertions → render the videos.
for (const r of captured.filter((c) => c.kind === "video")) {
  const props = path.join(OUT_DIR, `.${r.name}.props.json`);
  writeFileSync(props, JSON.stringify(r));
  console.log(`rendering ${r.name} …`);
  execFileSync("npx", ["remotion", "render", "src/index.ts", "DocsClip", path.join(OUT_DIR, `${r.name}.mp4`), `--props=${props}`, "--crf=18", "--scale=2", "--log=error"], {
    cwd: ROOT,
    stdio: "inherit",
  });
  const frame = Math.max(0, Math.round((r.durationSec - 1.2) * 30));
  execFileSync(
    "npx",
    ["remotion", "still", "src/index.ts", "DocsClip", path.join(OUT_DIR, `${r.name}.png`), `--props=${props}`, `--frame=${frame}`, "--scale=2", "--log=error"],
    { cwd: ROOT, stdio: "inherit" },
  );
  rmSync(props, { force: true });
}
console.log("done:", captured.map((r) => r.name).join(", "));
