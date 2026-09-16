param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectRef,

  [Parameter(Mandatory = $true)]
  [string]$GeminiApiKey,

  [string]$GeminiModel = "gemini-2.5-flash",

  [string]$EmbeddingModel = "gemini-embedding-001"
)

$ErrorActionPreference = "Stop"

Write-Host "Linking Supabase project..."
supabase link --project-ref $ProjectRef

Write-Host "Applying RWBOT database migration..."
supabase db push

Write-Host "Setting RWBOT Edge Function secrets..."
supabase secrets set `
  GEMINI_API_KEY="$GeminiApiKey" `
  GEMINI_MODEL="$GeminiModel" `
  GEMINI_EMBEDDING_MODEL="$EmbeddingModel"

Write-Host "Deploying RWBOT document processor..."
supabase functions deploy rwbot-process-document

Write-Host "Deploying RWBOT question service..."
supabase functions deploy rwbot-ask

Write-Host "RWBOT backend deployment completed."
Write-Host "Open Manage Documents and process/reprocess existing files before testing Ask RWBOT."
