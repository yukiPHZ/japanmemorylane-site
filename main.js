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
};

const journeyState = {
  acceptedFiles: [],
  currentIndex: 0,
  gate: "idle",
  poems: [],
  ready: false,
  requestId: 0,
};

let settleTimer;
let journeyBeforeWordsTimer;
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

  if (japanese.length === 0 || english.length === 0) {
    return null;
  }

  return {
    japanese: japanese.slice(0, 3),
    english: english.slice(0, 2),
    source: poem?.mood_tags?.includes("fallback") ? "fallback" : "api",
  };
};

const createFallbackJourneyPoems = () =>
  Array.from({ length: journeyLimit }, () => ({ ...fallbackPoem }));

const createBeforeWordsJourneyPoems = () =>
  Array.from({ length: journeyLimit }, () => ({
    japanese: [...beforeWords.japanese],
    english: [...beforeWords.english],
    source: "before-words",
  }));

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

const requestPoemForCard = async (file, index, requestId) => {
  const formData = new FormData();
  formData.append("image", file);

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
  resetTanzakuReveal();

  journeyItems.forEach((file, index) => {
    const item = tanzakuItems[index];
    const image = item?.querySelector(".memory-photo img");
    const japanesePoem = item?.querySelector(".jp-poem");
    const englishPoem = item?.querySelector(".en-poem");

    if (!item || !image) {
      return;
    }

    const photoUrl = URL.createObjectURL(file);
    selectedJourneyPhotoUrls.push(photoUrl);
    image.src = photoUrl;
    image.alt = `A quiet moment ${index + 1} selected for Japan Memory Lane`;
    image.loading = index === 0 ? "eager" : "lazy";

    const poem = journeyPoems[index] || fallbackPoem;

    renderPoemLines(japanesePoem, poem.japanese);
    renderPoemLines(englishPoem, poem.english);

    console.log("card poem applied", {
      index: index + 1,
      source: poem.source || "api",
      japanese: poem.japanese.join("\n"),
      english: poem.english.join("\n"),
    });
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
            updateJourneyCardPoem(index, poem);
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
            updateJourneyCardPoem(index, journeyState.poems[index]);
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
  clearPoemRequestTimers();
  clearPoemUpdateTimers();
  clearJourneyPhotoUrls();
});
