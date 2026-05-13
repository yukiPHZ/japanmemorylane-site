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
const fallbackPoem = {
  japanese: ["……"],
  english: ["……"],
  source: "fallback",
  moodTags: [],
};

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
};

let settleTimer;
let journeyBeforeWordsTimer;
let journeyStarTimer;
let journeyWaterTimer;
let takeOneTimer;
let poemRequestTimers = [];
let poemUpdateTimers = [];
let selectedJourneyPhotoUrls = [];

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
  const japanese = normalizeJapanesePoemLines(Array.isArray(poem?.japanese)
    ? poem.japanese.map(normalizePoemText).flatMap(splitPoemLines)
    : splitPoemLines(poem?.japanese_poem));
  const english = Array.isArray(poem?.english)
    ? poem.english.map(normalizePoemText).flatMap(splitPoemLines)
    : splitPoemLines(poem?.english_poem);
  const moodTags = Array.isArray(poem?.moodTags)
    ? poem.moodTags
    : Array.isArray(poem?.mood_tags)
      ? poem.mood_tags
      : [];

  if (japanese.length === 0 || english.length === 0) {
    return null;
  }

  const normalizedMoodTags = moodTags
    .map((tag) => String(tag).trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 5);

  return {
    japanese: japanese.slice(0, 3),
    english: english.slice(0, 2),
    moodTags: normalizedMoodTags,
    source: normalizedMoodTags.includes("fallback") ? "fallback" : "api",
  };
};

const createFallbackJourneyPoems = () =>
  Array.from({ length: journeyLimit }, () => ({ ...fallbackPoem }));

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

const resetJourneyStar = () => {
  clearJourneyStarTimer();
  clearJourneyWaterTimer();
  clearTakeOneTimer();
  removeJourneyStars();
  removeWaterMemories();
  removeTakeOneActions();
  journeyState.lastCardReached = false;
  journeyState.starShown = false;
  journeyState.waterShown = false;
  journeyState.takeOneShown = false;
  journeyState.isTakingOne = false;
  journeyState.takeOneCompleted = false;
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
  const jpY = 800;
  const jpFontSize = 70;
  const jpColumnGap = 100;
  const jpLetterGap = 69;
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
    action.disabled = true;
    action.classList.add("is-taking-one");

    const completed = await exportCurrentTanzaku();

    journeyState.isTakingOne = false;

    if (completed) {
      journeyState.takeOneCompleted = true;
      action.classList.remove("is-taking-one");
      action.classList.add("is-taken");
      window.setTimeout(() => action.remove(), 520);
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
  }, 1400);
};

const showWaterMemory = () => {
  if (journeyState.waterShown) {
    return;
  }

  journeyState.waterShown = true;

  const memory = document.createElement("span");
  memory.className = "water-memory";
  memory.setAttribute("aria-hidden", "true");

  const finishWaterMemory = () => {
    window.clearTimeout(removeTimer);
    memory.remove();
    scheduleTakeOneAction();
  };

  const removeTimer = window.setTimeout(finishWaterMemory, 4400);

  memory.addEventListener("animationend", finishWaterMemory, {
    once: true,
  });

  document.body.append(memory);
};

const showJourneyStar = () => {
  if (journeyState.starShown) {
    return;
  }

  journeyState.starShown = true;

  const star = document.createElement("span");
  star.className = "journey-star";
  star.setAttribute("aria-hidden", "true");

  const removeTimer = window.setTimeout(() => star.remove(), 2400);

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
  }, 1450);
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

const loadImageForCompression = (file) =>
  new Promise((resolve, reject) => {
    const imageUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(imageUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(imageUrl);
      reject(new Error("Image could not be decoded"));
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

const createCompressedImageFile = async (file, index) => {
  try {
    const image = await loadImageForCompression(file);
    const maxSide = 1280;
    const originalWidth = image.naturalWidth || image.width;
    const originalHeight = image.naturalHeight || image.height;

    if (!originalWidth || !originalHeight) {
      throw new Error("Image dimensions were unavailable");
    }

    const scale = Math.min(1, maxSide / Math.max(originalWidth, originalHeight));
    const width = Math.max(1, Math.round(originalWidth * scale));
    const height = Math.max(1, Math.round(originalHeight * scale));
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", {
      alpha: false,
    });

    if (!context) {
      throw new Error("Canvas context was unavailable");
    }

    canvas.width = width;
    canvas.height = height;
    context.drawImage(image, 0, 0, width, height);

    const targetBytes = 1024 * 1024;
    let blob = await canvasToJpegBlob(canvas, 0.72);

    if (blob.size > targetBytes) {
      blob = await canvasToJpegBlob(canvas, 0.66);
    }

    if (blob.size > targetBytes) {
      blob = await canvasToJpegBlob(canvas, 0.6);
    }

    const compressedFile =
      typeof File === "function"
        ? new File([blob], getCompressedImageName(file), {
            type: "image/jpeg",
            lastModified: Date.now(),
          })
        : blob;

    return compressedFile;
  } catch (error) {
    console.error("image compression failed:", {
      index: index + 1,
      error: error?.message || "unknown",
    });
    throw error;
  }
};

const requestPoemForCard = async (file, index, requestId) => {
  const compressedFile = await createCompressedImageFile(file, index);
  const formData = new FormData();
  formData.append("image", compressedFile);

  const response = await fetch("/api/poem", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorJson = await readPoemErrorJson(response);
    const error = new Error(`Poem request failed with ${response.status}`);
    error.status = response.status;
    error.detail = errorJson;
    throw error;
  }

  const responseJson = await response.json();
  const poem = normalizeJourneyPoem(responseJson);

  if (!poem) {
    throw new Error("Poem response was invalid");
  }

  return poem;
};

const waitForBeforeWordsPaint = () =>
  new Promise((resolve) => {
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => {
        window.setTimeout(resolve, 420);
      });
      return;
    }

    window.setTimeout(resolve, 520);
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
  document.body.classList.add("is-choosing-journey");
  journeyGate?.setAttribute("aria-hidden", "false");
  setJourneyCount(journeyState.acceptedFiles.length);
};

const showPreparingGate = () => {
  journeyState.gate = "preparing";
  journeyGate?.classList.add("is-before-words", "is-preparing-path");
  renderGateText(beforePath);
  document.body.classList.remove("is-choosing-journey");
  document.body.classList.add("is-entering-lane", "is-preparing-journey");
  journeyGate?.setAttribute("aria-hidden", "false");
  setJourneyCount(journeyLimit);
};

const hideJourneyGate = () => {
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
  const nextPoem = journeyItem?.poem || fallbackPoem;

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
  const nextPoem = poem || fallbackPoem;

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
  journeyState.items = [];
  journeyState.arranged = displayOrder.length === journeyLimit;
  journeyState.flowOrder = [...displayOrder];

  displayOrder.forEach((sourceIndex, index) => {
    const file = journeyFiles[sourceIndex];

    if (!file) {
      return;
    }

    const photoUrl = URL.createObjectURL(file);
    selectedJourneyPhotoUrls.push(photoUrl);
    const poem = journeyPoems[sourceIndex] || fallbackPoem;
    const journeyItem = {
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
};

const startJourneyPoemRequest = (requestId) => {
  const poemRequests = journeyState.acceptedFiles
    .slice(0, journeyLimit)
    .map((file, index) => {
      const delayMs = index * 1500;

      return new Promise((resolve) => {
        const timer = window.setTimeout(() => {
          if (requestId !== journeyState.requestId) {
            resolve(null);
            return;
          }

          requestPoemForCard(file, index, requestId)
            .then((poem) => {
              if (requestId !== journeyState.requestId) {
                resolve(null);
                return;
              }

              journeyState.poems[index] = poem;
              if (journeyState.items[index]) {
                journeyState.items[index].poem = poem;
                journeyState.items[index].settled = true;
              }
              resolve(poem);
            })
            .catch((error) => {
              console.error("poem request failed:", index + 1, {
                status: error?.status || error?.detail?.status || null,
                error: error?.detail || error?.message || "unknown",
              });

              if (requestId !== journeyState.requestId) {
                resolve(null);
                return;
              }

              journeyState.poems[index] = { ...fallbackPoem };
              if (journeyState.items[index]) {
                journeyState.items[index].poem = journeyState.poems[index];
                journeyState.items[index].settled = true;
              }
              resolve(journeyState.poems[index]);
            });
        }, delayMs);

        poemRequestTimers.push(timer);
      });
    });

  return Promise.all(poemRequests).then(() => {
    if (requestId !== journeyState.requestId) {
      return null;
    }

    arrangeJourneyIfReady();
    return journeyState.poems;
  });
};

const prepareJourneyItems = () => {
  journeyState.poems = createFallbackJourneyPoems();
  journeyState.items = journeyState.acceptedFiles
    .slice(0, journeyLimit)
    .map((file, index) => ({
      file,
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

  window.clearTimeout(journeyBeforeWordsTimer);

  journeyBeforeWordsTimer = window.setTimeout(async () => {
    showPreparingGate();
    await waitForBeforeWordsPaint();

    if (requestId !== journeyState.requestId) {
      return;
    }

    prepareJourneyItems();
    await startJourneyPoemRequest(requestId);

    if (requestId !== journeyState.requestId) {
      return;
    }

    createJourneyCards(journeyState.poems, journeyState.flowOrder);
  }, 260);
};

const acceptSelectedFiles = (selectedFiles) => {
  const selectedFileList = [...selectedFiles];
  const remainingSlots = journeyLimit - journeyState.acceptedFiles.length;
  const nextAcceptedFiles = selectedFileList
    .filter(isQuietImageFile)
    .slice(0, Math.max(remainingSlots, 0));

  journeyState.acceptedFiles = [
    ...journeyState.acceptedFiles,
    ...nextAcceptedFiles,
  ].slice(0, journeyLimit);

  setJourneyCount(journeyState.acceptedFiles.length);
};

const handleJourneySelection = (files) => {
  if (journeyState.ready || journeyState.gate === "preparing") {
    return;
  }

  showJourneyGate();
  acceptSelectedFiles(files);

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

journeyEntry?.addEventListener("click", showJourneyGate);

journeyGate?.addEventListener("click", () => {
  if (!journeyState.ready && journeyState.gate === "selecting") {
    quietMomentInput?.click();
  }
});

quietMomentInput?.addEventListener("click", showJourneyGate);

quietMomentInput?.addEventListener("change", () => {
  handleJourneySelection(quietMomentInput.files || []);
  quietMomentInput.value = "";
});

window.addEventListener("beforeunload", () => {
  window.clearTimeout(settleTimer);
  window.clearTimeout(journeyBeforeWordsTimer);
  clearJourneyStarTimer();
  clearJourneyWaterTimer();
  clearTakeOneTimer();
  removeJourneyStars();
  removeWaterMemories();
  removeTakeOneActions();
  clearPoemRequestTimers();
  clearPoemUpdateTimers();
  clearJourneyPhotoUrls();
});
