const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "manifest.json"), "utf8")
);

test("store manifest is narrowly scoped and complete", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, "1.0.0");
  assert.ok(manifest.description.length <= 132);
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.deepEqual(manifest.host_permissions, ["https://chatgpt.com/*"]);
});

test("every declared extension icon exists", () => {
  for (const iconPath of Object.values(manifest.icons)) {
    assert.ok(fs.existsSync(path.join(root, iconPath)), iconPath);
  }
});
