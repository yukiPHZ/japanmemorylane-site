const lane = document.querySelector(".lane");
const tanzakuItems = [...document.querySelectorAll(".tanzaku")];
const currentMemory = document.querySelector("#currentMemory");
const quietMomentInput = document.querySelector("#quietMomentInput");
const journeyEntry = document.querySelector("#journeyEntry");
const journeyCount = document.querySelector("#journeyCount");
const journeyGate = document.querySelector("#journeyGate");
const journeyGateJapanese = document.querySelector("#journeyGateJapanese");
const journeyGateEnglish = document.querySelector("#journeyGateEnglish");
const journeyGateCount = document.querySelector("#journeyGateCount");
const journeyBack = document.querySelector("#journeyBack");
const journeyPick = document.querySelector("#journeyPick");
const journeyStatus = document.querySelector("#journeyStatus");
const sampleJourneyBridge = document.querySelector("#sampleJourneyBridge");
const POEM_REQUEST_TIMEOUT_MS = 16000;
const JOURNEY_GENERATION_DEADLINE_MS = 30000;
const POEM_RETRY_DELAY_MS = 800;
const SAMPLE_BRIDGE_DELAY_MS = 1800;
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const initialTanzakuState = tanzakuItems.map((item) => {
  const image = item.querySelector(".memory-photo img");
  const japanesePoem = item.querySelector(".jp-poem");
  const englishPoem = item.querySelector(".en-poem");

  return {
    className: item.className,
    imageSrc: image?.getAttribute("src") || "",
    imageAlt: image?.getAttribute("alt") || "",
    imageLoading: image?.getAttribute("loading"),
    japaneseHtml: japanesePoem?.innerHTML || "",
    englishHtml: englishPoem?.innerHTML || "",
  };
});

const journeyLimit = 7;
const quietImageExtensions = /\.(jpe?g|png|webp|heic|heif|gif|avif)$/i;
const journeyIntro = {
  japanese: "七つ、\nことばの前へ",
  english: "Seven moments,\nbefore words.",
};
const beforeWords = {
  japanese: ["ことばの前"],
  english: ["before words"],
};
const beforePath = {
  japanese: "\u5de1\u308a\u306e\u524d",
  english: "before the path",
};
const fallbackPoems = [
  ["この一枚\nまだことばの\n前にいる", "Still here,\nbefore words."],
  ["名のないまま\nひとつの景色\nここにある", "Unnamed,\nthe view remains."],
  ["見えたもの\nまだそのまま\nここにいる", "As it appeared,\nit stays."],
  ["ひとつだけ\nことばの外に\n置いておく", "One moment,\noutside words."],
  ["目の前に\nまだ名のない\n景色だけ", "Before a name,\nonly the view."],
  ["写ったまま\nことばを持たず\nここにある", "As it was caught,\nwithout words."],
  ["この景色\nまだ何も言わず\n残っている", "This view\nsays nothing yet."],
];
const getFallbackPoem = (index = 0) => ({
  japanese: fallbackPoems[index % journeyLimit][0].split("\n"),
  english: fallbackPoems[index % journeyLimit][1].split("\n"),
  source: "fallback",
  moodTags: ["fallback"],
});

const journeyState = {
  acceptedFiles: [],
  currentIndex: 0,
  gate: "idle",
  items: [],
  poems: [],
  ready: false,
  requestId: 0,
  arranged: false,
  flowOrder: [],
  lastCardReached: false,
  starShown: false,
  waterShown: false,
  takeOneShown: false,
  isTakingOne: false,
  takeOneCompleted: false,
  keptIndex: null,
  returnJourneyShown: false,
  isReturningJourney: false,
};

let settleTimer;
let journeyBeforeWordsTimer;
let journeyStarTimer;
let journeyWaterTimer;
let takeOneTimer;
let returnJourneyTimer;
let poemRequestTimers = [];
let poemUpdateTimers = [];
let selectedJourneyPhotoUrls = [];
let sampleJourneyBridgeTimer;
let statusMessageTimer;
let generationDeadlineTimer;
let generationController;
let selectionController;
let gateOpener;
let isSelectingFiles = false;
let preparedFiles = [];
const activePoemControllers = new Set();
const effectTimers = new Set();

const later = (callback, delay) => {
  const requestId = journeyState.requestId;
  const timer = window.setTimeout(() => {
    effectTimers.delete(timer);
    if (requestId === journeyState.requestId) callback();
  }, delay);
  effectTimers.add(timer);
  return timer;
};

const abortReason = (stage) => Object.assign(new Error(stage), { stage });

// Race even response-body reads against cancellation, and always remove listeners.
const withAbort = (promise, signal) => new Promise((resolve, reject) => {
  const abort = () => reject(signal.reason || abortReason("cancelled"));
  if (signal.aborted) {
    promise.catch(() => {});
    abort();
    return;
  }
  signal.addEventListener("abort", abort, { once: true });
  promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
});

const waitQuietly = (delay, signal) => new Promise((resolve, reject) => {
  let timer;
  const finish = () => {
    window.clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  };
  const abort = () => { finish(); reject(signal.reason || abortReason("cancelled")); };
  if (signal.aborted) { abort(); return; }
  signal.addEventListener("abort", abort, { once: true });
  timer = window.setTimeout(() => { finish(); resolve(); }, delay);
});

const clearAsyncJourneyWork = () => {
  selectionController?.abort(abortReason("cancelled"));
  generationController?.abort(abortReason("cancelled"));
  activePoemControllers.forEach((controller) => controller.abort(abortReason("cancelled")));
  activePoemControllers.clear();
  window.clearTimeout(generationDeadlineTimer);
  window.clearTimeout(journeyBeforeWordsTimer);
  window.clearTimeout(settleTimer);
  window.clearTimeout(statusMessageTimer);
  effectTimers.forEach((timer) => window.clearTimeout(timer));
  effectTimers.clear();
  isSelectingFiles = false;
  journeyStatus?.classList.remove("is-visible");
  if (journeyStatus) journeyStatus.replaceChildren();
};

const clearSampleJourneyBridge = () => {
  window.clearTimeout(sampleJourneyBridgeTimer);
  sampleJourneyBridgeTimer = undefined;
  sampleJourneyBridge?.classList.remove("is-visible");
  if (sampleJourneyBridge) sampleJourneyBridge.inert = true;
};

const isSampleBridgeEligible = () => !journeyState.ready &&
  journeyState.acceptedFiles.length === 0 && journeyState.currentIndex === 6 &&
  ["idle", "hidden"].includes(journeyState.gate);

const updateSampleJourneyBridge = () => {
  if (!isSampleBridgeEligible()) { clearSampleJourneyBridge(); return; }
  if (sampleJourneyBridgeTimer || sampleJourneyBridge?.classList.contains("is-visible")) return;
  sampleJourneyBridgeTimer = window.setTimeout(() => {
    sampleJourneyBridgeTimer = undefined;
    if (!isSampleBridgeEligible()) return;
    sampleJourneyBridge.inert = false;
    sampleJourneyBridge.classList.add("is-visible");
  }, SAMPLE_BRIDGE_DELAY_MS);
};

const showInvalidPhotoStatus = () => {
  window.clearTimeout(statusMessageTimer);
  journeyStatus.replaceChildren();
  const ja = document.createElement("span");
  ja.lang = "ja";
  ja.textContent = "別の一枚を。";
  const en = document.createElement("small");
  en.textContent = "Choose another moment.";
  journeyStatus.append(ja, en);
  journeyStatus.classList.add("is-visible");
  statusMessageTimer = window.setTimeout(() => {
    journeyStatus.classList.remove("is-visible");
    journeyStatus.replaceChildren();
  }, 3000);
};

const setScreenHeight = () => {
  document.documentElement.style.setProperty(
    "--screen-height",
    `${window.innerHeight}px`,
  );
};

const renderPoemLines = (element, lines) => {
  if (!element) {
    return;
  }

  element.replaceChildren();
  lines.forEach((line, index) => {
    if (index > 0) {
      element.append(document.createElement("br"));
    }

    element.append(document.createTextNode(line));
  });
};

const renderGateText = ({ japanese, english }) => {
  if (journeyGateJapanese) {
    renderPoemLines(journeyGateJapanese, String(japanese).split("\n"));
  }

  if (journeyGateEnglish) {
    renderPoemLines(journeyGateEnglish, String(english).split("\n"));
  }
};

const normalizePoemText = (poem) =>
  String(poem || "")
    .replace(/\r\n/g, "\n")
    .replace(/\\n/g, "\n")
    .trim();

const splitPoemLines = (poem) =>
  normalizePoemText(poem)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

const isPunctuationOnlyLine = (line) =>
  /^[\s\u3000\u3001\u3002\uff0c\uff0e.,。、…!！?？]+$/u.test(
    String(line || ""),
  );

const hasLatinLetters = (line) =>
  /[A-Za-z\uFF21-\uFF3A\uFF41-\uFF5A]/.test(line);
const japaneseLineFallbacks = [
  "\u5c0f\u3055\u306a\u5f71",
  "\u307e\u3060\u305d\u3053\u306b",
  "\u6b8b\u3063\u3066\u3044\u305f",
];

const normalizeJapanesePoemLines = (lines) => {
  const normalizedLines = [];

  lines.forEach((rawLine) => {
    const line = String(rawLine || "").trim();

    if (!line) {
      return;
    }

    if (isPunctuationOnlyLine(line)) {
      if (normalizedLines.length > 0) {
        normalizedLines[normalizedLines.length - 1] = `${
          normalizedLines[normalizedLines.length - 1]
        }${line.replace(/\s+/g, "")}`;
      }
      return;
    }

    normalizedLines.push(
      hasLatinLetters(line)
        ? japaneseLineFallbacks[
            normalizedLines.length % japaneseLineFallbacks.length
          ]
        : line,
    );
  });

  return normalizedLines.slice(0, 3);
};

const normalizeJourneyPoem = (poem) => {
  const japanese = Array.isArray(poem?.japanese)
    ? poem.japanese.map(normalizePoemText).flatMap(splitPoemLines)
    : splitPoemLines(poem?.japanese_poem);
  const english = Array.isArray(poem?.english)
    ? poem.english.map(normalizePoemText).flatMap(splitPoemLines)
    : splitPoemLines(poem?.english_poem);
  const moodTags = Array.isArray(poem?.moodTags)
    ? poem.moodTags
    : Array.isArray(poem?.mood_tags)
      ? poem.mood_tags
      : [];

  if (japanese.length !== 3 || english.length === 0 ||
      japanese.some((line) => [...line].length > 8 || /\p{Script=Latin}/u.test(line) || /^[\p{P}\p{S}\s]+$/u.test(line))) {
    return null;
  }

  const normalizedMoodTags = moodTags
    .map((tag) => String(tag).trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 5);

  if (normalizedMoodTags.length === 0) return null;

  return {
    japanese: japanese.slice(0, 3),
    english: english.slice(0, 2),
    moodTags: normalizedMoodTags,
    source: normalizedMoodTags.includes("fallback") ? "fallback" : "api",
  };
};

const createFallbackJourneyPoems = () =>
  Array.from({ length: journeyLimit }, (_, index) => getFallbackPoem(index));

const createBeforeWordsJourneyPoems = () =>
  Array.from({ length: journeyLimit }, () => ({
    japanese: [...beforeWords.japanese],
    english: [...beforeWords.english],
    source: "before-words",
    moodTags: [],
  }));

const heatMoodWeights = {
  bright: 1,
  busy: 2,
  close: 1,
  colorful: 1,
  crowded: 2,
  dense: 2,
  full: 1,
  energetic: 2,
  festive: 2,
  hot: 1,
  humid: 1,
  loud: 1,
  market: 1,
  movement: 1,
  neon: 1,
  noise: 1,
  people: 2,
  red: 1,
  street: 1,
  summer: 1,
  sun: 1,
  sunlight: 1,
  traffic: 1,
  vivid: 2,
  warm: 1,
};

const calmMoodWeights = {
  calm: 2,
  cold: 1,
  cool: 1,
  dim: 1,
  distant: 1,
  dusk: 1,
  empty: 2,
  evening: 1,
  far: 1,
  hushed: 1,
  low: 1,
  mist: 1,
  muted: 1,
  night: 1,
  quiet: 2,
  rain: 1,
  reflective: 2,
  serene: 2,
  shadow: 1,
  soft: 1,
  sparse: 1,
  still: 2,
  stillness: 2,
  winter: 1,
};

const getMoodWeight = (tag, weights) => {
  const normalizedTag = String(tag || "")
    .trim()
    .toLowerCase();

  if (!normalizedTag) {
    return 0;
  }

  if (Object.prototype.hasOwnProperty.call(weights, normalizedTag)) {
    return weights[normalizedTag];
  }

  return Object.entries(weights).reduce((weight, [keyword, value]) => {
    if (!normalizedTag.includes(keyword)) {
      return weight;
    }

    return Math.max(weight, value);
  }, 0);
};

const getJourneyFlowScore = (item) =>
  (item?.poem?.moodTags || []).reduce(
    (score, tag) =>
      score +
      getMoodWeight(tag, heatMoodWeights) -
      getMoodWeight(tag, calmMoodWeights),
    0,
  );

const orderJourneyItemsByMood = (items) =>
  items
    .map((item, originalOrder) => ({
      flowScore: getJourneyFlowScore(item),
      item,
      originalOrder,
    }))
    .sort((a, b) => {
      if (b.flowScore !== a.flowScore) {
        return b.flowScore - a.flowScore;
      }

      return a.originalOrder - b.originalOrder;
    })
    .map(({ item }) => item);

const clearJourneyStarTimer = () => {
  window.clearTimeout(journeyStarTimer);
  journeyStarTimer = undefined;
};

const clearJourneyWaterTimer = () => {
  window.clearTimeout(journeyWaterTimer);
  journeyWaterTimer = undefined;
};

const clearTakeOneTimer = () => {
  window.clearTimeout(takeOneTimer);
  takeOneTimer = undefined;
};

const clearReturnJourneyTimer = () => {
  window.clearTimeout(returnJourneyTimer);
  returnJourneyTimer = undefined;
};

const removeJourneyStars = () => {
  document
    .querySelectorAll(".journey-star")
    .forEach((star) => star.remove());
};

const removeWaterMemories = () => {
  document
    .querySelectorAll(".water-memory")
    .forEach((memory) => memory.remove());
};

const removeTakeOneActions = () => {
  document
    .querySelectorAll(".take-one-action")
    .forEach((action) => action.remove());
};

const removeReturnJourneyActions = () => {
  document
    .querySelectorAll(".return-journey-action")
    .forEach((action) => action.remove());
};

const resetJourneyStar = () => {
  clearJourneyStarTimer();
  clearJourneyWaterTimer();
  clearTakeOneTimer();
  clearReturnJourneyTimer();
  removeJourneyStars();
  removeWaterMemories();
  removeTakeOneActions();
  removeReturnJourneyActions();
  journeyState.lastCardReached = false;
  journeyState.starShown = false;
  journeyState.waterShown = false;
  journeyState.takeOneShown = false;
  journeyState.isTakingOne = false;
  journeyState.takeOneCompleted = false;
  journeyState.keptIndex = null;
  journeyState.returnJourneyShown = false;
  journeyState.isReturningJourney = false;
};

const getCurrentTanzaku = () =>
  tanzakuItems[journeyState.currentIndex] || findClosestTanzaku().item;

const getPoemLinesFromElement = (element) => {
  if (!element) {
    return [];
  }

  const lines = [];
  let currentLine = "";

  element.childNodes.forEach((node) => {
    if (node.nodeName === "BR") {
      if (currentLine.trim()) {
        lines.push(currentLine.trim());
      }
      currentLine = "";
      return;
    }

    currentLine += node.textContent || "";
  });

  if (currentLine.trim()) {
    lines.push(currentLine.trim());
  }

  return lines;
};

const waitForImage = (image) =>
  new Promise((resolve, reject) => {
    if (!image) {
      reject(new Error("No image found for export"));
      return;
    }

    if (image.complete && image.naturalWidth > 0) {
      resolve(image);
      return;
    }

    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener(
      "error",
      () => reject(new Error("Export image could not be loaded")),
      { once: true },
    );
  });

const drawImageCover = (context, image, x, y, width, height) => {
  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;
  const scale = Math.max(width / imageWidth, height / imageHeight);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (imageWidth - sourceWidth) / 2;
  const sourceY = (imageHeight - sourceHeight) / 2;

  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    x,
    y,
    width,
    height,
  );
};

const drawVerticalPoem = (
  context,
  lines,
  startX,
  startY,
  columnGap,
  letterGap,
) => {
  lines.slice(0, 3).forEach((line, columnIndex) => {
    [...line].forEach((character, characterIndex) => {
      context.fillText(
        character,
        startX - columnIndex * columnGap,
        startY + characterIndex * letterGap,
      );
    });
  });
};

const drawEnglishPoem = (context, lines, x, y, lineHeight) => {
  lines.slice(0, 2).forEach((line, index) => {
    context.fillText(line, x, y + index * lineHeight);
  });
};

const canvasToPngBlob = (canvas) =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Canvas could not create a PNG blob"));
        return;
      }

      resolve(blob);
    }, "image/png");
  });

const getExportDateStamp = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
};

const openBlobInNewTab = (blob) => {
  const url = URL.createObjectURL(blob);
  const openedWindow = window.open(url, "_blank", "noopener");

  if (!openedWindow) {
    URL.revokeObjectURL(url);
    return false;
  }

  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  return true;
};

const isLikelyDesktopDevice = () => {
  const hasFinePointer =
    window.matchMedia && window.matchMedia("(pointer: fine)").matches;
  const hasHover =
    window.matchMedia && window.matchMedia("(hover: hover)").matches;
  const hasCoarsePointer =
    window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  const touchPoints = navigator.maxTouchPoints || 0;
  const viewportWidth =
    window.innerWidth || document.documentElement?.clientWidth || 0;

  return (
    hasFinePointer &&
    hasHover &&
    (viewportWidth >= 768 || !hasCoarsePointer || touchPoints <= 1)
  );
};

const shareOrSaveBlob = async (blob, filename) => {
  if (isLikelyDesktopDevice()) {
    try {
      return downloadBlob(blob, filename);
    } catch (error) {
      console.error("Take-one download failed", error);
      return openBlobInNewTab(blob);
    }
  }

  const file =
    typeof File === "function"
      ? new File([blob], filename, { type: "image/png" })
      : null;
  const canUseWebShare =
    file &&
    navigator.share &&
    (!navigator.canShare || navigator.canShare({ files: [file] }));

  if (canUseWebShare) {
    try {
      await navigator.share({
        files: [file],
        title: "Japan Memory Lane",
      });
      return true;
    } catch (error) {
      if (error?.name === "AbortError" || error?.name === "NotAllowedError") {
        return false;
      }
    }
  }

  try {
    return downloadBlob(blob, filename);
  } catch (error) {
    console.error("Take-one download failed", error);
    return openBlobInNewTab(blob);
  }
};

const createCurrentTanzakuCanvas = async () => {
  const item = getCurrentTanzaku();
  const image = item?.querySelector(".memory-photo img");
  const japanesePoem = item?.querySelector(".jp-poem");
  const englishPoem = item?.querySelector(".en-poem");
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!item || !image || !japanesePoem || !englishPoem || !context) {
    throw new Error("Current tanzaku could not be exported");
  }

  await waitForImage(image);

  const canvasW = 1080;
  const canvasH = 1920;
  const photoX = 132;
  const photoY = 275;
  const photoW = 390;
  const photoH = 488;
  const jpX = 835;
  const jpY = 700;
  const jpFontSize = 70;
  const jpColumnGap = 120;
  const jpLetterGap = 78;
  const enX = photoX;
  const enY = 1348;
  const enFontSize = 29;
  const enLineHeight = 44;

  canvas.width = canvasW;
  canvas.height = canvasH;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  context.fillStyle = "#f6f4ef";
  context.fillRect(0, 0, canvasW, canvasH);

  drawImageCover(context, image, photoX, photoY, photoW, photoH);

  context.fillStyle = "rgba(31, 31, 31, 0.96)";
  context.font =
    `${jpFontSize}px "Shippori Mincho", "Noto Serif JP", "Yu Mincho", serif`;
  context.textBaseline = "top";
  drawVerticalPoem(
    context,
    getPoemLinesFromElement(japanesePoem),
    jpX,
    jpY,
    jpColumnGap,
    jpLetterGap,
  );

  context.fillStyle = "rgba(31, 31, 31, 0.42)";
  context.font = `${enFontSize}px Inter, Manrope, "Segoe UI", sans-serif`;
  drawEnglishPoem(
    context,
    getPoemLinesFromElement(englishPoem),
    enX,
    enY,
    enLineHeight,
  );

  return canvas;
};

const exportCurrentTanzaku = async () => {
  try {
    const canvas = await createCurrentTanzakuCanvas();
    const blob = await canvasToPngBlob(canvas);
    const filename = `japan-memory-lane-${getExportDateStamp()}.png`;
    return await shareOrSaveBlob(blob, filename);
  } catch (error) {
    console.error("Take-one export failed", error);
    return false;
  }
};

const showTakeOneAction = () => {
  if (journeyState.takeOneShown || journeyState.takeOneCompleted) {
    return;
  }

  journeyState.takeOneShown = true;

  const action = document.createElement("button");
  action.className = "take-one-action";
  action.type = "button";
  action.textContent = "\u4e00\u679a\u3060\u3051";
  action.setAttribute("aria-label", "take one");

  action.addEventListener("click", async () => {
    if (journeyState.isTakingOne || journeyState.takeOneCompleted) {
      return;
    }

    journeyState.isTakingOne = true;
    const requestId = journeyState.requestId;
    const keptIndex = journeyState.currentIndex;
    action.disabled = true;
    action.classList.add("is-taking-one");

    const completed = await exportCurrentTanzaku();
    if (requestId !== journeyState.requestId) return;

    journeyState.isTakingOne = false;

    if (completed) {
      journeyState.takeOneCompleted = true;
      journeyState.keptIndex = keptIndex;
      action.classList.remove("is-taking-one");
      action.classList.add("is-taken");
      later(() => action.remove(), 520);
      scheduleReturnJourneyAction();
      return;
    }

    action.disabled = false;
    action.classList.remove("is-taking-one");
  });

  document.body.append(action);
};

const scheduleTakeOneAction = () => {
  if (
    !journeyState.ready ||
    !journeyState.lastCardReached ||
    journeyState.takeOneShown
  ) {
    return;
  }

  clearTakeOneTimer();
  takeOneTimer = window.setTimeout(() => {
    takeOneTimer = undefined;
    showTakeOneAction();
  }, reducedMotion() ? 200 : 1400);
};

const restoreInitialTanzakuContent = () => {
  tanzakuItems.forEach((item, index) => {
    const initialState = initialTanzakuState[index];
    const image = item.querySelector(".memory-photo img");
    const japanesePoem = item.querySelector(".jp-poem");
    const englishPoem = item.querySelector(".en-poem");

    if (!initialState) {
      return;
    }

    item.className = initialState.className;

    if (image) {
      image.src = initialState.imageSrc;
      image.alt = initialState.imageAlt;

      if (initialState.imageLoading) {
        image.setAttribute("loading", initialState.imageLoading);
      } else {
        image.removeAttribute("loading");
      }
    }

    if (japanesePoem) {
      japanesePoem.innerHTML = initialState.japaneseHtml;
    }

    if (englishPoem) {
      englishPoem.innerHTML = initialState.englishHtml;
    }
  });
};

const resetJourneyToStart = () => {
  journeyState.requestId += 1;
  clearAsyncJourneyWork();
  clearSampleJourneyBridge();
  preparedFiles = [];
  clearJourneyStarTimer();
  clearJourneyWaterTimer();
  clearTakeOneTimer();
  clearReturnJourneyTimer();
  clearPoemRequestTimers();
  clearPoemUpdateTimers();
  clearJourneyPhotoUrls();
  removeJourneyStars();
  removeWaterMemories();
  removeTakeOneActions();
  removeReturnJourneyActions();

  journeyState.acceptedFiles = [];
  journeyState.currentIndex = 0;
  journeyState.gate = "idle";
  journeyState.items = [];
  journeyState.poems = [];
  journeyState.ready = false;
  journeyState.arranged = false;
  journeyState.flowOrder = [];
  journeyState.lastCardReached = false;
  journeyState.starShown = false;
  journeyState.waterShown = false;
  journeyState.takeOneShown = false;
  journeyState.isTakingOne = false;
  journeyState.takeOneCompleted = false;
  journeyState.keptIndex = null;
  journeyState.returnJourneyShown = false;
  journeyState.isReturningJourney = false;

  document.body.classList.remove(
    "has-journey",
    "is-choosing-journey",
    "is-entering-lane",
    "is-preparing-journey",
    "is-returning-journey",
  );
  journeyGate?.classList.remove("is-before-words", "is-preparing-path");
  journeyGate?.setAttribute("aria-hidden", "true");
  if (journeyGate) journeyGate.inert = true;
  if (lane) lane.inert = false;

  restoreInitialTanzakuContent();
  setGateIntro();
  setJourneyCount(0);

  if (quietMomentInput) {
    quietMomentInput.value = "";
  }

  if (lane) {
    lane.scrollTo({ top: 0, behavior: "auto" });
  }

  setCurrentTanzaku(tanzakuItems[0]);
  markTanzakuSeen(tanzakuItems[0]);
};

const cancelJourneyGate = () => {
  if (!["selecting", "preparing"].includes(journeyState.gate)) return;
  const opener = gateOpener;
  const fromBridge = opener === sampleJourneyBridge;
  resetJourneyToStart();
  if (fromBridge) {
    lane.scrollTo({ top: tanzakuItems[6].offsetTop - tanzakuItems[0].offsetTop, behavior: "instant" });
    setCurrentTanzaku(tanzakuItems[6]);
    clearSampleJourneyBridge();
    sampleJourneyBridge.inert = false;
    sampleJourneyBridge.classList.add("is-visible");
  }
  (opener || journeyEntry)?.focus({ preventScroll: true });
};

const showReturnWaterMemory = (onFinish) => {
  removeWaterMemories();

  const memory = document.createElement("span");
  memory.className = "water-memory";
  memory.setAttribute("aria-hidden", "true");

  let finished = false;
  const requestId = journeyState.requestId;
  const finishWaterMemory = () => {
    if (finished || requestId !== journeyState.requestId) return;
    finished = true;
    window.clearTimeout(removeTimer);
    memory.remove();
    onFinish?.();
  };

  const removeTimer = later(finishWaterMemory, reducedMotion() ? 350 : 4400);

  memory.addEventListener("animationend", finishWaterMemory, {
    once: true,
  });

  document.body.append(memory);
};

const returnJourneyToWater = () => {
  if (journeyState.isReturningJourney) {
    return;
  }

  journeyState.isReturningJourney = true;
  clearReturnJourneyTimer();
  document.body.classList.add("is-returning-journey");

  const currentTanzaku = tanzakuItems[journeyState.keptIndex] || getCurrentTanzaku();
  tanzakuItems.forEach((item) => {
    item.classList.toggle("is-returning-away", item !== currentTanzaku);
  });

  later(removeReturnJourneyActions, reducedMotion() ? 150 : 900);
  later(() => {
    showReturnWaterMemory(resetJourneyToStart);
  }, reducedMotion() ? 220 : 1700);
};

const showReturnJourneyAction = () => {
  if (
    !journeyState.ready ||
    !journeyState.takeOneCompleted ||
    journeyState.returnJourneyShown ||
    journeyState.isReturningJourney
  ) {
    return;
  }

  journeyState.returnJourneyShown = true;

  const action = document.createElement("button");
  action.className = "return-journey-action";
  action.type = "button";
  action.setAttribute("aria-label", "Return to another journey.");

  const japanese = document.createElement("span");
  japanese.className = "return-journey-ja";
  japanese.lang = "ja";
  japanese.textContent = "\u9084\u3059";

  const english = document.createElement("span");
  english.className = "return-journey-en";
  english.textContent = "Return to another journey.";

  action.append(japanese, english);
  action.addEventListener("click", returnJourneyToWater);
  document.body.append(action);
};

const scheduleReturnJourneyAction = () => {
  if (
    !journeyState.ready ||
    !journeyState.takeOneCompleted ||
    journeyState.returnJourneyShown ||
    journeyState.isReturningJourney
  ) {
    return;
  }

  clearReturnJourneyTimer();
  returnJourneyTimer = window.setTimeout(() => {
    returnJourneyTimer = undefined;
    showReturnJourneyAction();
  }, 15000);
};

const showWaterMemory = () => {
  if (!journeyState.ready || journeyState.waterShown) {
    return;
  }

  journeyState.waterShown = true;

  const memory = document.createElement("span");
  memory.className = "water-memory";
  memory.setAttribute("aria-hidden", "true");

  let finished = false;
  const requestId = journeyState.requestId;
  const finishWaterMemory = () => {
    if (finished || requestId !== journeyState.requestId) return;
    finished = true;
    window.clearTimeout(removeTimer);
    memory.remove();
    scheduleTakeOneAction();
  };

  const removeTimer = later(finishWaterMemory, reducedMotion() ? 350 : 4400);

  memory.addEventListener("animationend", finishWaterMemory, {
    once: true,
  });

  document.body.append(memory);
};

const showJourneyStar = () => {
  if (!journeyState.ready || journeyState.starShown) {
    return;
  }

  journeyState.starShown = true;

  const star = document.createElement("span");
  star.className = "journey-star";
  star.setAttribute("aria-hidden", "true");

  const removeTimer = later(() => star.remove(), reducedMotion() ? 350 : 2400);

  star.addEventListener("animationend", () => {
    window.clearTimeout(removeTimer);
    star.remove();
  }, {
    once: true,
  });

  document.body.append(star);

  clearJourneyWaterTimer();
  journeyWaterTimer = window.setTimeout(() => {
    journeyWaterTimer = undefined;
    showWaterMemory();
  }, reducedMotion() ? 300 : 1450);
};

const updateJourneyStarState = () => {
  if (!journeyState.ready || journeyState.starShown) {
    clearJourneyStarTimer();
    return;
  }

  if (journeyState.currentIndex !== journeyLimit - 1) {
    clearJourneyStarTimer();
    return;
  }

  journeyState.lastCardReached = true;

  if (journeyStarTimer) {
    return;
  }

  journeyStarTimer = window.setTimeout(() => {
    journeyStarTimer = undefined;

    if (
      journeyState.ready &&
      journeyState.currentIndex === journeyLimit - 1
    ) {
      showJourneyStar();
    }
  }, 2100);
};

const findClosestTanzaku = () => {
  const laneTop = lane.getBoundingClientRect().top;
  return tanzakuItems.reduce(
    (closest, item) => {
      const distance = Math.abs(item.getBoundingClientRect().top - laneTop);

      if (distance < closest.distance) {
        return { distance, item };
      }

      return closest;
    },
    { distance: Number.POSITIVE_INFINITY, item: tanzakuItems[0] },
  );
};

const setCurrentTanzaku = (item) => {
  if (!item || !currentMemory) {
    return;
  }

  journeyState.currentIndex = Number(item.dataset.index || 1) - 1;
  currentMemory.textContent = item.dataset.index;
  tanzakuItems.forEach((tanzaku) => {
    tanzaku.classList.toggle("is-current", tanzaku === item);
  });

  updateJourneyStarState();
  updateSampleJourneyBridge();
};

const markTanzakuSeen = (item) => {
  if (!item || item.classList.contains("has-been-seen")) {
    return;
  }

  item.classList.add("has-been-seen");
};

const activateFirstCard = () => {
  const firstCard = tanzakuItems[0];

  if (!firstCard) {
    return;
  }

  setCurrentTanzaku(firstCard);
  markTanzakuSeen(firstCard);

};

const updateAfterSettle = () => {
  if (!lane || tanzakuItems.length === 0) {
    return;
  }

  const { item } = findClosestTanzaku();
  setCurrentTanzaku(item);
  markTanzakuSeen(item);
};

const queueSettleUpdate = () => {
  window.clearTimeout(settleTimer);
  settleTimer = window.setTimeout(updateAfterSettle, 180);
};

const isQuietImageFile = (file) => {
  if (!file) {
    return false;
  }

  const fileType = typeof file.type === "string" ? file.type : "";
  return fileType.startsWith("image/") || quietImageExtensions.test(file.name);
};

const setJourneyCount = (count) => {
  const safeCount = Math.min(count, journeyLimit);
  const nextText = `${safeCount} / ${journeyLimit}`;

  if (journeyCount) {
    journeyCount.textContent = nextText;
  }

  if (journeyGateCount) {
    journeyGateCount.textContent = String(safeCount);
  }
};

const readPoemErrorJson = async (response) => {
  try {
    return await response.json();
  } catch {
    return {
      error: "poem_request_failed",
      status: response.status,
    };
  }
};

const getCompressedImageName = (file) => {
  const baseName = String(file?.name || "compressed")
    .replace(/\.[^.]+$/, "")
    .trim();
  return `${baseName || "compressed"}.jpg`;
};

const loadImageForCompression = (file, signal) =>
  new Promise((resolve, reject) => {
    const imageUrl = URL.createObjectURL(file);
    const image = new Image();
    const cleanup = () => {
      window.clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      image.onload = null;
      image.onerror = null;
      URL.revokeObjectURL(imageUrl);
    };
    const abort = () => {
      cleanup();
      image.src = "";
      reject(signal.reason || abortReason("invalid_image"));
    };
    const timer = window.setTimeout(abort, 12000);
    if (signal.aborted) { abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
    image.onload = () => {
      cleanup();
      resolve(image);
    };

    image.onerror = () => {
      cleanup();
      reject(abortReason("invalid_image"));
    };

    image.decoding = "async";
    image.src = imageUrl;
  });

const canvasToJpegBlob = (canvas, quality) =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Canvas could not create a JPEG blob"));
          return;
        }

        resolve(blob);
      },
      "image/jpeg",
      quality,
    );
  });

const createCompressedImageFile = async (file, image, signal) => {
  const canvas = document.createElement("canvas");
  const compressionController = new AbortController();
  const cancel = () => compressionController.abort(signal.reason);
  signal.addEventListener("abort", cancel, { once: true });
  const timeout = window.setTimeout(() => compressionController.abort(abortReason("compression_timeout")), 12000);
  try {
    if (signal.aborted) throw signal.reason;
    const maxSide = 1280;
    const originalWidth = image.naturalWidth || image.width;
    const originalHeight = image.naturalHeight || image.height;

    if (!originalWidth || !originalHeight) {
      throw new Error("Image dimensions were unavailable");
    }

    const scale = Math.min(1, maxSide / Math.max(originalWidth, originalHeight));
    const width = Math.max(1, Math.round(originalWidth * scale));
    const height = Math.max(1, Math.round(originalHeight * scale));
    const context = canvas.getContext("2d", {
      alpha: false,
    });

    if (!context) {
      throw new Error("Canvas context was unavailable");
    }

    canvas.width = width;
    canvas.height = height;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, width, height);

    const targetBytes = 1024 * 1024;
    let blob = await withAbort(canvasToJpegBlob(canvas, 0.72), compressionController.signal);

    if (blob.size > targetBytes) {
      blob = await withAbort(canvasToJpegBlob(canvas, 0.66), compressionController.signal);
    }

    if (blob.size > targetBytes) {
      blob = await withAbort(canvasToJpegBlob(canvas, 0.6), compressionController.signal);
    }

    const compressedFile =
      typeof File === "function"
        ? new File([blob], getCompressedImageName(file), {
            type: "image/jpeg",
            lastModified: Date.now(),
          })
        : blob;

    return compressedFile;
  } finally {
    window.clearTimeout(timeout);
    signal.removeEventListener("abort", cancel);
    image.src = "";
    canvas.width = canvas.height = 0;
  }
};

const requestPoemForCard = async (file, signal) => {
  const formData = new FormData();
  formData.append("image", file, "moment.jpg");

  const response = await withAbort(fetch("/api/poem", {
    method: "POST",
    body: formData,
    signal,
  }), signal);

  if (!response.ok) {
    const errorJson = await withAbort(readPoemErrorJson(response), signal);
    const error = new Error(`Poem request failed with ${response.status}`);
    error.status = response.status;
    error.diagnosticStatus = Number(errorJson?.status) || response.status;
    error.stage = typeof errorJson?.stage === "string" ? errorJson.stage : "openai_request";
    throw error;
  }

  let responseJson;
  try {
    responseJson = await withAbort(response.json(), signal);
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    throw abortReason("schema_validation");
  }
  const poem = normalizeJourneyPoem(responseJson);

  if (!poem) {
    throw abortReason("schema_validation");
  }

  return poem;
};

const canRetryPoem = (error) => {
  if (["invalid_image", "schema_validation", "openai_response_parse", "missing_api_key", "cancelled", "deadline"].includes(error?.stage)) return false;
  if (error?.status >= 400 && error.status < 500 && error.status !== 429) return false;
  const status = error?.diagnosticStatus || error?.status;
  if (status) return status === 429 || (status >= 500 && status <= 599);
  return error instanceof TypeError || error?.stage === "request_timeout";
};

const generateCardPoem = async (item, signal, deadlineAt) => {
  if (!item.optimizedFile) return getFallbackPoem(item.originalIndex);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (signal.aborted || Date.now() >= deadlineAt) throw abortReason("deadline");
    const controller = new AbortController();
    const abort = () => controller.abort(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    activePoemControllers.add(controller);
    const timer = window.setTimeout(() => controller.abort(abortReason("request_timeout")), POEM_REQUEST_TIMEOUT_MS);
    let failure;
    try {
      return await requestPoemForCard(item.optimizedFile, controller.signal);
    } catch (error) {
      failure = error;
    } finally {
      window.clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      activePoemControllers.delete(controller);
    }
    if (signal.aborted) throw signal.reason;
    if (attempt === 0 && canRetryPoem(failure) && deadlineAt - Date.now() > POEM_RETRY_DELAY_MS + 3000) {
      await waitQuietly(POEM_RETRY_DELAY_MS, signal);
      continue;
    }
    console.error("Poem unavailable", { index: item.originalIndex, status: failure?.diagnosticStatus || failure?.status || null });
    return getFallbackPoem(item.originalIndex);
  }
};

const waitForBeforeWordsPaint = (signal) => new Promise((resolve, reject) => {
  let frame;
  let timer;
  const cleanup = () => {
    window.clearTimeout(timer);
    window.cancelAnimationFrame(frame);
    signal.removeEventListener("abort", abort);
  };
  const finish = () => { cleanup(); resolve(); };
  const abort = () => { cleanup(); reject(signal.reason); };
  if (signal.aborted) { abort(); return; }
  signal.addEventListener("abort", abort, { once: true });
  // Resolve even when rAF is suspended, and cancel both paths on Back.
  timer = window.setTimeout(finish, reducedMotion() ? 100 : 520);
  frame = window.requestAnimationFrame(() => {
    window.clearTimeout(timer);
    timer = window.setTimeout(finish, reducedMotion() ? 50 : 420);
  });
});

const setGateIntro = () => {
  journeyGate?.classList.remove("is-before-words", "is-preparing-path");
  renderGateText(journeyIntro);
};

const showJourneyGate = () => {
  if (journeyState.ready || journeyState.gate === "preparing") {
    return;
  }

  if (journeyState.gate !== "before-words") {
    setGateIntro();
  }

  journeyState.gate = "selecting";
  clearSampleJourneyBridge();
  lane.inert = true;
  journeyGate.inert = false;
  journeyPick.disabled = false;
  document.body.classList.add("is-choosing-journey");
  journeyGate?.setAttribute("aria-hidden", "false");
  setJourneyCount(journeyState.acceptedFiles.length);
};

const showPreparingGate = () => {
  journeyState.gate = "preparing";
  journeyPick.disabled = true;
  journeyBack?.focus({ preventScroll: true });
  journeyGate?.classList.add("is-before-words", "is-preparing-path");
  renderGateText(beforePath);
  document.body.classList.remove("is-choosing-journey");
  document.body.classList.add("is-entering-lane", "is-preparing-journey");
  journeyGate?.setAttribute("aria-hidden", "false");
  setJourneyCount(journeyLimit);
};

const hideJourneyGate = () => {
  journeyGate.inert = true;
  lane.inert = false;
  document.body.classList.remove(
    "is-choosing-journey",
    "is-entering-lane",
    "is-preparing-journey",
  );
  journeyGate?.classList.remove("is-before-words", "is-preparing-path");
  journeyGate?.setAttribute("aria-hidden", "true");
  journeyState.gate = "hidden";
};

const clearJourneyPhotoUrls = () => {
  selectedJourneyPhotoUrls.forEach((url) => URL.revokeObjectURL(url));
  selectedJourneyPhotoUrls = [];
};

const clearPoemRequestTimers = () => {
  poemRequestTimers.forEach((timer) => window.clearTimeout(timer));
  poemRequestTimers = [];
};

const clearPoemUpdateTimers = () => {
  poemUpdateTimers.forEach((timer) => window.clearTimeout(timer));
  poemUpdateTimers = [];
};

const resetTanzakuReveal = () => {
  tanzakuItems.forEach((item) => {
    item.classList.remove(
      "has-been-seen",
      "is-current",
      "is-poem-waiting",
      "is-poem-loading",
      "is-poem-updating",
      "is-returning-away",
      "show-japanese-poem",
      "show-english-poem",
    );
  });
};

const renderJourneyItem = (index, journeyItem) => {
  const item = tanzakuItems[index];
  const image = item?.querySelector(".memory-photo img");
  const japanesePoem = item?.querySelector(".jp-poem");
  const englishPoem = item?.querySelector(".en-poem");
  const nextPoem = journeyItem?.poem || getFallbackPoem(index);

  if (!item || !image || !japanesePoem || !englishPoem) {
    return;
  }

  if (journeyItem?.photoUrl) {
    image.src = journeyItem.photoUrl;
    image.alt = `A quiet moment ${
      (journeyItem.originalIndex ?? index) + 1
    } selected for Japan Memory Lane`;
    image.loading = index === 0 ? "eager" : "lazy";
  }

  renderPoemLines(japanesePoem, nextPoem.japanese);
  renderPoemLines(englishPoem, nextPoem.english);
  item.classList.remove("is-poem-updating");
};

const arrangeJourneyIfReady = () => {
  if (journeyState.arranged) {
    return;
  }

  const journeyItems = journeyState.items.slice(0, journeyLimit);

  if (
    journeyItems.length < journeyLimit ||
    journeyItems.some((item) => !item?.settled)
  ) {
    return;
  }

  const orderedItems = orderJourneyItemsByMood(journeyItems);
  journeyState.arranged = true;
  journeyState.flowOrder = orderedItems.map((item) => item.originalIndex);
};

const updateJourneyCardPoem = (index, poem) => {
  const item = tanzakuItems[index];
  const japanesePoem = item?.querySelector(".jp-poem");
  const englishPoem = item?.querySelector(".en-poem");
  const nextPoem = poem || getFallbackPoem(index);

  if (!item || !japanesePoem || !englishPoem) {
    return;
  }

  item.classList.add("is-poem-updating");

  const timer = window.setTimeout(() => {
    renderPoemLines(japanesePoem, nextPoem.japanese);
    renderPoemLines(englishPoem, nextPoem.english);
    item.classList.remove("is-poem-updating");
  }, 360);

  poemUpdateTimers.push(timer);
};

const createJourneyCards = (
  poems = journeyState.poems,
  flowOrder = journeyState.flowOrder,
) => {
  const journeyFiles = journeyState.acceptedFiles.slice(0, journeyLimit);
  const displayOrder =
    Array.isArray(flowOrder) && flowOrder.length === journeyLimit
      ? flowOrder
      : journeyFiles.map((_, index) => index);
  const journeyPoems =
    poems.length > 0 ? poems : createBeforeWordsJourneyPoems();

  clearPoemRequestTimers();
  clearPoemUpdateTimers();
  clearJourneyPhotoUrls();
  resetJourneyStar();
  resetTanzakuReveal();
  const preparedItems = journeyState.items;
  journeyState.items = [];
  journeyState.arranged = displayOrder.length === journeyLimit;
  journeyState.flowOrder = [...displayOrder];

  displayOrder.forEach((sourceIndex, index) => {
    const prepared = preparedItems[sourceIndex];
    const file = prepared?.displayFile || journeyFiles[sourceIndex];

    if (!file) {
      return;
    }

    const photoUrl = URL.createObjectURL(file);
    selectedJourneyPhotoUrls.push(photoUrl);
    const poem = journeyPoems[sourceIndex] || getFallbackPoem(sourceIndex);
    const journeyItem = {
      ...prepared,
      file,
      originalIndex: sourceIndex,
      photoUrl,
      poem,
      settled: true,
    };

    journeyState.items[index] = journeyItem;
    renderJourneyItem(index, journeyItem);
  });

  journeyState.ready = true;
  document.body.classList.add("has-journey");
  hideJourneyGate();
  setJourneyCount(journeyLimit);

  if (lane) {
    lane.scrollTo({ top: 0, behavior: "auto" });
  }

  activateFirstCard();
  lane.focus({ preventScroll: true });
};

const startJourneyPoemRequest = async (requestId, controller) => {
  const { signal } = controller;
  const deadlineAt = Date.now() + JOURNEY_GENERATION_DEADLINE_MS;
  generationDeadlineTimer = window.setTimeout(() => controller.abort(abortReason("deadline")), JOURNEY_GENERATION_DEADLINE_MS);
  const items = journeyState.items.slice();
  try {
    await Promise.all(items.map(async (item, index) => {
      let poem = getFallbackPoem(index);
      try {
        await waitQuietly(index * 1500, signal);
        poem = await generateCardPoem(item, signal, deadlineAt);
      } catch {
        // Cancellation and the deadline settle each card independently.
      }
      if (requestId !== journeyState.requestId) return;
      item.poem = poem;
      item.settled = true;
      journeyState.poems[index] = poem;
    }));
    if (requestId !== journeyState.requestId) return null;
    arrangeJourneyIfReady();
    return journeyState.poems;
  } finally {
    if (generationController === controller) {
      window.clearTimeout(generationDeadlineTimer);
      generationController = undefined;
    }
  }
};

const prepareJourneyItems = () => {
  journeyState.poems = createFallbackJourneyPoems();
  journeyState.items = journeyState.acceptedFiles
    .slice(0, journeyLimit)
    .map((file, index) => ({
      file,
      displayFile: preparedFiles[index]?.displayFile || file,
      optimizedFile: preparedFiles[index]?.optimizedFile || null,
      originalIndex: index,
      poem: journeyState.poems[index],
      settled: false,
    }));
  journeyState.arranged = false;
  journeyState.flowOrder = [];
};

const enterJourneyWhenReady = () => {
  if (journeyState.ready || journeyState.acceptedFiles.length < journeyLimit) {
    return;
  }

  if (journeyState.gate === "preparing") {
    return;
  }

  const requestId = journeyState.requestId + 1;
  journeyState.requestId = requestId;
  journeyState.gate = "preparing";
  const controller = new AbortController();
  generationController = controller;

  window.clearTimeout(journeyBeforeWordsTimer);

  journeyBeforeWordsTimer = window.setTimeout(async () => {
    if (requestId !== journeyState.requestId) return;
    showPreparingGate();
    try {
      await waitForBeforeWordsPaint(controller.signal);
    } catch {
      return;
    }

    if (requestId !== journeyState.requestId) {
      return;
    }

    prepareJourneyItems();
    await startJourneyPoemRequest(requestId, controller);

    if (requestId !== journeyState.requestId) {
      return;
    }

    createJourneyCards(journeyState.poems, journeyState.flowOrder);
  }, 260);
};

const acceptSelectedFiles = async (selectedFiles, signal, requestId) => {
  for (const file of selectedFiles) {
    if (signal.aborted || requestId !== journeyState.requestId || journeyState.acceptedFiles.length === journeyLimit) break;
    let image;
    try {
      if (!isQuietImageFile(file)) throw abortReason("invalid_image");
      image = await loadImageForCompression(file, signal);
      if (!image.naturalWidth || !image.naturalHeight) throw abortReason("invalid_image");
    } catch {
      if (signal.aborted) break;
      showInvalidPhotoStatus();
      continue;
    }
    let optimizedFile = null;
    try {
      optimizedFile = await createCompressedImageFile(file, image, signal);
    } catch {
      // A decoded original remains displayable if JPEG encoding alone failed.
    }
    if (signal.aborted || requestId !== journeyState.requestId) break;
    const displayFile = optimizedFile || file;
    preparedFiles.push({ displayFile, optimizedFile });
    journeyState.acceptedFiles.push(displayFile);
    setJourneyCount(journeyState.acceptedFiles.length);
  }
};

const handleJourneySelection = async (files) => {
  if (journeyState.ready || journeyState.gate === "preparing" || isSelectingFiles) {
    return;
  }

  showJourneyGate();
  isSelectingFiles = true;
  journeyPick.disabled = true;
  const controller = new AbortController();
  selectionController = controller;
  const requestId = journeyState.requestId;
  try {
    await acceptSelectedFiles([...files], controller.signal, requestId);
  } finally {
    if (selectionController === controller) {
      isSelectingFiles = false;
      journeyPick.disabled = false;
    }
  }
  if (controller.signal.aborted || requestId !== journeyState.requestId) return;

  if (journeyState.acceptedFiles.length < journeyLimit) {
    return;
  }

  enterJourneyWhenReady();
};

document.body.classList.add("js-ready");

setGateIntro();
setScreenHeight();
updateAfterSettle();
setJourneyCount(0);

if ("IntersectionObserver" in window && lane) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.72) {
          return;
        }

        const item = entry.target;
        setCurrentTanzaku(item);
        markTanzakuSeen(item);
      });
    },
    {
      root: lane,
      threshold: [0.72],
    },
  );

  tanzakuItems.forEach((item) => observer.observe(item));
}

window.addEventListener("resize", () => {
  setScreenHeight();
  updateAfterSettle();
});

if (lane) {
  lane.addEventListener("scroll", queueSettleUpdate, { passive: true });
}

const openJourneyPicker = (opener) => {
  if (journeyState.ready || journeyState.gate === "preparing" || isSelectingFiles) return;
  if (["idle", "hidden"].includes(journeyState.gate)) gateOpener = opener;
  showJourneyGate();
  journeyPick.focus({ preventScroll: true });
  quietMomentInput?.click();
};

journeyEntry?.addEventListener("click", () => openJourneyPicker(journeyEntry));
sampleJourneyBridge?.addEventListener("click", () => openJourneyPicker(sampleJourneyBridge));
journeyBack?.addEventListener("click", cancelJourneyGate);
journeyPick?.addEventListener("click", () => openJourneyPicker(gateOpener));

journeyGate?.addEventListener("click", (event) => {
  if (event.target.closest("button, a, input")) return;
  if (!journeyState.ready && journeyState.gate === "selecting") {
    openJourneyPicker(gateOpener);
  }
});

document.addEventListener("keydown", (event) => {
  if (!["selecting", "preparing"].includes(journeyState.gate)) return;
  if (event.key === "Escape") {
    event.preventDefault();
    cancelJourneyGate();
  }
  if (event.key === "Tab") {
    const controls = [...journeyGate.querySelectorAll("button:not(:disabled), a[href]")];
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});

quietMomentInput?.addEventListener("cancel", () => {
  if (journeyState.gate === "selecting") journeyPick.focus({ preventScroll: true });
});

quietMomentInput?.addEventListener("change", () => {
  handleJourneySelection(quietMomentInput.files || []);
  quietMomentInput.value = "";
});

window.addEventListener("beforeunload", () => {
  journeyState.requestId += 1;
  clearAsyncJourneyWork();
  clearSampleJourneyBridge();
  window.clearTimeout(settleTimer);
  window.clearTimeout(journeyBeforeWordsTimer);
  clearJourneyStarTimer();
  clearJourneyWaterTimer();
  clearTakeOneTimer();
  clearReturnJourneyTimer();
  removeJourneyStars();
  removeWaterMemories();
  removeTakeOneActions();
  removeReturnJourneyActions();
  clearPoemRequestTimers();
  clearPoemUpdateTimers();
  clearJourneyPhotoUrls();
});
