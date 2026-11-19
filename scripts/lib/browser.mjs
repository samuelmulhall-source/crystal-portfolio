// Headless Chromium (Edge on Windows by default; CHROME_PATH to override)
// driven over the DevTools protocol — no Puppeteer/Playwright dependency.
//
//   const b = await launch({ width, height, dpr, webgl: true });
//   await b.go(url); await b.until("window.__litReady"); b.eval("…"); b.png();
//   b.close();
import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CANDIDATES = [
  process.env.CHROME_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch({ width = 1440, height = 900, dpr = 1, webgl = false } = {}) {
  const exe = CANDIDATES.find((p) => existsSync(p));
  if (!exe) throw new Error("No Chromium-family browser found — set CHROME_PATH.");
  const port = 9400 + Math.floor(Math.random() * 500);
  // The profile lives in the OS temp folder; only this exact folder is removed on close.
  const profile = join(tmpdir(), `lit-tools-${process.pid}-${Date.now()}`);
  const args = ["--headless=new", "--no-first-run", "--mute-audio", "--hide-scrollbars", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${width},${height}`];
  // Software WebGL, so set photographs come out the same on any machine.
  if (webgl) args.push("--use-angle=swiftshader", "--enable-unsafe-swiftshader");
  const proc = spawn(exe, [...args, "about:blank"], { stdio: "ignore" });
  let target;
  for (let i = 0; i < 80 && !target; i++) {
    try {
      target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page");
    } catch {}
    if (!target) await sleep(250);
  }
  if (!target) {
    proc.kill();
    throw new Error(`Couldn't start the browser at ${exe}`);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails?.exception?.description?.split("\n")[0] ?? "exception");
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push(m.params.args?.map((a) => a.value ?? a.description).join(" "));
  });
  const send = (method, params = {}) =>
    new Promise((res) => {
      const i = ++id;
      pending.set(i, res);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const evaluate = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
  await send("Page.enable");
  await send("Runtime.enable");
  const size = async (w, h, d = dpr, mobile = false) => {
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: d, mobile });
    await send("Emulation.setTouchEmulationEnabled", { enabled: mobile, maxTouchPoints: mobile ? 5 : 0 });
  };
  await size(width, height);
  return {
    send,
    eval: evaluate,
    errors,
    size,
    /** Navigate and wait for the load event. */
    async go(url) {
      errors.length = 0;
      const loaded = new Promise((r) => {
        const on = (e) => {
          if (JSON.parse(e.data).method === "Page.loadEventFired") {
            ws.removeEventListener("message", on);
            r();
          }
        };
        ws.addEventListener("message", on);
      });
      await send("Page.navigate", { url });
      await Promise.race([loaded, sleep(20000)]);
    },
    /** Poll an expression until it is truthy (or time out → null). */
    async until(expr, ms = 60000, every = 400) {
      for (let t = 0; t < ms; t += every) {
        const v = await evaluate(expr);
        if (v) return v;
        await sleep(every);
      }
      return null;
    },
    async png() {
      const s = await send("Page.captureScreenshot", { format: "png" });
      return Buffer.from(s.result.data, "base64");
    },
    async close() {
      try { ws.close(); } catch {}
      proc.kill();
      // Edge holds the profile for a moment after exit. Remove only the
      // folder this launch created (validated: inside the OS temp folder).
      await sleep(1200);
      try {
        if (profile.startsWith(tmpdir()) && /lit-tools-\d+-\d+$/.test(profile)) rmSync(profile, { recursive: true, force: true });
      } catch {}
    },
  };
}
