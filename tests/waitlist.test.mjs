import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../script.js", import.meta.url), "utf8");
const waitlistSource = source.slice(source.indexOf("// ---------- Waitlist ----------"));

class FakeElement {
  constructor() {
    this.hidden = false;
    this.disabled = false;
    this.value = "";
    this.textContent = "";
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this.queries = new Map();
    this.classList = new Set();
    this.classList.add = (...names) => names.forEach((name) => Set.prototype.add.call(this.classList, name));
    this.classList.remove = (...names) => names.forEach((name) => Set.prototype.delete.call(this.classList, name));
    this.classList.toggle = (name, force) => {
      const enabled = force ?? !this.classList.has(name);
      if (enabled) Set.prototype.add.call(this.classList, name);
      else Set.prototype.delete.call(this.classList, name);
      return enabled;
    };
  }

  querySelector(selector) {
    return this.queries.get(selector) || null;
  }

  querySelectorAll(selector) {
    return this.queries.get(selector) || [];
  }

  addEventListener(type, listener) {
    (this.listeners[type] ||= []).push(listener);
  }

  dispatch(type) {
    const event = { target: this, preventDefault() {} };
    return Promise.all((this.listeners[type] || []).map((listener) => listener(event)));
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  focus() {}
  select() {}
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function response(json) {
  return { ok: true, json: async () => json };
}

function setup() {
  const requests = [];
  const documentListeners = {};
  const joinForms = [0, 1].map(() => {
    const form = new FakeElement();
    form.elements = { email: new FakeElement(), website: new FakeElement() };
    const status = new FakeElement();
    const button = new FakeElement();
    const done = new FakeElement();
    const doneText = new FakeElement();
    done.hidden = true;
    done.queries.set("[data-done-text]", doneText);
    form.parentElement = new FakeElement();
    form.parentElement.queries.set(".join-done", done);
    form.queries.set(".join-status", status);
    form.queries.set("button[type=submit]", button);
    return { form, status, button, done, doneText };
  });

  const dialog = new FakeElement();
  dialog.open = false;
  dialog.showModal = () => { dialog.open = true; };
  dialog.close = () => { dialog.open = false; };
  const detailsForm = new FakeElement();
  detailsForm.elements = { role: new FakeElement(), campus: new FakeElement() };
  detailsForm.elements.role.value = "player";
  const detailsStep = new FakeElement();
  const shareStep = new FakeElement();
  shareStep.hidden = true;
  shareStep.queries.set("h2", new FakeElement());
  const detailsStatus = new FakeElement();
  const detailsSave = new FakeElement();
  const detailsSkip = new FakeElement();
  const title = new FakeElement();
  const hostInvite = new FakeElement();
  const sharePosition = new FakeElement();
  const progressDetails = new FakeElement();
  const progressShare = new FakeElement();
  detailsForm.queries.set(".details-status", detailsStatus);
  detailsForm.queries.set("button[type=submit]", detailsSave);
  detailsForm.queries.set("[data-show-share]", detailsSkip);
  dialog.queries.set('[data-signup-step="details"]', detailsStep);
  dialog.queries.set('[data-signup-step="share"]', shareStep);
  dialog.queries.set("[data-title]", title);
  dialog.queries.set("[data-progress-details]", progressDetails);
  dialog.queries.set("[data-progress-share]", progressShare);
  dialog.queries.set("#host-invite", hostInvite);
  dialog.queries.set("[data-share-position]", sharePosition);
  dialog.queries.set("[data-close]", []);

  const ids = {
    details: dialog,
    "details-form": detailsForm,
    "share-link": new FakeElement(),
    "share-whatsapp": new FakeElement(),
    "share-native": new FakeElement(),
    "share-status": new FakeElement(),
    "cta-email": new FakeElement(),
    "copy-link": new FakeElement(),
  };
  const document = {
    referrer: "",
    getElementById: (id) => ids[id],
    querySelectorAll: (selector) => selector === "form.join" ? joinForms.map((item) => item.form) : [],
    addEventListener: (type, listener) => { (documentListeners[type] ||= []).push(listener); },
  };
  const messages = {
    "form.submit": "Join the waitlist",
    "form.sending": "Adding you…",
    "form.invalid": "Invalid email",
    "form.error": "Request error",
    "form.timeout": "Request timeout",
    "done.joined": "Joined",
    "done.duplicate": "Duplicate",
    "done.details": "Details saved",
    "dlg.title": "You're in",
    "dlg.pendingTitle": "Almost there",
    "dlg.confirming": "Confirming your registration…",
    "dlg.position": "You're in · #{n} on the list",
    "dlg.sharePosition": "#{n} on the list",
    "dlg.save": "Save",
    "dlg.saving": "Saving…",
    "dlg.error": "Details error",
    "share.message": "Join me:",
    "share.note": "Share note",
  };
  const context = vm.createContext({
    WAITLIST_ENDPOINT: "https://example.test/waitlist",
    EMAIL_RE: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    MSG: messages,
    t: (key, vars = {}) => (messages[key] || key).replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? ""),
    render: (el, key, vars = {}) => {
      el.dataset.messageKey = key;
      el.dataset.messageVars = JSON.stringify(vars);
      el.textContent = (messages[key] || key).replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? "");
    },
    window: {
      location: { href: "https://example.test/", search: "" },
      masUNOI18n: { translate: (text) => text },
    },
    document,
    navigator: { clipboard: { writeText: async () => {} } },
    fetch: (url, options) => {
      const request = deferred();
      requests.push({ url, options, ...request });
      options.signal.addEventListener("abort", () => request.reject(new DOMException("Aborted", "AbortError")));
      return request.promise;
    },
    URL,
    URLSearchParams,
    Intl,
    performance,
    AbortController,
    DOMException,
    setTimeout,
    clearTimeout,
    console: { warn() {}, debug() {}, error() {} },
  });
  vm.runInContext(waitlistSource.replace("const REQUEST_TIMEOUT_MS = 12000;", "const REQUEST_TIMEOUT_MS = 20;"), context);
  return { requests, joinForms, dialog, detailsForm, detailsStep, shareStep, detailsStatus, detailsSave, detailsSkip, title, sharePosition };
}

test("opens details immediately and confirms only after the server succeeds", async () => {
  const state = setup();
  const signup = state.joinForms[0];
  signup.form.elements.email.value = "person@example.com";
  const pending = signup.form.dispatch("submit");

  assert.equal(state.dialog.open, true);
  assert.equal(state.title.textContent, "Almost there");
  assert.equal(state.detailsSave.disabled, true);
  assert.equal(state.detailsSkip.disabled, true);
  assert.equal(state.detailsStatus.textContent, "Confirming your registration…");
  assert.equal(signup.form.hidden, false);
  assert.equal(signup.done.hidden, true);

  state.requests[0].resolve(response({ ok: true, position: 42, token: "private-token", referralCode: "INVITE42" }));
  await pending;
  assert.equal(signup.form.hidden, true);
  assert.equal(signup.doneText.textContent, "Joined");
  assert.equal(state.title.textContent, "You're in · #42 on the list");
  assert.equal(state.detailsSave.disabled, false);
  assert.equal(state.detailsSkip.disabled, false);
  assert.equal(state.dialog.attributes["aria-busy"], "false");

  state.detailsForm.elements.role.value = "host";
  state.detailsForm.elements.campus.value = "Tec de Monterrey";
  const saving = state.detailsForm.dispatch("submit");
  state.requests[1].resolve(response({ ok: true }));
  await saving;
  assert.equal(Object.fromEntries(state.requests[1].options.body).token, "private-token");
  assert.equal(state.shareStep.hidden, false);
  assert.equal(state.sharePosition.textContent, "#42 on the list");
});

test("a network failure does not show a false confirmation and can be retried", async () => {
  const state = setup();
  const signup = state.joinForms[0];
  signup.form.elements.email.value = "person@example.com";
  const pending = signup.form.dispatch("submit");
  state.requests[0].reject(new Error("offline"));
  await pending;

  assert.equal(state.dialog.open, false);
  assert.equal(signup.form.hidden, false);
  assert.equal(signup.done.hidden, true);
  assert.equal(signup.status.textContent, "Request error");
  assert.equal(signup.button.disabled, false);
  assert.equal(state.joinForms[1].button.disabled, false);
});

test("a duplicate closes the pending dialog and shows the existing-registration message", async () => {
  const state = setup();
  const signup = state.joinForms[0];
  signup.form.elements.email.value = "person@example.com";
  const pending = signup.form.dispatch("submit");
  state.requests[0].resolve(response({ ok: true, duplicate: true, referralCode: "EXISTING" }));
  await pending;

  assert.equal(state.dialog.open, false);
  assert.equal(signup.form.hidden, true);
  assert.equal(signup.doneText.textContent, "Duplicate");
  assert.equal(state.detailsSave.disabled, false);
});

test("a timeout restores the form and explains how to retry", async () => {
  const state = setup();
  const signup = state.joinForms[0];
  signup.form.elements.email.value = "person@example.com";
  await signup.form.dispatch("submit");

  assert.equal(state.requests.length, 1);
  assert.equal(state.dialog.open, false);
  assert.equal(signup.status.textContent, "Request timeout");
  assert.equal(signup.button.disabled, false);
  assert.equal(signup.form.hidden, false);
});
