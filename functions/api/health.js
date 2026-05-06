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
        allow: "GET",
      },
    },
  );

export async function onRequest({ request, env }) {
  if (request.method !== "GET") {
    return methodNotAllowed();
  }

  return json({
    ok: true,
    hasOpenAiKey: Boolean(env?.OPENAI_API_KEY),
  });
}
