/* ===================================================================
   Public site script
   - Pulls editable content from the Google Sheet (via Apps Script API)
   - Falls back to the static markup already in index.html if the
     backend isn't configured yet or a fetch fails
=================================================================== */

(function () {
  "use strict";

  const backendReady = typeof APPS_SCRIPT_URL === "string" &&
    APPS_SCRIPT_URL.startsWith("http");

  /* ---------------- Nav ---------------- */
  const navShell = document.getElementById("navShell");
  const navToggle = document.getElementById("navToggle");
  const navLinks = document.getElementById("navLinks");

  window.addEventListener("scroll", () => {
    navShell.classList.toggle("scrolled", window.scrollY > 12);
  });

  navToggle.addEventListener("click", () => {
    navLinks.classList.toggle("open");
  });

  navLinks.querySelectorAll("a").forEach((a) => {
    a.addEventListener("click", () => navLinks.classList.remove("open"));
  });

  /* ---------------- Reveal on scroll ---------------- */
  const revealEls = document.querySelectorAll(".reveal, .scroll-reveal");
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry, i) => {
        if (entry.isIntersecting) {
          if (entry.target.classList.contains("reveal")) {
            entry.target.style.animationDelay = (i % 4) * 0.1 + "s";
          }
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );
  revealEls.forEach((el) => io.observe(el));

  /* ---------------- Fetch content from the sheet ---------------- */
  async function loadContent() {
    if (!backendReady) return;
    try {
      const res = await fetch(`${APPS_SCRIPT_URL}?action=getContent`);
      const data = await res.json();
      if (!data || data.success === false) return;
      applySettings(data.settings || {});
      if (Array.isArray(data.projects) && data.projects.length) {
        renderProjects(data.projects);
      }
      if (data.skills && Object.keys(data.skills).length) {
        renderSkills(data.skills);
      }
    } catch (err) {
      // Silently keep the static fallback content already in the page.
      console.warn("Portfolio content fetch failed, showing fallback content.", err);
    }
  }

  function applySettings(s) {
    setText("aboutBio", s.about_bio);
    setText("aboutLong", s.about_long);
    setText("contactEmail", s.contact_email);
    setText("contactPhone", s.contact_phone);
    setText("footerName", s.footer_name);
    setText("footerTagline", s.footer_tagline);

    if (s.footer_year) {
      setText("footerCopy", `© ${s.footer_year} ${s.footer_name || "Reign Kerstine A. Balagtas"}. All Rights Reserved.`);
    }

    if (s.contact_email) {
      const mail = `mailto:${s.contact_email}`;
      setHref("footerEmail", mail);
      const emailSocial = document.querySelector('.social-row a[aria-label="Email"]');
      if (emailSocial) emailSocial.href = mail;
    }
    if (s.contact_facebook) {
      setHref("fbLink", s.contact_facebook);
      setHref("footerFb", s.contact_facebook);
    }
    if (s.contact_instagram) {
      setHref("igLink", s.contact_instagram);
      setHref("footerIg", s.contact_instagram);
    }
  }

  function setText(id, value) {
    if (!value) return;
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }
  function setHref(id, value) {
    if (!value) return;
    const el = document.getElementById(id);
    if (el) el.href = value;
  }

  /* ---------------- Render projects ---------------- */
  function renderProjects(projects) {
    const grid = document.getElementById("projectGrid");
    grid.innerHTML = "";
    projects
      .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
      .forEach((p) => {
        const card = document.createElement("article");
        card.className = "project-card reveal";

        const media = p.image
          ? `<div class="project-media"><img src="${escapeAttr(p.image)}" alt="${escapeAttr(p.title || "Project image")}" loading="lazy"></div>`
          : `<div class="project-media">
               <div class="placeholder">
                 <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                 <span>Image set by admin</span>
               </div>
             </div>`;

        const tags = (p.tags || "")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
          .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
          .join("");

        const roleLine = [p.role, p.company].filter(Boolean).join(" — ");

        card.innerHTML = `
          ${media}
          <div class="project-body">
            ${roleLine ? `<div class="project-role">${escapeHtml(roleLine.toUpperCase())}</div>` : ""}
            <h3>${escapeHtml(p.title || "")}</h3>
            <p>${escapeHtml(p.description || "")}</p>
            <div class="tag-row">${tags}</div>
          </div>`;
        grid.appendChild(card);
        io.observe(card);
      });
  }

  /* ---------------- Render skills ---------------- */
  const SVG_NS = "0 0 24 24";
  const ICONS = {
    "System Analysis":
      '<svg width="20" height="20" viewBox="' + SVG_NS + '" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M8.2 7.3L11 15.8M15.8 7.3L13 15.8M8.5 6H15.5"/></svg>',
    "UI/UX & Design":
      '<svg width="20" height="20" viewBox="' + SVG_NS + '" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 100 18h1.5a2 2 0 001.9-2.6 1.7 1.7 0 011.6-2.4H18a3 3 0 003-3 9 9 0 00-9-10z"/><circle cx="7.5" cy="10.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="12" cy="7.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="16" cy="10" r="1.1" fill="currentColor" stroke="none"/></svg>',
    "Quality Assurance":
      '<svg width="20" height="20" viewBox="' + SVG_NS + '" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"/><path d="M9 12.3l2 2 4-4.3"/></svg>',
    "Data & Productivity":
      '<svg width="20" height="20" viewBox="' + SVG_NS + '" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="20" x2="5" y2="12"/><line x1="12" y1="20" x2="12" y2="6"/><line x1="19" y1="20" x2="19" y2="15"/><line x1="3" y1="20" x2="21" y2="20"/></svg>',
    "Other":
      '<svg width="20" height="20" viewBox="' + SVG_NS + '" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"/><line x1="12" y1="8" x2="12" y2="13"/><circle cx="12" cy="16" r="0.9" fill="currentColor" stroke="none"/></svg>',
  };
  const DEFAULT_ICON =
    '<svg width="20" height="20" viewBox="' + SVG_NS + '" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/></svg>';

  function renderSkills(groups) {
    const grid = document.getElementById("skillsGrid");
    grid.innerHTML = "";
    Object.keys(groups).forEach((category) => {
      const card = document.createElement("div");
      card.className = "skill-card reveal";
      const items = groups[category]
        .map((s) => `<li>${escapeHtml(s)}</li>`)
        .join("");
      card.innerHTML = `
        <div class="skill-icon">${ICONS[category] || DEFAULT_ICON}</div>
        <h4>${escapeHtml(category)}</h4>
        <ul>${items}</ul>`;
      grid.appendChild(card);
      io.observe(card);
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  function escapeAttr(str) {
    return escapeHtml(str).replace(/"/g, "&quot;");
  }

  /* ---------------- Contact form ---------------- */
  const form = document.getElementById("contactForm");
  const msgEl = document.getElementById("cf-msg");
  const submitBtn = document.getElementById("cf-submit");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msgEl.textContent = "";
    msgEl.className = "form-msg";

    const payload = {
      action: "sendMessage",
      name: document.getElementById("cf-name").value.trim(),
      email: document.getElementById("cf-email").value.trim(),
      message: document.getElementById("cf-message").value.trim(),
    };

    if (!backendReady) {
      msgEl.textContent = "Message form isn't connected yet — please email me directly.";
      msgEl.classList.add("err");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";

    try {
      await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
      });
      msgEl.textContent = "Thanks! Your message has been sent — I'll get back to you soon.";
      msgEl.classList.add("ok");
      form.reset();
    } catch (err) {
      msgEl.textContent = "Something went wrong sending your message. Please try emailing me directly.";
      msgEl.classList.add("err");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Send Message →";
    }
  });

  loadContent();
})();
