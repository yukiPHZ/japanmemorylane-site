const lane = document.querySelector(".lane");
const tanzakuItems = [...document.querySelectorAll(".tanzaku")];
const currentMemory = document.querySelector("#currentMemory");
const quietMomentInput = document.querySelector("#quietMomentInput");
const firstMemoryPhoto = document.querySelector("#firstMemoryPhoto");
const firstMemoryJapanesePoem = document.querySelector(
  "#firstMemoryJapanesePoem",
);
const firstMemoryEnglishPoem = document.querySelector("#firstMemoryEnglishPoem");
const quietImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const quietImageExtensions = /\.(jpe?g|png|webp)$/i;
const firstTanzaku = firstMemoryPhoto?.closest(".tanzaku");
const fallbackPoem = {
  japanese: ["……"],
  english: ["……"],
};
const loadingPoem = {
  japanese: ["ことばの前"],
  english: ["before words"],
};
let settleTimer;
let japanesePoemTimer;
let englishPoemTimer;
let selectedPhotoUrl;
let poemRequestId = 0;

const setScreenHeight = () => {
  document.documentElement.style.setProperty(
    "--screen-height",
    `${window.innerHeight}px`,
  );
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

  currentMemory.textContent = item.dataset.index;
  tanzakuItems.forEach((tanzaku) => {
    tanzaku.classList.toggle("is-current", tanzaku === item);
  });
};

const markTanzakuSeen = (item) => {
  if (!item || item.classList.contains("has-been-seen")) {
    return;
  }

  item.classList.add("has-been-seen");
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

document.body.classList.add("js-ready");

setScreenHeight();
updateAfterSettle();

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

const isQuietImageFile = (file) => {
  if (!file) {
    return false;
  }

  return quietImageTypes.has(file.type) || quietImageExtensions.test(file.name);
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

const chooseQuietPoem = () => fallbackPoem;

const renderLoadingJapanesePoem = () => {
  if (!firstMemoryJapanesePoem) {
    return;
  }

  firstMemoryJapanesePoem.replaceChildren();
  [...loadingPoem.japanese[0]].forEach((character, index) => {
    const characterElement = document.createElement("span");
    characterElement.className = "loading-kana";
    characterElement.style.setProperty("--loading-delay", `${index * 0.46}s`);
    characterElement.append(document.createTextNode(character));
    firstMemoryJapanesePoem.append(characterElement);
  });
};

const showLoadingPoem = () => {
  renderLoadingJapanesePoem();
  renderPoemLines(firstMemoryEnglishPoem, loadingPoem.english);

  console.log("Japan Memory Lane frontend render text", {
    source: "loading",
    japanese: loadingPoem.japanese.join("\n"),
    english: loadingPoem.english.join("\n"),
  });
};

const splitPoemLines = (poem) =>
  String(poem || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

const normalizePoem = (poem) => {
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
  };
};

const readPoemErrorJson = async (response) => {
  try {
    return await response.json();
  } catch {
    return {
      error: "poem_request_failed",
      stage: "unknown",
      status: response.status,
      message: "Poem request failed without JSON body",
    };
  }
};

const requestPoem = async (file) => {
  const formData = new FormData();
  formData.append("image", file);

  const response = await fetch("/api/poem", {
    method: "POST",
    body: formData,
  });

  console.log("Japan Memory Lane API response", {
    source: response.ok ? "api" : "fallback",
    status: response.status,
    ok: response.ok,
  });

  if (!response.ok) {
    const errorJson = await readPoemErrorJson(response);
    console.error("Poem request failed", errorJson);

    const error = new Error(`Poem request failed with ${response.status}`);
    error.detail = errorJson;
    throw error;
  }

  const responseJson = await response.json();

  console.log("Japan Memory Lane frontend received json", {
    source: "api",
    json: responseJson,
  });

  const poem = normalizePoem(responseJson);

  if (!poem) {
    throw new Error("Poem response was invalid");
  }

  return poem;
};

const clearPoemRevealTimers = () => {
  window.clearTimeout(japanesePoemTimer);
  window.clearTimeout(englishPoemTimer);
};

const setPoemsWaiting = () => {
  if (!firstTanzaku) {
    return;
  }

  showLoadingPoem();
  firstTanzaku.classList.add("is-poem-waiting", "is-poem-loading");
  firstTanzaku.classList.remove("show-japanese-poem", "show-english-poem");
};

const revealFirstMemoryPoems = () => {
  if (!firstTanzaku) {
    return;
  }

  japanesePoemTimer = window.setTimeout(() => {
    firstTanzaku.classList.add("show-japanese-poem");
  }, 1350);

  englishPoemTimer = window.setTimeout(() => {
    firstTanzaku.classList.add("show-english-poem");
  }, 1870);
};

const replaceFirstMemoryPoemsAfterPause = (poem, source = "api") => {
  const normalizedPoem = normalizePoem(poem);
  const renderSource = normalizedPoem ? source : "fallback";
  const nextPoem = normalizedPoem || chooseQuietPoem();

  if (firstTanzaku) {
    firstTanzaku.classList.remove("is-poem-loading");
  }

  console.log("Japan Memory Lane frontend render text", {
    source: renderSource,
    japanese: nextPoem.japanese.join("\n"),
    english: nextPoem.english.join("\n"),
  });

  renderPoemLines(firstMemoryJapanesePoem, nextPoem.japanese);
  renderPoemLines(firstMemoryEnglishPoem, nextPoem.english);
  revealFirstMemoryPoems();
};

const replaceFirstMemoryPoemsFromApi = async (file, requestId) => {
  try {
    const poem = await requestPoem(file);

    if (requestId !== poemRequestId) {
      console.log("Japan Memory Lane ignored stale poem response", {
        requestId,
        currentRequestId: poemRequestId,
      });
      return;
    }

    replaceFirstMemoryPoemsAfterPause(poem, "api");
  } catch (error) {
    console.error("Japan Memory Lane poem request failed; using fallback", {
      source: "fallback",
      message: error?.message,
      detail: error?.detail || null,
    });

    if (requestId !== poemRequestId) {
      console.log("Japan Memory Lane ignored stale poem fallback", {
        requestId,
        currentRequestId: poemRequestId,
      });
      return;
    }

    replaceFirstMemoryPoemsAfterPause(chooseQuietPoem(), "fallback");
  }
};

const replaceFirstMemoryPhoto = (file) => {
  if (!firstMemoryPhoto || !isQuietImageFile(file)) {
    return;
  }

  const requestId = ++poemRequestId;
  const nextPhotoUrl = URL.createObjectURL(file);
  const previousPhotoUrl = selectedPhotoUrl;

  selectedPhotoUrl = nextPhotoUrl;
  firstMemoryPhoto.src = selectedPhotoUrl;
  firstMemoryPhoto.alt = "A quiet moment selected for Japan Memory Lane";
  clearPoemRevealTimers();
  setPoemsWaiting();
  replaceFirstMemoryPoemsFromApi(file, requestId);

  if (previousPhotoUrl) {
    URL.revokeObjectURL(previousPhotoUrl);
  }
};

if (quietMomentInput) {
  quietMomentInput.addEventListener("change", () => {
    const [file] = quietMomentInput.files;

    if (!isQuietImageFile(file)) {
      quietMomentInput.value = "";
      return;
    }

    replaceFirstMemoryPhoto(file);
    quietMomentInput.value = "";
  });
}

window.addEventListener("beforeunload", () => {
  clearPoemRevealTimers();

  if (selectedPhotoUrl) {
    URL.revokeObjectURL(selectedPhotoUrl);
  }
});
