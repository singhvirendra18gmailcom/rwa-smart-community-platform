# RWBOT backend setup

RWBOT uses the existing Supabase project for authentication, PostgreSQL, Storage and Edge Functions. Gemini is called only from Supabase Edge Functions, so the Gemini API key is never exposed to the React browser app.

## What is included

- `rwbot_documents` document master
- `rwbot_document_chunks` searchable chunks with 768-dimensional pgvector embeddings
- `rwbot_question_log` question/answer audit trail
- `rwbot-process-document` Edge Function
- `rwbot-ask` Edge Function
- React chat connected to the Edge Function
- automatic processing after a new document upload
- manual reprocess button for documents uploaded before RAG was enabled
- role/visibility enforcement through the existing Supabase Auth + RLS model

Supported uploads remain PDF, DOC, DOCX, JPG/JPEG, PNG and TXT up to 10 MB.

## 1. Prerequisites

Install the Supabase CLI and log in:

```powershell
supabase login
```

The database must already contain the existing RWBOT foundation (`flats`, `profiles`, `rwbot_documents`, `is_rwa_member()`) and the private Storage bucket `rwbot-documents`.

## 2. Deploy in one command

From the repository root:

```powershell
.\scripts\deploy-rwbot.ps1 `
  -ProjectRef "YOUR_SUPABASE_PROJECT_REF" `
  -GeminiApiKey "YOUR_GEMINI_API_KEY"
```

Optional model overrides:

```powershell
.\scripts\deploy-rwbot.ps1 `
  -ProjectRef "YOUR_SUPABASE_PROJECT_REF" `
  -GeminiApiKey "YOUR_GEMINI_API_KEY" `
  -GeminiModel "gemini-2.5-flash" `
  -EmbeddingModel "gemini-embedding-001"
```

Do not put `GEMINI_API_KEY` in the Vite `.env` file. Keep it only in Supabase Edge Function secrets.

## 3. If deploying manually

```powershell
supabase link --project-ref YOUR_SUPABASE_PROJECT_REF
supabase db push
supabase secrets set GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
supabase secrets set GEMINI_MODEL="gemini-2.5-flash"
supabase secrets set GEMINI_EMBEDDING_MODEL="gemini-embedding-001"
supabase functions deploy rwbot-process-document
supabase functions deploy rwbot-ask
```

## 4. Process existing documents

Documents uploaded before this change will still show `UPLOADED`. Log in as an `RWA_MEMBER`, open **Manage Documents**, and use the circular-arrow button to process each existing document.

A successfully indexed document changes to `READY`. If extraction/indexing fails, it changes to `FAILED`; press the same button after correcting the issue to retry.

## 5. Test questions

After at least one document is `READY`, try:

- `How many flats do we have?` (answered from the structured flat master)
- `How many flats are in Tower 5?` (structured flat master)
- `What was decided about parking?` (document RAG)
- `Summarize the August 2026 GBM.` (document RAG)
- `How much was spent on civil work?` (document RAG if a supporting financial record is indexed)

RWBOT is instructed to answer only from accessible RWA records and to return source documents. Resident users cannot retrieve chunks from documents marked RWA-only.

## Processing notes

- PDF/JPG/PNG: Gemini performs document/image transcription so scanned statements are supported.
- DOC/DOCX: text is extracted server-side with `word-extractor`.
- TXT: decoded directly.
- Document text is chunked and embedded with a 768-dimensional Gemini embedding before being stored in pgvector.
- Existing file visibility (`resident_visible`) is enforced during retrieval.
