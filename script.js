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
  "form.timeout": "It's taking longer than expected. Check your connection and try again.",
  "done.joined": "You're on the list. We'll be in touch.",
  "done.duplicate": "You're already on the list. See you soon.",
  "done.details": "Thanks! We'll let you know when games go live near you.",
  "dlg.title": "You're in",
  "dlg.pendingTitle": "Almost there",
  "dlg.confirming": "Confirming your registration…",
  "dlg.position": "You're in · #{n} on the list",
  "dlg.sharePosition": "#{n} on the list",
  "dlg.save": "Save",
  "dlg.saving": "Saving…",
  "dlg.error": "Couldn't save that. Try again, or skip. You're already on the list.",
  "demo.open.spots": "1 spot left",
  "demo.open.caption": "On the map",
  "demo.full.spots": "Full",
  "demo.full.caption": "Full games leave the map",
  "demo.drop.spots": "1 spot left",
  "demo.drop.caption": "Reposted to the top of the map",
  "hero.joined.button": "You're the +1",
  "hero.joined.spots": "Game on",
  "hero.joined.faces": "They know you're coming",
  "hero.joined.status": "You're in. Show up expected.",
  "hero.joined.toast": "That's your spot",
  "hero.joined.toastCopy": "No asking. No awkward arrival.",
  "share.message": "I'm joining masUNO to find pickup games on campus. Join the early-access list with my invite:",
  "share.note": "One invite can be the start of your next game.",
  "share.opened": "WhatsApp opened. Choose your team or group chat.",
  "share.done": "Thanks for bringing your team.",
  "share.copied": "Personal invite link copied. Send it to your team.",
  "share.copyFallback": "Select and copy the link above to share it.",
};
const t = (key, vars = {}) => window.masUNOI18n.translate(MSG[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
const render = (el, key, vars = {}) => {
  el.dataset.messageKey = key;
  el.dataset.messageVars = JSON.stringify(vars);
  el.textContent = t(key, vars);
};

// Refresh dynamic messages without resetting the current form, dialog or demo state.
document.addEventListener("masuno:languagechange", () => {
  document.querySelectorAll("[data-message-key]").forEach((el) => {
    render(el, el.dataset.messageKey, JSON.parse(el.dataset.messageVars || "{}"));
  });
});

// ---------- Launch countdown ----------
// Noon in Chicago on launch day (CST, UTC-6). The date shown to visitors is in index.html.
const LAUNCH_AT = Date.parse("2026-12-16T12:00:00-06:00");
const countdown = document.querySelector("[data-countdown]");
if (countdown) {
  const setUnit = (name, value) => {
    countdown.querySelector(`[data-unit="${name}"]`).textContent = String(value).padStart(2, "0");
  };
  const tick = () => {
    const left = LAUNCH_AT - Date.now();
    if (left <= 0) {
      countdown.hidden = true;
      return;
    }
    const seconds = Math.ceil(left / 1000);
    setUnit("days", Math.floor(seconds / 86400));
    setUnit("hours", Math.floor(seconds / 3600) % 24);
    setUnit("minutes", Math.floor(seconds / 60) % 60);
    setUnit("seconds", seconds % 60);
    setTimeout(tick, left % 1000 || 1000);
  };
  tick();
}

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

// ---------- Interactive hero: take the open spot ----------
const heroGame = document.getElementById("hero-game");
const heroJoin = document.getElementById("hero-join");
const heroToast = document.getElementById("hero-toast");

heroJoin.addEventListener("click", () => {
  if (heroGame.classList.contains("is-joined")) return;
  heroGame.classList.add("is-joined");
  heroToast.classList.add("is-joined");
  heroJoin.disabled = true;
  render(heroJoin, "hero.joined.button");
  render(heroGame.querySelector("[data-hero-spots]"), "hero.joined.spots");
  render(heroGame.querySelector("[data-hero-faces]"), "hero.joined.faces");
  render(document.getElementById("hero-game-status"), "hero.joined.status");
  render(heroToast.querySelector("[data-hero-toast-title]"), "hero.joined.toast");
  render(heroToast.querySelector("[data-hero-toast-copy]"), "hero.joined.toastCopy");
});

// ---------- Waitlist ----------
// Step 1: email only. Step 2: role and campus. Step 3: personal invite.
const REQUEST_TIMEOUT_MS = 12000;
const joinForms = [...document.querySelectorAll("form.join")];
const dialog = document.getElementById("details");
const detailsForm = document.getElementById("details-form");
const detailsStep = dialog.querySelector('[data-signup-step="details"]');
const shareStep = dialog.querySelector('[data-signup-step="share"]');
const detailsStatus = detailsForm.querySelector(".details-status");
const detailsSave = detailsForm.querySelector("button[type=submit]");
const detailsSkip = detailsForm.querySelector("[data-show-share]");
const shareLink = document.getElementById("share-link");
const shareWhatsapp = document.getElementById("share-whatsapp");
const shareNative = document.getElementById("share-native");
const shareStatus = document.getElementById("share-status");
let signup = null; // { email, token, referralCode, position } from step 1
let joinPending = false;

function source() {
  const params = new URLSearchParams(window.location.search);
  return params.get("ref") || params.get("utm_source") || document.referrer || "direct";
}

// The time zone name (like "America/Monterrey"). The Apps Script turns it into a country and doesn't store it.
function timeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
}

async function post(payload) {
  const startedAt = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let outcome = "error";
  try {
    let json;
    if (WAITLIST_ENDPOINT.startsWith("PASTE_")) {
      console.warn("[masUNO] WAITLIST_ENDPOINT not set; using the local test response.");
      await new Promise((r) => setTimeout(r, 450));
      json = { ok: true, position: 128, token: "local-test", referralCode: "LOCAL123" };
    } else {
      // A form-encoded body keeps this a "simple" CORS request, so Apps Script doesn't need a preflight.
      const res = await fetch(WAITLIST_ENDPOINT, {
        method: "POST",
        body: new URLSearchParams(payload),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      json = await res.json();
      if (!json.ok) throw new Error(json.error || "Request failed");
    }
    outcome = json.duplicate ? "duplicate" : "success";
    return json;
  } catch (err) {
    if (err.name === "AbortError") {
      const timeoutError = new Error("request_timeout");
      timeoutError.code = "timeout";
      throw timeoutError;
    }
    throw err;
  } finally {
    clearTimeout(timeout);
    const elapsedMs = Math.round(performance.now() - startedAt);
    console.debug(`[masUNO] waitlist ${payload.action}: ${outcome}, ${elapsedMs} ms`);
  }
}

function markJoined(key) {
  joinForms.forEach((f) => {
    f.hidden = true;
    const done = f.parentElement.querySelector(".join-done");
    render(done.querySelector("[data-done-text]"), key);
    done.hidden = false;
  });
}

function waitlistShareUrl() {
  const url = new URL(window.location.href);
  url.hash = "";
  url.search = "";
  url.searchParams.set("ref", signup?.referralCode || "team");
  return url.href;
}

function updateShareLinks() {
  const url = waitlistShareUrl();
  const message = t("share.message");
  shareLink.value = url;
  shareWhatsapp.href = `https://wa.me/?text=${encodeURIComponent(`${message} ${url}`)}`;
}

function showShare() {
  detailsStep.hidden = true;
  shareStep.hidden = false;
  dialog.querySelector("[data-progress-details]").classList.remove("is-active");
  dialog.querySelector("[data-progress-share]").classList.add("is-active");
  dialog.querySelector("#host-invite").hidden = !["host", "both"].includes(detailsForm.elements.role.value);
  if (signup?.position) render(dialog.querySelector("[data-share-position]"), "dlg.sharePosition", { n: signup.position });
  updateShareLinks();
  render(shareStatus, "share.note");
  shareStep.querySelector("h2").focus?.();
}

function clearMessage(el) {
  el.textContent = "";
  delete el.dataset.messageKey;
  delete el.dataset.messageVars;
}

function setDetailsPending(pending) {
  detailsSave.disabled = pending;
  detailsSkip.disabled = pending;
  detailsStatus.classList.toggle("is-pending", pending);
  dialog.setAttribute("aria-busy", String(pending));
  if (pending) render(detailsStatus, "dlg.confirming");
  else if (detailsStatus.dataset.messageKey === "dlg.confirming") clearMessage(detailsStatus);
}

function openDetailsPending() {
  detailsStep.hidden = false;
  shareStep.hidden = true;
  dialog.querySelector("[data-progress-details]").classList.add("is-active");
  dialog.querySelector("[data-progress-share]").classList.remove("is-active");
  render(dialog.querySelector("[data-title]"), "dlg.pendingTitle");
  setDetailsPending(true);
  if (!dialog.open) dialog.showModal();
}

updateShareLinks();
document.addEventListener("masuno:languagechange", updateShareLinks);
if (navigator.share) shareNative.hidden = false;

joinForms.forEach((form) => {
  const input = form.elements.email;
  const status = form.querySelector(".join-status");
  const button = form.querySelector("button[type=submit]");

  input.addEventListener("input", () => {
    form.classList.remove("is-invalid");
    input.removeAttribute("aria-invalid");
    clearMessage(status);
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (joinPending) return;
    const email = input.value.trim();
    if (!EMAIL_RE.test(email)) {
      form.classList.add("is-invalid");
      input.setAttribute("aria-invalid", "true");
      render(status, "form.invalid");
      input.focus();
      return;
    }
    if (form.elements.website.value) return markJoined("done.joined");

    joinPending = true;
    joinForms.forEach((f) => { f.querySelector("button[type=submit]").disabled = true; });
    render(button, "form.sending");
    openDetailsPending();
    try {
      const res = await post({ action: "join", email, source: source(), tz: timeZone() });
      if (res.duplicate) {
        markJoined("done.duplicate");
        setDetailsPending(false);
        if (dialog.open) dialog.close();
        return;
      }
      signup = { email, token: res.token, referralCode: res.referralCode, position: res.position };
      markJoined("done.joined");
      const title = dialog.querySelector("[data-title]");
      if (res.position) render(title, "dlg.position", { n: res.position });
      else render(title, "dlg.title");
      setDetailsPending(false);
    } catch (err) {
      console.error(err);
      setDetailsPending(false);
      if (dialog.open) dialog.close();
      render(status, err.code === "timeout" ? "form.timeout" : "form.error");
    } finally {
      joinPending = false;
      joinForms.forEach((f) => { f.querySelector("button[type=submit]").disabled = false; });
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
detailsSkip.addEventListener("click", () => { if (signup) showShare(); });
dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });

shareWhatsapp.addEventListener("click", () => render(shareStatus, "share.opened"));
shareNative.addEventListener("click", async () => {
  try {
    await navigator.share({ title: "masUNO", text: t("share.message"), url: waitlistShareUrl() });
    render(shareStatus, "share.done");
  } catch (err) {
    if (err.name !== "AbortError") render(shareStatus, "share.copyFallback");
  }
});

document.getElementById("copy-link").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(waitlistShareUrl());
    render(shareStatus, "share.copied");
  } catch (_) {
    shareLink.focus();
    shareLink.select();
    render(shareStatus, "share.copyFallback");
  }
});

detailsForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!signup) {
    setDetailsPending(true);
    return;
  }
  clearMessage(detailsStatus);
  detailsStatus.classList.remove("is-pending");
  detailsSave.disabled = true;
  render(detailsSave, "dlg.saving");
  try {
    await post({
      action: "details",
      email: signup.email,
      token: signup.token,
      role: detailsForm.elements.role.value,
      campus: detailsForm.elements.campus.value,
    });
    markJoined("done.details");
    showShare();
  } catch (err) {
    console.error(err);
    render(detailsStatus, "dlg.error");
  } finally {
    detailsSave.disabled = false;
    render(detailsSave, "dlg.save");
  }
});
