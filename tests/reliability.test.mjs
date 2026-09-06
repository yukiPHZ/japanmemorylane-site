import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { execFileSync } from "node:child_process";

const server = readFileSync(new URL("../functions/api/poem.js", import.meta.url), "utf8");
const frontend = readFileSync(new URL("../public/main.js", import.meta.url), "utf8");
const context = vm.createContext({ Response, console: { error() {} } });
vm.runInContext(server.replace("export async function", "async function"), context);
const validate = (poem) => { context.poem = poem; return vm.runInContext("validatePoem(poem)", context); };
const valid = { japanese_poem: "窓の端に\n昨日の雨が\n残っていた", english_poem: "Rain remains,\nat the window.", mood_tags: ["rain", "quiet"] };

test("server accepts a short three-column poem", () => {
  assert.equal(validate(valid).japanese_poem, valid.japanese_poem);
});
test("server rejects malformed poems without another provider request", () => {
  for (const japanese of ["", "窓に\n雨の跡", "窓に\n雨が\nまだ\n残る", "窓に\nrope\n残った", "窓に\nｓｈａｄｏｗ\n残った", "窓に\n。\n残った", "窓に\n。。。\n。。。", "一".repeat(90)]) {
    assert.throws(() => validate({ ...valid, japanese_poem: japanese }), { stage: "schema_validation" });
  }
  for (const tags of [[], [null], [""], ["rain", 2], Array(6).fill("quiet")]) {
    assert.throws(() => validate({ ...valid, mood_tags: tags }), { stage: "schema_validation" });
  }
  assert.throws(() => validate({ ...valid, english_poem: " " }), { stage: "schema_validation" });
});
test("canvas composition and provider writing prompt remain unchanged", () => {
  const before = execFileSync("git", ["show", "8536a82:public/main.js"], { encoding: "utf8" });
  const canvas = (source) => source.slice(source.indexOf("const createCurrentTanzakuCanvas"), source.indexOf("const exportCurrentTanzaku"));
  assert.equal(canvas(frontend).replace(/\r/g, ""), canvas(before).replace(/\r/g, ""));
  const priorServer = execFileSync("git", ["show", "8536a82:functions/api/poem.js"], { encoding: "utf8" });
  const prompt = (source) => source.slice(source.indexOf("const generationPrompt"), source.indexOf("const jsonHeaders")).replace(/\r/g, "");
  assert.equal(prompt(server), prompt(priorServer));
  assert.match(server, /store: false/);
  assert.doesNotMatch(server, /bodyHead:|outputHead:|stack: error/);
});
test("static gate controls and photo handling anchor exist without duplicate ids", () => {
  for (const path of ["../public/index.html", "../public/colophon/index.html"]) {
    const html = readFileSync(new URL(path, import.meta.url), "utf8");
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(new Set(ids).size, ids.length);
  }
  const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(html, /name="mobile-web-app-capable" content="yes"/);
  assert.match(html, /<button[^>]*id="journeyBack"/);
  assert.match(html, /role="status" aria-live="polite"/);
});
