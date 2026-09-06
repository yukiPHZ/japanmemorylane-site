import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const browser = await chromium.launch({ headless: true });
const baseURL = process.env.TEST_URL || "http://127.0.0.1:8789";

// Real animation time: the reliability suite separately uses a fake API/clock.
try {
  for (const width of [1280, 390]) {
    for (const reducedMotion of ["no-preference", "reduce"]) {
      const page = await browser.newPage({ viewport: { width, height: 700 }, reducedMotion });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/api/poem", () => { throw new Error("Scene tests must not call the poem API"); });
      await page.goto(baseURL);
      await page.waitForFunction(() => getComputedStyle(document.body).opacity === "1");
      await page.evaluate(async () => {
        // Reuse a local sample, never a private image or an external asset.
        const blob = await (await fetch("/assets/quiet-window-rain.jpg")).blob();
        window.sceneFile = new File([blob], "sample.jpg", { type: "image/jpeg" });
        window.beginSceneTrace = () => {
          window.sceneStart = performance.now();
          window.sceneFrames = [];
          window.sceneSwaps = [];
          const read = () => ({
            time: performance.now() - window.sceneStart,
            opacity: Number(getComputedStyle(lane).opacity),
            indicator: Number(getComputedStyle(document.querySelector(".position-indicator")).opacity),
            text: currentMemory.textContent,
            index: journeyState.currentIndex, top: lane.scrollTop,
            gate: journeyState.gate, transitioning: isLaneSceneTransitioning,
            returning: journeyState.isReturningJourney,
            fadingOut: document.body.classList.contains("is-lane-fading-out"),
            fadingIn: document.body.classList.contains("is-lane-fading-in"),
          });
          const frame = () => { window.sceneFrames.push(read()); window.sceneFrame = requestAnimationFrame(frame); };
          frame();
          window.sceneObserver = new MutationObserver((mutations) => {
            if (mutations.some((mutation) => mutation.type === "attributes" && mutation.attributeName === "src")) window.sceneSwaps.push(read());
          });
          window.sceneObserver.observe(lane, { subtree: true, attributes: true, attributeFilter: ["src"] });
        };
        window.endSceneTrace = () => {
          cancelAnimationFrame(window.sceneFrame);
          window.sceneObserver.disconnect();
          return { frames: window.sceneFrames, swaps: window.sceneSwaps };
        };
      });
      for (const keptIndex of [2, 6]) {
        // Enter from sample seven, with the preparation gate already covering it.
        await page.evaluate(() => {
          lane.scrollTo({ top: lane.scrollHeight, behavior: "instant" });
          updateAfterSettle();
          showJourneyGate();
          showPreparingGate();
          journeyState.acceptedFiles = Array(7).fill(window.sceneFile);
          journeyState.items = journeyState.acceptedFiles.map((file) => ({ displayFile: file }));
        });
        await page.waitForTimeout(800);
        await page.evaluate(() => {
          window.beginSceneTrace();
          createJourneyCards(Array.from({ length: 7 }, (_, index) => getFallbackPoem(index)), [0, 1, 2, 3, 4, 5, 6]);
        });
        await page.waitForFunction(() => !isLaneSceneTransitioning && journeyState.ready);
        const entry = await page.evaluate(() => window.endSceneTrace());
        const fadeOut = reducedMotion === "reduce" ? 120 : 360;
        assert.ok(entry.swaps.length > 0);
        assert.ok(entry.swaps.every((swap) => swap.time >= fadeOut - 5 && swap.opacity === 0), "swap only after fade-out, at zero opacity");
        assert.ok(entry.frames.some((frame) => frame.opacity > 0 && frame.opacity < 1), "opacity changes gradually");
        assert.ok(entry.frames.every((frame) => frame.index === 6 || frame.index === 0), "no intermediate current card");
        assert.ok(entry.frames.every((frame) => frame.top === entry.frames[0].top || frame.top === 0), "no animated scroll during entry");
        assert.ok(entry.frames.filter((frame) => frame.fadingIn).every((frame) => frame.index === 0 && frame.top === 0 && frame.text === "1"), "first card is committed before reveal");
        assert.ok(entry.frames.every((frame) => frame.gate !== "hidden" || frame.top === 0), "no visible intermediate cards through the gate");

        // Saving/15 seconds are covered by reliability.browser; start at that state.
        await page.evaluate((keptIndex) => {
          lane.scrollTo({ top: tanzakuItems[keptIndex].offsetTop - tanzakuItems[0].offsetTop, behavior: "instant" });
          updateAfterSettle();
          journeyState.takeOneCompleted = true;
          journeyState.keptIndex = keptIndex;
          journeyState.starShown = true;
          clearJourneyStarTimer();
          showReturnJourneyAction();
        }, keptIndex);
        await page.waitForTimeout(1700);
        await page.evaluate(() => window.beginSceneTrace());
        await page.locator(".return-journey-action").click();
        await page.waitForTimeout(reducedMotion === "reduce" ? 60 : 150);
        const startingOpacity = await page.locator(".position-indicator").evaluate((el) => Number(getComputedStyle(el).opacity));
        assert.ok(startingOpacity < 1, "indicator fades as soon as return starts");
        await page.waitForFunction(() => !journeyState.ready && !isLaneSceneTransitioning, null, { timeout: 10000 });
        await page.waitForTimeout(50);
        const returning = await page.evaluate(() => window.endSceneTrace());
        assert.ok(returning.swaps.length > 0);
        assert.ok(returning.swaps.every((swap) => swap.opacity === 0), "reset restores DOM invisibly");
        assert.ok(returning.frames.every((frame) => frame.index === keptIndex || frame.index === 0), "reset never activates a middle card");
        const returnStart = returning.frames.find((frame) => frame.returning).time;
        const lingering = returning.frames.filter((frame) => frame.time > returnStart + 350 && !frame.fadingIn && frame.index !== 0 && frame.indicator > 0.000001);
        assert.deepEqual(lingering, [], "no old number through the return/water phase");
        const outStart = returning.frames.find((frame) => frame.fadingOut).time;
        assert.ok(returning.swaps.every((swap) => swap.time >= outStart + fadeOut - 20), "old scene fades before reset");
        assert.ok(returning.frames.every((frame) => frame.top === returning.frames[0].top || frame.top === 0), "no animated scroll during reset");
        const last = returning.frames.at(-1);
        assert.equal(last.index, 0);
        assert.equal(last.text, "1");
        assert.equal(last.opacity, 1);
        assert.equal(last.indicator, 1);
        assert.equal(await page.locator(".journey-star, .water-memory, .return-journey-action").count(), 0);
        assert.equal(await page.evaluate(() => lane.inert || document.documentElement.scrollWidth > innerWidth), false);
        assert.equal(await page.evaluate(() => getComputedStyle(lane).scrollSnapType), "y mandatory");
      }
      await page.locator(".lane").hover();
      await page.mouse.wheel(0, 510);
      await page.waitForTimeout(1400);
      assert.equal(await page.evaluate(() => journeyState.currentIndex), 1);
      assert.equal(await page.evaluate(() => Math.abs(lane.scrollTop - (tanzakuItems[1].offsetTop - tanzakuItems[0].offsetTop)) < 1), true);
      assert.equal(await page.evaluate(() => getComputedStyle(lane).scrollBehavior), reducedMotion === "reduce" ? "auto" : "smooth");
      // Escape during the outgoing fade must cancel the pending DOM commit.
      await page.evaluate(() => {
        showJourneyGate();
        showPreparingGate();
        journeyState.acceptedFiles = Array(7).fill(window.sceneFile);
        createJourneyCards(Array.from({ length: 7 }, (_, index) => getFallbackPoem(index)), [0, 1, 2, 3, 4, 5, 6]);
      });
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => !isLaneSceneTransitioning);
      await page.waitForTimeout(800);
      assert.equal(await page.evaluate(() => journeyState.ready || journeyState.currentIndex !== 0 || selectedJourneyPhotoUrls.length > 0), false);
      await page.locator("#journeyEntry").focus();
      assert.equal(await page.evaluate(() => document.activeElement === journeyEntry), true);
      assert.deepEqual(errors, []);
      console.log(`PASS: entry, return from 3/7 and 7/7, round two; ${width}px; ${reducedMotion}`);
      await page.close();
    }
  }
} finally {
  await browser.close();
}
