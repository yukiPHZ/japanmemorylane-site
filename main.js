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
const quietPoemCandidates = [
  {
    japanese: ["雨の匂いが", "まだ", "残っていた。"],
    english: ["The scent of rain", "still remained."],
  },
  {
    japanese: ["道の奥で", "光だけが", "待っていた。"],
    english: ["A small light waited", "at the end of the road."],
  },
  {
    japanese: ["誰もいないのに", "ちゃんと", "静かだった。"],
    english: ["No one was there,", "yet the silence felt complete."],
  },
  {
    japanese: ["電車の音だけが", "少し", "遠かった。"],
    english: ["Only the sound of the train", "felt a little far away."],
  },
  {
    japanese: ["夜は", "少しだけ", "本音になる。"],
    english: ["The night becomes", "a little more honest."],
  },
];
let settleTimer;
let selectedPhotoUrl;

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

const chooseQuietPoem = () =>
  quietPoemCandidates[
    Math.floor(Math.random() * quietPoemCandidates.length)
  ];

const replaceFirstMemoryPoems = () => {
  const poem = chooseQuietPoem();

  renderPoemLines(firstMemoryJapanesePoem, poem.japanese);
  renderPoemLines(firstMemoryEnglishPoem, poem.english);
};

const replaceFirstMemoryPhoto = (file) => {
  if (!firstMemoryPhoto || !isQuietImageFile(file)) {
    return;
  }

  const nextPhotoUrl = URL.createObjectURL(file);
  const image = new Image();

  image.onload = () => {
    if (selectedPhotoUrl) {
      URL.revokeObjectURL(selectedPhotoUrl);
    }

    selectedPhotoUrl = nextPhotoUrl;
    firstMemoryPhoto.src = selectedPhotoUrl;
    firstMemoryPhoto.alt = "A quiet moment selected for Japan Memory Lane";
    replaceFirstMemoryPoems();
  };

  image.onerror = () => {
    URL.revokeObjectURL(nextPhotoUrl);
  };

  image.src = nextPhotoUrl;
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
  if (selectedPhotoUrl) {
    URL.revokeObjectURL(selectedPhotoUrl);
  }
});
