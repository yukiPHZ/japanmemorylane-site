const lane = document.querySelector(".lane");
const tanzakuItems = [...document.querySelectorAll(".tanzaku")];
const currentMemory = document.querySelector("#currentMemory");
const quietMomentInput = document.querySelector("#quietMomentInput");
const journeyEntry = document.querySelector("#journeyEntry");
const journeyCount = document.querySelector("#journeyCount");
const journeyGate = document.querySelector("#journeyGate");
const journeyGateCount = document.querySelector("#journeyGateCount");

const journeyLimit = 7;
const quietImageExtensions = /\.(jpe?g|png|webp|heic|heif|gif|avif)$/i;
const journeyPoem = {
  japanese: ["ことばの前"],
  english: ["before words"],
};

let settleTimer;
let journeyCountTimer;
let journeyEnterFadeTimer;
let journeyEnterApplyTimer;
let journeyFiles = [];
let selectedJourneyPhotoUrls = [];
let isJourneyEntering = false;

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

const isQuietImageFile = (file) => {
  if (!file) {
    return false;
  }

  const fileType = typeof file.type === "string" ? file.type : "";
  return fileType.startsWith("image/") || quietImageExtensions.test(file.name);
};

const setJourneyCount = (count) => {
  const nextText = `${Math.min(count, journeyLimit)} / ${journeyLimit}`;

  if (journeyCount) {
    journeyCount.textContent = nextText;
  }

  if (journeyGateCount) {
    journeyGateCount.textContent = String(Math.min(count, journeyLimit));
  }
};

const showJourneyGate = () => {
  document.body.classList.add("is-choosing-journey");
  journeyGate?.setAttribute("aria-hidden", "false");
  setJourneyCount(journeyFiles.length);
};

const hideJourneyGate = () => {
  document.body.classList.remove("is-choosing-journey", "is-entering-lane");
  journeyGate?.setAttribute("aria-hidden", "true");
};

const clearJourneyPhotoUrls = () => {
  selectedJourneyPhotoUrls.forEach((url) => URL.revokeObjectURL(url));
  selectedJourneyPhotoUrls = [];
};

const resetTanzakuReveal = () => {
  tanzakuItems.forEach((item) => {
    item.classList.remove(
      "has-been-seen",
      "is-current",
      "is-poem-waiting",
      "is-poem-loading",
      "show-japanese-poem",
      "show-english-poem",
    );
  });
};

const applyJourneyFiles = () => {
  clearJourneyPhotoUrls();
  resetTanzakuReveal();

  journeyFiles.slice(0, journeyLimit).forEach((file, index) => {
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

    renderPoemLines(japanesePoem, journeyPoem.japanese);
    renderPoemLines(englishPoem, journeyPoem.english);
  });

  document.body.classList.add("has-journey");
  hideJourneyGate();
  setJourneyCount(journeyLimit);

  if (lane) {
    lane.scrollTo({ top: 0, behavior: "auto" });
  }

  window.setTimeout(updateAfterSettle, 80);

  console.log("Japan Memory Lane journey entered", {
    source: "local-files",
    count: journeyFiles.length,
  });
};

const enterJourney = () => {
  if (isJourneyEntering) {
    return;
  }

  isJourneyEntering = true;
  window.clearTimeout(journeyEnterFadeTimer);
  window.clearTimeout(journeyEnterApplyTimer);

  journeyEnterFadeTimer = window.setTimeout(() => {
    document.body.classList.add("is-entering-lane");
  }, 260);

  journeyEnterApplyTimer = window.setTimeout(() => {
    applyJourneyFiles();
  }, 1120);
};

const queueJourneyFiles = (files) => {
  if (isJourneyEntering || journeyFiles.length >= journeyLimit) {
    return;
  }

  const availableFiles = [...files]
    .filter(isQuietImageFile)
    .slice(0, journeyLimit - journeyFiles.length);

  showJourneyGate();

  if (availableFiles.length === 0) {
    return;
  }

  let nextIndex = 0;
  window.clearTimeout(journeyCountTimer);

  const addNextFile = () => {
    if (nextIndex >= availableFiles.length || journeyFiles.length >= journeyLimit) {
      if (journeyFiles.length >= journeyLimit) {
        enterJourney();
      }

      return;
    }

    journeyFiles.push(availableFiles[nextIndex]);
    nextIndex += 1;
    setJourneyCount(journeyFiles.length);

    if (journeyFiles.length >= journeyLimit) {
      enterJourney();
      return;
    }

    journeyCountTimer = window.setTimeout(addNextFile, 150);
  };

  addNextFile();
};

document.body.classList.add("js-ready");

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
  if (!isJourneyEntering) {
    quietMomentInput?.click();
  }
});

quietMomentInput?.addEventListener("click", showJourneyGate);

quietMomentInput?.addEventListener("change", () => {
  queueJourneyFiles(quietMomentInput.files || []);
  quietMomentInput.value = "";
});

window.addEventListener("beforeunload", () => {
  window.clearTimeout(settleTimer);
  window.clearTimeout(journeyCountTimer);
  window.clearTimeout(journeyEnterFadeTimer);
  window.clearTimeout(journeyEnterApplyTimer);
  clearJourneyPhotoUrls();
});
