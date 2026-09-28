/* ===================================================================
   Admin panel script
   Talks to the same Apps Script backend as the public site.
   Session token is kept in sessionStorage (cleared when the tab closes).
=================================================================== */

(function () {
  "use strict";

  const backendReady = typeof APPS_SCRIPT_URL === "string" &&
    APPS_SCRIPT_URL.startsWith("http");

  const loginView = document.getElementById("loginView");
  const dashboardView = document.getElementById("dashboardView");
  const loginForm = document.getElementById("loginForm");
  const loginErr = document.getElementById("loginErr");
  const loginSubmitBtn = loginForm?.querySelector('button[type="submit"]');
  const logoutBtn = document.getElementById("logoutBtn");
  const toastContainer = document.getElementById("toastContainer");
  const confirmModal = document.getElementById("confirmModal");
  const confirmMessage = document.getElementById("confirmMessage");
  const confirmOkBtn = document.getElementById("confirmOkBtn");
  const confirmCancelBtn = document.getElementById("confirmCancelBtn");

  let state = { settings: {}, projects: [], skills: {} };
  let pendingConfirm = null;

  function getPersistedSessionState() {
    try {
      return JSON.parse(window.name || "{}");
    } catch (_) {
      return {};
    }
  }

  function setPersistedSessionState(token, guardTime) {
    const state = getPersistedSessionState();
    state.admin_token = token;
    state.admin_session_guard = guardTime;
    window.name = JSON.stringify(state);
  }

  function clearPersistedSessionState() {
    try {
      const state = getPersistedSessionState();
      delete state.admin_token;
      delete state.admin_session_guard;
      window.name = JSON.stringify(state);
    } catch (_) {
      window.name = "{}";
    }
  }

  function getToken() {
    return localStorage.getItem("admin_token") ||
      sessionStorage.getItem("admin_token") ||
      getPersistedSessionState().admin_token ||
      "";
  }

  function setToken(t) {
    const guardTime = Date.now();
    sessionStorage.setItem("admin_token", t);
    sessionStorage.setItem("admin_session_guard", String(guardTime));
    localStorage.setItem("admin_token", t);
    localStorage.setItem("admin_session_guard", String(guardTime));
    setPersistedSessionState(t, guardTime);
  }

  function clearToken() {
    sessionStorage.removeItem("admin_token");
    sessionStorage.removeItem("admin_session_guard");
    localStorage.removeItem("admin_token");
    localStorage.removeItem("admin_session_guard");
    clearPersistedSessionState();
  }

  function setLoadingState(button, isLoading, label) {
    if (!button) return;
    const btnLabel = button.querySelector(".btn-label");
    const spinner = button.querySelector(".spinner");

    if (isLoading) {
      button.classList.add("is-loading");
      button.disabled = true;
      if (btnLabel) btnLabel.textContent = label;
      if (spinner) spinner.style.display = "inline-block";
      return;
    }

    button.classList.remove("is-loading");
    button.disabled = false;
    if (btnLabel) btnLabel.textContent = label;
    if (spinner) spinner.style.display = "none";
  }

  function showToast(message, type = "success") {
    if (!toastContainer) return;

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add("show"));

    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 220);
    }, 2600);
  }

  function normalizeImageUrl(url) {
    if (!url || typeof url !== "string") return "";
    const trimmed = url.trim();
    if (!trimmed) return "";

    const driveMatch = trimmed.match(/(?:https?:\/\/)?drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
    if (driveMatch && driveMatch[1]) {
      return `https://drive.google.com/uc?export=view&id=${driveMatch[1]}`;
    }

    const openMatch = trimmed.match(/(?:https?:\/\/)?drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/i);
    if (openMatch && openMatch[1]) {
      return `https://drive.google.com/uc?export=view&id=${openMatch[1]}`;
    }

    const ucMatch = trimmed.match(/id=([a-zA-Z0-9_-]+)/i);
    if (ucMatch && ucMatch[1]) {
      return `https://drive.google.com/uc?export=view&id=${ucMatch[1]}`;
    }

    return trimmed;
  }

  function askConfirm(message, onConfirm) {
    if (!confirmModal) {
      const ok = window.confirm(message);
      if (ok) onConfirm();
      return;
    }

    confirmMessage.textContent = message;
    confirmModal.classList.remove("hidden");
    pendingConfirm = onConfirm;
  }

  function closeConfirm() {
    if (!confirmModal) return;
    confirmModal.classList.add("hidden");
    pendingConfirm = null;
  }

  confirmOkBtn.addEventListener("click", () => {
    const fn = pendingConfirm;
    closeConfirm();
    if (typeof fn === "function") fn();
  });

  confirmCancelBtn.addEventListener("click", closeConfirm);
  confirmModal.addEventListener("click", (e) => {
    if (e.target === confirmModal) closeConfirm();
  });

  async function api(action, extra) {
    if (!backendReady) throw new Error("Backend not configured yet (see README.md).");
    const res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(Object.assign({ action, token: getToken() }, extra || {})),
    });
    const data = await res.json();
    if (data.success === false) throw new Error(data.error || "Request failed.");
    return data;
  }

  async function getContent() {
    if (!backendReady) throw new Error("Backend not configured yet (see README.md).");
    const res = await fetch(`${APPS_SCRIPT_URL}?action=getContent`);
    return res.json();
  }

  /* ---------------- Login ---------------- */
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginErr.textContent = "";
    const username = document.getElementById("lg-user").value.trim();
    const password = document.getElementById("lg-pass").value;

    if (!username || !password) {
      loginErr.textContent = "Username and password are required.";
      return;
    }

    setLoadingState(loginSubmitBtn, true, "Logging in...");

    try {
      const data = await api("login", { username, password });
      setToken(data.token);
      showToast("Logged in successfully.", "success");
      await enterDashboard();
    } catch (err) {
      loginErr.textContent = err.message;
      showToast(err.message, "error");
    } finally {
      setLoadingState(loginSubmitBtn, false, "Log In");
    }
  });

  loginForm.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const target = e.target;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        e.preventDefault();
        loginForm.requestSubmit();
      }
    }
  });

  logoutBtn.addEventListener("click", () => {
    askConfirm("Are you sure you want to log out? This will end the current admin session.", () => {
      setLoadingState(logoutBtn, true, "Logging out...");

      setTimeout(() => {
        clearToken();
        dashboardView.style.display = "none";
        loginView.style.display = "flex";
        loginForm.reset();
        setLoadingState(logoutBtn, false, "Log Out");
        showToast("You have been logged out.", "warning");
        window.history.pushState(null, "", window.location.href);
      }, 450);
    });
  });
  document.getElementById("saveAdminCredentialsBtn")?.addEventListener("click", async () => {
    const statusEl = document.getElementById("status-security");
    const username = document.getElementById("adminUsername").value.trim();
    const password = document.getElementById("adminPassword").value;
    const confirmPassword = document.getElementById("adminPasswordConfirm").value;

    statusEl.textContent = "Saving…";
    statusEl.className = "save-status";

    if (!username || !password || !confirmPassword) {
      statusEl.textContent = "Username and password are required.";
      statusEl.classList.add("err");
      return;
    }

    if (password !== confirmPassword) {
      statusEl.textContent = "Passwords do not match.";
      statusEl.classList.add("err");
      return;
    }

    try {
      await api("updateAdminCredentials", { username, password });
      document.getElementById("adminUsername").value = "";
      document.getElementById("adminPassword").value = "";
      document.getElementById("adminPasswordConfirm").value = "";
      statusEl.textContent = "Credentials saved.";
      statusEl.classList.add("ok");
      showToast("Admin credentials updated successfully.", "success");
    } catch (err) {
      statusEl.textContent = err.message;
      statusEl.classList.add("err");
      showToast(err.message, "error");
    }
  });
  document.getElementById("clearInboxBtn")?.addEventListener("click", clearInbox);

  function enforceSessionGuard() {
    const token = getToken();

    if (!backendReady) {
      clearToken();
      showLoginView();
      return false;
    }

    if (!token) {
      showLoginView();
      return false;
    }

    return true;
  }

  function showLoginView() {
    dashboardView.style.display = "none";
    loginView.style.display = "flex";
    loginErr.textContent = "";
  }

  function showDashboardView() {
    loginView.style.display = "none";
    dashboardView.style.display = "block";
  }

  async function enterDashboard() {
    if (!getToken() || !backendReady) {
      clearToken();
      showLoginView();
      return;
    }

    showDashboardView();
    renderProjectLoadingState();
    try {
      const data = await getContent();
      state.settings = data.settings || {};
      state.projects = data.projects || [];
      state.skills = data.skills || {};
      fillSettingsFields();
      renderProjects();
      renderSkills();
    } catch (err) {
      clearToken();
      showLoginView();
      showToast(err.message || "Session expired.", "error");
    }
  }

  // If a token already exists this session, skip straight to the dashboard.
  if (backendReady && getToken()) {
    enterDashboard().catch(() => {
      clearToken();
      showLoginView();
    });
  } else {
    showLoginView();
  }

  window.addEventListener("pageshow", () => {
    if (!enforceSessionGuard()) return;
    enterDashboard().catch(() => {
      clearToken();
      showLoginView();
      showToast("Your session expired. Please log in again.", "error");
    });
  });

  window.addEventListener("popstate", () => {
    if (!getToken()) {
      clearToken();
      showLoginView();
      return;
    }
    enterDashboard().catch(() => {
      clearToken();
      showLoginView();
    });
  });

  /* ---------------- Tabs ---------------- */
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.querySelector(`.tab-panel[data-panel="${btn.dataset.tab}"]`).classList.add("active");
      if (btn.dataset.tab === "projects" && projectList && !state.projects.length) {
        renderProjectLoadingState();
      }
      if (btn.dataset.tab === "messages") loadMessages();
    });
  });

  /* ---------------- Settings fields (about / contact / footer) ---------------- */
  const settingKeys = [
    "about_bio", "about_long",
    "contact_email", "contact_phone", "contact_facebook", "contact_instagram",
    "footer_name", "footer_tagline", "footer_year",
  ];

  function fillSettingsFields() {
    settingKeys.forEach((key) => {
      const el = document.getElementById("s-" + key);
      if (el) el.value = state.settings[key] || "";
    });
  }

  const sectionKeyMap = {
    about: ["about_bio", "about_long"],
    contact: ["contact_email", "contact_phone", "contact_facebook", "contact_instagram"],
    footer: ["footer_name", "footer_tagline", "footer_year"],
  };

  document.querySelectorAll("[data-save]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const section = btn.dataset.save;
      if (section === "skills") return saveSkills();
      const keys = sectionKeyMap[section];
      const statusEl = document.getElementById("status-" + section);
      const payload = {};
      keys.forEach((k) => (payload[k] = document.getElementById("s-" + k).value));
      statusEl.textContent = "Saving…";
      statusEl.className = "save-status";
      try {
        await api("updateSettings", { data: payload });
        Object.assign(state.settings, payload);
        statusEl.textContent = "Saved.";
        statusEl.classList.add("ok");
      } catch (err) {
        statusEl.textContent = err.message;
        statusEl.classList.add("err");
      }
    });
  });

  /* ---------------- Projects editor ---------------- */
  const projectList = document.getElementById("projectList");

  function renderProjectLoadingState() {
    if (!projectList) return;
    projectList.innerHTML = "";
    const skeletonCount = 2;
    for (let i = 0; i < skeletonCount; i += 1) {
      const card = document.createElement("div");
      card.className = "project-loading-card";
      card.innerHTML = `
        <div class="project-loading-visual"></div>
        <div class="project-loading-body">
          <div class="project-loading-line short"></div>
          <div class="project-loading-line"></div>
          <div class="project-loading-line long"></div>
          <div class="project-loading-tags">
            <span></span><span></span><span></span>
          </div>
        </div>
      `;
      projectList.appendChild(card);
    }
  }

  function renderProjects() {
    if (!projectList) return;
    projectList.innerHTML = "";
    if (!state.projects.length) {
      renderProjectLoadingState();
      return;
    }
    state.projects.forEach((p) => projectList.appendChild(projectCardEl(p)));
  }

  function projectCardEl(project) {
    const wrap = document.createElement("div");
    wrap.className = "project-editor";
    const p = Object.assign({ id: "", title: "", role: "", company: "", description: "", image: "", tags: "", order: 0 }, project);

    wrap.innerHTML = `
      <div class="field-grid">
        <div class="field full">
          <label>Project title</label>
          <input type="text" class="f-title" value="${escAttr(p.title)}">
        </div>
        <div class="field">
          <label>Role</label>
          <input type="text" class="f-role" value="${escAttr(p.role)}">
        </div>
        <div class="field">
          <label>Company (optional)</label>
          <input type="text" class="f-company" value="${escAttr(p.company)}">
        </div>
        <div class="field full">
          <label>Description</label>
          <textarea class="f-description" rows="3">${escHtml(p.description)}</textarea>
        </div>
        <div class="field full">
          <label>Project image</label>
          <input type="text" class="f-image" placeholder="Paste image URL" value="${escAttr(p.image)}">
          <div class="project-image-preview-wrap ${p.image ? "" : "project-image-empty"}">
            <img class="project-image-preview" src="${escAttr(p.image || "")}" alt="Project preview">
          </div>
        </div>
        <div class="field full">
          <label>Tags (comma-separated)</label>
          <input type="text" class="f-tags" value="${escAttr(p.tags)}">
        </div>
      </div>
      <div class="row-actions">
        <button class="btn-danger" data-act="delete">Delete</button>
        <button class="btn btn-primary" data-act="save" style="padding:9px 18px; font-size:0.85rem;">Save Project</button>
        <span class="save-status"></span>
      </div>`;

    const imageInput = wrap.querySelector(".f-image");
    const preview = wrap.querySelector(".project-image-preview");
    const previewWrap = wrap.querySelector(".project-image-preview-wrap");

    const syncProjectPreview = (url) => {
      if (!preview || !previewWrap) return;
      const cleanedUrl = normalizeImageUrl(String(url || "").trim());
      const isValidImage = cleanedUrl && (
        cleanedUrl.startsWith("data:image/") ||
        cleanedUrl.startsWith("http://") ||
        cleanedUrl.startsWith("https://")
      );

      if (!isValidImage) {
        preview.src = "";
        previewWrap.classList.add("project-image-empty");
        return;
      }

      preview.src = cleanedUrl;
      previewWrap.classList.remove("project-image-empty");
    };

    syncProjectPreview(p.image || "");

    imageInput.addEventListener("input", () => {
      syncProjectPreview(imageInput.value);
    });

    wrap.querySelector('[data-act="save"]').addEventListener("click", async () => {
      const statusEl = wrap.querySelector(".save-status");
      const updated = {
        id: p.id,
        order: p.order,
        title: wrap.querySelector(".f-title").value,
        role: wrap.querySelector(".f-role").value,
        company: wrap.querySelector(".f-company").value,
        description: wrap.querySelector(".f-description").value,
        image: normalizeImageUrl(imageInput.value),
        tags: wrap.querySelector(".f-tags").value,
      };
      statusEl.textContent = "Saving…";
      statusEl.className = "save-status";
      try {
        const data = await api("saveProject", { project: updated });
        Object.assign(p, data.project);
        wrap.dataset.id = p.id;
        statusEl.textContent = "Saved.";
        statusEl.classList.add("ok");
      } catch (err) {
        statusEl.textContent = err.message;
        statusEl.classList.add("err");
      }
    });

    wrap.querySelector('[data-act="delete"]').addEventListener("click", async () => {
      if (!confirm("Delete this project?")) return;
      try {
        if (p.id) await api("deleteProject", { id: p.id });
        wrap.remove();
        state.projects = state.projects.filter((x) => x.id !== p.id);
      } catch (err) {
        alert(err.message);
      }
    });

    return wrap;
  }

  document.getElementById("addProjectBtn").addEventListener("click", () => {
    const blank = { id: "", title: "New Project", role: "", company: "", description: "", image: "", tags: "", order: state.projects.length };
    state.projects.push(blank);
    projectList.appendChild(projectCardEl(blank));
  });

  /* ---------------- Skills editor ---------------- */
  const skillCatList = document.getElementById("skillCatList");

  function renderSkills() {
    skillCatList.innerHTML = "";
    Object.keys(state.skills).forEach((category) => {
      skillCatList.appendChild(categoryEl(category, state.skills[category]));
    });
  }

  function categoryEl(category, skills) {
    const wrap = document.createElement("div");
    wrap.className = "skill-cat";
    wrap.innerHTML = `
      <div class="skill-cat-head">
        <input type="text" class="cat-name" value="${escAttr(category)}">
        <button class="btn-danger" data-act="remove-cat">Remove category</button>
      </div>
      <div class="skill-tag-list"></div>
      <div class="skill-add-row">
        <input type="text" class="new-skill" placeholder="Add a skill and press Enter">
      </div>`;

    const tagList = wrap.querySelector(".skill-tag-list");
    (skills || []).forEach((skill) => tagList.appendChild(skillTagEl(skill)));

    function skillTagEl(skill) {
      const tag = document.createElement("span");
      tag.className = "skill-tag";
      tag.innerHTML = `<span class="skill-text">${escHtml(skill)}</span> <button aria-label="Remove">×</button>`;
      tag.querySelector("button").addEventListener("click", () => tag.remove());
      return tag;
    }

    wrap.querySelector(".new-skill").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const val = e.target.value.trim();
        if (val) {
          tagList.appendChild(skillTagEl(val));
          e.target.value = "";
        }
      }
    });

    wrap.querySelector('[data-act="remove-cat"]').addEventListener("click", () => {
      if (confirm("Remove this whole category?")) wrap.remove();
    });

    return wrap;
  }

  document.getElementById("addCategoryBtn").addEventListener("click", () => {
    skillCatList.appendChild(categoryEl("New Category", []));
  });

  async function saveSkills() {
    const statusEl = document.getElementById("status-skills");
    const result = {};
    skillCatList.querySelectorAll(".skill-cat").forEach((cat) => {
      const name = cat.querySelector(".cat-name").value.trim();
      if (!name) return;
      const skills = Array.from(cat.querySelectorAll(".skill-text")).map((s) => s.textContent);
      result[name] = skills;
    });
    statusEl.textContent = "Saving…";
    statusEl.className = "save-status";
    try {
      await api("saveSkills", { skills: result });
      state.skills = result;
      statusEl.textContent = "Saved.";
      statusEl.classList.add("ok");
    } catch (err) {
      statusEl.textContent = err.message;
      statusEl.classList.add("err");
    }
  }

  /* ---------------- Messages ---------------- */
  async function loadMessages() {
    const el = document.getElementById("messagesList");
    el.textContent = "Loading…";
    try {
      const data = await api("getMessages");
      if (!data.messages.length) {
        el.textContent = "No messages yet.";
        return;
      }
      el.innerHTML = data.messages
        .map(
          (m) => `
        <div style="border:1px solid var(--panel-border); border-radius:12px; padding:14px; margin-bottom:10px; word-wrap:break-word; overflow-wrap:anywhere; white-space:pre-wrap;">
          <div style="font-size:0.78rem; color:var(--text-2); margin-bottom:6px;">${escHtml(m.timestamp)} — ${escHtml(m.name)} (${escHtml(m.email)})</div>
          <div style="color:var(--text-0); word-wrap:break-word; overflow-wrap:anywhere; white-space:pre-wrap;">${escHtml(m.message)}</div>
        </div>`
        )
        .join("");
    } catch (err) {
      el.textContent = err.message;
    }
  }

  async function clearInbox() {
    const el = document.getElementById("messagesList");
    askConfirm("Clear all inbox messages? This will permanently remove them from the database.", async () => {
      el.textContent = "Clearing messages…";
      try {
        const data = await api("clearMessages");
        if (!data.messages.length) {
          el.textContent = "No messages yet.";
          showToast("Inbox is already empty.", "warning");
          return;
        }
        el.textContent = "Messages cleared.";
        showToast("Inbox cleared successfully.", "success");
        await loadMessages();
      } catch (err) {
        el.textContent = err.message;
        showToast(err.message, "error");
      }
    });
  }

  /* ---------------- Helpers ---------------- */
  function escHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  function escAttr(str) {
    return escHtml(str).replace(/"/g, "&quot;");
  }
})();
