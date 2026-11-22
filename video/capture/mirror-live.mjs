// Mirror the deployed Apollo app (static build + the API responses the video uses) to capture/mirror/.
// Opens a visible Chromium window; the user signs in to Databricks themselves. No cookies or tokens are saved.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const APP = "https://find-the-right-care-redesign-7474644416958437.aws.databricksapps.com/";
const OUT = path.join(path.dirname(decodeURIComponent(new URL(import.meta.url).pathname)), "mirror");

const STATIC = ["", "favicon.svg", "ftrc-route.js", "ftrc-method.js", "ftrc.css"];
const API = {
  health: "health",
  meta: "meta",
  coverage: "coverage",
  methodology: "methodology",
  "search__dialysis__492001__5": "search?service=dialysis&location=492001&k=5",
  "search__dialysis__Dantewada__5": "search?service=dialysis&location=Dantewada&k=5",
  "search__burn_care__Bhopal__5": "search?service=burn_care&location=Bhopal&k=5",
};

const browser = await chromium.launch({ headless: false });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
await page.goto(APP);
console.log("Waiting for sign-in (up to 10 min)…");
await page.waitForFunction(() => document.title.includes("Apollo"), null, { timeout: 600_000, polling: 1000 });
await page.waitForTimeout(1500);

const save = (rel, b64) => {
  const dst = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, Buffer.from(b64, "base64"));
  console.log("saved", rel, fs.statSync(dst).size);
};
const grab = (url) =>
  page.evaluate(async (u) => {
    const r = await fetch(u);
    const buf = new Uint8Array(await r.arrayBuffer());
    let s = "";
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { status: r.status, type: r.headers.get("content-type"), b64: btoa(s) };
  }, url);

const html = await page.evaluate(() => fetch("./").then((r) => r.text()));
const assets = [...html.matchAll(/(?:src|href)="\.\/(assets\/[^"]+)"/g)].map((m) => m[1]);
for (const f of [...STATIC, ...assets]) {
  const r = await grab("./" + f);
  save("static/" + (f || "index.html"), r.b64);
}
// fonts referenced from CSS
for (const css of assets.filter((a) => a.endsWith(".css"))) {
  const text = Buffer.from((await grab("./" + css)).b64, "base64").toString();
  for (const m of text.matchAll(/url\(([^)]+?\.(?:woff2?|ttf|svg|png))\)/g)) {
    const rel = path.posix.normalize(path.posix.join(path.posix.dirname(css), m[1].replace(/["']/g, "")));
    const r = await grab("./" + rel);
    if (r.status === 200) save("static/" + rel, r.b64);
  }
}
const index = {};
for (const [name, q] of Object.entries(API)) {
  const r = await grab("api/" + q);
  save(`api/${name}.json`, r.b64);
  index[q] = { file: `${name}.json`, status: r.status };
}
fs.writeFileSync(path.join(OUT, "api/index.json"), JSON.stringify({ captured_from: APP, captured_at: new Date().toISOString(), responses: index }, null, 2));
console.log("DONE");
await browser.close();
