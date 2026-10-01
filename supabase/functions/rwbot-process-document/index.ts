import { Buffer } from "node:buffer"
import WordExtractor from "npm:word-extractor@1.0.4"

import {
  getErrorResponse,
  generateGeminiText,
  getSupabaseUserClient,
  jsonResponse,
  optionsResponse,
  requireRwaMember,
  requireUser,
  embedTexts,
} from "../_shared/rwbot.ts"

const STORAGE_BUCKET = "rwbot-documents"
const MAX_FILE_BYTES = 10 * 1024 * 1024
const MAX_TEXT_CHARACTERS = 450_000
const CHUNK_SIZE = 3200
const CHUNK_OVERLAP = 400
const MAX_CHUNKS = 160

function bytesToBase64(bytes: Uint8Array) {
  let binary = ""
  const step = 0x8000

  for (let i = 0; i < bytes.length; i += step) {
    const slice = bytes.subarray(i, Math.min(i + step, bytes.length))
    binary += String.fromCharCode(...slice)
  }

  return btoa(binary)
}

function cleanExtractedText(text: string) {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
}

function stripCodeFence(text: string) {
  const trimmed = text.trim()

  if (!trimmed.startsWith("```")) {
    return trimmed
  }

  return trimmed
    .replace(/^```(?:text|markdown)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim()
}

function inferMimeType(fileName: string, storedMimeType: string | null) {
  if (storedMimeType && storedMimeType !== "application/octet-stream") {
    return storedMimeType
  }

  const extension = fileName.toLowerCase().split(".").pop()

  switch (extension) {
    case "pdf":
      return "application/pdf"
    case "doc":
      return "application/msword"
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    case "jpg":
    case "jpeg":
      return "image/jpeg"
    case "png":
      return "image/png"
    case "txt":
      return "text/plain"
    default:
      return storedMimeType || "application/octet-stream"
  }
}

async function extractWordText(bytes: Uint8Array) {
  const extractor = new WordExtractor()
  const document = await extractor.extract(Buffer.from(bytes))
  return document.getBody()
}

async function extractVisualDocumentText(
  bytes: Uint8Array,
  mimeType: string,
  title: string,
) {
  const base64 = bytesToBase64(bytes)

  const prompt = [
    "You are extracting text for a private RWA knowledge base.",
    `Document title: ${title}`,
    "Transcribe ALL readable content accurately.",
    "Preserve headings, dates, names, rupee amounts, totals, balances, account entries, resolutions, decisions and table rows.",
    "For tables, output one row per line and separate cells with | so that exact amounts remain searchable.",
    "Do not summarize, explain, correct, infer or omit information.",
    "For a multi-page PDF, add [PAGE n] markers when the page changes.",
    "Return only the extracted document text.",
  ].join("\n")

  const text = await generateGeminiText(
    [
      { text: prompt },
      {
        inlineData: {
          mimeType,
          data: base64,
        },
      },
    ],
    {
      temperature: 0,
      maxOutputTokens: 16384,
    },
  )

  return stripCodeFence(text)
}

async function extractText(
  bytes: Uint8Array,
  mimeType: string,
  fileName: string,
  title: string,
) {
  if (mimeType === "text/plain") {
    return new TextDecoder("utf-8").decode(bytes)
  }

  if (
    mimeType === "application/msword" ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    fileName.toLowerCase().endsWith(".doc") ||
    fileName.toLowerCase().endsWith(".docx")
  ) {
    return await extractWordText(bytes)
  }

  if (
    mimeType === "application/pdf" ||
    mimeType === "image/jpeg" ||
    mimeType === "image/png"
  ) {
    return await extractVisualDocumentText(bytes, mimeType, title)
  }

  throw new Error(
    `Text extraction is not configured for file type ${mimeType}. Upload PDF, DOC, DOCX, JPG, PNG or TXT.`,
  )
}

type Chunk = {
  chunkNo: number
  content: string
  pageNo: number | null
}

function pageNumberFromText(text: string) {
  const matches = [...text.matchAll(/\[PAGE\s+(\d+)\]/gi)]
  const last = matches.at(-1)
  return last ? Number(last[1]) : null
}

function splitIntoChunks(text: string) {
  const chunks: Chunk[] = []
  let start = 0
  let chunkNo = 1
  let complete = false

  while (start < text.length && chunks.length < MAX_CHUNKS) {
    let end = Math.min(start + CHUNK_SIZE, text.length)

    if (end < text.length) {
      const minimumBreak = start + Math.floor(CHUNK_SIZE * 0.55)
      const candidate = text.lastIndexOf("\n", end)

      if (candidate >= minimumBreak) {
        end = candidate
      }
    }

    const content = text.slice(start, end).trim()

    if (content) {
      chunks.push({
        chunkNo,
        content,
        pageNo: pageNumberFromText(content),
      })
      chunkNo += 1
    }

    if (end >= text.length) {
      complete = true
      break
    }

    const nextStart = Math.max(0, end - CHUNK_OVERLAP)
    start = nextStart > start ? nextStart : end
  }

  return {
    chunks,
    truncated: !complete,
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return optionsResponse()
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405)
  }

  let supabase: ReturnType<typeof getSupabaseUserClient> | null = null
  let documentId: string | null = null

  try {
    supabase = getSupabaseUserClient(req)
    const user = await requireUser(supabase)
    await requireRwaMember(supabase, user.id)

    const body = await req.json()
    documentId = typeof body?.documentId === "string" ? body.documentId : null

    if (!documentId) {
      return jsonResponse({ error: "documentId is required." }, 400)
    }

    const { data: document, error: documentError } = await supabase
      .from("rwbot_documents")
      .select(
        "id, title, document_type, document_date, file_name, file_path, mime_type, file_size, resident_visible, processing_status",
      )
      .eq("id", documentId)
      .maybeSingle()

    if (documentError) {
      throw new Error(`Unable to load document: ${documentError.message}`)
    }

    if (!document) {
      return jsonResponse({ error: "Document not found." }, 404)
    }

    if (document.file_size && Number(document.file_size) > MAX_FILE_BYTES) {
      throw new Error("Document is larger than the supported 10 MB processing limit.")
    }

    const { error: processingUpdateError } = await supabase
      .from("rwbot_documents")
      .update({
        processing_status: "PROCESSING",
        processing_error: null,
      })
      .eq("id", documentId)

    if (processingUpdateError) {
      throw new Error(`Unable to mark document as processing: ${processingUpdateError.message}`)
    }

    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(document.file_path)

    if (downloadError || !fileBlob) {
      throw new Error(`Unable to download document: ${downloadError?.message || "Unknown storage error"}`)
    }

    const bytes = new Uint8Array(await fileBlob.arrayBuffer())
    const mimeType = inferMimeType(document.file_name, document.mime_type)
    const extracted = await extractText(bytes, mimeType, document.file_name, document.title)
    const normalized = cleanExtractedText(extracted)

    if (!normalized) {
      throw new Error("No readable text could be extracted from this document.")
    }

    if (normalized.length > MAX_TEXT_CHARACTERS) {
      throw new Error(
        `Extracted text is too large (${normalized.length.toLocaleString()} characters). Split this document into smaller files before processing.`,
      )
    }

    const { chunks, truncated } = splitIntoChunks(normalized)

    if (chunks.length === 0) {
      throw new Error("No searchable chunks could be created from this document.")
    }

    if (truncated) {
      throw new Error("Document produced too many chunks. Split it into smaller files before processing.")
    }

    const embeddings = await embedTexts(
      chunks.map((chunk) => chunk.content),
      "RETRIEVAL_DOCUMENT",
      document.title,
    )

    const { error: deleteError } = await supabase
      .from("rwbot_document_chunks")
      .delete()
      .eq("document_id", documentId)

    if (deleteError) {
      throw new Error(`Unable to replace existing document chunks: ${deleteError.message}`)
    }

    const rows = chunks.map((chunk, index) => ({
      document_id: documentId,
      chunk_no: chunk.chunkNo,
      content: chunk.content,
      page_no: chunk.pageNo,
      embedding: embeddings[index],
      metadata: {
        title: document.title,
        document_type: document.document_type,
        document_date: document.document_date,
        file_name: document.file_name,
      },
    }))

    for (let offset = 0; offset < rows.length; offset += 25) {
      const { error: insertError } = await supabase
        .from("rwbot_document_chunks")
        .insert(rows.slice(offset, offset + 25))

      if (insertError) {
        throw new Error(`Unable to store document chunks: ${insertError.message}`)
      }
    }

    const { error: readyError } = await supabase
      .from("rwbot_documents")
      .update({
        processing_status: "READY",
        processing_error: null,
        processed_at: new Date().toISOString(),
        chunk_count: chunks.length,
      })
      .eq("id", documentId)

    if (readyError) {
      throw new Error(`Unable to mark document as ready: ${readyError.message}`)
    }

    return jsonResponse({
      ok: true,
      documentId,
      status: "READY",
      chunkCount: chunks.length,
      extractedCharacters: normalized.length,
    })
  } catch (error) {
    if (supabase && documentId) {
      const message = error instanceof Error ? error.message : "Document processing failed."

      try {
        await supabase
          .from("rwbot_documents")
          .update({
            processing_status: "FAILED",
            processing_error: message.slice(0, 1000),
          })
          .eq("id", documentId)
      } catch {
        // Keep the original processing error as the response.
      }
    }

    return getErrorResponse(error)
  }
})
