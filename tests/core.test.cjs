const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../src/core.js");

test("parses a project label with status suffixes", () => {
  assert.deepEqual(
    core.parseProjectFromLabel(
      "Create morning brief task, chat in project Testarossa, Work, unread"
    ),
    { title: "Create morning brief task", project: "Testarossa" }
  );
});

test("ignores ordinary recent chats", () => {
  assert.equal(core.parseProjectFromLabel("Native Migration Reasoning"), null);
});

test("normalizes conversation links", () => {
  assert.equal(
    core.normalizeHref(
      "/c/6aa29230-ebd0-83ee-a7da-0b95ff5124bc?messageId=finalAgentTurnStart"
    ),
    "/c/6aa29230-ebd0-83ee-a7da-0b95ff5124bc"
  );
});

test("extracts project IDs from project-aware URLs", () => {
  assert.equal(
    core.projectIdFromHref(
      "/g/g-p-6aa291f71f5481919da8335dfd4967c5-testarossa/project"
    ),
    "g-p-6aa291f71f5481919da8335dfd4967c5"
  );
});

test("merges recent and learned chats without duplicates", () => {
  assert.deepEqual(
    core.mergeChats(
      [{ title: "Recent title", href: "/c/6aa29230-ebd0-83ee-a7da-0b95ff5124bc" }],
      [
        { title: "Old title", href: "/g/g-p-project/c/6aa29230-ebd0-83ee-a7da-0b95ff5124bc" },
        { title: "Another", href: "/c/6aa42509-b5b4-83e8-8652-5821f835a190" }
      ]
    ),
    [
      { title: "Recent title", href: "/c/6aa29230-ebd0-83ee-a7da-0b95ff5124bc" },
      { title: "Another", href: "/c/6aa42509-b5b4-83e8-8652-5821f835a190" }
    ]
  );
});
