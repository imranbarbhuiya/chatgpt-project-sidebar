(function exposeCore(globalScope) {
  "use strict";

  const PROJECT_ID_PATTERN = /\/g\/(g-p-[^/]+?)(?:-[^/]+)?\/(?:project|c\/)/i;
  const CONVERSATION_ID_PATTERN = /\/c\/([0-9a-f-]{16,})/i;

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function parseProjectFromLabel(label) {
    const value = cleanText(label);
    if (!value) return null;

    const marker = ", chat in project ";
    const markerIndex = value.toLowerCase().indexOf(marker);
    if (markerIndex < 0) return null;

    const title = value.slice(0, markerIndex).trim();
    const suffix = value.slice(markerIndex + marker.length);
    const project = suffix
      .split(/,\s*(?:work|unread|read|shared)(?:,|$)/i)[0]
      .replace(/,\s*$/, "")
      .trim();

    if (!title || !project) return null;
    return { title, project };
  }

  function normalizeHref(href, origin) {
    try {
      const url = new URL(href, origin || "https://chatgpt.com");
      url.search = "";
      url.hash = "";
      return url.pathname;
    } catch {
      return "";
    }
  }

  function projectIdFromHref(href) {
    const match = normalizeHref(href).match(PROJECT_ID_PATTERN);
    return match ? match[1] : null;
  }

  function conversationIdFromHref(href) {
    const match = normalizeHref(href).match(CONVERSATION_ID_PATTERN);
    return match ? match[1] : null;
  }

  function projectKey(name, id) {
    if (id) return `id:${id}`;
    return `name:${cleanText(name).toLocaleLowerCase()}`;
  }

  function uniqueChats(chats) {
    const seen = new Set();
    const result = [];

    for (const chat of chats || []) {
      const href = normalizeHref(chat && chat.href);
      const title = cleanText(chat && chat.title);
      if (!href || !title) continue;
      const identity = conversationIdFromHref(href) || href;
      if (seen.has(identity)) continue;
      seen.add(identity);
      result.push({ title, href });
    }

    return result;
  }

  function mergeChats(primary, secondary) {
    return uniqueChats([...(primary || []), ...(secondary || [])]);
  }

  const api = {
    cleanText,
    conversationIdFromHref,
    mergeChats,
    normalizeHref,
    parseProjectFromLabel,
    projectIdFromHref,
    projectKey,
    uniqueChats
  };

  globalScope.ChatGPTProjectSidebarCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
