(function attachMarketObserver(root) {
  "use strict";

  const VERSION = "1.0.0";
  const RUNTIME_KEY = "__MARKET_OBSERVER_RUNTIME__";
  const GOOGLE_TAG_ID = "market-observer-google-tag";
  const CONSENT_KEY = "market_observer_analytics_consent";
  const LEGACY_OPT_OUT_KEY = "market_observer_opt_out";
  const TERMINAL_STATES = new Set(["loading", "ready", "failed_terminal"]);
  // Reporting/setup metadata and Google configuration are not event parameters.
  const CONFIG_ONLY_KEYS = new Set([
    "send_page_view", "allow_google_signals", "allow_ad_personalization_signals",
    "config_scope_parameters", "required_custom_dimensions", "ga4_reporting_metadata", "ga4_config",
    "schema_version", "production_origins", "production_path_policy", "production_path_prefixes",
    "preview_host_patterns", "preview_validation", "allowed_events", "aliases", "destination_hosts",
    "page_title_alias", "measurement_id_placeholder", "campaign_policy", "referrer_policy", "_notice",
    "use_start_contract", "excluded_routes", "transport_policy", "measurement_id", "privacy_contract", "route_contracts",
  ]);
  const GOOGLE_CONFIG_KEYS = new Set([
    "send_page_view", "allow_google_signals", "allow_ad_personalization_signals",
    "page_location", "page_referrer", "page_title", "project_id", "surface", "tracker_version",
    "campaign_source", "campaign_medium", "campaign_name", "campaign_content",
  ]);

  const isCommonJs = typeof module !== "undefined" && module.exports;
  const win = getWindow();
  const browserLike = Boolean(win && win.document);

  if (browserLike && win[RUNTIME_KEY] && win.MarketObserver) {
    win[RUNTIME_KEY].loadCount = (win[RUNTIME_KEY].loadCount || 1) + 1;
    if (isCommonJs) module.exports = win.MarketObserver;
    return;
  }

  if (browserLike) {
    win[RUNTIME_KEY] = {
      version: VERSION,
      loadCount: 1,
      status: "idle",
    };
  }

  let state = freshState();

  function freshState() {
    return {
      status: "idle",
      blockedReasons: [],
      config: null,
      runtimeSchema: null,
      profile: null,
      transport: null,
      scriptLoadCount: 0,
      gtagCallCount: 0,
      sentEventCount: 0,
      lastEventName: "",
      warnings: [],
      dedupe: new Map(),
      rateLimit: new Map(),
      rateLimitedCount: 0,
      pageContext: {},
      boundRoute: null,
      now: () => Date.now(),
    };
  }

  function getWindow() {
    if (typeof window !== "undefined") return window;
    if (root && root.window) return root.window;
    return root;
  }

  function getDocument() {
    const currentWindow = getWindow();
    return currentWindow && currentWindow.document ? currentWindow.document : null;
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function canonicalStringify(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`).join(",")}}`;
  }

  function sha256(value) {
    const text = typeof value === "string" ? value : `${canonicalStringify(value)}\n`;
    if (isCommonJs) {
      return require("node:crypto").createHash("sha256").update(text, "utf8").digest("hex");
    }
    return sha256Browser(text);
  }

  function sha256Browser(input) {
    const bytes = [];
    for (let i = 0; i < input.length; i += 1) {
      let code = input.charCodeAt(i);
      if (code < 0x80) bytes.push(code);
      else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
      else if (code < 0xd800 || code >= 0xe000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      else {
        i += 1;
        code = 0x10000 + (((code & 0x3ff) << 10) | (input.charCodeAt(i) & 0x3ff));
        bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      }
    }
    const k = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ];
    const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const bitLen = bytes.length * 8;
    bytes.push(0x80);
    while ((bytes.length % 64) !== 56) bytes.push(0);
    for (let i = 7; i >= 0; i -= 1) bytes.push((bitLen / Math.pow(2, i * 8)) & 0xff);
    const w = new Array(64);
    for (let chunk = 0; chunk < bytes.length; chunk += 64) {
      for (let i = 0; i < 16; i += 1) {
        w[i] = ((bytes[chunk + i * 4] << 24) | (bytes[chunk + i * 4 + 1] << 16) | (bytes[chunk + i * 4 + 2] << 8) | bytes[chunk + i * 4 + 3]) >>> 0;
      }
      for (let i = 16; i < 64; i += 1) {
        const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }
      let [a, b, c, d, e, f, g, hh] = h;
      for (let i = 0; i < 64; i += 1) {
        const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const ch = (e & f) ^ (~e & g);
        const temp1 = (hh + s1 + ch + k[i] + w[i]) >>> 0;
        const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = (s0 + maj) >>> 0;
        hh = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
      }
      h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
      h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
    }
    return h.map((item) => item.toString(16).padStart(8, "0")).join("");
  }

  function rotr(value, shift) {
    return (value >>> shift) | (value << (32 - shift));
  }

  function normalizePath(pathname) {
    let decoded = "";
    try {
      decoded = decodeURIComponent(pathname || "/");
    } catch (_error) {
      return "";
    }
    let path = decoded || "/";
    if (!path.startsWith("/")) path = `/${path}`;
    path = path.replace(/\/{2,}/g, "/");
    if (!path.endsWith("/")) {
      const last = path.split("/").pop();
      if (last && !last.includes(".")) path = `${path}/`;
    }
    return path;
  }

  function sanitizedLocation() {
    const currentWindow = getWindow();
    if (!currentWindow || !currentWindow.location || currentWindow.location.protocol === "file:") return "";
    const path = normalizePath(currentWindow.location.pathname || "/");
    if (!path) return "";
    const origin = currentWindow.location.origin || "";
    return origin && origin !== "null" ? `${origin}${path}` : "";
  }

  function sanitizedReferrer() {
    if (state.profile && state.profile.referrer_policy === "none") return "";
    const document = getDocument();
    const currentWindow = getWindow();
    if (!document || !document.referrer) return "";
    let parsed;
    try {
      parsed = new URL(document.referrer);
    } catch (_error) {
      return "";
    }
    const currentOrigin = currentWindow && currentWindow.location ? currentWindow.location.origin : "";
    if (parsed.origin === currentOrigin) {
      const path = normalizePath(parsed.pathname || "/");
      return path ? `${parsed.origin}${path}` : "";
    }
    return parsed.origin;
  }

  function currentOrigin() {
    const currentWindow = getWindow();
    if (!currentWindow || !currentWindow.location || currentWindow.location.protocol === "file:") return "";
    return currentWindow.location.origin || "";
  }

  function currentPath() {
    const currentWindow = getWindow();
    if (!currentWindow || !currentWindow.location) return "";
    return normalizePath(currentWindow.location.pathname || "/");
  }

  function isLocalOrFile() {
    const currentWindow = getWindow();
    if (!currentWindow || !currentWindow.location) return true;
    const protocol = currentWindow.location.protocol;
    const host = currentWindow.location.hostname;
    return protocol === "file:" || host === "localhost" || host === "127.0.0.1" || host === "::1";
  }

  function wildcardMatch(hostname, pattern) {
    if (!pattern) return false;
    if (pattern.startsWith("*.")) return hostname.toLowerCase().endsWith(pattern.slice(1).toLowerCase());
    return hostname.toLowerCase() === pattern.toLowerCase();
  }

  function isPreviewHost(profile) {
    const currentWindow = getWindow();
    if (!currentWindow || !currentWindow.location) return false;
    const host = currentWindow.location.hostname || "";
    return asArray(profile.preview_host_patterns).some((pattern) => wildcardMatch(host, pattern));
  }

  function isPreviewValidationAllowed(profile) {
    const currentWindow = getWindow();
    if (!currentWindow || !currentWindow.location) return false;
    const validation = profile.preview_validation || {};
    const gate = validation.collect_gate || {};
    if (gate.mode !== "explicit_query_only") return false;
    const host = currentWindow.location.hostname || "";
    const hostAllowed = asArray(gate.allowed_host_patterns).some((pattern) => wildcardMatch(host, pattern));
    if (!hostAllowed || !isPreviewHost(profile)) return false;
    const key = gate.query_parameter;
    const values = asArray(gate.allowed_values);
    if (!key || values.length === 0) return false;
    const params = new URLSearchParams(currentWindow.location.search || "");
    return params.getAll(key).some((value) => values.includes(value));
  }

  function hasGlobalPrivacyControl() {
    const currentWindow = getWindow();
    return Boolean(currentWindow && currentWindow.navigator && currentWindow.navigator.globalPrivacyControl === true);
  }

  function storedConsentValue(value) {
    if (value === "granted" || value === "denied") return value;
    if (!value) return "unknown";
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && (parsed.state === "granted" || parsed.state === "denied")) return parsed.state;
    } catch (_error) {
      return "unknown";
    }
    return "unknown";
  }

  function analyticsConsentState() {
    const currentWindow = getWindow();
    if (hasGlobalPrivacyControl()) return { state: "denied", reason: "global_privacy_control" };
    try {
      if (!currentWindow || !currentWindow.localStorage) return { state: "unavailable", reason: "consent_unavailable" };
      const storage = currentWindow.localStorage;
      if (storage.getItem(LEGACY_OPT_OUT_KEY) === "true") {
        storage.setItem(CONSENT_KEY, "denied");
        storage.removeItem(LEGACY_OPT_OUT_KEY);
        return { state: "denied", reason: "consent_denied" };
      }
      const value = storedConsentValue(storage.getItem(CONSENT_KEY));
      if (value === "granted") return { state: "granted", reason: "" };
      if (value === "denied") return { state: "denied", reason: "consent_denied" };
      return { state: "unknown", reason: "consent_unknown" };
    } catch (_error) {
      return { state: "unavailable", reason: "consent_unavailable" };
    }
  }

  function validProductionPath(profile) {
    // Route contracts are literal Cloudflare canonical paths, including whether
    // they end in a slash. Legacy prefix/normalized contracts keep their behavior.
    if (profile.route_contracts && profile.production_path_policy.mode === "exact") return asArray(profile.production_path_policy.values).includes(getWindow().location.pathname);
    const path = currentPath();
    if (!path) return false;
    if (asArray(profile.excluded_routes).some((route) => path === normalizePath(route) || path.startsWith(normalizePath(route).replace(/\/$/, "") + "/"))) return false;
    const policy = profile.production_path_policy || {};
    const values = asArray(policy.values).map((item) => normalizePath(item)).filter(Boolean);
    if (policy.mode === "exact") return values.includes(path);
    if (policy.mode === "prefix") return values.some((prefix) => path.startsWith(prefix));
    return false;
  }

  // Only the new LP contracts require writable consent storage. Preserve the
  // exact existing saved value/key; never create a probe identifier or reset it.
  function profileRouteConsentAvailable() {
    if (analyticsConsentState().state !== "granted") return false;
    try {
      const storage = getWindow().localStorage;
      const value = storage.getItem(CONSENT_KEY);
      storage.setItem(CONSENT_KEY, value);
      return storage.getItem(CONSENT_KEY) === value;
    } catch (_error) { return false; }
  }

  function hasKnownDummyMeasurementId(measurementId) {
    return measurementId === "G-XXXXXXXXXX" || measurementId === "G-0000000000" || /^G-TEST/i.test(measurementId || "");
  }

  function validMeasurementId(measurementId) {
    return typeof measurementId === "string" && /^G-[A-Z0-9]{6,}$/.test(measurementId) && !hasKnownDummyMeasurementId(measurementId);
  }

  function scriptElements() {
    const document = getDocument();
    if (!document || typeof document.getElementsByTagName !== "function") return [];
    return Array.prototype.slice.call(document.getElementsByTagName("script") || []);
  }

  function attr(element, name) {
    if (!element) return "";
    if (typeof element.getAttribute === "function") return element.getAttribute(name) || "";
    if (name === "src") return element.src || "";
    if (name === "id") return element.id || "";
    return element[name] || "";
  }

  function hasUnknownAnalytics(measurementId) {
    const currentWindow = getWindow();
    if (currentWindow && currentWindow.gtag && !currentWindow.gtag.__marketObserverOwned) return "unknown_existing_gtag";
    for (const script of scriptElements()) {
      const src = attr(script, "src");
      const owned = attr(script, "data-market-observer-owned") === "true";
      if (/googletagmanager\.com\/gtag\/js/i.test(src) && !owned) return "unknown_existing_gtag_script";
      if (/googletagmanager\.com\/gtm\.js/i.test(src) && !owned) return "unknown_existing_gtm_script";
      if (/UA-\d+/i.test(src)) return "legacy_ua_script";
      if (/G-[A-Z0-9]{6,}/i.test(src) && !src.includes(measurementId) && !owned) return "multiple_measurement_id";
    }
    return "";
  }

  function validateGenerated(config) {
    const reasons = [];
    const runtimeSchema = config.runtimeSchema;
    const profile = config.profile;
    if (!runtimeSchema || !profile) return ["missing_generated_runtime_or_profile"];
    if (sha256(runtimeSchema) !== config.runtimeSchemaHash) reasons.push("runtime_schema_hash_mismatch");
    if (sha256(profile) !== config.profileHash) reasons.push("profile_hash_mismatch");
    const schemaProject = runtimeSchema.projects && runtimeSchema.projects[profile.project_id];
    if (!schemaProject) reasons.push("profile_project_missing_from_runtime_schema");
    if (schemaProject) {
      for (const key of ["surface", "page_title_alias", "campaign_policy", "referrer_policy"]) {
        if (schemaProject[key] !== profile[key]) reasons.push(`profile_${key}_mismatch`);
      }
      for (const key of ["production_origins", "production_path_prefixes", "preview_host_patterns", "preview_validation", "allowed_events", "destination_hosts"]) {
        if (canonicalStringify(schemaProject[key]) !== canonicalStringify(profile[key])) reasons.push(`profile_${key}_mismatch`);
      }
      for (const key of ["use_start_contract", "excluded_routes", "transport_policy", "measurement_id", "privacy_contract", "route_contracts"]) {
        if (canonicalStringify(schemaProject[key] || null) !== canonicalStringify(profile[key] || null)) reasons.push(`profile_${key}_mismatch`);
      }
    }
    return reasons;
  }

  function validateInit(config) {
    const reasons = [];
    if (TERMINAL_STATES.has(state.status)) reasons.push(`already_${state.status}`);
    reasons.push(...validateGenerated(config));
    const runtimeSchema = config.runtimeSchema || {};
    const profile = config.profile || {};
    if (profile.transport_policy === "no_send") reasons.push("no_send_project");
    if (!validMeasurementId(config.measurementId)) reasons.push("invalid_or_placeholder_measurement_id");
    if (isLocalOrFile()) reasons.push("local_or_file_origin");
    const previewValidationAllowed = isPreviewValidationAllowed(profile);
    if (profile.transport_policy === "staging_only" && !previewValidationAllowed) reasons.push("staging_validation_only");
    if (profile.measurement_id && config.measurementId !== profile.measurement_id) reasons.push("canonical_measurement_id_mismatch");
    if (isPreviewHost(profile) && !previewValidationAllowed) reasons.push("preview_origin");
    const consent = analyticsConsentState();
    if (consent.state !== "granted") reasons.push(consent.reason);
    if (config.automatedTest || config.healthCheck || (win && (win.__MARKET_OBSERVER_AUTOMATED_TEST__ || win.__MARKET_OBSERVER_HEALTH_CHECK__))) reasons.push("automated_or_health_check");
    const origin = currentOrigin();
    if (!origin || (!asArray(profile.production_origins).includes(origin) && !previewValidationAllowed)) reasons.push("non_production_origin");
    if (!validProductionPath(profile)) reasons.push("invalid_production_path");
    const route = profile.route_contracts && profile.route_contracts[getWindow().location.pathname];
    if (route) {
      if (!profileRouteConsentAvailable()) reasons.push("route_consent_unavailable");
      const production = asArray(profile.production_origins).includes(getWindow().location.origin);
      if (production ? route.production_enabled !== true : route.preview_enabled !== true) reasons.push("route_observation_pending");
      if (!config.pageContext || config.pageContext.route_id !== route.route_id || config.pageContext.content_type !== route.content_type) reasons.push("route_context_mismatch");
    }
    const analyticsReason = hasUnknownAnalytics(config.measurementId);
    if (analyticsReason) reasons.push(analyticsReason);
    if (runtimeSchema.ga4_config && runtimeSchema.ga4_config.send_page_view !== false) reasons.push("send_page_view_not_false");
    return reasons;
  }

  function ensureOwnedTransport(config) {
    if (config.transport && typeof config.transport.gtag === "function") return config.transport;
    const currentWindow = getWindow();
    const document = getDocument();
    currentWindow.dataLayer = currentWindow.dataLayer || [];
    currentWindow.gtag = currentWindow.gtag || function gtagShim() {
      currentWindow.dataLayer.push(arguments);
    };
    currentWindow.gtag.__marketObserverOwned = true;
    return {
      gtag() {
        currentWindow.gtag.apply(currentWindow, arguments);
      },
      loadTag(measurementId) {
        if (!document || typeof document.createElement !== "function") return false;
        const existing = document.getElementById ? document.getElementById(GOOGLE_TAG_ID) : null;
        if (existing && attr(existing, "data-measurement-id") === measurementId) return false;
        const script = document.createElement("script");
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
        script.id = GOOGLE_TAG_ID;
        if (typeof script.setAttribute === "function") {
          script.setAttribute("data-market-observer-owned", "true");
          script.setAttribute("data-measurement-id", measurementId);
        } else {
          script["data-market-observer-owned"] = "true";
          script["data-measurement-id"] = measurementId;
        }
        const first = document.getElementsByTagName && document.getElementsByTagName("script")[0];
        if (first && first.parentNode && typeof first.parentNode.insertBefore === "function") {
          first.parentNode.insertBefore(script, first);
          return true;
        }
        if (document.head && typeof document.head.appendChild === "function") {
          document.head.appendChild(script);
          return true;
        }
        return false;
      },
    };
  }

  function extractSafeCampaign(runtimeSchema) {
    const currentWindow = getWindow();
    const utm = runtimeSchema.utm || {};
    if (!currentWindow || !currentWindow.location || !currentWindow.location.search) return {};
    let params;
    try {
      params = new URLSearchParams(currentWindow.location.search);
    } catch (_error) {
      return {};
    }
    const output = {};
    const source = params.get("utm_source");
    if (source && asArray(utm.source_allowed).includes(source) && !asArray(utm.source_forbidden).includes(source) && source.length <= utm.source_max_length) {
      output.campaign_source = source;
    }
    const medium = params.get("utm_medium");
    if (medium && asArray(utm.medium_allowed).includes(medium) && medium.length <= utm.medium_max_length) {
      output.campaign_medium = medium;
    }
    const campaign = params.get("utm_campaign");
    if (campaign && campaign.length <= utm.campaign_max_length && new RegExp(utm.campaign_pattern).test(campaign)) {
      output.campaign_name = campaign;
    }
    const content = params.get("utm_content");
    if (content && content.length <= utm.content_max_length && new RegExp(utm.content_pattern).test(content)) {
      output.campaign_content = content;
    }
    return output;
  }

  function consentCommandPayload(runtimeSchema) {
    const command = runtimeSchema && runtimeSchema.consent ? runtimeSchema.consent.google_tag_consent_command : null;
    if (!command || command.command !== "default") return null;
    return {
      analytics_storage: command.analytics_storage || "granted",
      ad_storage: command.ad_storage || "denied",
      ad_user_data: command.ad_user_data || "denied",
      ad_personalization: command.ad_personalization || "denied",
      wait_for_update: Number.isFinite(command.wait_for_update_ms) ? command.wait_for_update_ms : 0,
    };
  }

  function init(config) {
    if (TERMINAL_STATES.has(state.status)) return { ok: false, reasons: [`already_${state.status}`], retryable: false };
    const safeConfig = config || {};
    state.config = safeConfig;
    state.runtimeSchema = safeConfig.runtimeSchema || null;
    state.profile = safeConfig.profile || null;
    state.pageContext = sanitizePageContext(safeConfig.pageContext);
    const reasons = validateInit(safeConfig);
    state.blockedReasons = reasons.slice();
    if (reasons.length > 0) {
      state.status = TERMINAL_STATES.has(state.status) ? state.status : "blocked_retryable";
      updateSentinel();
      return { ok: false, reasons: reasons.slice(), retryable: state.status === "blocked_retryable" };
    }

    if (state.profile.route_contracts && state.profile.route_contracts[getWindow().location.pathname]) {
      state.boundRoute = { origin: getWindow().location.origin, path: getWindow().location.pathname };
    }
    state.status = "loading";
    state.transport = ensureOwnedTransport(safeConfig);
    const loaded = state.transport.loadTag ? state.transport.loadTag(safeConfig.measurementId) : false;
    if (loaded !== false) state.scriptLoadCount += 1;
    const consentPayload = consentCommandPayload(safeConfig.runtimeSchema);
    if (consentPayload) callGtag("consent", "default", consentPayload);
    callGtag("js", new Date());
    const configPayload = Object.assign(
      {},
      // Schema metadata describes validation, not parameters for Google's tag.
      {
        send_page_view: false,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
      },
      {
        page_location: sanitizedLocation(),
        page_referrer: sanitizedReferrer(),
        page_title: safeConfig.profile.page_title_alias,
        project_id: safeConfig.profile.project_id,
        surface: safeConfig.profile.surface,
        tracker_version: safeConfig.profile.tracker_version,
      },
      safeConfig.profile.campaign_policy === "none" ? {} : extractSafeCampaign(safeConfig.runtimeSchema)
    );
    callGtag("config", safeConfig.measurementId, configPayload);
    state.status = "ready";
    updateSentinel();
    return { ok: true, reasons: [] };
  }

  function updateSentinel() {
    const currentWindow = getWindow();
    if (currentWindow && currentWindow[RUNTIME_KEY]) {
      currentWindow[RUNTIME_KEY].status = state.status;
      currentWindow[RUNTIME_KEY].scriptLoadCount = state.scriptLoadCount;
      currentWindow[RUNTIME_KEY].sentEventCount = state.sentEventCount;
    }
  }

  function callGtag() {
    const args = Array.from(arguments);
    if (args[0] === "event") {
      // Last application-controlled boundary: recheck after payload assembly.
      // Google tag's own automatic fields/events are outside this serializer.
      const final = sanitizeParameters(args[1], args[2]);
      if (!final.ok) return false;
      args[2] = final.value;
    } else if (args[0] === "config") {
      // Positive allowlist also protects legacy generated schemas carrying metadata
      // in ga4_config, and drops future/unknown config keys instead of inheriting them.
      args[2] = Object.fromEntries(Object.entries(args[2] || {}).filter(([key]) => GOOGLE_CONFIG_KEYS.has(key)));
    }
    state.gtagCallCount += 1;
    if (state.transport && typeof state.transport.gtag === "function") {
      state.transport.gtag.apply(null, args);
    }
    return true;
  }

  function eventDefinition(eventName) {
    const schemaEvents = state.runtimeSchema && state.runtimeSchema.events ? state.runtimeSchema.events : {};
    if (!schemaEvents[eventName]) return null;
    if (!asArray(state.profile.allowed_events).includes(eventName)) return null;
    return schemaEvents[eventName];
  }

  function unsafeParameterBag(value) {
    if (value === null || value === undefined) return false;
    if (Array.isArray(value)) return true;
    if (typeof Error !== "undefined" && value instanceof Error) return true;
    if (typeof value !== "object") return true;
    if (typeof Event !== "undefined" && value instanceof Event) return true;
    if (value.target || value.currentTarget || value.clipboardData || value.nodeType) return true;
    return false;
  }

  function unsafeValue(value) {
    if (value === null || value === undefined) return false;
    if (Array.isArray(value)) return true;
    if (typeof value === "function" || typeof value === "symbol") return true;
    if (typeof Error !== "undefined" && value instanceof Error) return true;
    if (typeof value === "object") {
      if (typeof Event !== "undefined" && value instanceof Event) return true;
      if (value.target || value.currentTarget || value.clipboardData || value.nodeType) return true;
      return true;
    }
    return false;
  }

  function allowedValuesForSource(source) {
    if (source === "sites.project_id") return new Set(Object.keys(state.runtimeSchema.projects || {}));
    if (source === "sites.surface") return new Set(Object.values(state.runtimeSchema.projects || {}).map((project) => project.surface));
    if (source && source.startsWith("profile.")) {
      const key = source.slice("profile.".length);
      if (key === "destination_hosts") return new Set(asArray(state.profile.destination_hosts));
      return new Set(asArray(state.profile.aliases && state.profile.aliases[key]));
    }
    return null;
  }

  function sanitizeValue(name, value) {
    const definition = state.runtimeSchema.parameters[name];
    if (!definition) return { ok: false, reason: "undefined_parameter" };
    if (unsafeValue(value)) return { ok: false, reason: "unsafe_value" };
    if (value === "" || value === null || value === undefined) return { ok: false, reason: "empty_value" };
    if (definition.type === "boolean") return typeof value === "boolean" ? { ok: true, value } : { ok: false, reason: "type_mismatch" };
    if (definition.type === "integer") return Number.isInteger(value) ? { ok: true, value } : { ok: false, reason: "type_mismatch" };
    if (typeof value !== "string") return { ok: false, reason: "type_mismatch" };
    let normalized = value.trim();
    if (definition.normalization === "trim_lowercase" || definition.normalization === "hostname_lowercase") normalized = normalized.toLowerCase();
    if (normalized.length === 0 || normalized.length > definition.max_length) return { ok: false, reason: "length" };
    if (definition.allowed_values && !definition.allowed_values.includes(normalized)) return { ok: false, reason: "enum" };
    const sourceValues = allowedValuesForSource(definition.allowed_values_source);
    if (sourceValues && !sourceValues.has(normalized)) return { ok: false, reason: "source_enum" };
    const strictAliasKey = { route_id: "route_ids", cta_id: "cta_ids", section_id: "section_ids", product_id: "product_ids", price_id_alias: "price_id_aliases", tool_action: "tool_actions", result_type: "result_types", error_code: "error_codes", component: "components" }[name];
    if (state.profile.privacy_contract && state.profile.privacy_contract.permitted === "canonical_fixed_aliases_only" && strictAliasKey && !asArray(state.profile.aliases[strictAliasKey]).includes(normalized)) return { ok: false, reason: "project_alias" };
    if (definition.pattern && !new RegExp(definition.pattern).test(normalized)) return { ok: false, reason: "pattern" };
    return { ok: true, value: normalized };
  }

  function baseParameters() {
    return {
      project_id: state.profile.project_id,
      surface: state.profile.surface,
      tracker_version: state.profile.tracker_version,
    };
  }

  function pageParams() {
    return Object.assign({}, state.pageContext, {
      page_location: sanitizedLocation(),
      page_referrer: sanitizedReferrer(),
      page_title: state.profile.page_title_alias,
    });
  }

  function sanitizePageContext(value) {
    if (!state.runtimeSchema || !state.profile) return {};
    if (unsafeParameterBag(value || {})) return {};
    const output = {};
    const allowed = ["route_id", "content_type", "area", "service_type", "intent_cluster", "launch_group", "referrer_type"];
    for (const key of allowed) {
      if (!Object.prototype.hasOwnProperty.call(value || {}, key)) continue;
      const result = sanitizeValue(key, value[key]);
      if (result.ok) output[key] = result.value;
    }
    return output;
  }

  function sanitizeParameters(eventName, parameters) {
    if (unsafeParameterBag(parameters || {})) return { ok: false, reason: "unsafe_parameters", value: {} };
    const definition = eventDefinition(eventName);
    if (!definition) return { ok: false, reason: "unknown_event", value: {} };
    const input = Object.assign({}, parameters || {}, baseParameters());
    const output = {};
    for (const key of asArray(definition.allowed_parameters)) {
      if (CONFIG_ONLY_KEYS.has(key)) continue;
      if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
      const result = sanitizeValue(key, input[key]);
      if (result.ok) output[key] = result.value;
      else if (asArray(definition.required_parameters).includes(key)) return { ok: false, reason: `invalid_required_${key}`, value: {} };
      else state.warnings.push({ eventName, parameter: key, reason: result.reason });
    }
    for (const key of asArray(definition.required_parameters)) {
      if (!Object.prototype.hasOwnProperty.call(output, key)) return { ok: false, reason: `missing_required_${key}`, value: {} };
    }
    return { ok: true, value: output };
  }

  function semanticValidation(eventName, parameters, options) {
    const definition = eventDefinition(eventName);
    const rules = definition.semantic_rules || {};
    if (eventName === "use_start" && rules.input_present_project_contract) {
      const contract = state.profile.use_start_contract;
      if (contract) {
        if (contract.input_mode !== "none" || contract.explicit_start_action_required !== true || contract.input_present_value !== false) return "invalid_input_free_contract";
        if (parameters.input_present !== false) return "input_free_requires_false";
        if (!options || options.explicitStart !== true) return "explicit_start_required";
      } else if (parameters.input_present !== true) return "input_not_present";
    } else if (rules.input_present_must_be_true && parameters.input_present !== true) return "input_not_present";
    if (rules.copy_success_confirmation_required && !(options && options.copySucceeded === true)) return "copy_not_confirmed";
    if (requiresActionToken(eventName) && !actionToken(options)) return "action_token_required";
    return "";
  }

  function requiresActionToken(eventName) {
    const definition = eventDefinition(eventName);
    if (!definition) return false;
    return /once_per_user_action|copy_success/.test(definition.dedupe_policy || "") || Boolean(definition.semantic_rules && definition.semantic_rules.action_token_required);
  }

  function actionToken(options) {
    return options && typeof options.actionToken === "string" && options.actionToken.trim() ? options.actionToken.trim().slice(0, 120) : "";
  }

  function pruneDedupe(now) {
    const ttl = state.runtimeSchema.dedupe.ttl_ms;
    for (const [key, item] of state.dedupe) {
      if (now - item.at > ttl) state.dedupe.delete(key);
    }
    const max = state.runtimeSchema.dedupe.cache_max_entries;
    while (state.dedupe.size > max) {
      const oldest = state.dedupe.keys().next().value;
      state.dedupe.delete(oldest);
    }
  }

  function dedupeKey(eventName, options) {
    if (eventName === "page_view") return `page_view:${sanitizedLocation()}`;
    const token = actionToken(options);
    if (!token) return "";
    if (asArray(state.runtimeSchema.duplicate_rules.outbound_events).includes(eventName) || eventName === "cta_click") return `navigation:${token}`;
    return `${eventName}:${token}`;
  }

  function checkDedupe(eventName, options) {
    const key = dedupeKey(eventName, options);
    if (!key) return { ok: true, key: "" };
    pruneDedupe(state.now());
    return state.dedupe.has(key) ? { ok: false, key } : { ok: true, key };
  }

  function registerDedupe(key) {
    if (!key) return;
    state.dedupe.set(key, { at: state.now() });
    pruneDedupe(state.now());
  }

  function checkRateLimit(eventName, parameters) {
    if (eventName !== "client_exception") return { ok: true };
    const rules = eventDefinition(eventName).semantic_rules || {};
    const key = `${parameters.project_id}:${parameters.error_code}:${parameters.component}`;
    const now = state.now();
    const current = state.rateLimit.get(key) || { windowStart: now, count: 0 };
    if (now - current.windowStart > rules.rate_limit_window_ms) {
      state.rateLimit.set(key, { windowStart: now, count: 1 });
      return { ok: true };
    }
    if (current.count >= rules.rate_limit_max) {
      state.rateLimitedCount += 1;
      state.rateLimit.set(key, current);
      return { ok: false, reason: "rate_limited" };
    }
    current.count += 1;
    state.rateLimit.set(key, current);
    return { ok: true };
  }

  function trackPageView(parameters, options) {
    return track("page_view", pageParams(), options || parameters || {});
  }

  function track(eventName, parameters, options) {
    const runtimeSchema = state.runtimeSchema || {};
    if (state.status !== "ready") return { ok: false, reason: "tracker_not_ready" };
    const route = state.profile.route_contracts && state.profile.route_contracts[getWindow().location.pathname];
    if (state.boundRoute && (getWindow().location.origin !== state.boundRoute.origin || getWindow().location.pathname !== state.boundRoute.path || !route)) return { ok: false, reason: "route_changed" };
    if (route && eventName === "cta_click" && ((parameters || {}).route_id !== route.route_id || (parameters || {}).content_type !== route.content_type || !asArray(state.profile.aliases.cta_groups).includes((parameters || {}).cta_group))) return { ok: false, reason: "route_context_mismatch" };
    if (route && !profileRouteConsentAvailable()) return { ok: false, reason: "route_consent_unavailable" };
    if (route && (!asArray(route.allowed_events).includes(eventName)
        || (eventName === "cta_click" && !Object.prototype.hasOwnProperty.call(route.cta_destinations, (parameters || {}).cta_id)))) return { ok: false, reason: "route_event_not_allowed" };
    if (asArray(runtimeSchema.prohibited_client_events).includes(eventName)) return { ok: false, reason: "prohibited_event" };
    if (!eventDefinition(eventName)) return { ok: false, reason: "unknown_event" };
    const effectiveParameters = eventName === "page_view" ? pageParams() : (parameters || {});
    const sanitized = sanitizeParameters(eventName, effectiveParameters);
    if (!sanitized.ok) return { ok: false, reason: sanitized.reason };
    const semanticReason = semanticValidation(eventName, sanitized.value, options || {});
    if (semanticReason) return { ok: false, reason: semanticReason };
    const rate = checkRateLimit(eventName, sanitized.value);
    if (!rate.ok) return { ok: false, reason: rate.reason };
    const dedupe = checkDedupe(eventName, options || {});
    if (!dedupe.ok) return { ok: false, reason: "deduped" };
    const payload = Object.assign({}, sanitized.value);
    if (eventName !== "page_view") {
      const eventDefinitionValue = eventDefinition(eventName);
      if (asArray(eventDefinitionValue.allowed_parameters).includes("page_location")) payload.page_location = sanitizedLocation();
    }
    if (!callGtag("event", eventName, payload)) return { ok: false, reason: "final_serialization_rejected" };
    registerDedupe(dedupe.key);
    state.sentEventCount += 1;
    state.lastEventName = eventName;
    updateSentinel();
    return { ok: true, eventName, parameters: payload };
  }

  function getStatus() {
    return {
      status: state.status,
      ready: state.status === "ready",
      blockedReasons: state.blockedReasons.slice(),
      scriptLoadCount: state.scriptLoadCount,
      gtagCallCount: state.gtagCallCount,
      sentEventCount: state.sentEventCount,
      lastEventName: state.lastEventName,
      dedupeCacheSize: state.dedupe.size,
      rateLimitKeyCount: state.rateLimit.size,
      rateLimitedCount: state.rateLimitedCount,
      warningCount: state.warnings.length,
      version: VERSION,
    };
  }

  function resetForTests() {
    state = freshState();
    const currentWindow = getWindow();
    if (currentWindow && currentWindow[RUNTIME_KEY]) {
      currentWindow[RUNTIME_KEY] = { version: VERSION, loadCount: 1, status: "idle" };
    }
  }

  function setNowForTests(fn) {
    state.now = fn;
  }

  const publicApi = {
    init,
    trackPageView,
    track,
    getStatus,
  };

  root.MarketObserver = publicApi;
  if (isCommonJs) {
    module.exports = Object.assign({}, publicApi, {
      __resetForTests: resetForTests,
      __setNowForTests: setNowForTests,
      __internals: {
        canonicalStringify,
        sha256,
        sanitizedLocation,
        sanitizedReferrer,
        normalizePath,
        extractSafeCampaign,
        hasGlobalPrivacyControl,
        storedConsentValue,
        VERSION,
        callGtag,
      },
    });
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
