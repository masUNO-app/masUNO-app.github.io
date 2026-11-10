// PLACEHOLDER: paste your Apps Script web app URL here after deploying apps-script/Code.gs
// (Deploy → New deployment → Web app → copy the URL that ends in /exec). See README.md.
const WAITLIST_ENDPOINT = "https://script.google.com/macros/s/AKfycbwT7WBTR8Uv3l1uxmtOD4pJfX8fzwdwKQIHxwNxTPEQRjvSBwLaWFypTqkqFGtnsUOp/exec";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

// Text the page changes at runtime. {n} is filled in by t().
const MSG = {
  "form.submit": "Join the waitlist",
  "form.sending": "Adding you…",
  "form.invalid": "That email doesn't look right. Mind checking it?",
  "form.error": "Something went wrong on our end. Try again in a moment.",
  "done.joined": "You're on the list. We'll be in touch.",
  "done.duplicate": "You're already on the list. See you soon.",
  "done.details": "Thanks! We'll let you know when games go live near you.",
  "dlg.title": "You're in",
  "dlg.position": "You're in · #{n} on the list",
  "dlg.sharePosition": "#{n} on the list",
  "dlg.save": "Save",
  "dlg.saving": "Saving…",
  "dlg.error": "Couldn't save that. Try again, or skip. You're already on the list.",
  "demo.count": "{n} games nearby",
  "demo.open.spots": "Room for 1 more",
  "demo.open.caption": "On the map",
  "demo.full.spots": "Game is full",
  "demo.full.caption": "Full games leave the map",
  "demo.drop.spots": "A spot just opened · room for 1",
  "demo.drop.caption": "Reposted to the top of the map",
  "hero.join": "Be the +1",
  "hero.joined.tag": "You're in!",
  "hero.joined.status": "You're in. Show up expected.",
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
const clear = (el) => {
  delete el.dataset.messageKey;
  delete el.dataset.messageVars;
  el.textContent = "";
};

// Refresh dynamic messages without resetting the current form, dialog or demo state.
document.addEventListener("masuno:languagechange", () => {
  document.querySelectorAll("[data-message-key]").forEach((el) => {
    render(el, el.dataset.messageKey, JSON.parse(el.dataset.messageVars || "{}"));
  });
});

// Add a class for one animation, then take it off again so it can replay later.
function flash(el, name, ms) {
  el.classList.remove(name);
  void el.offsetWidth;
  el.classList.add(name);
  clearTimeout(el[`_${name}`]);
  el[`_${name}`] = setTimeout(() => el.classList.remove(name), ms);
}

// ---------- Launch countdown ----------
// Noon in Chicago on launch day (CST, UTC-6). The date shown to visitors is in index.html.
const LAUNCH_AT = Date.parse("2026-12-16T12:00:00-06:00");
const countdown = document.querySelector("[data-countdown]");
if (countdown) {
  // Each number slides in when it changes
  const setUnit = (name, value) => {
    const el = countdown.querySelector(`[data-unit="${name}"]`);
    const text = String(value).padStart(2, "0");
    if (el.textContent === text) return;
    el.textContent = text;
    if (!reduceMotion) flash(el, "is-ticking", 420);
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

// ---------- Nav: one green action per viewport ----------
// The nav button is plain glass while a signup form is on screen, and green otherwise.
const nav = document.querySelector(".nav");
const visibleForms = new Set();
const formWatcher = new IntersectionObserver((entries) => {
  entries.forEach((e) => (e.isIntersecting ? visibleForms.add(e.target) : visibleForms.delete(e.target)));
  nav.classList.toggle("is-away", visibleForms.size === 0);
});
document.querySelectorAll(".join-wrap").forEach((el) => formWatcher.observe(el));

// ---------- Nav: mark the section being read ----------
const navLinks = [...document.querySelectorAll('.nav-links a[href^="#"]')];
const sectionsInView = new Set();
const sectionWatcher = new IntersectionObserver((entries) => {
  entries.forEach((e) => (e.isIntersecting ? sectionsInView.add(e.target.id) : sectionsInView.delete(e.target.id)));
  navLinks.forEach((a) => {
    if (sectionsInView.has(a.hash.slice(1))) a.setAttribute("aria-current", "location");
    else a.removeAttribute("aria-current");
  });
}, { rootMargin: "-45% 0px -50% 0px" }); // a thin band across the middle of the screen
navLinks.forEach((a) => {
  const section = document.getElementById(a.hash.slice(1));
  if (section) sectionWatcher.observe(section);
});

// ---------- Hero: the court cycles through the sports ----------
const hero = document.querySelector(".hero");
const heroArt = document.querySelector(".hero-art");
const sportChips = [...document.querySelectorAll(".sport-chip")];
const SPORT_MS = 4200;
let sportIndex = 0;
let sportTimer = null;
let sportTouched = false;

function showSport(i) {
  sportIndex = i;
  hero.dataset.sport = sportChips[i].dataset.pick;
  sportChips.forEach((c, j) => c.setAttribute("aria-pressed", j === i));
}

function startSports() {
  if (reduceMotion || sportTouched || sportTimer) return;
  sportTimer = setInterval(() => showSport((sportIndex + 1) % sportChips.length), SPORT_MS);
}

function stopSports() {
  clearInterval(sportTimer);
  sportTimer = null;
}

// Stays on the chosen sport once someone picks one; pauses off screen and on hover or focus
sportChips.forEach((chip, i) => chip.addEventListener("click", () => {
  sportTouched = true;
  stopSports();
  showSport(i);
}));
const sportSwitch = document.querySelector(".sport-switch");
["pointerenter", "focusin"].forEach((type) => sportSwitch.addEventListener(type, stopSports));
["pointerleave", "focusout"].forEach((type) => sportSwitch.addEventListener(type, startSports));
new IntersectionObserver(([e]) => {
  if (e.isIntersecting) startSports();
  else stopSports();
}).observe(heroArt);

// ---------- Hero: take the open spot ----------
// Tapping the +1 puts "You" on the court; tapping again gives the spot back.
const heroJoin = document.getElementById("hero-join");
const heroTag = heroJoin.querySelector("[data-hero-tag]");
const heroStatus = document.getElementById("hero-game-status");
const heroSignup = hero.querySelector(".join-wrap");

heroJoin.addEventListener("click", () => {
  const joined = hero.classList.toggle("is-joined");
  render(heroTag, joined ? "hero.joined.tag" : "hero.join");
  if (!joined) {
    clear(heroStatus);
    hero.classList.remove("is-cheering");
    return;
  }
  render(heroStatus, "hero.joined.status");
  if (reduceMotion) return;
  flash(hero, "is-cheering", 1100); // the others hop
  if (!heroSignup.querySelector("form.join").hidden) flash(heroSignup, "is-nudged", 1400); // then the real signup asks for a look
});

// The court and the players drift a few pixels with the pointer
if (finePointer && !reduceMotion) {
  let frame = 0;
  const clamp = (n) => Math.max(-0.5, Math.min(0.5, n)).toFixed(3);
  hero.addEventListener("pointermove", (e) => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const box = heroArt.getBoundingClientRect();
      hero.style.setProperty("--px", clamp((e.clientX - box.left) / box.width - 0.5));
      hero.style.setProperty("--py", clamp((e.clientY - box.top) / box.height - 0.5));
    });
  });
  hero.addEventListener("pointerleave", () => {
    hero.style.setProperty("--px", 0);
    hero.style.setProperty("--py", 0);
  });
}

// ---------- Steps that play on their own ----------
// Used by the two phone walkthroughs and the open-spots demo. Steps advance while `watch` is on
// screen, with a progress bar on the current step, and stay manual once someone picks a step.
function stepper({ steps, watch, ms, show }) {
  let index = 0;
  let timer = null;
  let touched = false;

  function go(i, timed) {
    index = i;
    steps.forEach((s, j) => {
      s.setAttribute("aria-pressed", j === i);
      s.classList.remove("is-timing");
    });
    show(i);
    if (timed) {
      void steps[i].offsetWidth; // restart the progress-bar animation
      steps[i].style.setProperty("--dur", ms + "ms");
      steps[i].classList.add("is-timing");
    }
  }

  function start() {
    if (reduceMotion || touched || timer) return;
    go(index, true);
    timer = setInterval(() => go((index + 1) % steps.length, true), ms);
  }

  function stop() {
    clearInterval(timer);
    timer = null;
    steps.forEach((s) => s.classList.remove("is-timing"));
  }

  // Stop auto-play for good, and optionally jump to a step
  function take(i = index) {
    touched = true;
    stop();
    go(i);
  }

  steps.forEach((step, i) => step.addEventListener("click", () => take(i)));
  new IntersectionObserver(([e]) => (e.isIntersecting ? start() : stop()), { threshold: 0.4 }).observe(watch);
  go(0);
  return { take };
}

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
  const layers = [...panel.querySelectorAll(".layer")];
  const phone = panel.querySelector(".phone");
  stepper({
    steps: [...panel.querySelectorAll(".wt-step")],
    watch: phone, // a hidden tab's phone is never on screen, so only the open tab plays
    ms: 4200,
    show: (i) => layers.forEach((l, j) => l.classList.toggle("is-active", j === i)),
  });

  // The phone leans a little toward the pointer
  if (!finePointer || reduceMotion) return;
  const col = panel.querySelector(".phone-col");
  col.addEventListener("pointermove", (e) => {
    const box = col.getBoundingClientRect();
    phone.style.setProperty("--ry", (((e.clientX - box.left) / box.width - 0.5) * 9).toFixed(2) + "deg");
    phone.style.setProperty("--rx", (((e.clientY - box.top) / box.height - 0.5) * -6).toFixed(2) + "deg");
  });
  col.addEventListener("pointerleave", () => {
    phone.style.setProperty("--ry", "0deg");
    phone.style.setProperty("--rx", "0deg");
  });
});

// ---------- Open-spots demo ----------
const stage = document.querySelector(".demo-stage");
const demoSteps = [...document.querySelectorAll(".demo-step")];
const demoCount = stage.querySelector("[data-count]");
const LEAVE_MS = 1100; // matches the delay before a full game leaves the map in styles.css
let countTimer = null;

const demo = stepper({
  steps: demoSteps,
  watch: stage,
  ms: 3600,
  show: (i) => {
    const state = demoSteps[i].dataset.state;
    stage.dataset.state = state;
    render(stage.querySelector("[data-spots]"), `demo.${state}.spots`);
    render(stage.querySelector("[data-caption]"), `demo.${state}.caption`);
    // The count drops when the full game leaves the map, not before
    clearTimeout(countTimer);
    if (state === "full" && !reduceMotion) countTimer = setTimeout(() => render(demoCount, "demo.count", { n: 4 }), LEAVE_MS);
    else render(demoCount, "demo.count", { n: state === "full" ? 4 : 5 });
  },
});

// The card's own buttons work too: "Count me in" fills the game, the bookmark saves it
stage.querySelector("[data-demo-join]").addEventListener("click", () => demo.take(1));
const demoSave = stage.querySelector("[data-demo-save]");
demoSave.addEventListener("click", () => {
  demoSave.setAttribute("aria-pressed", demoSave.getAttribute("aria-pressed") !== "true");
  demo.take();
});

// ---------- Waitlist ----------
// Step 1: email only. Step 2: role and campus. Step 3: personal invite.
const joinForms = [...document.querySelectorAll("form.join")];
const dialog = document.getElementById("details");
const detailsForm = document.getElementById("details-form");
const detailsStep = dialog.querySelector('[data-signup-step="details"]');
const shareStep = dialog.querySelector('[data-signup-step="share"]');
const shareLink = document.getElementById("share-link");
const shareWhatsapp = document.getElementById("share-whatsapp");
const shareNative = document.getElementById("share-native");
const shareStatus = document.getElementById("share-status");
const copyLink = document.getElementById("copy-link");
let signup = null; // { email, token, referralCode, position } from step 1

function source() {
  const params = new URLSearchParams(window.location.search);
  return params.get("ref") || params.get("utm_source") || document.referrer || "direct";
}

// The time zone name (like "America/Monterrey"). The Apps Script turns it into a country and doesn't store it.
function timeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
}

async function post(payload) {
  if (WAITLIST_ENDPOINT.startsWith("PASTE_")) {
    // Not wired up yet: log the payload so the flow can be tested locally
    console.warn("[masUNO] WAITLIST_ENDPOINT not set. Would have sent:", payload);
    await new Promise((r) => setTimeout(r, 450));
    return { ok: true, position: 128, token: "local-test", referralCode: "LOCAL123" };
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

function waitlistShareUrl() {
  const url = new URL(window.location.href);
  url.hash = "";
  url.search = "";
  url.searchParams.set("ref", signup?.referralCode || "team");
  return url.href;
}

function updateShareLinks() {
  const url = waitlistShareUrl();
  shareLink.value = url;
  shareWhatsapp.href = `https://wa.me/?text=${encodeURIComponent(`${t("share.message")} ${url}`)}`;
}

function showStep(step) {
  detailsStep.hidden = step !== "details";
  shareStep.hidden = step !== "share";
  dialog.querySelector("[data-progress-details]").classList.toggle("is-active", step === "details");
  dialog.querySelector("[data-progress-share]").classList.toggle("is-active", step === "share");
}

function showShare() {
  showStep("share");
  dialog.querySelector("#host-invite").hidden = !["host", "both"].includes(detailsForm.elements.role.value);
  if (signup?.position) render(dialog.querySelector("[data-share-position]"), "dlg.sharePosition", { n: signup.position });
  updateShareLinks();
  render(shareStatus, "share.note");
  shareStep.querySelector("h2").focus?.();
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
    status.textContent = "";
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = input.value.trim();
    if (!EMAIL_RE.test(email)) {
      form.classList.remove("is-invalid");
      void form.offsetWidth; // replay the shake on a second wrong try
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
      const res = await post({ action: "join", email, source: source(), tz: timeZone() });
      if (res.duplicate) {
        markJoined("done.duplicate");
        return;
      }
      signup = { email, token: res.token, referralCode: res.referralCode, position: res.position };
      markJoined("done.joined");
      showStep("details");
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
dialog.querySelector("[data-show-share]").addEventListener("click", showShare);
dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); }); // click on backdrop

shareWhatsapp.addEventListener("click", () => render(shareStatus, "share.opened"));
shareNative.addEventListener("click", async () => {
  try {
    await navigator.share({ title: "masUNO", text: t("share.message"), url: waitlistShareUrl() });
    render(shareStatus, "share.done");
  } catch (err) {
    if (err.name !== "AbortError") render(shareStatus, "share.copyFallback");
  }
});

copyLink.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(waitlistShareUrl());
    render(shareStatus, "share.copied");
    flash(copyLink, "is-done", 450);
  } catch (_) {
    shareLink.focus();
    shareLink.select();
    render(shareStatus, "share.copyFallback");
  }
});

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
    });
    markJoined("done.details");
    showShare();
  } catch (err) {
    console.error(err);
    render(status, "dlg.error");
  } finally {
    button.disabled = false;
    render(button, "dlg.save");
  }
});
