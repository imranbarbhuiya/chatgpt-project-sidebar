(function startProjectSidebar() {
  "use strict";

  const core = globalThis.ChatGPTProjectSidebarCore;
  if (!core || globalThis.__chatgptProjectSidebarLoaded) return;
  globalThis.__chatgptProjectSidebarLoaded = true;

  const ROOT_ID = "cgps-project-groups";
  const SOURCE_CLASS = "cgps-source-project-chat";
  const STORAGE = {
    projects: "cgpsProjects",
    collapsed: "cgpsCollapsed",
    settings: "cgpsSettings"
  };
  const DEFAULT_SETTINGS = {
    enabled: true,
    showLearnedChats: true,
    collapseOthers: false,
    privacyAccepted: false
  };

  let cache = {};
  let collapsed = {};
  let settings = { ...DEFAULT_SETTINGS };
  let renderTimer = 0;
  let lastUrl = location.href;
  let writingStorage = false;

  function storageGet(keys) {
    return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  }

  function storageSet(value) {
    writingStorage = true;
    return new Promise((resolve) => {
      chrome.storage.local.set(value, () => {
        writingStorage = false;
        resolve();
      });
    });
  }

  function scheduleRender(delay = 80) {
    clearTimeout(renderTimer);
    renderTimer = window.setTimeout(refresh, delay);
  }

  function findSidebar() {
    return (
      document.querySelector('nav[aria-label="Chat history"]') ||
      document.querySelector('[aria-label="Chat history"]') ||
      [...document.querySelectorAll("nav")].find((nav) =>
        nav.querySelector('a[href="/projects"], a[href$="/projects"]')
      ) ||
      null
    );
  }

  function getChatAnchors(sidebar) {
    if (!sidebar) return [];
    return [...sidebar.querySelectorAll('a[href*="/c/"]')].filter((anchor) => {
      const path = core.normalizeHref(anchor.href, location.origin);
      return /^\/(?:g\/[^/]+\/)?c\/[0-9a-f-]+$/i.test(path);
    });
  }

  function labelFor(anchor) {
    const labelledBy = anchor.getAttribute?.("aria-labelledby");
    const referencedLabel = labelledBy
      ? labelledBy
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent || "")
          .join(" ")
      : "";
    return core.cleanText(
      anchor.getAttribute("aria-label") ||
        referencedLabel ||
        anchor.getAttribute("alt") ||
        anchor.getAttribute("data-tooltip") ||
        anchor.getAttribute("title") ||
        anchor.innerText ||
        anchor.textContent
    );
  }

  function readVisibleProjectChats(sidebar) {
    const projects = new Map();
    const sourceAnchors = [];

    for (const anchor of getChatAnchors(sidebar)) {
      const parsed = core.parseProjectFromLabel(labelFor(anchor));
      if (!parsed) continue;

      sourceAnchors.push(anchor);
      const key = core.projectKey(parsed.project);
      const project = projects.get(key) || {
        key,
        name: parsed.project,
        chats: [],
        recentChatIds: new Set()
      };
      const href = core.normalizeHref(anchor.href, location.origin);
      project.chats.push({ title: parsed.title, href });
      project.recentChatIds.add(core.conversationIdFromHref(href) || href);
      projects.set(key, project);
    }

    return { projects, sourceAnchors };
  }

  function currentProjectMetadata() {
    const projectId = core.projectIdFromHref(location.href);
    if (!projectId || !/\/project(?:[?#]|$)/.test(location.href)) return null;

    const titleButton = [...document.querySelectorAll("button")].find((button) =>
      /^Edit the title of\s+/i.test(labelFor(button))
    );
    const name = core.cleanText(
      titleButton
        ? labelFor(titleButton).replace(/^Edit the title of\s+/i, "")
        : document.querySelector("main h1")?.textContent
    );
    if (!name) return null;

    const projectRoot = `/g/${location.pathname.split("/g/")[1].split("/project")[0]}/project`;
    const chatAnchors = [
      ...document.querySelectorAll('a[href*="/g/"][href*="/c/"]')
    ];
    const chats = core.uniqueChats(
      chatAnchors.map((anchor) => ({
        title: labelFor(anchor),
        href: core.normalizeHref(anchor.href, location.origin)
      }))
    );

    return {
      id: projectId,
      key: core.projectKey(name, projectId),
      name,
      href: projectRoot,
      chats,
      syncedAt: Date.now()
    };
  }

  function readProjectsPageMetadata() {
    if (location.pathname !== "/projects") return [];

    return [...document.querySelectorAll("button")]
      .filter((button) => /^Open project options for\s+/i.test(labelFor(button)))
      .map((menu) => {
        const name = core.cleanText(
          labelFor(menu).replace(/^Open project options for\s+/i, "")
        );
        if (!name) return null;

        const row = menu.closest("tr, [role='row']") || menu.parentElement?.parentElement;
        if (!row) return null;
        const rowLabel = labelFor(row);
        const prefix = rowLabel.slice(0, rowLabel.toLocaleLowerCase().indexOf(name.toLocaleLowerCase()));
        const iconElement = row.querySelector("svg, img, [role='img']");
        const colorCandidates = [
          iconElement,
          iconElement?.parentElement,
          iconElement?.parentElement?.parentElement
        ].filter(Boolean);
        const iconLabel = colorCandidates.map((element) => labelFor(element)).join(" ");
        const iconDescriptor = `${iconLabel} ${prefix}`;
        const colorValue = colorCandidates
          .map((element) => getComputedStyle(element).color)
          .find((color) => color && color !== "rgba(0, 0, 0, 0)");
        const iconKind = /heart/i.test(iconDescriptor)
          ? "heart"
          : /flask/i.test(iconDescriptor)
            ? "flask"
            : /(?:currency|dollar)/i.test(iconDescriptor)
              ? "currency"
              : "folder";
        const colorName =
          prefix.match(/\b(blue|purple|green|orange|red|yellow|pink|teal)\b/i)?.[1]?.toLowerCase() ||
          "default";

        return {
          name,
          key: core.projectKey(name),
          iconKind,
          colorName,
          colorValue
        };
      })
      .filter(Boolean);
  }

  async function learnFromPage() {
    const learned = currentProjectMetadata();
    let changed = false;

    if (learned) {
      const nameKey = core.projectKey(learned.name);
      const previous = cache[learned.key] || cache[nameKey] || {};
      const next = {
        ...previous,
        ...learned,
        chats: learned.chats.length ? learned.chats : previous.chats || [],
        syncedAt: previous.syncedAt || learned.syncedAt
      };
      const previousShape = JSON.stringify({
        id: previous.id,
        name: previous.name,
        href: previous.href,
        chats: previous.chats || []
      });
      const nextShape = JSON.stringify({
        id: next.id,
        name: next.name,
        href: next.href,
        chats: next.chats
      });
      if (previousShape !== nextShape || (nameKey !== learned.key && cache[nameKey])) {
        next.syncedAt = learned.syncedAt;
        cache[learned.key] = next;
        if (nameKey !== learned.key && cache[nameKey]) delete cache[nameKey];
        changed = true;
      }
    }

    for (const project of readProjectsPageMetadata()) {
      const existingEntry =
        Object.entries(cache).find(([key]) => key === project.key) ||
        Object.entries(cache).find(
          ([, candidate]) =>
            core.cleanText(candidate.name).toLocaleLowerCase() ===
            project.name.toLocaleLowerCase()
        );

      if (!existingEntry) {
        cache[project.key] = { ...project, chats: [] };
        changed = true;
        continue;
      }

      const [existingKey, existing] = existingEntry;
      const next = {
        ...existing,
        iconKind: project.iconKind,
        colorName: project.colorName,
        colorValue: project.colorValue
      };
      const metadataChanged =
        existing.iconKind !== next.iconKind ||
        existing.colorName !== next.colorName ||
        existing.colorValue !== next.colorValue;

      if (metadataChanged) {
        cache[existingKey] = next;
        changed = true;
      }
    }

    if (changed) await storageSet({ [STORAGE.projects]: cache });
  }

  function matchCachedProject(visibleProject) {
    return (
      Object.values(cache).find(
        (project) =>
          core.cleanText(project.name).toLocaleLowerCase() ===
          visibleProject.name.toLocaleLowerCase()
      ) || null
    );
  }

  function projectIcon(project) {
    const icon = document.createElement("span");
    icon.className = "cgps-project-icon";
    icon.dataset.color = project.colorName || "default";
    if (project.colorValue) icon.style.color = project.colorValue;
    icon.setAttribute("aria-hidden", "true");
    const icons = {
      folder:
        '<path d="M3.75 6.75A2.25 2.25 0 0 1 6 4.5h3.1c.6 0 1.17.24 1.59.66l1.18 1.18c.14.14.33.22.53.22H18A2.25 2.25 0 0 1 20.25 8.8v7.45A2.25 2.25 0 0 1 18 18.5H6a2.25 2.25 0 0 1-2.25-2.25v-9.5Z"/>',
      heart:
        '<path d="M12 19.25 5.2 12.7a4.45 4.45 0 0 1 6.3-6.3l.5.5.5-.5a4.45 4.45 0 1 1 6.3 6.3L12 19.25Z"/>',
      flask:
        '<path d="M9 3.75h6m-5 0v5.1l-4.8 8.1A2.2 2.2 0 0 0 7.1 20.25h9.8a2.2 2.2 0 0 0 1.9-3.3L14 8.85v-5.1M7.4 15h9.2"/>',
      currency:
        '<circle cx="12" cy="12" r="8.25"/><path d="M12 7.25v9.5m2.35-7.65c-.55-.55-1.35-.85-2.3-.85-1.45 0-2.55.72-2.55 1.82 0 1.15 1 1.6 2.58 1.9 1.48.3 2.42.72 2.42 1.85 0 1.18-1.08 1.93-2.62 1.93-.98 0-1.88-.3-2.53-.92"/>'
    };
    icon.innerHTML = `<svg viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icons[project.iconKind] || icons.folder}</g></svg>`;
    return icon;
  }

  function createChatLink(chat) {
    const link = document.createElement("a");
    link.className = "cgps-chat-link";
    link.href = chat.href;
    link.textContent = chat.title;
    link.title = chat.title;
    return link;
  }

  function createProjectGroup(project) {
    const section = document.createElement("section");
    section.className = "cgps-project";
    section.dataset.projectKey = project.key;

    const header = document.createElement("div");
    header.className = "cgps-project-header";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "cgps-project-toggle";
    toggle.setAttribute(
      "aria-label",
      `${project.collapsed ? "Expand" : "Collapse"} ${project.name}`
    );
    toggle.setAttribute("aria-expanded", String(!project.collapsed));
    const title = document.createElement("span");
    title.className = "cgps-project-title";
    title.textContent = project.name;
    toggle.append(projectIcon(project), title);

    const open = document.createElement("a");
    open.className = "cgps-project-open";
    open.href = project.href || "/projects";
    open.textContent = "↗";
    open.setAttribute("aria-label", `Open ${project.name} project`);
    open.title = `Open ${project.name}`;

    const count = document.createElement("span");
    count.className = "cgps-project-count";
    count.textContent = String(project.chats.length);
    count.setAttribute(
      "aria-label",
      `${project.chats.length} ${project.chats.length === 1 ? "chat" : "chats"}`
    );

    const list = document.createElement("div");
    list.className = "cgps-chat-list";
    list.hidden = project.collapsed;
    for (const chat of project.chats) {
      list.append(createChatLink(chat));
    }

    toggle.addEventListener("click", async () => {
      const next = !list.hidden;
      list.hidden = next;
      toggle.setAttribute("aria-expanded", String(!next));
      toggle.setAttribute("aria-label", `${next ? "Expand" : "Collapse"} ${project.name}`);
      collapsed[project.key] = next;
      await storageSet({ [STORAGE.collapsed]: collapsed });
    });

    header.append(toggle, count, open);
    section.append(header, list);
    return section;
  }

  function createConsentNotice() {
    const notice = document.createElement("section");
    notice.className = "cgps-consent";
    notice.setAttribute("aria-label", "Enable Project Sidebar");

    const title = document.createElement("strong");
    title.textContent = "Group chats by project?";

    const detail = document.createElement("p");
    detail.textContent =
      "This extension reads project names, chat titles, and ChatGPT URLs from this page and stores them only in this browser. Nothing is transmitted.";

    const actions = document.createElement("div");
    actions.className = "cgps-consent-actions";

    const accept = document.createElement("button");
    accept.type = "button";
    accept.textContent = "Enable grouping";
    accept.addEventListener("click", async () => {
      settings.privacyAccepted = true;
      settings.enabled = true;
      await storageSet({ [STORAGE.settings]: settings });
      scheduleRender(0);
    });

    const policy = document.createElement("a");
    policy.href =
      "https://github.com/imranbarbhuiya/chatgpt-project-sidebar/blob/main/PRIVACY.md";
    policy.target = "_blank";
    policy.rel = "noreferrer";
    policy.textContent = "Privacy details";

    actions.append(accept, policy);
    notice.append(title, detail, actions);
    return notice;
  }

  function chooseMount(sidebar, sourceAnchors) {
    const first = sourceAnchors[0] || getChatAnchors(sidebar)[0];
    if (!first) return null;
    const list = first.closest("ol, ul, [role='list']") || first.parentElement;
    return list && list.parentElement ? { list, parent: list.parentElement } : null;
  }

  function restoreSourceVisibility() {
    document.querySelectorAll(`.${SOURCE_CLASS}`).forEach((element) =>
      element.classList.remove(SOURCE_CLASS)
    );
  }

  async function refresh() {
    const existing = document.getElementById(ROOT_ID);
    restoreSourceVisibility();
    if (existing) existing.remove();

    const sidebar = findSidebar();
    if (!sidebar) return;

    if (!settings.privacyAccepted) {
      const mount = chooseMount(sidebar, []);
      if (!mount) return;
      const root = document.createElement("div");
      root.id = ROOT_ID;
      root.append(createConsentNotice());
      mount.parent.insertBefore(root, mount.list);
      return;
    }

    await learnFromPage();
    if (!settings.enabled) return;

    const { projects: visible, sourceAnchors } = readVisibleProjectChats(sidebar);
    if (!visible.size && !Object.keys(cache).length) return;

    const mount = chooseMount(sidebar, sourceAnchors);
    if (!mount) return;

    const root = document.createElement("div");
    root.id = ROOT_ID;
    root.setAttribute("aria-label", "Chats grouped by project");

    const masterToggle = document.createElement("button");
    masterToggle.type = "button";
    masterToggle.className = "cgps-master-toggle";
    masterToggle.setAttribute("aria-expanded", String(!collapsed.__all));
    masterToggle.innerHTML =
      '<span>Projects</span><svg aria-hidden="true" viewBox="0 0 16 16"><path d="m5.5 6.5 2.5 3 2.5-3"/></svg>';

    const projectList = document.createElement("div");
    projectList.className = "cgps-project-list";
    projectList.hidden = Boolean(collapsed.__all);

    masterToggle.addEventListener("click", async () => {
      const next = !projectList.hidden;
      projectList.hidden = next;
      masterToggle.setAttribute("aria-expanded", String(!next));
      collapsed.__all = next;
      await storageSet({ [STORAGE.collapsed]: collapsed });
    });

    root.append(masterToggle, projectList);

    const renderProjects = new Map(visible);
    for (const learned of Object.values(cache)) {
      const nameKey = core.projectKey(learned.name);
      if (![...renderProjects.values()].some((item) => item.key === nameKey)) {
        renderProjects.set(nameKey, {
          key: nameKey,
          name: learned.name,
          chats: [],
          recentChatIds: new Set()
        });
      }
    }

    for (const visibleProject of renderProjects.values()) {
      const learned = matchCachedProject(visibleProject);
      const learnedChats = settings.showLearnedChats ? learned?.chats || [] : [];
      const chats = core.mergeChats(visibleProject.chats, learnedChats);
      const activeProjectId = core.projectIdFromHref(location.href);
      const isActive = Boolean(learned?.id && learned.id === activeProjectId);
      const isCollapsed =
        collapsed[learned?.key || visibleProject.key] ??
        (settings.collapseOthers && !isActive);

      projectList.append(
        createProjectGroup({
          ...visibleProject,
          key: learned?.key || visibleProject.key,
          href: learned?.href,
          iconKind: learned?.iconKind,
          colorName: learned?.colorName,
          colorValue: learned?.colorValue,
          chats,
          collapsed: isCollapsed
        })
      );
    }

    sourceAnchors.forEach((anchor) => {
      const row = anchor.closest("li, [role='listitem']");
      (row || anchor).classList.add(SOURCE_CLASS);
    });
    mount.parent.insertBefore(root, mount.list);
  }

  async function initialize() {
    const stored = await storageGet(Object.values(STORAGE));
    cache = stored[STORAGE.projects] || {};
    collapsed = stored[STORAGE.collapsed] || {};
    settings = { ...DEFAULT_SETTINGS, ...(stored[STORAGE.settings] || {}) };
    if (!settings.privacyAccepted && Object.keys(cache).length) {
      settings.privacyAccepted = true;
      await storageSet({ [STORAGE.settings]: settings });
    }

    const observer = new MutationObserver((records) => {
      const meaningful = records.some((record) => {
        const changedNodes = [...record.addedNodes, ...record.removedNodes];
        return changedNodes.some((node) => {
          if (node.nodeType !== Node.ELEMENT_NODE) return true;
          if (node.id === ROOT_ID) return false;
          return !node.closest?.(`#${ROOT_ID}`);
        });
      });
      if (meaningful) scheduleRender();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    window.setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        scheduleRender(180);
      }
    }, 600);

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || writingStorage) return;
      if (changes[STORAGE.projects]) cache = changes[STORAGE.projects].newValue || {};
      if (changes[STORAGE.collapsed]) collapsed = changes[STORAGE.collapsed].newValue || {};
      if (changes[STORAGE.settings]) {
        settings = {
          ...DEFAULT_SETTINGS,
          ...(changes[STORAGE.settings].newValue || {})
        };
      }
      scheduleRender();
    });

    scheduleRender(0);
  }

  initialize();
})();
