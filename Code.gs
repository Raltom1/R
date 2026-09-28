/* ===================================================================
   Reign Kerstine Portfolio — Backend (Google Apps Script)
   Bind this script to the Google Sheet that will act as the database.
   See README.md for full setup steps.

   Sheets used (auto-created on first run if missing):
     - Settings  : Key | Value
     - Projects  : id | title | role | company | description | image | tags | order
     - Skills    : category | skill | order
     - Messages  : timestamp | name | email | message

   Admin auth:
     Set Script Properties ADMIN_USER and ADMIN_PASS
     (Project Settings -> Script Properties) before deploying.
=================================================================== */

const SETTINGS_SHEET = "Settings";
const PROJECTS_SHEET = "Projects";
const SKILLS_SHEET = "Skills";
const MESSAGES_SHEET = "Messages";
const TOKEN_TTL_SECONDS = 6 * 60 * 60; // 6 hours
const MAX_FAILED_LOGINS = 5;
const LOGIN_LOCK_SECONDS = 15 * 60;
const ADMIN_USER_KEY = "ADMIN_USER";
const ADMIN_PASS_HASH_KEY = "ADMIN_PASS_HASH";

/* ------------------------- Entry points ------------------------- */

function doGet(e) {
  initializePortfolio();
  const action = (e && e.parameter && e.parameter.action) || "getContent";
  try {
    if (action === "getContent") {
      return jsonOut(getContent());
    }
    return jsonOut({ success: false, error: "Unknown action" });
  } catch (err) {
    return jsonOut({ success: false, error: String(err) });
  }
}

function doPost(e) {
  initializePortfolio();
  let body = {};
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOut({ success: false, error: "Invalid request body" });
  }

  const action = body.action;
  try {
    switch (action) {
      case "login":
        return jsonOut(login(body.username, body.password));

      case "sendMessage":
        appendMessage(body.name, body.email, body.message);
        return jsonOut({ success: true });

      case "updateSettings":
        requireAuth(body.token);
        writeSettings(body.data || {});
        return jsonOut({ success: true, settings: readSettings() });

      case "saveProject":
        requireAuth(body.token);
        return jsonOut({ success: true, project: upsertProject(body.project || {}) });

      case "deleteProject":
        requireAuth(body.token);
        deleteProject(body.id);
        return jsonOut({ success: true });

      case "saveSkills":
        requireAuth(body.token);
        writeSkills(body.skills || {});
        return jsonOut({ success: true, skills: readSkills() });

      case "getMessages":
        requireAuth(body.token);
        return jsonOut({ success: true, messages: readMessages() });

      case "clearMessages":
        requireAuth(body.token);
        clearMessages();
        return jsonOut({ success: true, messages: readMessages() });

      case "updateAdminCredentials":
        requireAuth(body.token);
        return jsonOut(updateAdminCredentials(body.username, body.password));

      default:
        return jsonOut({ success: false, error: "Unknown action" });
    }
  } catch (err) {
    return jsonOut({ success: false, error: String(err) });
  }
}

/* ------------------------- Public content ------------------------- */

function initializePortfolio() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("No active Google Sheet found. Run this script from a bound spreadsheet.");

  ensureScriptProperties();
  getOrCreateSheet(SETTINGS_SHEET, ["Key", "Value"]);
  getOrCreateSheet(PROJECTS_SHEET, PROJECT_COLS);
  getOrCreateSheet(SKILLS_SHEET, ["category", "skill", "order"]);
  getOrCreateSheet(MESSAGES_SHEET, ["timestamp", "name", "email", "message"]);

  const settings = readSettings();
  const projects = readProjects();
  const skills = readSkills();

  if (!Object.keys(settings).length && !projects.length && !Object.keys(skills).length) {
    seedDefaultPortfolioContent();
  }

  return ss;
}

function ensureScriptProperties() {
  const props = PropertiesService.getScriptProperties();
  const user = props.getProperty(ADMIN_USER_KEY);
  const passHash = props.getProperty(ADMIN_PASS_HASH_KEY);
  const legacyPass = props.getProperty("ADMIN_PASS");

  if (!user && !legacyPass) {
    return false;
  }

  if (!passHash && legacyPass) {
    props.setProperty(ADMIN_PASS_HASH_KEY, hashString(legacyPass));
  }

  return true;
}

function getContent() {
  initializePortfolio();
  return {
    success: true,
    settings: readSettings(),
    projects: readProjects(),
    skills: readSkills(),
  };
}

/* ------------------------- Auth ------------------------- */

function login(username, password) {
  const props = PropertiesService.getScriptProperties();
  const validUser = String(props.getProperty(ADMIN_USER_KEY) || "").trim();
  const validHash = String(props.getProperty(ADMIN_PASS_HASH_KEY) || "").trim();
  const legacyPass = props.getProperty("ADMIN_PASS");
  const inputUser = String(username || "").trim();
  const inputPass = String(password || "");

  if (!validUser || (!validHash && !legacyPass)) {
    return { success: false, error: "Admin credentials are not configured. Set ADMIN_USER and ADMIN_PASS_HASH in Script Properties." };
  }

  const cache = CacheService.getScriptCache();
  const failKey = "login_fail_" + (inputUser || "unknown");
  const failCount = Number(cache.get(failKey) || "0");

  if (failCount >= MAX_FAILED_LOGINS) {
    return { success: false, error: "Too many failed login attempts. Please try again later." };
  }

  const hash = hashString(inputPass);
  const legacyMatch = !!legacyPass && inputPass === legacyPass && inputUser === validUser;
  const isValid = (inputUser === validUser && hash === validHash) || legacyMatch;

  if (!isValid) {
    cache.put(failKey, String(failCount + 1), LOGIN_LOCK_SECONDS);
    return { success: false, error: "Invalid username or password." };
  }

  if (legacyPass && !validHash) {
    props.setProperty(ADMIN_PASS_HASH_KEY, hashString(inputPass));
    props.deleteProperty("ADMIN_PASS");
  }

  cache.remove(failKey);

  const token = Utilities.getUuid();
  cache.put("session_" + token, inputUser, TOKEN_TTL_SECONDS);
  return { success: true, token: token };
}

function requireAuth(token) {
  if (!token) throw new Error("Not authenticated.");
  const user = CacheService.getScriptCache().get("session_" + token);
  if (!user) throw new Error("Session expired. Please log in again.");
  return user;
}

function updateAdminCredentials(username, password) {
  const trimmedUser = String(username || "").trim();
  const trimmedPassword = String(password || "").trim();

  if (!trimmedUser) {
    throw new Error("Username cannot be empty.");
  }

  if (!trimmedPassword) {
    throw new Error("Password cannot be empty.");
  }

  const props = PropertiesService.getScriptProperties();
  props.setProperty(ADMIN_USER_KEY, trimmedUser);
  props.setProperty(ADMIN_PASS_HASH_KEY, hashString(trimmedPassword));
  props.deleteProperty("ADMIN_PASS");

  return {
    success: true,
    username: trimmedUser,
    updated: true,
  };
}

/* ------------------------- Settings sheet ------------------------- */

function readSettings() {
  const sheet = getOrCreateSheet(SETTINGS_SHEET, ["Key", "Value"]);
  const rows = sheet.getDataRange().getValues();
  const out = {};
  for (let i = 1; i < rows.length; i++) {
    const key = rows[i][0];
    if (key) out[key] = rows[i][1];
  }
  return out;
}

function writeSettings(dataObj) {
  const sheet = getOrCreateSheet(SETTINGS_SHEET, ["Key", "Value"]);
  const rows = sheet.getDataRange().getValues();
  const keyRow = {};
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0]) keyRow[rows[i][0]] = i + 1; // 1-indexed sheet row
  }
  Object.keys(dataObj).forEach((key) => {
    const value = dataObj[key];
    if (keyRow[key]) {
      sheet.getRange(keyRow[key], 2).setValue(value);
    } else {
      sheet.appendRow([key, value]);
    }
  });
}

/* ------------------------- Projects sheet ------------------------- */

const PROJECT_COLS = ["id", "title", "role", "company", "description", "image", "tags", "order"];

function readProjects() {
  const sheet = getOrCreateSheet(PROJECTS_SHEET, PROJECT_COLS);
  const rows = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    const obj = {};
    PROJECT_COLS.forEach((col, idx) => (obj[col] = rows[i][idx]));
    out.push(obj);
  }
  return out;
}

function upsertProject(project) {
  const sheet = getOrCreateSheet(PROJECTS_SHEET, PROJECT_COLS);
  const rows = sheet.getDataRange().getValues();

  if (!project.id) {
    project.id = Utilities.getUuid();
  }
  if (project.order === undefined || project.order === "") {
    project.order = rows.length; // append to end by default
  }

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === project.id) {
      const values = PROJECT_COLS.map((col) => project[col] !== undefined ? project[col] : rows[i][PROJECT_COLS.indexOf(col)]);
      sheet.getRange(i + 1, 1, 1, PROJECT_COLS.length).setValues([values]);
      return project;
    }
  }

  const newRow = PROJECT_COLS.map((col) => project[col] !== undefined ? project[col] : "");
  sheet.appendRow(newRow);
  return project;
}

function deleteProject(id) {
  const sheet = getOrCreateSheet(PROJECTS_SHEET, PROJECT_COLS);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === id) {
      sheet.deleteRow(i + 1);
      return;
    }
  }
}

/* ------------------------- Skills sheet ------------------------- */

function readSkills() {
  const sheet = getOrCreateSheet(SKILLS_SHEET, ["category", "skill", "order"]);
  const rows = sheet.getDataRange().getValues();
  const grouped = {};
  const withOrder = [];
  for (let i = 1; i < rows.length; i++) {
    const [category, skill, order] = rows[i];
    if (!category || !skill) continue;
    withOrder.push({ category, skill, order: Number(order) || i });
  }
  withOrder.sort((a, b) => a.order - b.order);
  withOrder.forEach(({ category, skill }) => {
    if (!grouped[category]) grouped[category] = [];
    grouped[category].push(skill);
  });
  return grouped;
}

function writeSkills(skillsObj) {
  const sheet = getOrCreateSheet(SKILLS_SHEET, ["category", "skill", "order"]);
  // wipe existing rows below header
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, 3).clearContent();
  }
  let order = 0;
  const newRows = [];
  Object.keys(skillsObj).forEach((category) => {
    (skillsObj[category] || []).forEach((skill) => {
      newRows.push([category, skill, order++]);
    });
  });
  if (newRows.length) {
    sheet.getRange(2, 1, newRows.length, 3).setValues(newRows);
  }
}

/* ------------------------- Messages sheet ------------------------- */

function appendMessage(name, email, message) {
  const sheet = getOrCreateSheet(MESSAGES_SHEET, ["timestamp", "name", "email", "message"]);
  sheet.appendRow([new Date(), name || "", email || "", message || ""]);
}

function readMessages() {
  const sheet = getOrCreateSheet(MESSAGES_SHEET, ["timestamp", "name", "email", "message"]);
  const rows = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    out.push({
      timestamp: rows[i][0],
      name: rows[i][1],
      email: rows[i][2],
      message: rows[i][3],
    });
  }
  return out.reverse();
}

function clearMessages() {
  const sheet = getOrCreateSheet(MESSAGES_SHEET, ["timestamp", "name", "email", "message"]);
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, 4).clearContent();
  }
}

/* ------------------------- Helpers ------------------------- */

function getOrCreateSheet(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function hashString(value) {
  const raw = Utilities.newBlob(String(value || "")).getBytes();
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw);
  return digest
    .map((byte) => (byte < 0 ? byte + 256 : byte).toString(16).padStart(2, "0"))
    .join("");
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

/**
 * Auto-seeds the spreadsheet with default portfolio content the first time
 * the Apps Script is run, and is safe to run again.
 */
function seedDefaultPortfolioContent() {
  writeSettings({
    about_bio:
      "I'm an IT graduate with an interest in System Analysis, UI/UX Design, and Web Development. I enjoy turning ideas and requirements into organized, user-friendly, and functional systems.",
    about_long:
      "I have experience working on system requirements, workflow design, UI design, quality assurance, documentation, and data analysis. Through my academic project and internship experience, I've also worked closely with developers to build and test web-based systems.",
    contact_email: "balagtasreignkerstine@gmail.com",
    contact_phone: "+63 993 568 9386",
    contact_facebook: "",
    contact_instagram: "",
    footer_name: "Reign Kerstine A. Balagtas",
    footer_tagline: "IT Graduate | System Analyst | UI/UX Enthusiast",
    footer_year: "2026",
  });

  upsertProject({
    id: "smartsk",
    title: "SmartSK — Web-Based Project Monitoring System",
    role: "System Analyst",
    company: "",
    description:
      "A web-based project monitoring system focused on budgeting, project tracking, and forecasting for the Sangguniang Kabataan.",
    image: "",
    tags: "Requirements, UI Design, Documentation",
    order: 0,
  });

  upsertProject({
    id: "dtr",
    title: "Daily Time Record (DTR) Management System",
    role: "System Analyst & QA Intern",
    company: "Matimco Incorporated",
    description:
      "A web-based DTR management system developed during my internship to support employee time-record management.",
    image: "",
    tags: "UI & Workflow, Test Cases, Bug Verification",
    order: 1,
  });

  writeSkills({
    "System Analysis": [
      "Requirements Gathering",
      "System Evaluation",
      "Workflow Design",
      "Technical Documentation",
    ],
    "UI/UX & Design": ["UI Design", "Basic Frontend Design", "Figma", "Presentation Design"],
    "Quality Assurance": [
      "Test Case Creation",
      "Functional Testing",
      "Bug Identification",
      "Issue Documentation",
      "Fix Verification",
    ],
    "Data & Productivity": [
      "Data Analysis",
      "Data Organization",
      "Microsoft Word",
      "Microsoft Excel",
      "Microsoft PowerPoint",
    ],
    Other: ["Cybersecurity Fundamentals", "Risk Awareness", "Teamwork", "Communication"],
  });
}

function seedInitialContent() {
  seedDefaultPortfolioContent();
}
