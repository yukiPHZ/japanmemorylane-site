const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-4o-mini";
const IMAGE_DETAIL = "high";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
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
Use 1 to 3 short lines.
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

  return "";
};

const validatePoem = (poem) => {
  const japanesePoem = poem?.japanese_poem;
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
    throw new Error("Invalid poem JSON");
  }

  return {
    japanese_poem: japanesePoem.trim(),
    english_poem: englishPoem.trim(),
    mood_tags: moodTags,
  };
};

const requestOpenAIPoem = async ({ apiKey, model, file }) => {
  const arrayBuffer = await file.arrayBuffer();

  if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("Image too large");
  }

  if (arrayBuffer.byteLength === 0) {
    throw new Error("Image is empty");
  }

  console.log("Japan Memory Lane poem request", {
    model,
    imageType: file.type,
    imageBytes: arrayBuffer.byteLength,
    imageDetail: IMAGE_DETAIL,
  });

  const imageUrl = `data:${file.type};base64,${toBase64(arrayBuffer)}`;
  const response = await fetch(OPENAI_RESPONSES_URL, {
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
  const responseTextBody = await response.text();

  console.log("OpenAI API response status", {
    status: response.status,
    ok: response.ok,
  });

  if (!response.ok) {
    console.error("OpenAI API error response", {
      status: response.status,
      body: responseTextBody.slice(0, 2000),
    });
    throw new Error(`OpenAI request failed with ${response.status}`);
  }

  const responseBody = JSON.parse(responseTextBody);
  const responseText = extractResponseText(responseBody);

  console.log("OpenAI raw output head", responseText.slice(0, 1000));

  const parsedPoem = JSON.parse(responseText);

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
      return json({ error: "multipart_form_data_required" }, { status: 400 });
    }

    const formData = await request.formData();
    const image = formData.get("image");

    if (!isImageFile(image)) {
      console.error("Poem image was missing or unsupported", {
        imageType: image?.type || null,
      });
      return json({ error: "unsupported_image" }, { status: 400 });
    }

    const apiKey = env?.OPENAI_API_KEY;

    if (!apiKey) {
      console.error("OPENAI_API_KEY is not configured");
      throw new Error("OPENAI_API_KEY is not configured");
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
      message: error?.message,
      stack: error?.stack,
    });
    return json({ error: "poem_generation_failed" }, { status: 500 });
  }
}
