const lane = document.querySelector(".lane");
const tanzakuItems = [...document.querySelectorAll(".tanzaku")];
const currentMemory = document.querySelector("#currentMemory");

const setScreenHeight = () => {
  document.documentElement.style.setProperty(
    "--screen-height",
    `${window.innerHeight}px`,
  );
};

const updateCurrentMemory = () => {
  if (!lane || !currentMemory || tanzakuItems.length === 0) {
    return;
  }

  const laneTop = lane.getBoundingClientRect().top;
  const current = tanzakuItems.reduce(
    (closest, item) => {
      const distance = Math.abs(item.getBoundingClientRect().top - laneTop);

      if (distance < closest.distance) {
        return { distance, index: item.dataset.index };
      }

      return closest;
    },
    { distance: Number.POSITIVE_INFINITY, index: "1" },
  );

  currentMemory.textContent = current.index;
  tanzakuItems.forEach((item) => {
    item.classList.toggle("is-visible", item.dataset.index === current.index);
  });
};

setScreenHeight();
updateCurrentMemory();

window.addEventListener("resize", () => {
  setScreenHeight();
  updateCurrentMemory();
});

if (lane) {
  lane.addEventListener("scroll", updateCurrentMemory, { passive: true });
}
