const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-4o-mini";
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

Look at the uploaded photo.
Find only a small trace of atmosphere:
light, rain, silence, sound, distance, season, time, or stillness.

Write a short Japanese poem first.
The Japanese must be natural, quiet, and suitable for vertical writing.
Use 1 to 3 short lines.
Reduce explicit subjects.
Do not explain the photo.
Do not describe everything.
Do not say emotions directly.
Do not use dramatic or overly poetic words.
Do not use tourism, advertising, influencer, motivational, or fantasy language.
Avoid words like miracle, magic, dream, soul, destiny, eternal, hidden gem, must-see, and perfect spot.
Leave space.

Then write a small English poem as a gentle interpretation.
The English should support the Japanese, not replace it.
Use 1 to 2 short lines.
Keep it quieter than the Japanese.

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
  const moodTags = poem?.mood_tags;

  if (
    typeof japanesePoem !== "string" ||
    typeof englishPoem !== "string" ||
    !Array.isArray(moodTags) ||
    moodTags.length < 1 ||
    moodTags.length > 5 ||
    !moodTags.every((tag) => typeof tag === "string")
  ) {
    throw new Error("Invalid poem JSON");
  }

  return {
    japanese_poem: japanesePoem.trim(),
    english_poem: englishPoem.trim(),
    mood_tags: moodTags.map((tag) => tag.trim()).filter(Boolean).slice(0, 5),
  };
};

const requestOpenAIPoem = async ({ apiKey, model, file }) => {
  const arrayBuffer = await file.arrayBuffer();

  if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("Image too large");
  }

  console.log("Japan Memory Lane poem request", {
    model,
    imageType: file.type,
    imageBytes: arrayBuffer.byteLength,
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
              detail: "low",
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

  console.log("OpenAI API response body", responseTextBody.slice(0, 4000));

  const responseBody = JSON.parse(responseTextBody);
  const responseText = extractResponseText(responseBody);

  console.log("OpenAI output text", responseText.slice(0, 1000));

  return validatePoem(JSON.parse(responseText));
};

export async function onRequest({ request, env }) {
  if (request.method !== "POST") {
    return methodNotAllowed();
  }

  try {
    const apiKey = env?.OPENAI_API_KEY;

    if (!apiKey) {
      console.error("OPENAI_API_KEY is not configured");
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const contentType = request.headers.get("content-type") || "";

    if (!contentType.toLowerCase().includes("multipart/form-data")) {
      return json({ error: "multipart_form_data_required" }, { status: 400 });
    }

    const formData = await request.formData();
    const image = formData.get("image");

    if (!isImageFile(image)) {
      return json({ error: "unsupported_image" }, { status: 400 });
    }

    const poem = await requestOpenAIPoem({
      apiKey,
      model: env?.OPENAI_MODEL || DEFAULT_MODEL,
      file: image,
    });

    console.log("Poem JSON validated", {
      japaneseLength: poem.japanese_poem.length,
      englishLength: poem.english_poem.length,
      moodTags: poem.mood_tags,
    });

    return json(poem);
  } catch (error) {
    console.error("Poem generation failed", {
      message: error?.message,
      stack: error?.stack,
    });
    return json({ error: "poem_generation_failed" }, { status: 500 });
  }
}
