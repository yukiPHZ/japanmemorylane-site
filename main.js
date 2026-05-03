const lane = document.querySelector(".lane");
const tanzakuItems = [...document.querySelectorAll(".tanzaku")];
const currentMemory = document.querySelector("#currentMemory");
let settleTimer;

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
