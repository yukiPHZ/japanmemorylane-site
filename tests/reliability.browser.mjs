import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const baseURL = process.env.TEST_URL || "http://127.0.0.1:8789";
const root = fileURLToPath(new URL("../", import.meta.url));
const output = `${root}.wrangler/reliability`;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const failures = [];
const fixtures = ["quiet-window-rain.jpg", "distant-train.jpg", "small-shrine.jpg", "night-alley.jpg", "vending-machine-light.jpg", "quiet-window-rain.jpg", "small-shrine.jpg"].map((name) => `${root}public/assets/${name}`);
const context = await browser.newContext({ viewport: { width: 390, height: 700 }, acceptDownloads: true });
const page = await context.newPage();
page.on("pageerror", (e) => failures.push(e.message));
await page.addInitScript(() => {
  window.__mode = "success";
  window.__calls = [];
  window.__urls = new Set();
  const create = URL.createObjectURL.bind(URL);
  const revoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = (blob) => { const url = create(blob); window.__urls.add(url); return url; };
  URL.revokeObjectURL = (url) => { window.__urls.delete(url); revoke(url); };
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (url, options) => {
    if (url !== "/api/poem") return nativeFetch(url, options);
    const call = { time: Date.now(), file: options.body.get("image"), aborted: false };
    window.__calls.push(call);
    options.signal.addEventListener("abort", () => { call.aborted = true; });
    // Deliberately ignore abort: the application must still settle the Promise.
    if (window.__mode === "timeout" || (window.__mode === "partial-timeout" && window.__calls.length !== 1)) return new Promise(() => {});
    if (window.__mode === "body-timeout") return Promise.resolve({ ok: true, json: () => new Promise(() => {}) });
    if (window.__mode === "schema") return Promise.resolve(new Response(JSON.stringify({ stage: "schema_validation", status: 500 }), { status: 500 }));
    if (window.__mode === "offline") return Promise.reject(new TypeError("network"));
    if (window.__mode === "partial" && window.__calls.length === 2) return Promise.resolve(new Response(JSON.stringify({ stage: "invalid_image", status: 400 }), { status: 400 }));
    if (window.__mode === "retry" && window.__calls.length === 1) return Promise.resolve(new Response(JSON.stringify({ stage: "openai_request", status: 429 }), { status: 500 }));
    return Promise.resolve(new Response(JSON.stringify({
      japanese_poem: "窓の端に\n昨日の雨が\n残っていた",
      english_poem: "Rain remains,\\nat the window.",
      mood_tags: [window.__calls.length % 2 ? "quiet" : "bright"],
    }), { status: 200 }));
  };
});
const tick = (ms) => page.clock.runFor(ms);
const state = () => page.evaluate(() => ({ ready: journeyState.ready, gate: journeyState.gate, count: journeyState.acceptedFiles.length, order: journeyState.flowOrder, sources: journeyState.items.map((x) => x.poem.source) }));
const select = async (files) => {
  await page.locator("#quietMomentInput").setInputFiles(files);
  await page.waitForFunction(() => !isSelectingFiles);
};
const reset = async (mode) => {
  await page.evaluate((mode) => { resetJourneyToStart(); window.__calls = []; window.__mode = mode; }, mode);
};
try {
  await page.goto(baseURL);
  await page.clock.install();
  await tick(800);
  // Sample dwell and the bridge's real file chooser event.
  await page.evaluate(() => { lane.scrollTo({ top: lane.scrollHeight, behavior: "instant" }); updateAfterSettle(); });
  await tick(2400);
  assert.equal(await page.locator("#sampleJourneyBridge").evaluate((e) => e.classList.contains("is-visible")), true);
  assert.equal(await page.locator(".journey-star, .water-memory, .take-one-action").count(), 0);
  await page.waitForFunction(() => tanzakuItems[6].querySelector("img").complete && tanzakuItems[6].querySelector("img").naturalWidth > 0);
  await page.screenshot({ path: `${output}/sample-390.png`, animations: "disabled" });
  const chooser = page.waitForEvent("filechooser");
  await page.locator("#sampleJourneyBridge").click();
  await (await chooser).setFiles(fixtures.slice(0, 3));
  await page.waitForFunction(() => !isSelectingFiles);
  assert.equal((await state()).count, 3);
  await page.locator("#journeyBack").click();
  assert.equal((await state()).count, 0);
  assert.equal(await page.evaluate(() => window.__urls.size), 0);
  assert.equal(await page.evaluate(() => document.activeElement.id), "sampleJourneyBridge");
  await reset("success");
  await select([{ name: "valid.jpg", mimeType: "image/jpeg", buffer: await readFile(fixtures[0]) }, { name: "bad.heic", mimeType: "image/heic", buffer: Buffer.from("not an image") }]);
  assert.equal((await state()).count, 1);
  assert.match(await page.locator("#journeyStatus").textContent(), /別の一枚を/);
  await page.screenshot({ path: `${output}/invalid-390.png`, animations: "disabled" });
  await page.keyboard.press("Escape");
  assert.equal((await state()).gate, "idle");

  // No new picker on the handling link; keyboard focus remains inside the gate.
  await page.evaluate(() => showJourneyGate());
  await page.locator("#journeyBack").focus();
  await page.keyboard.press("Tab");
  assert.match(await page.evaluate(() => document.activeElement.href), /colophon\/#photo-handling/);
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement.id), "journeyPick");
  await page.keyboard.press("Escape");

  // Staggered starts, optimized reuse, neutral isolated fallback, immutable order.
  await reset("partial");
  await select([...fixtures, ...fixtures.slice(0, 2)]);
  assert.equal((await state()).count, 7);
  assert.equal((await state()).ready, false);
  await tick(12000);
  assert.equal((await state()).ready, true);
  assert.equal((await state()).sources.filter((s) => s === "fallback").length, 1);
  const details = await page.evaluate(() => ({
    count: window.__calls.length,
    gaps: window.__calls.slice(1).map((call, i) => call.time - window.__calls[i].time),
    optimized: journeyState.items.every((item) => item.file === item.optimizedFile && item.file.type === "image/jpeg"),
    lines: journeyState.items.map((item) => item.poem.japanese.length),
    english: tanzakuItems[0].querySelector(".en-poem").textContent,
  }));
  assert.equal(details.count, 7);
  assert.ok(details.gaps.every((gap) => gap >= 1490 && gap <= 1510));
  assert.equal(details.optimized, true);
  assert.deepEqual(details.lines, Array(7).fill(3));
  assert.equal(details.english.includes("\\n"), false);
  const order = (await state()).order;
  await tick(32000);
  assert.deepEqual((await state()).order, order);

  for (const [width, height] of [[1280, 900], [390, 700], [360, 640], [320, 568], [700, 390]]) {
    await page.setViewportSize({ width, height });
    await tick(300);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `${output}/journey-${width}.png`, animations: "disabled" });
  }
  await page.setViewportSize({ width: 390, height: 700 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => { lane.scrollTo({ top: lane.scrollHeight, behavior: "instant" }); updateAfterSettle(); });
  await tick(5000);
  assert.equal(await page.locator(".take-one-action").count(), 1);
  // Desktop download succeeds and the 15-second return delay is unchanged.
  await page.setViewportSize({ width: 1280, height: 900 });
  const download = page.waitForEvent("download");
  await page.locator(".take-one-action").click();
  await (await download).saveAs(`${output}/take-one.png`);
  await page.waitForFunction(() => journeyState.takeOneCompleted);
  await tick(14000);
  assert.equal(await page.locator(".return-journey-action").count(), 0);
  await tick(1100);
  assert.equal(await page.locator(".return-journey-action").count(), 1);
  await tick(46000);
  assert.equal((await state()).ready, true);
  await page.locator(".return-journey-action").click();
  await tick(1300);
  assert.equal((await state()).ready, false);
  assert.equal(await page.evaluate(() => window.__urls.size), 0);

  // Cancel in-flight generation; no stale work or URLs in the next round.
  await reset("timeout");
  await select(fixtures);
  await tick(4000);
  await page.keyboard.press("Escape");
  const cancelledCalls = await page.evaluate(() => window.__calls.length);
  await tick(40000);
  assert.equal((await state()).ready, false);
  assert.equal(await page.evaluate(() => window.__calls.length), cancelledCalls);
  assert.equal(await page.evaluate(() => window.__urls.size), 0);

  await reset("timeout");
  await select(fixtures);
  await tick(31000);
  assert.equal((await state()).ready, true);
  assert.deepEqual((await state()).sources, Array(7).fill("fallback"));
  assert.equal(await page.evaluate(() => new Set(journeyState.items.map((i) => i.poem.japanese.join(""))).size), 7);
  assert.equal(await page.evaluate(() => activePoemControllers.size), 0);
  assert.ok(await page.evaluate(() => window.__calls.every((call) => call.aborted)));

  for (const mode of ["partial-timeout", "body-timeout", "schema"]) {
    await reset(mode);
    await select(fixtures);
    await tick(31000);
    assert.equal((await state()).ready, true);
    assert.equal((await state()).sources.filter((s) => s === "api").length, mode === "partial-timeout" ? 1 : 0);
    if (mode === "schema") assert.equal(await page.evaluate(() => window.__calls.length), 7);
  }

  // Encoding failure is isolated; a decoded image can still be displayed.
  await reset("success");
  await page.evaluate(() => {
    window.__toBlob = HTMLCanvasElement.prototype.toBlob;
    let failed = false;
    HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) {
      if (!failed && type === "image/jpeg") { failed = true; callback(null); return; }
      return window.__toBlob.call(this, callback, type, quality);
    };
  });
  await select(fixtures);
  await tick(11000);
  assert.equal((await state()).ready, true);
  assert.equal((await state()).sources.filter((s) => s === "fallback").length, 1);
  assert.equal(await page.evaluate(() => window.__calls.length), 6);
  await page.evaluate(() => { HTMLCanvasElement.prototype.toBlob = window.__toBlob; });

  await reset("retry");
  await select(fixtures);
  await tick(11000);
  assert.equal((await state()).ready, true);
  assert.equal(await page.evaluate(() => window.__calls.length), 8);
  assert.equal((await state()).sources.every((s) => s === "api"), true);
  await reset("offline");
  await select(fixtures);
  await tick(11000);
  assert.equal((await state()).ready, true);
  assert.equal(await page.evaluate(() => window.__calls.length), 14);

  for (const path of ["/colophon/", "/about/", "/en/about/", "/api/health"]) {
    const response = await page.goto(`${baseURL}${path}`);
    assert.equal(response.status(), 200);
  }
  const mobile = await browser.newContext({ viewport: { width: 390, height: 700 }, isMobile: true, hasTouch: true });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(baseURL);
  const shareResults = await mobilePage.evaluate(async () => {
    const results = [];
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    for (const name of ["AbortError", "NotAllowedError", "success"]) {
      Object.defineProperty(navigator, "share", { configurable: true, value: async () => {
        if (name !== "success") throw new DOMException("cancel", name);
      } });
      results.push(await shareOrSaveBlob(new Blob(["test"], { type: "image/png" }), "test.png"));
    }
    return { desktop: isLikelyDesktopDevice(), results };
  });
  assert.equal(shareResults.desktop, false);
  assert.deepEqual(shareResults.results, [false, false, true]);
  await mobile.close();
  assert.deepEqual(failures, []);
  console.log("PASS: bridge, invalid decode, cancel, seven staged requests, optimized reuse, partial/offline/timeout/retry, immutable order, export/return, viewports, reduced motion, pages.");
} finally {
  await browser.close();
}
