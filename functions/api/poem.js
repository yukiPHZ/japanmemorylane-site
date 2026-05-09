const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-4o-mini";
const IMAGE_DETAIL = "high";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const JAPANESE_LINE_MAX = 8;
const JAPANESE_LINE_SOFT_MAX = 7;
const JAPANESE_LINE_MIN = 4;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const poemSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    japanese_poem: {
      type: "string",
    },
    english_poem: {
      type: "string",
    },
    mood_tags: {
      type: "array",
      items: {
        type: "string",
      },
      minItems: 1,
      maxItems: 5,
    },
  },
  required: ["japanese_poem", "english_poem", "mood_tags"],
};

const generationPrompt = `You are writing for Japan Memory Lane.

This is not a travel guide.
This is not an AI caption generator.
This is a quiet memory of Japan.

You must look at the uploaded image before writing.
Do not write a generic quiet poem.
Do not reuse prepared-sounding phrases.

Pick exactly one small visual detail from the photo:
a rope, wet stone, window edge, sign, shadow, rail, step, curtain, reflection,
vending-machine button, shrine paper, puddle, leaf, wire, tile, or another visible thing.
Use that detail indirectly.
Do not mention everything in the photo.
Do not invent details that are not visible.
If the photo has no obvious Japan marker, use a visible detail instead of forcing Japan.

Write a short Japanese poem first.
The Japanese must be natural, quiet, and suitable for vertical writing.
The Japanese poem will be displayed vertically as a tanzaku.
Keep visual balance in vertical writing.
Prefer 2 or 3 balanced short columns.
Use 2 to 3 short lines unless the image only needs one very small line.
Keep each Japanese line around 6 to 8 characters.
Avoid overly long continuous phrases.
Avoid repeating connected の phrases such as の...の...の.
Prioritize empty space over readability.
Reduce explicit subjects.
Pick one concrete thing, but do not turn it into a caption.
Do not explain the photo.
Do not describe everything.
Do not say emotions directly.
Do not use dramatic or overly poetic words.
Do not use tourism, advertising, influencer, motivational, or fantasy language.
Avoid words like miracle, magic, dream, soul, destiny, eternal, hidden gem, must-see, and perfect spot.
Avoid overusing common quiet-poem words such as light, silence, distant, waiting, little, stillness.
Avoid repeating common Japanese words and endings such as 光, 静か, 遠い, 待っていた, 少し, だけ.
Vary the sentence shape.
Let punctuation appear only when it feels natural.
Leave space.

Then write a small English poem as a gentle interpretation.
The English should support the Japanese, not replace it.
Use 1 to 2 short lines.
Keep it quieter than the Japanese.
Do not make the English a full caption.

For mood_tags, use lowercase atmosphere tags only.
Use tags that help arrange a quiet journey from warmer, denser, brighter moments
toward cooler, softer, more still moments.
Good tag directions include bright, vivid, crowded, dense, humid, warm, neon,
busy, calm, serene, reflective, shadow, quiet, distant, soft, rain, empty,
muted, night, hushed, and still.
Do not use quality, ranking, tourism, aesthetic, or recommendation tags.

Return only JSON.`;

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
};

const json = (body, init = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...jsonHeaders,
      ...(init.headers || {}),
    },
  });

class PoemApiError extends Error {
  constructor(stage, message, options = {}) {
    super(message);
    this.name = "PoemApiError";
    this.stage = stage;
    this.responseStatus = options.responseStatus || 500;
    this.diagnosticStatus = options.diagnosticStatus || this.responseStatus;
  }
}

const methodNotAllowed = () =>
  json(
    { error: "method_not_allowed" },
    {
      status: 405,
      headers: {
        allow: "POST",
      },
    },
  );

const isImageFile = (file) =>
  file &&
  typeof file.arrayBuffer === "function" &&
  ALLOWED_IMAGE_TYPES.has(file.type);

const poemError = (stage, message, options) =>
  new PoemApiError(stage, message, options);

const errorResponse = (error) => {
  const stage = error instanceof PoemApiError ? error.stage : "unknown";
  const status =
    error instanceof PoemApiError ? error.diagnosticStatus : 500;
  const responseStatus =
    error instanceof PoemApiError ? error.responseStatus : 500;
  const message =
    error instanceof PoemApiError
      ? error.message
      : "Unexpected poem generation failure";

  return json(
    {
      error: "poem_generation_failed",
      stage,
      status,
      message,
    },
    { status: responseStatus },
  );
};

const toBase64 = (arrayBuffer) => {
  const bytes = new Uint8Array(arrayBuffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(index, index + chunkSize),
    );
  }

  return btoa(binary);
};

const extractResponseText = (responseBody) => {
  if (typeof responseBody.output_text === "string") {
    return responseBody.output_text;
  }

  for (const item of responseBody.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") {
        return content.text;
      }
    }
  }

  throw poemError(
    "openai_response_parse",
    "OpenAI response did not include output text",
  );
};

const visibleLength = (text) => [...text].length;

const findJapaneseBreakIndex = (line) => {
  const characters = [...line];
  const maxIndex = Math.min(JAPANESE_LINE_MAX, characters.length - 1);
  const preferredBreakAfter = new Set([
    "に",
    "を",
    "が",
    "は",
    "で",
    "と",
    "へ",
    "も",
    "や",
    "、",
  ]);

  for (let index = maxIndex; index >= JAPANESE_LINE_MIN; index -= 1) {
    if (preferredBreakAfter.has(characters[index - 1])) {
      return index;
    }
  }

  for (let index = JAPANESE_LINE_SOFT_MAX; index >= JAPANESE_LINE_MIN; index -= 1) {
    if (characters[index] === "の") {
      return index;
    }
  }

  return Math.min(JAPANESE_LINE_SOFT_MAX, characters.length - 1);
};

const splitLongJapaneseLine = (line) => {
  const segments = [];
  let remaining = line.trim();

  while (visibleLength(remaining) > JAPANESE_LINE_MAX && segments.length < 2) {
    const breakIndex = findJapaneseBreakIndex(remaining);
    const characters = [...remaining];
    segments.push(characters.slice(0, breakIndex).join("").trim());
    remaining = characters.slice(breakIndex).join("").trim();
  }

  if (remaining) {
    segments.push(remaining);
  }

  return segments.filter(Boolean);
};

const balanceJapanesePoem = (poem) => {
  const originalLines = String(poem || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const balancedLines = originalLines.flatMap((line) =>
    visibleLength(line) > JAPANESE_LINE_MAX
      ? splitLongJapaneseLine(line)
      : line,
  );

  while (balancedLines.length > 3) {
    const tail = balancedLines.pop();
    balancedLines[balancedLines.length - 1] = `${balancedLines[
      balancedLines.length - 1
    ]}${tail}`;
  }

  return balancedLines.slice(0, 3).join("\n");
};

const validatePoem = (poem) => {
  const japanesePoem =
    typeof poem?.japanese_poem === "string"
      ? balanceJapanesePoem(poem.japanese_poem)
      : poem?.japanese_poem;
  const englishPoem = poem?.english_poem;
  const moodTags = Array.isArray(poem?.mood_tags)
    ? poem.mood_tags
        .filter((tag) => typeof tag === "string")
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 5)
    : null;

  if (
    typeof japanesePoem !== "string" ||
    typeof englishPoem !== "string" ||
    !moodTags ||
    moodTags.length < 1 ||
    moodTags.length > 5 ||
    !moodTags.every((tag) => typeof tag === "string")
  ) {
    throw poemError(
      "schema_validation",
      "OpenAI poem JSON did not match the expected schema",
    );
  }

  return {
    japanese_poem: japanesePoem.trim(),
    english_poem: englishPoem.trim(),
    mood_tags: moodTags,
  };
};

const requestOpenAIPoem = async ({ apiKey, model, file }) => {
  let arrayBuffer;

  try {
    arrayBuffer = await file.arrayBuffer();
  } catch (error) {
    console.error("Poem image arrayBuffer failed", {
      imageType: file?.type || null,
      message: error?.message,
    });
    throw poemError("invalid_image", "Image could not be read", {
      responseStatus: 400,
      diagnosticStatus: 400,
    });
  }

  if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
    console.error("Poem image is too large", {
      imageType: file?.type || null,
      imageSize: typeof file?.size === "number" ? file.size : null,
      imageBytes: arrayBuffer.byteLength,
      maxImageBytes: MAX_IMAGE_BYTES,
    });
    throw poemError("invalid_image", "Image is too large", {
      responseStatus: 400,
      diagnosticStatus: 400,
    });
  }

  if (arrayBuffer.byteLength === 0) {
    throw poemError("invalid_image", "Image is empty", {
      responseStatus: 400,
      diagnosticStatus: 400,
    });
  }

  console.log("Japan Memory Lane poem request", {
    model,
    imageType: file.type,
    imageBytes: arrayBuffer.byteLength,
    imageDetail: IMAGE_DETAIL,
  });

  let imageUrl;

  try {
    imageUrl = `data:${file.type};base64,${toBase64(arrayBuffer)}`;
  } catch (error) {
    console.error("Poem image base64 conversion failed", {
      imageType: file?.type || null,
      imageBytes: arrayBuffer.byteLength,
      message: error?.message,
    });
    throw poemError("invalid_image", "Image could not be encoded", {
      responseStatus: 400,
      diagnosticStatus: 400,
    });
  }

  let response;

  try {
    response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: generationPrompt,
              },
              {
                type: "input_image",
                image_url: imageUrl,
                detail: IMAGE_DETAIL,
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "japan_memory_lane_poem",
            schema: poemSchema,
            strict: true,
          },
        },
        store: false,
      }),
    });
  } catch (error) {
    console.error("OpenAI request network error", {
      message: error?.message,
    });
    throw poemError("openai_request", "OpenAI API request failed");
  }

  const responseTextBody = await response.text();

  console.log("OpenAI API response status", {
    status: response.status,
    ok: response.ok,
  });

  if (!response.ok) {
    console.error("OpenAI API error response", {
      status: response.status,
      bodyHead: responseTextBody.slice(0, 1000),
    });
    throw poemError("openai_request", "OpenAI API request failed", {
      diagnosticStatus: response.status,
    });
  }

  let responseBody;

  try {
    responseBody = JSON.parse(responseTextBody);
  } catch (error) {
    console.error("OpenAI response JSON parse failed", {
      message: error?.message,
      bodyHead: responseTextBody.slice(0, 1000),
    });
    throw poemError(
      "openai_response_parse",
      "OpenAI API response was not valid JSON",
    );
  }

  const responseText = extractResponseText(responseBody);

  console.log("OpenAI raw output head", responseText.slice(0, 1000));

  let parsedPoem;

  try {
    parsedPoem = JSON.parse(responseText);
  } catch (error) {
    console.error("OpenAI output JSON parse failed", {
      message: error?.message,
      outputHead: responseText.slice(0, 1000),
    });
    throw poemError(
      "openai_response_parse",
      "OpenAI output text was not valid poem JSON",
    );
  }

  console.log("Parsed Japanese poem", {
    source: "api",
    japanese_poem: parsedPoem?.japanese_poem,
  });
  console.log("Parsed English poem", {
    source: "api",
    english_poem: parsedPoem?.english_poem,
  });

  return validatePoem(parsedPoem);
};

export async function onRequest({ request, env }) {
  if (request.method !== "POST") {
    return methodNotAllowed();
  }

  try {
    const contentType = request.headers.get("content-type") || "";

    if (!contentType.toLowerCase().includes("multipart/form-data")) {
      throw poemError("invalid_image", "Multipart image upload is required", {
        responseStatus: 400,
        diagnosticStatus: 400,
      });
    }

    let formData;

    try {
      formData = await request.formData();
    } catch (error) {
      console.error("Poem multipart formData failed", {
        contentTypeHead: contentType.slice(0, 80),
        message: error?.message,
      });
      throw poemError("invalid_image", "Multipart form data could not be read", {
        responseStatus: 400,
        diagnosticStatus: 400,
      });
    }

    const image = formData.get("image");
    console.log("Poem form image received", {
      hasImage: Boolean(image),
      imageType: image?.type || null,
      imageSize: typeof image?.size === "number" ? image.size : null,
    });

    if (!isImageFile(image)) {
      console.error("Poem image was missing or unsupported", {
        imageType: image?.type || null,
      });
      throw poemError("invalid_image", "A supported image file is required", {
        responseStatus: 400,
        diagnosticStatus: 400,
      });
    }

    const apiKey = env?.OPENAI_API_KEY;

    if (!apiKey) {
      console.error("OPENAI_API_KEY is not configured");
      throw poemError(
        "missing_api_key",
        "OpenAI API key is not configured",
      );
    }

    const poem = await requestOpenAIPoem({
      apiKey,
      model: env?.OPENAI_MODEL || DEFAULT_MODEL,
      file: image,
    });

    console.log("Poem JSON validated", {
      source: "api",
      japaneseLength: poem.japanese_poem.length,
      englishLength: poem.english_poem.length,
      moodTags: poem.mood_tags,
    });

    return json(poem);
  } catch (error) {
    console.error("Poem generation failed", {
      source: "api_error",
      stage: error?.stage || "unknown",
      status: error?.diagnosticStatus || 500,
      message: error?.message,
      stack: error?.stack,
    });
    return errorResponse(error);
  }
}
