// Capture the live Apollo app at 1920x1080: one screenshot per state + a screen recording.
// The user signs in themselves in the visible window. No cookies/tokens are written to disk.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const APP = "https://find-the-right-care-redesign-7474644416958437.aws.databricksapps.com/";
const DIR = path.dirname(decodeURIComponent(new URL(import.meta.url).pathname));
const SHOTS = path.join(DIR, "../public/app");
const VID = path.join(DIR, "video");
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(VID, { recursive: true });
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1255/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;

const browser = await chromium.launch({ headless: false, executablePath: EXE });
// login context (not recorded)
const login = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const lp = await login.newPage();
await lp.goto(APP);
console.log("WAITING_FOR_SIGNIN");
for (let i = 0; i < 300; i++) { try { if ((await lp.title()).includes("Apollo")) break; } catch {} await lp.waitForTimeout(1000); }
await lp.waitForTimeout(1500);
console.log("SIGNED_IN");
const state = await login.storageState(); // kept in memory only
await login.close();

const ctx = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  storageState: state,
});
const page = await ctx.newPage();
const api = {};
page.on("response", async (r) => {
  if (r.url().includes("/api/")) {
    try { api[r.url().split("/api/")[1]] = await r.json(); } catch {}
  }
});
const shot = async (n) => { await page.screenshot({ path: path.join(SHOTS, n + ".png") }); console.log("shot", n); };
const step = async (name, fn) => { try { await fn(); } catch (e) { console.log("STEP_FAIL", name, String(e).slice(0, 200)); } };
const marks = [];
const t0 = Date.now();
const mark = (n) => marks.push([n, (Date.now() - t0) / 1000]);

await page.goto(APP);
for (let i = 0; i < 60; i++) { try { if ((await page.title()).includes("Apollo")) break; } catch {} await page.waitForTimeout(1000); }
await page.waitForTimeout(3500);
mark("home"); await shot("01_home");

await step("care", async () => {
  mark("care_open");
  await page.getByText(/Search for the care needed/i).first().click();
  await page.waitForTimeout(900);
  await shot("02_care_open");
  await page.keyboard.type("Dialysis", { delay: 90 });
  await page.waitForTimeout(700);
  await shot("03_care_typed");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(900);
  mark("care_done"); await shot("04_care_chosen");
});
await step("location", async () => {
  const inp = page.getByPlaceholder(/PIN code/i).first();
  await inp.click();
  await inp.pressSequentially("492001", { delay: 140 });
  await page.waitForTimeout(800);
  mark("pin_done"); await shot("05_pin");
});
await step("search", async () => {
  mark("search_click");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(7000);
  mark("results"); await shot("06_results");
});
await step("why", async () => {
  await page.getByText("Why", { exact: true }).first().click();
  await page.waitForTimeout(2500);
  mark("why"); await shot("07_why");
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(1500);
  await shot("08_why_scrolled");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1000);
});
await step("leftout", async () => {
  await page.getByRole("tab", { name: /Left out/ }).first().click();
  await page.waitForTimeout(2000);
  mark("leftout"); await shot("09_leftout");
});
await step("coverage", async () => {
  await page.getByText(/^Coverage$/).first().click();
  await page.waitForTimeout(4500);
  mark("coverage"); await shot("10_coverage");
});
await step("dantewada", async () => {
  await page.goto(APP);
  await page.waitForTimeout(3000);
  await page.getByText(/Search for the care needed/i).first().click();
  await page.keyboard.type("Dialysis", { delay: 40 });
  await page.keyboard.press("Enter");
  const inp = page.getByPlaceholder(/PIN code/i).first();
  await inp.click();
  await inp.fill("Dantewada");
  await page.waitForTimeout(600);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(7000);
  mark("dantewada"); await shot("11_dantewada");
});
fs.writeFileSync(path.join(SHOTS, "api.json"), JSON.stringify(api, null, 1));
fs.writeFileSync(path.join(SHOTS, "marks.json"), JSON.stringify(marks));
await ctx.close();
await browser.close();
console.log("DONE");
