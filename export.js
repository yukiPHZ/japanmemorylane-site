const keepTanzakuButton = document.querySelector("#keepTanzaku");
const exportSize = {
  width: 1080,
  height: 1920,
};

const exportLayout = {
  marginX: 96,
  titleY: 150,
  subtitleY: 192,
  photoX: 96,
  photoY: 360,
  photoW: 560,
  photoH: 560,
  poemStartX: 892,
  poemStartY: 470,
  columnGap: 82,
  fontSizeJP: 54,
  lineHeightJP: 66,
  englishX: 96,
  englishY: 1380,
  fontSizeEN: 30,
  lineHeightEN: 48,
};

const exportColors = {
  paper: "#f6f4ef",
  ink: "#1f1f1f",
  title: "rgba(31, 31, 31, 0.72)",
  subtitle: "rgba(31, 31, 31, 0.34)",
  quiet: "rgba(31, 31, 31, 0.34)",
  photoBorder: "rgba(31, 31, 31, 0.08)",
};

let keepFadeTimer;
const preferredJapaneseBreaks = [
  "に",
  "を",
  "が",
  "は",
  "で",
  "と",
  "へ",
  "も",
  "、",
];

const getCurrentTanzaku = () =>
  document.querySelector(".tanzaku.is-current") ||
  document.querySelector(".tanzaku");

const getTextLines = (element) => {
  const text =
    typeof element?.innerText === "string"
      ? element.innerText
      : element?.textContent || "";

  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
};

const visibleLength = (text) => [...text].length;

const splitLongJapaneseLine = (line) => {
  const characters = [...line.trim()];

  if (characters.length <= 8) {
    return [line.trim()];
  }

  const segments = [];
  let remaining = characters;

  while (remaining.length > 8 && segments.length < 2) {
    const max = Math.min(8, remaining.length - 1);
    let breakIndex = Math.min(7, max);

    for (let index = max; index >= 4; index -= 1) {
      if (preferredJapaneseBreaks.includes(remaining[index - 1])) {
        breakIndex = index;
        break;
      }
    }

    segments.push(remaining.slice(0, breakIndex).join("").trim());
    remaining = remaining.slice(breakIndex);
  }

  if (remaining.length > 0) {
    segments.push(remaining.join("").trim());
  }

  return segments.filter(Boolean);
};

const balanceJapaneseLines = (lines) => {
  const balanced = lines.flatMap((line) =>
    visibleLength(line) > 8 ? splitLongJapaneseLine(line) : line,
  );

  while (balanced.length > 3) {
    const tail = balanced.pop();
    balanced[balanced.length - 1] = `${balanced[balanced.length - 1]}${tail}`;
  }

  return balanced.slice(0, 3);
};

const waitForImage = async (image) => {
  if (!image) {
    throw new Error("No image found for export");
  }

  if (image.complete && image.naturalWidth > 0) {
    return image;
  }

  if (typeof image.decode === "function") {
    await image.decode();
    return image;
  }

  await new Promise((resolve, reject) => {
    image.addEventListener("load", resolve, { once: true });
    image.addEventListener("error", reject, { once: true });
  });

  return image;
};

const drawCoverImage = (context, image, x, y, width, height) => {
  const imageRatio = image.naturalWidth / image.naturalHeight;
  const targetRatio = width / height;
  let sourceWidth = image.naturalWidth;
  let sourceHeight = image.naturalHeight;
  let sourceX = 0;
  let sourceY = 0;

  if (imageRatio > targetRatio) {
    sourceWidth = image.naturalHeight * targetRatio;
    sourceX = (image.naturalWidth - sourceWidth) / 2;
  } else {
    sourceHeight = image.naturalWidth / targetRatio;
    sourceY = (image.naturalHeight - sourceHeight) / 2;
  }

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

const drawVerticalLine = (context, text, x, y, characterGap) => {
  [...text].forEach((character, index) => {
    context.fillText(character, x, y + index * characterGap);
  });
};

const drawVerticalPoem = (context, lines) => {
  const {
    poemStartX,
    poemStartY,
    columnGap,
    fontSizeJP,
    lineHeightJP,
  } = exportLayout;

  context.fillStyle = exportColors.ink;
  context.font = `${fontSizeJP}px "Shippori Mincho", "Noto Serif JP", "Yu Mincho", serif`;
  context.textAlign = "center";
  context.textBaseline = "top";

  balanceJapaneseLines(lines).forEach((line, index) => {
    drawVerticalLine(
      context,
      line,
      poemStartX - index * columnGap,
      poemStartY,
      lineHeightJP,
    );
  });
};

const drawMultilineText = (context, lines, x, y, lineHeight) => {
  lines.forEach((line, index) => {
    context.fillText(line, x, y + index * lineHeight);
  });
};

const canvasToBlob = (canvas) =>
  new Promise((resolve) => {
    canvas.toBlob(resolve, "image/png", 0.95);
  });

const shareBlob = async (blob) => {
  if (typeof File !== "function") {
    return false;
  }

  const file = new File([blob], "japan-memory-lane.png", {
    type: "image/png",
  });

  if (!navigator.canShare?.({ files: [file] })) {
    return false;
  }

  try {
    await navigator.share({
      files: [file],
      title: "Japan Memory Lane",
    });
    return true;
  } catch (error) {
    if (error?.name === "AbortError") {
      return true;
    }

    console.error("Tanzaku share failed", {
      message: error?.message,
    });
    return false;
  }
};

const downloadBlob = (blob) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "japan-memory-lane.png";
  document.body.append(link);
  link.click();
  link.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1200);
};

const openBlobInNewTab = (blob) => {
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, "_blank", "noopener,noreferrer");

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60000);

  if (!opened) {
    throw new Error("Could not open tanzaku image");
  }
};

const presentBlob = async (blob) => {
  if (await shareBlob(blob)) {
    return;
  }

  try {
    downloadBlob(blob);
    return;
  } catch (error) {
    console.error("Tanzaku download failed", {
      message: error?.message,
    });
  }

  openBlobInNewTab(blob);
};

const exportCurrentTanzaku = async () => {
  const currentTanzaku = getCurrentTanzaku();
  const image = currentTanzaku?.querySelector(".memory-photo img");
  const japaneseLines = getTextLines(currentTanzaku?.querySelector(".jp-poem"));
  const englishLines = getTextLines(currentTanzaku?.querySelector(".en-poem"));

  await waitForImage(image);

  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const { width, height } = exportSize;

  canvas.width = width;
  canvas.height = height;

  context.fillStyle = exportColors.paper;
  context.fillRect(0, 0, width, height);

  context.fillStyle = exportColors.title;
  context.font = '500 26px Inter, Manrope, system-ui, sans-serif';
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.fillText(
    "Japan Memory Lane",
    exportLayout.marginX,
    exportLayout.titleY,
  );

  context.fillStyle = exportColors.subtitle;
  context.font = '22px Inter, Manrope, system-ui, sans-serif';
  context.fillText(
    "Quiet moments in Japan.",
    exportLayout.marginX,
    exportLayout.subtitleY,
  );

  drawCoverImage(
    context,
    image,
    exportLayout.photoX,
    exportLayout.photoY,
    exportLayout.photoW,
    exportLayout.photoH,
  );
  context.strokeStyle = exportColors.photoBorder;
  context.lineWidth = 2;
  context.strokeRect(
    exportLayout.photoX,
    exportLayout.photoY,
    exportLayout.photoW,
    exportLayout.photoH,
  );

  drawVerticalPoem(context, japaneseLines);

  context.fillStyle = exportColors.quiet;
  context.font = `${exportLayout.fontSizeEN}px Inter, Manrope, system-ui, sans-serif`;
  context.textAlign = "left";
  context.textBaseline = "top";
  drawMultilineText(
    context,
    englishLines.slice(0, 2),
    exportLayout.englishX,
    exportLayout.englishY,
    exportLayout.lineHeightEN,
  );

  const blob = await canvasToBlob(canvas);

  if (!blob) {
    throw new Error("Could not create tanzaku image");
  }

  await presentBlob(blob);
};

const revealKeepLink = () => {
  if (!keepTanzakuButton) {
    return;
  }

  window.clearTimeout(keepFadeTimer);
  keepTanzakuButton.hidden = false;
  keepTanzakuButton.classList.remove("is-dimmed");

  const show = () => {
    keepTanzakuButton.classList.add("is-available");
  };

  if (typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(show);
  } else {
    window.setTimeout(show, 0);
  }

  keepFadeTimer = window.setTimeout(() => {
    keepTanzakuButton.classList.add("is-dimmed");
  }, 4200);
};

const hideKeepLink = () => {
  if (!keepTanzakuButton) {
    return;
  }

  window.clearTimeout(keepFadeTimer);
  keepTanzakuButton.classList.remove("is-available", "is-dimmed");
  keepTanzakuButton.hidden = true;
};

window.addEventListener("jml:tanzaku-pending", hideKeepLink);
window.addEventListener("jml:tanzaku-ready", revealKeepLink);

keepTanzakuButton?.addEventListener("click", async () => {
  keepTanzakuButton.classList.add("is-saving");
  keepTanzakuButton.disabled = true;

  try {
    await exportCurrentTanzaku();
  } catch (error) {
    console.error("Tanzaku export failed", {
      message: error?.message,
    });
  } finally {
    keepTanzakuButton.disabled = false;
    keepTanzakuButton.classList.remove("is-saving");
  }
});
