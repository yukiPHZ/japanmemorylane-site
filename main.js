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
  lastCardReached: false,
  starShown: false,
  waterShown: false,
};

let settleTimer;
let journeyBeforeWordsTimer;
let journeyStarTimer;
let journeyWaterTimer;
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

const splitPoemLines = (poem) =>
  String(poem || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

const normalizeJourneyPoem = (poem) => {
  const japanese = Array.isArray(poem?.japanese)
    ? poem.japanese
    : splitPoemLines(poem?.japanese_poem);
  const english = Array.isArray(poem?.english)
    ? poem.english
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

const resetJourneyStar = () => {
  clearJourneyStarTimer();
  clearJourneyWaterTimer();
  removeJourneyStars();
  removeWaterMemories();
  journeyState.lastCardReached = false;
  journeyState.starShown = false;
  journeyState.waterShown = false;
};

const showWaterMemory = () => {
  if (journeyState.waterShown) {
    return;
  }

  journeyState.waterShown = true;

  const memory = document.createElement("span");
  memory.className = "water-memory";
  memory.setAttribute("aria-hidden", "true");

  const removeTimer = window.setTimeout(() => memory.remove(), 4400);

  memory.addEventListener("animationend", () => {
    window.clearTimeout(removeTimer);
    memory.remove();
  }, {
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

  console.log("current index", journeyState.currentIndex);
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

  console.log("first card activated", {
    currentIndex: journeyState.currentIndex,
  });
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
  const originalSize = file?.size || 0;

  console.log("image compression started:", {
    index: index + 1,
    originalSize,
  });

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

    console.log("image compression finished:", {
      index: index + 1,
      originalSize,
      compressedSize: blob.size,
      width,
      height,
    });

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

  console.log("poem request started:", index + 1, {
    requestId,
  });

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

  console.log("poem response received:", index + 1, {
    requestId,
    status: response.status,
    source: poem.source,
    moodTags: poem.moodTags,
  });

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
  journeyGate?.classList.remove("is-before-words");
  renderGateText(journeyIntro);
};

const showJourneyGate = () => {
  if (journeyState.ready) {
    return;
  }

  if (journeyState.gate !== "before-words") {
    setGateIntro();
  }

  journeyState.gate = "selecting";
  document.body.classList.add("is-choosing-journey");
  journeyGate?.setAttribute("aria-hidden", "false");
  setJourneyCount(journeyState.acceptedFiles.length);

  console.log("journey gate shown", {
    acceptedFiles: journeyState.acceptedFiles.length,
  });
};

const showBeforeWordsGate = () => {
  journeyState.gate = "before-words";
  journeyGate?.classList.add("is-before-words");
  renderGateText({
    japanese: beforeWords.japanese.join("\n"),
    english: beforeWords.english.join("\n"),
  });
  document.body.classList.add("is-entering-lane");
  setJourneyCount(journeyLimit);

  console.log("journey gate shown", {
    state: "before-words",
    acceptedFiles: journeyState.acceptedFiles.length,
  });
};

const hideJourneyGate = () => {
  document.body.classList.remove("is-choosing-journey", "is-entering-lane");
  journeyGate?.classList.remove("is-before-words");
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

const renderJourneyItem = (index, journeyItem, logName = "card poem applied") => {
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

  console.log(logName, {
    index: index + 1,
    originalIndex: (journeyItem?.originalIndex ?? index) + 1,
    source: nextPoem.source || "api",
    japanese: nextPoem.japanese.join("\n"),
    english: nextPoem.english.join("\n"),
  });
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
  journeyState.items = orderedItems;
  journeyState.poems = orderedItems.map((item) => item.poem || fallbackPoem);

  clearPoemUpdateTimers();
  orderedItems.forEach((item, index) =>
    renderJourneyItem(index, item, "journey card arranged"),
  );
  updateAfterSettle();

  console.log("journey order arranged", {
    order: orderedItems.map((item) => (item.originalIndex ?? 0) + 1),
  });
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

    console.log("card poem updated", {
      index: index + 1,
      source: nextPoem.source || "api",
      japanese: nextPoem.japanese.join("\n"),
      english: nextPoem.english.join("\n"),
    });
  }, 360);

  poemUpdateTimers.push(timer);
};

const createJourneyCards = (poems = journeyState.poems) => {
  const journeyItems = journeyState.acceptedFiles.slice(0, journeyLimit);
  const journeyPoems =
    poems.length > 0 ? poems : createBeforeWordsJourneyPoems();

  clearPoemRequestTimers();
  clearPoemUpdateTimers();
  clearJourneyPhotoUrls();
  resetJourneyStar();
  resetTanzakuReveal();
  journeyState.items = [];
  journeyState.arranged = false;

  journeyItems.forEach((file, index) => {
    const photoUrl = URL.createObjectURL(file);
    selectedJourneyPhotoUrls.push(photoUrl);
    const poem = journeyPoems[index] || fallbackPoem;
    const journeyItem = {
      file,
      originalIndex: index,
      photoUrl,
      poem,
      settled: poem.source === "fallback",
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

  console.log("journey cards created", {
    count: journeyItems.length,
  });

  console.log("journey cards shown before api", {
    count: journeyItems.length,
  });
};

const startJourneyPoemRequest = (requestId) => {
  journeyState.acceptedFiles
    .slice(0, journeyLimit)
    .forEach((file, index) => {
      const delayMs = index * 1500;

      console.log("poem request scheduled:", {
        index: index + 1,
        delayMs,
      });

      const timer = window.setTimeout(() => {
        if (requestId !== journeyState.requestId) {
          return;
        }

        requestPoemForCard(file, index, requestId)
          .then((poem) => {
            if (requestId !== journeyState.requestId) {
              return;
            }

            journeyState.poems[index] = poem;
            if (journeyState.items[index]) {
              journeyState.items[index].poem = poem;
              journeyState.items[index].settled = true;
            }
            updateJourneyCardPoem(index, poem);
            arrangeJourneyIfReady();
          })
          .catch((error) => {
            console.error("poem request failed:", index + 1, {
              status: error?.status || error?.detail?.status || null,
              error: error?.detail || error?.message || "unknown",
            });

            if (requestId !== journeyState.requestId) {
              return;
            }

            journeyState.poems[index] = { ...fallbackPoem };
            if (journeyState.items[index]) {
              journeyState.items[index].poem = journeyState.poems[index];
              journeyState.items[index].settled = true;
            }
            updateJourneyCardPoem(index, journeyState.poems[index]);
            arrangeJourneyIfReady();
          });
      }, delayMs);

      poemRequestTimers.push(timer);
    });
};

const enterJourneyWhenReady = () => {
  if (journeyState.ready || journeyState.acceptedFiles.length < journeyLimit) {
    return;
  }

  if (
    journeyState.gate === "preparing" ||
    journeyState.gate === "before-words"
  ) {
    return;
  }

  const requestId = journeyState.requestId + 1;
  journeyState.requestId = requestId;
  journeyState.gate = "preparing";

  window.clearTimeout(journeyBeforeWordsTimer);

  journeyBeforeWordsTimer = window.setTimeout(async () => {
    showBeforeWordsGate();
    await waitForBeforeWordsPaint();

    if (requestId !== journeyState.requestId) {
      return;
    }

    journeyState.poems = createBeforeWordsJourneyPoems();
    createJourneyCards(journeyState.poems);
    startJourneyPoemRequest(requestId);
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

  console.log("selected files:", selectedFileList.length);
  console.log("accepted files:", journeyState.acceptedFiles.length);

  setJourneyCount(journeyState.acceptedFiles.length);
};

const handleJourneySelection = (files) => {
  if (journeyState.ready) {
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
  if (!journeyState.ready && journeyState.gate !== "before-words") {
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
  removeJourneyStars();
  removeWaterMemories();
  clearPoemRequestTimers();
  clearPoemUpdateTimers();
  clearJourneyPhotoUrls();
});
