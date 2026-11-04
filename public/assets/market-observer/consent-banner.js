(function attachMarketObserverConsent(root) {
  "use strict";

  const VERSION = "2026-06-24-explicit-opt-in-v1";
  const CONSENT_KEY = "market_observer_analytics_consent";
  const LEGACY_OPT_OUT_KEY = "market_observer_opt_out";
  const BANNER_ID = "market-observer-consent-banner";
  const STYLE_ID = "market-observer-consent-style";
  const CHANGE_BUTTON_CLASS = "market-observer-consent-change";
  const VALID_STATES = new Set(["granted", "denied"]);
  const BUTTON_CLASS = "market-observer-consent-button";

  const MESSAGES = {
    ja: {
      heading: "利用状況の解析について",
      body: [
        "このサイトでは、改善のために利用状況の解析を行います。",
        "解析は、あなたが許可した場合のみ有効になります。",
        "設定はいつでも変更できます。",
      ],
      allow: "許可する",
      deny: "許可しない",
      learnMore: "詳しく見る",
      changeSettings: "解析設定",
      close: "閉じる",
      statusGranted: "アクセス解析：許可済み",
      statusDenied: "アクセス解析：利用しない",
      statusUnknown: "アクセス解析：未選択",
      statusUnavailable: "設定を保存できないため、解析は無効です",
      gpcNotice: "ブラウザのプライバシー設定により解析を無効にしています。",
    },
    en: {
      heading: "About usage analytics",
      body: [
        "This site uses usage analytics to improve the site.",
        "Analytics are enabled only if you allow them.",
        "You can change your settings at any time.",
      ],
      allow: "Allow",
      deny: "Do not allow",
      learnMore: "Learn more",
      changeSettings: "Analytics settings",
      close: "Close",
      statusGranted: "Analytics: allowed",
      statusDenied: "Analytics: disabled",
      statusUnknown: "Analytics: not selected",
      statusUnavailable: "Analytics: unavailable",
      gpcNotice: "Your browser privacy settings are disabling analytics.",
    },
  };

  function hasGpc() {
    return Boolean(root.navigator && root.navigator.globalPrivacyControl === true);
  }

  function parseStoredValue(value) {
    if (value === "granted" || value === "denied") return value;
    if (!value) return "unknown";
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && VALID_STATES.has(parsed.state)) return parsed.state;
    } catch (_error) {
      return "unknown";
    }
    return "unknown";
  }

  function readConsent() {
    if (hasGpc()) return { state: "denied", reason: "global_privacy_control", gpc: true };
    try {
      if (!root.localStorage) return { state: "unavailable", reason: "consent_unavailable", gpc: false };
      const legacyValue = root.localStorage.getItem(LEGACY_OPT_OUT_KEY);
      if (legacyValue === "true") {
        root.localStorage.setItem(CONSENT_KEY, "denied");
        root.localStorage.removeItem(LEGACY_OPT_OUT_KEY);
        return { state: "denied", reason: "consent_denied", gpc: false };
      }
      const state = parseStoredValue(root.localStorage.getItem(CONSENT_KEY));
      if (state === "granted") return { state, reason: "", gpc: false };
      if (state === "denied") return { state, reason: "consent_denied", gpc: false };
      return { state: "unknown", reason: "consent_unknown", gpc: false };
    } catch (_error) {
      return { state: "unavailable", reason: "consent_unavailable", gpc: false };
    }
  }

  function writeConsent(state) {
    if (!VALID_STATES.has(state)) return false;
    if (state === "granted" && hasGpc()) return false;
    try {
      if (!root.localStorage) return false;
      root.localStorage.setItem(CONSENT_KEY, state);
      root.localStorage.removeItem(LEGACY_OPT_OUT_KEY);
      return true;
    } catch (_error) {
      return false;
    }
  }

  function localeFor(options) {
    if (options && (options.locale === "ja" || options.locale === "en")) return options.locale;
    const document = root.document;
    const lang = document && document.documentElement ? String(document.documentElement.lang || "").toLowerCase() : "";
    return lang.startsWith("ja") ? "ja" : "en";
  }

  function messagesFor(options) {
    const locale = localeFor(options);
    const defaults = MESSAGES[locale] || MESSAGES.en;
    const overrides = options && options.messages;
    if (!overrides || typeof overrides !== "object") return defaults;
    return {
      ...defaults,
      ...overrides,
      body: Array.isArray(overrides.body) && overrides.body.every((line) => typeof line === "string")
        ? overrides.body
        : defaults.body,
    };
  }

  function ensureStyle(document) {
    if (!document || document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      ".market-observer-consent-banner{position:fixed;inset:auto 16px 16px;z-index:2147483000;box-sizing:border-box;background:var(--mo-consent-background,Canvas);color:var(--mo-consent-foreground,CanvasText);border:1px solid var(--mo-consent-border,currentColor);border-radius:var(--mo-consent-radius,0);padding:var(--mo-consent-spacing,20px);max-width:760px;max-height:calc(100dvh - 32px);overflow:auto;margin:0 auto;font-family:inherit;font-size:14px;line-height:1.7;overflow-wrap:anywhere}",
      ".market-observer-consent-banner h2{font-size:1em;line-height:1.5;margin:0 0 10px;font-weight:600;letter-spacing:0}",
      ".market-observer-consent-banner p{margin:0 0 6px}",
      ".market-observer-consent-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}",
      ".market-observer-consent-button{appearance:none;box-sizing:border-box;border:1px solid var(--mo-consent-border,currentColor);border-radius:var(--mo-consent-radius,0);padding:10px 18px;font:inherit;font-size:14px;font-weight:500;line-height:1.5;min-height:44px;background:var(--mo-consent-background,Canvas);color:inherit;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;text-align:center;text-decoration:none}",
      ".market-observer-consent-button[data-action='allow'],.market-observer-consent-button[data-action='deny']{flex:1 1 140px}",
      ".market-observer-consent-button[data-action='details'],.market-observer-consent-button[data-action='close']{background:transparent;border-color:transparent;text-decoration:underline;text-underline-offset:3px}",
      ".market-observer-consent-button:hover{text-decoration:underline;text-underline-offset:3px}",
      ".market-observer-consent-button:focus-visible,.market-observer-consent-change:focus-visible{outline:2px solid var(--mo-consent-focus,currentColor);outline-offset:4px}",
      ".market-observer-consent-button:disabled{opacity:.6;cursor:not-allowed}",
      ".market-observer-consent-change{display:inline;position:static;border:0;background:none;box-shadow:none;border-radius:0;padding:0;font:inherit;color:inherit;text-decoration:underline;text-underline-offset:.25em;cursor:pointer}",
      "@media(max-width:480px){.market-observer-consent-banner{inset:auto 8px 8px;max-height:calc(100dvh - 16px);padding:16px}.market-observer-consent-actions{display:grid;grid-template-columns:1fr 1fr}.market-observer-consent-button{padding:10px 8px;min-width:0}}",
      "@media(prefers-reduced-motion:reduce){.market-observer-consent-banner{scroll-behavior:auto}.market-observer-consent-button,.market-observer-consent-change{transition:none;animation:none}}",
      ".market-observer-consent-banner.market-observer-consent-quiet{position:static;inset:auto;z-index:auto;max-height:none;margin:24px auto;overflow:visible}",
    ].join("\n");
    (document.head || document.documentElement).appendChild(style);
  }

  function removeBanner(document) {
    const existing = document && document.getElementById(BANNER_ID);
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    const entry = document && document.querySelector("." + CHANGE_BUTTON_CLASS);
    if (entry) entry.setAttribute("aria-expanded", "false");
  }

  function openDetails(options) {
    const document = root.document;
    if (!document) return;
    const selector = options && options.detailsSelector ? options.detailsSelector : ".analytics-privacy";
    const details = document.querySelector(selector);
    if (details) {
      if ("open" in details) details.open = true;
      if (typeof details.scrollIntoView === "function") details.scrollIntoView({ block: "nearest" });
      return;
    }
    const privacyUrl = options && options.privacyUrl ? options.privacyUrl : "/privacy/";
    if (privacyUrl && root.location) root.location.href = privacyUrl;
  }

  function choose(state, options) {
    const document = root.document;
    const ok = writeConsent(state);
    if (!ok) {
      updateExistingControls(options, "unavailable");
      return false;
    }
    removeBanner(document);
    updateExistingControls(options, state);
    if (!options || options.reload !== false) root.location.reload();
    return true;
  }

  function button(document, text, action) {
    const element = document.createElement("button");
    element.className = BUTTON_CLASS;
    element.type = "button";
    element.dataset.action = action;
    element.textContent = text;
    return element;
  }

  function applyButtonRole(element, action) {
    if (!element) return;
    if (element.classList && typeof element.classList.add === "function") {
      element.classList.add(BUTTON_CLASS);
    } else if (!String(element.className || "").split(/\s+/).includes(BUTTON_CLASS)) {
      element.className = `${element.className || ""} ${BUTTON_CLASS}`.trim();
    }
    if (!element.dataset) element.dataset = {};
    element.dataset.action = action;
  }

  function showBanner(options, force) {
    const document = root.document;
    if (!document || !document.body) return null;
    ensureStyle(document);
    removeBanner(document);
    const locale = localeFor(options);
    const text = messagesFor(options);
    const consent = readConsent();
    if (!force && consent.state !== "unknown") return null;

    const banner = document.createElement("section");
    banner.id = BANNER_ID;
    banner.className = "market-observer-consent-banner";
    if (options && options.presentation === "quiet") banner.className += " market-observer-consent-quiet";
    banner.setAttribute("role", "region");
    banner.setAttribute("aria-live", "polite");
    banner.setAttribute("aria-label", text.heading);

    const heading = document.createElement("h2");
    heading.textContent = text.heading;
    banner.appendChild(heading);

    if (force) {
      const status = document.createElement("p");
      status.id = "market-observer-consent-panel-status";
      status.textContent = statusText(consent, text);
      banner.appendChild(status);
    }

    if (consent.gpc && !force) {
      const notice = document.createElement("p");
      notice.textContent = text.gpcNotice;
      banner.appendChild(notice);
    }
    for (const line of text.body) {
      const paragraph = document.createElement("p");
      paragraph.textContent = line;
      banner.appendChild(paragraph);
    }

    const actions = document.createElement("div");
    actions.className = "market-observer-consent-actions";
    const allow = button(document, text.allow, "allow");
    const deny = button(document, text.deny, "deny");
    const details = button(document, text.learnMore, "details");
    if (consent.gpc || consent.state === "unavailable") allow.disabled = true;
    if (consent.state === "unavailable") deny.disabled = true;
    allow.addEventListener("click", () => choose("granted", options || {}));
    deny.addEventListener("click", () => choose("denied", options || {}));
    details.addEventListener("click", () => openDetails(options || {}));
    actions.appendChild(allow);
    actions.appendChild(deny);
    actions.appendChild(details);
    if (force) {
      const close = button(document, text.close, "close");
      const closePanel = () => {
        removeBanner(document);
        const entry = document.querySelector("." + CHANGE_BUTTON_CLASS);
        if (entry && typeof entry.focus === "function") entry.focus();
      };
      close.addEventListener("click", closePanel);
      banner.addEventListener("keydown", (event) => {
        if (event.key === "Escape") { event.preventDefault(); closePanel(); }
      });
      actions.appendChild(close);
    }
    banner.appendChild(actions);
    const container = options && options.presentation === "quiet" && options.containerSelector
      ? document.querySelector(options.containerSelector) : null;
    (container || document.body).appendChild(banner);
    const entry = document.querySelector("." + CHANGE_BUTTON_CLASS);
    if (entry) entry.setAttribute("aria-expanded", "true");
    if (force && typeof deny.focus === "function") (allow.disabled ? deny : allow).focus();
    return banner;
  }

  function statusText(consent, text) {
    if (consent.gpc) return text.gpcNotice;
    return ({ granted: text.statusGranted, denied: text.statusDenied, unavailable: text.statusUnavailable })[consent.state] || text.statusUnknown;
  }

  function updateExistingControls(options, stateOverride) {
    const document = root.document;
    if (!document) return;
    const text = messagesFor(options);
    const consent = stateOverride ? { state: stateOverride, gpc: hasGpc() } : readConsent();
    const panelStatus = document.querySelector("#market-observer-consent-panel-status");
    if (panelStatus) panelStatus.textContent = statusText(consent, text);
    const status = document.querySelector("#market-observer-consent-status");
    const allowButton = document.querySelector("#market-observer-consent-allow");
    const denyButton = document.querySelector("#market-observer-consent-deny");
    if (!status || !allowButton || !denyButton) return;
    ensureStyle(document);
    applyButtonRole(allowButton, "allow");
    applyButtonRole(denyButton, "deny");

    allowButton.hidden = false;
    denyButton.hidden = false;
    allowButton.disabled = false;
    denyButton.disabled = false;
    allowButton.textContent = text.allow;
    denyButton.textContent = text.deny;

    if (consent.gpc) {
      status.textContent = text.gpcNotice;
      allowButton.disabled = true;
      return;
    }
    if (consent.state === "granted") {
      status.textContent = text.statusGranted;
      return;
    }
    if (consent.state === "denied") {
      status.textContent = text.statusDenied;
      return;
    }
    if (consent.state === "unavailable") {
      status.textContent = text.statusUnavailable;
      allowButton.disabled = true;
      denyButton.disabled = true;
      return;
    }
    status.textContent = text.statusUnknown;
  }

  function bindExistingControls(options) {
    const document = root.document;
    if (!document) return;
    const allowButton = document.querySelector("#market-observer-consent-allow");
    const denyButton = document.querySelector("#market-observer-consent-deny");
    if (allowButton && !allowButton.dataset.marketObserverConsentBound) {
      allowButton.dataset.marketObserverConsentBound = "true";
      allowButton.addEventListener("click", () => choose("granted", options || {}));
    }
    if (denyButton && !denyButton.dataset.marketObserverConsentBound) {
      denyButton.dataset.marketObserverConsentBound = "true";
      denyButton.addEventListener("click", () => choose("denied", options || {}));
    }
    updateExistingControls(options);
  }

  function ensureChangeControl(options) {
    const document = root.document;
    if (!document || document.querySelector(`.${CHANGE_BUTTON_CLASS}`)) return;
    const locale = localeFor(options);
    const text = messagesFor(options);
    const container = document.querySelector((options && options.settingsContainerSelector) || "footer") || document.querySelector("footer");
    if (!container) return;
    const action = document.createElement("a");
    action.setAttribute("href", "#" + BANNER_ID);
    action.setAttribute("aria-controls", BANNER_ID);
    action.setAttribute("aria-expanded", "false");
    action.className = CHANGE_BUTTON_CLASS;
    action.textContent = text.changeSettings;
    action.addEventListener("click", (event) => {
      event.preventDefault();
      showBanner(Object.assign({}, options, { reload: true }), true);
    });
    container.appendChild(action);
  }

  function mount(options) {
    bindExistingControls(options || {});
    ensureChangeControl(options || {});
    return showBanner(options || {}, false);
  }

  root.MarketObserverConsent = {
    VERSION,
    storageKey: CONSENT_KEY,
    legacyOptOutKey: LEGACY_OPT_OUT_KEY,
    read: readConsent,
    write: writeConsent,
    choose,
    mount,
    showBanner,
    hasGpc,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = root.MarketObserverConsent;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
