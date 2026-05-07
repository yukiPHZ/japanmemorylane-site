const keepTanzakuButton = document.querySelector("#keepTanzaku");
const exportSize = {
  width: 1080,
  height: 1920,
};

const exportColors = {
  paper: "#f6f4ef",
  ink: "#1f1f1f",
  muted: "rgba(31, 31, 31, 0.46)",
  quiet: "rgba(31, 31, 31, 0.36)",
  photoBorder: "rgba(31, 31, 31, 0.09)",
};

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

const drawVerticalPoem = (context, lines, x, y) => {
  const columnGap = 78;
  const characterGap = 58;

  context.fillStyle = exportColors.ink;
  context.font =
    '44px "Shippori Mincho", "Noto Serif JP", "Yu Mincho", serif';
  context.textAlign = "center";
  context.textBaseline = "top";

  lines.slice(0, 3).forEach((line, index) => {
    drawVerticalLine(context, line, x - index * columnGap, y, characterGap);
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

  context.fillStyle = "rgba(31, 31, 31, 0.82)";
  context.font = '500 28px Inter, Manrope, system-ui, sans-serif';
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.fillText("Japan Memory Lane", 108, 126);

  context.fillStyle = exportColors.muted;
  context.font = '24px Inter, Manrope, system-ui, sans-serif';
  context.textAlign = "right";
  context.fillText("Quiet moments in Japan.", width - 108, 126);

  const photo = {
    x: 108,
    y: 330,
    width: 570,
    height: 712,
  };

  drawCoverImage(context, image, photo.x, photo.y, photo.width, photo.height);
  context.strokeStyle = exportColors.photoBorder;
  context.lineWidth = 2;
  context.strokeRect(photo.x, photo.y, photo.width, photo.height);

  drawVerticalPoem(context, japaneseLines, 858, 394);

  context.fillStyle = exportColors.quiet;
  context.font = '26px Inter, Manrope, system-ui, sans-serif';
  context.textAlign = "left";
  context.textBaseline = "top";
  drawMultilineText(context, englishLines, 108, 1130, 46);

  const blob = await canvasToBlob(canvas);

  if (!blob) {
    throw new Error("Could not create tanzaku image");
  }

  downloadBlob(blob);
};

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
