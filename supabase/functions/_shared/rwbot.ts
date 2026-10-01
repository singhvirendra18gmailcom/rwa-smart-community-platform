import { createClient } from "npm:@supabase/supabase-js@2.115.0"

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

export class HttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  })
}

export function optionsResponse() {
  return new Response("ok", { headers: corsHeaders })
}

export function getSupabaseUserClient(req: Request) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const supabaseKey =
    Deno.env.get("SUPABASE_ANON_KEY") ??
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY")
  const authorization = req.headers.get("Authorization")

  if (!supabaseUrl || !supabaseKey) {
    throw new HttpError(500, "Supabase function environment is not configured.")
  }

  if (!authorization) {
    throw new HttpError(401, "Missing authorization token.")
  }

  return createClient(supabaseUrl, supabaseKey, {
    global: {
      headers: {
        Authorization: authorization,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

export async function requireUser(supabase: ReturnType<typeof createClient>) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    throw new HttpError(401, "Invalid or expired login session.")
  }

  return user
}

export async function requireRwaMember(
  supabase: ReturnType<typeof createClient>,
  userId: string,
) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, active")
    .eq("id", userId)
    .maybeSingle()

  if (error) {
    throw new HttpError(500, `Unable to verify RWA member role: ${error.message}`)
  }

  if (!data || !data.active || data.role !== "RWA_MEMBER") {
    throw new HttpError(403, "Only active RWA members can perform this action.")
  }

  return data
}

function getGeminiApiKey() {
  const apiKey = Deno.env.get("GEMINI_API_KEY")

  if (!apiKey) {
    throw new HttpError(
      500,
      "GEMINI_API_KEY is not configured in Supabase Edge Function secrets.",
    )
  }

  return apiKey
}

export function getGeminiModel() {
  return Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash"
}

export function getGeminiFallbackModel() {
  return Deno.env.get("GEMINI_FALLBACK_MODEL") || "gemini-2.5-flash-lite"
}

export function getGeminiEmbeddingModel() {
  return Deno.env.get("GEMINI_EMBEDDING_MODEL") || "gemini-embedding-001"
}

async function parseGeminiError(response: Response) {
  let detail = ""

  try {
    const payload = await response.clone().json()
    detail = payload?.error?.message || JSON.stringify(payload)
  } catch {
    try {
      detail = await response.clone().text()
    } catch {
      detail = ""
    }
  }

  return detail || `${response.status} ${response.statusText}`
}

function isRetryableGeminiStatus(status: number) {
  return [429, 500, 502, 503, 504].includes(status)
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchGeminiWithRetry(
  url: string,
  init: RequestInit,
  attempts = 3,
) {
  let lastResponse: Response | null = null

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetch(url, init)

    if (response.ok) {
      return response
    }

    lastResponse = response

    if (!isRetryableGeminiStatus(response.status) || attempt === attempts) {
      return response
    }

    const delayMs = 700 * Math.pow(2, attempt - 1)
    await sleep(delayMs)
  }

  return lastResponse as Response
}

async function callGeminiGenerate(
  model: string,
  apiKey: string,
  parts: Array<Record<string, unknown>>,
  temperature: number,
  maxOutputTokens: number,
) {
  return await fetchGeminiWithRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts,
          },
        ],
        generationConfig: {
          temperature,
          maxOutputTokens,
        },
      }),
    },
  )
}

export async function generateGeminiText(
  parts: Array<Record<string, unknown>>,
  options: {
    temperature?: number
    maxOutputTokens?: number
    model?: string
  } = {},
) {
  const apiKey = getGeminiApiKey()
  const primaryModel = options.model || getGeminiModel()
  const fallbackModel = getGeminiFallbackModel()
  const temperature = options.temperature ?? 0.15
  const maxOutputTokens = options.maxOutputTokens ?? 8192

  let response = await callGeminiGenerate(
    primaryModel,
    apiKey,
    parts,
    temperature,
    maxOutputTokens,
  )

  if (
    !response.ok &&
    isRetryableGeminiStatus(response.status) &&
    fallbackModel !== primaryModel
  ) {
    response = await callGeminiGenerate(
      fallbackModel,
      apiKey,
      parts,
      temperature,
      maxOutputTokens,
    )
  }

  if (!response.ok) {
    const detail = await parseGeminiError(response)
    throw new HttpError(502, `Gemini generation failed: ${detail}`)
  }

  const payload = await response.json()
  const text = (payload?.candidates?.[0]?.content?.parts || [])
    .map((part: { text?: string }) => part?.text || "")
    .join("")
    .trim()

  if (!text) {
    throw new HttpError(502, "Gemini returned an empty response.")
  }

  return text
}

export async function embedText(
  text: string,
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY",
  title?: string,
) {
  const apiKey = getGeminiApiKey()
  const model = getGeminiEmbeddingModel()

  const response = await fetchGeminiWithRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:embedContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        model: `models/${model}`,
        content: {
          parts: [{ text }],
        },
        taskType,
        ...(title ? { title } : {}),
        outputDimensionality: 768,
      }),
    },
  )

  if (!response.ok) {
    const detail = await parseGeminiError(response)
    throw new HttpError(502, `Gemini embedding failed: ${detail}`)
  }

  const payload = await response.json()
  const values = payload?.embedding?.values

  if (!Array.isArray(values) || values.length !== 768) {
    throw new HttpError(502, "Gemini returned an invalid embedding vector.")
  }

  return values as number[]
}

export async function embedTexts(
  texts: string[],
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY",
  title?: string,
) {
  if (texts.length === 0) {
    return [] as number[][]
  }

  const apiKey = getGeminiApiKey()
  const model = getGeminiEmbeddingModel()
  const result: number[][] = []
  const batchSize = 20

  for (let offset = 0; offset < texts.length; offset += batchSize) {
    const batch = texts.slice(offset, offset + batchSize)

    const response = await fetchGeminiWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:batchEmbedContents`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          requests: batch.map((text) => ({
            model: `models/${model}`,
            content: {
              parts: [{ text }],
            },
            taskType,
            ...(title ? { title } : {}),
            outputDimensionality: 768,
          })),
        }),
      },
    )

    if (!response.ok) {
      const detail = await parseGeminiError(response)
      throw new HttpError(502, `Gemini batch embedding failed: ${detail}`)
    }

    const payload = await response.json()
    const embeddings = payload?.embeddings

    if (!Array.isArray(embeddings) || embeddings.length !== batch.length) {
      throw new HttpError(502, "Gemini returned an invalid batch embedding response.")
    }

    for (const embedding of embeddings) {
      const values = embedding?.values

      if (!Array.isArray(values) || values.length !== 768) {
        throw new HttpError(502, "Gemini returned an invalid embedding vector.")
      }

      result.push(values as number[])
    }
  }

  return result
}

export function getErrorResponse(error: unknown) {
  if (error instanceof HttpError) {
    return jsonResponse({ error: error.message }, error.status)
  }

  const message = error instanceof Error ? error.message : "Unexpected server error."
  return jsonResponse({ error: message }, 500)
}
