const poemResponse = {
  japanese_poem: "雨の匂いが\nまだ残っていた",
  english_poem: "The scent of rain still remained.",
  mood_tags: ["rain", "quiet", "memory"],
};

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

export async function onRequest({ request }) {
  if (request.method !== "POST") {
    return methodNotAllowed();
  }

  const contentType = request.headers.get("content-type") || "";

  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return json({ error: "multipart_form_data_required" }, { status: 400 });
  }

  const formData = await request.formData();
  const image = formData.get("image");

  if (!(image instanceof File)) {
    return json({ error: "image_required" }, { status: 400 });
  }

  return json(poemResponse);
}
