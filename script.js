// PLACEHOLDER: paste your Apps Script web app URL here after deploying apps-script/Code.gs
// (Deploy → New deployment → Web app → copy the URL that ends in /exec). See README.md.
const WAITLIST_ENDPOINT = "https://script.google.com/macros/s/AKfycbwT7WBTR8Uv3l1uxmtOD4pJfX8fzwdwKQIHxwNxTPEQRjvSBwLaWFypTqkqFGtnsUOp/exec";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Text the page changes at runtime. {n} is filled in by t().
const MSG = {
  "form.submit": "Join the waitlist",
  "form.sending": "Adding you…",
  "form.invalid": "That email doesn't look right. Mind checking it?",
  "form.error": "Something went wrong on our end. Try again in a moment.",
  "done.joined": "You're on the list. We'll be in touch.",
  "done.duplicate": "You're already on the list. See you soon.",
  "done.details": "Thanks! We'll let you know when games go live near you.",
  "dlg.title": "You're on the list",
  "dlg.position": "You're #{n} on the list",
  "dlg.save": "Save",
  "dlg.saving": "Saving…",
  "dlg.error": "Couldn't save that. Try again, or skip. You're already on the list.",
  "demo.open.spots": "1 spot left",
  "demo.open.caption": "On the map",
  "demo.full.spots": "Full",
  "demo.full.caption": "Full games leave the map",
  "demo.drop.spots": "1 spot left",
  "demo.drop.caption": "Reposted, nearby players pinged",
};
const t = (key, vars = {}) => (MSG[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
const render = (el, key, vars) => { el.textContent = t(key, vars); };

// ---------- Scroll reveal ----------
const revealObserver = new IntersectionObserver(
  (entries) => entries.forEach((e) => {
    if (e.isIntersecting) {
      e.target.classList.add("is-in");
      revealObserver.unobserve(e.target);
    }
  }),
  { rootMargin: "0px 0px -8% 0px" }
);
document.querySelectorAll(".reveal").forEach((el) => revealObserver.observe(el));

// ---------- How it works: side tabs ----------
const tabs = [...document.querySelectorAll(".tab")];

function selectTab(tab) {
  tabs.forEach((t) => {
    const selected = t === tab;
    t.setAttribute("aria-selected", selected);
    t.tabIndex = selected ? 0 : -1;
    document.getElementById(t.getAttribute("aria-controls")).hidden = !selected;
  });
}

tabs.forEach((tab, i) => {
  tab.addEventListener("click", () => selectTab(tab));
  tab.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    selectTab(next);
    next.focus();
  });
});

// ---------- How it works: step → phone screen ----------
document.querySelectorAll(".walkthrough").forEach((panel) => {
  const steps = [...panel.querySelectorAll(".wt-step")];
  const layers = [...panel.querySelectorAll(".layer")];
  steps.forEach((step, i) => {
    step.addEventListener("click", () => {
      steps.forEach((s) => s.setAttribute("aria-pressed", s === step));
      layers.forEach((l, j) => l.classList.toggle("is-active", j === i));
    });
  });
});

// ---------- Open-spots demo ----------
const stage = document.querySelector(".demo-stage");
const demoSteps = [...document.querySelectorAll(".demo-step")];
const DEMO_MS = 3600;
let demoIndex = 0;
let demoTimer = null;
let demoTouched = false;

function showDemo(i, { timed } = {}) {
  demoIndex = i;
  const step = demoSteps[i];
  const state = step.dataset.state;
  stage.dataset.state = state;
  render(stage.querySelector("[data-spots]"), `demo.${state}.spots`);
  render(stage.querySelector("[data-caption]"), `demo.${state}.caption`);
  demoSteps.forEach((s) => {
    s.setAttribute("aria-pressed", s === step);
    s.classList.remove("is-timing");
  });
  if (timed) {
    void step.offsetWidth; // restart the progress-bar animation
    step.style.setProperty("--dur", DEMO_MS + "ms");
    step.classList.add("is-timing");
  }
}

function startDemo() {
  if (reduceMotion || demoTimer) return;
  showDemo(demoIndex, { timed: true });
  demoTimer = setInterval(() => showDemo((demoIndex + 1) % demoSteps.length, { timed: true }), DEMO_MS);
}

function stopDemo() {
  clearInterval(demoTimer);
  demoTimer = null;
  demoSteps.forEach((s) => s.classList.remove("is-timing"));
}

// Auto-play only while the demo is on screen; stays manual once someone clicks a step
demoSteps.forEach((step, i) => step.addEventListener("click", () => {
  demoTouched = true;
  stopDemo();
  showDemo(i);
}));
new IntersectionObserver(([e]) => {
  if (e.isIntersecting && !demoTouched) startDemo();
  else stopDemo();
}, { threshold: 0.4 }).observe(stage);

// ---------- Waitlist ----------
// Step 1: email only (hero or final CTA). Step 2: optional details in a dialog.
const joinForms = [...document.querySelectorAll("form.join")];
const dialog = document.getElementById("details");
const detailsForm = document.getElementById("details-form");
let signup = null; // { email, token } from step 1, used to attach step-2 details

function source() {
  const params = new URLSearchParams(window.location.search);
  return params.get("ref") || params.get("utm_source") || document.referrer || "direct";
}

async function post(payload) {
  if (WAITLIST_ENDPOINT.startsWith("PASTE_")) {
    // Not wired up yet: log the payload so the flow can be tested locally
    console.warn("[masUNO] WAITLIST_ENDPOINT not set. Would have sent:", payload);
    await new Promise((r) => setTimeout(r, 450));
    return { ok: true, position: 128, token: "local-test" };
  }
  // A form-encoded body keeps this a "simple" CORS request, so Apps Script doesn't need a preflight
  const res = await fetch(WAITLIST_ENDPOINT, { method: "POST", body: new URLSearchParams(payload) });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "Request failed");
  return json;
}

function markJoined(key) {
  joinForms.forEach((f) => {
    f.hidden = true;
    const done = f.parentElement.querySelector(".join-done");
    render(done.querySelector("[data-done-text]"), key);
    done.hidden = false;
  });
}

joinForms.forEach((form) => {
  const input = form.elements.email;
  const status = form.querySelector(".join-status");
  const button = form.querySelector("button[type=submit]");

  input.addEventListener("input", () => {
    form.classList.remove("is-invalid");
    input.removeAttribute("aria-invalid");
    status.textContent = "";
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = input.value.trim();
    if (!EMAIL_RE.test(email)) {
      form.classList.add("is-invalid");
      input.setAttribute("aria-invalid", "true");
      render(status, "form.invalid");
      input.focus();
      return;
    }
    // Bots fill the hidden field; pretend it worked and drop it
    if (form.elements.website.value) return markJoined("done.joined");

    button.disabled = true;
    render(button, "form.sending");
    try {
      const res = await post({ action: "join", email, source: source() });
      if (res.duplicate) {
        markJoined("done.duplicate");
        return;
      }
      signup = { email, token: res.token };
      markJoined("done.joined");
      const title = dialog.querySelector("[data-title]");
      if (res.position) render(title, "dlg.position", { n: res.position });
      else render(title, "dlg.title");
      dialog.showModal();
    } catch (err) {
      console.error(err);
      render(status, "form.error");
    } finally {
      button.disabled = false;
      render(button, "form.submit");
    }
  });
});

// Host CTA: jump to the final signup with "Fill my games" pre-selected for step 2
document.querySelectorAll("a[data-role]").forEach((a) => a.addEventListener("click", () => {
  detailsForm.elements.role.value = a.dataset.role;
  document.getElementById("cta-email").focus({ preventScroll: true });
}));

dialog.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => dialog.close()));
dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); }); // click on backdrop

detailsForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const status = detailsForm.querySelector(".details-status");
  const button = detailsForm.querySelector("button[type=submit]");
  status.textContent = "";
  button.disabled = true;
  render(button, "dlg.saving");
  try {
    await post({
      action: "details",
      email: signup.email,
      token: signup.token,
      role: detailsForm.elements.role.value,
      campus: detailsForm.elements.campus.value,
      sports: [...detailsForm.querySelectorAll("input[name=sports]:checked")].map((c) => c.value).join(", "),
    });
    markJoined("done.details");
    dialog.close();
  } catch (err) {
    console.error(err);
    render(status, "dlg.error");
  } finally {
    button.disabled = false;
    render(button, "dlg.save");
  }
});
