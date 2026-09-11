(function setupPopup() {
  "use strict";

  const SETTINGS_KEY = "cgpsSettings";
  const PROJECTS_KEY = "cgpsProjects";
  const COLLAPSED_KEY = "cgpsCollapsed";
  const defaults = {
    enabled: true,
    showLearnedChats: true,
    collapseOthers: false,
    privacyAccepted: false
  };

  const controls = {
    enabled: document.getElementById("enabled"),
    showLearnedChats: document.getElementById("showLearnedChats"),
    collapseOthers: document.getElementById("collapseOthers")
  };

  function updateSummary(projects) {
    const values = Object.values(projects || {});
    const chatCount = values.reduce(
      (total, project) => total + (project.chats || []).length,
      0
    );
    document.getElementById("summary").textContent =
      values.length === 0
        ? "No project pages learned yet"
        : `${values.length} ${values.length === 1 ? "project" : "projects"} · ${chatCount} ${chatCount === 1 ? "chat" : "chats"} learned`;
  }

  chrome.storage.local.get([SETTINGS_KEY, PROJECTS_KEY], (stored) => {
    const settings = { ...defaults, ...(stored[SETTINGS_KEY] || {}) };
    if (!settings.privacyAccepted && Object.keys(stored[PROJECTS_KEY] || {}).length) {
      settings.privacyAccepted = true;
      chrome.storage.local.set({ [SETTINGS_KEY]: settings });
    }

    const consent = document.getElementById("consent");
    const preferences = document.getElementById("preferences");
    consent.hidden = settings.privacyAccepted;
    preferences.hidden = !settings.privacyAccepted;

    document.getElementById("accept").addEventListener("click", () => {
      settings.privacyAccepted = true;
      settings.enabled = true;
      chrome.storage.local.set({ [SETTINGS_KEY]: settings }, () => {
        consent.hidden = true;
        preferences.hidden = false;
      });
    });

    for (const [key, control] of Object.entries(controls)) {
      control.checked = Boolean(settings[key]);
      control.addEventListener("change", () => {
        settings[key] = control.checked;
        chrome.storage.local.set({ [SETTINGS_KEY]: settings });
      });
    }
    updateSummary(stored[PROJECTS_KEY]);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[PROJECTS_KEY]) {
      updateSummary(changes[PROJECTS_KEY].newValue);
    }
  });

  document.getElementById("openProjects").addEventListener("click", () => {
    chrome.tabs.create({ url: "https://chatgpt.com/projects" });
  });

  document.getElementById("clear").addEventListener("click", () => {
    chrome.storage.local.remove([PROJECTS_KEY, COLLAPSED_KEY], () => {
      updateSummary({});
    });
  });
})();
