import { useEffect, useState } from 'react'

import {
  ArrowLeft,
  Upload,
  FileText,
  Trash2,
  Download,
  CheckCircle2,
  AlertCircle,
  LoaderCircle
} from 'lucide-react'

import { supabase } from '../supabase'
import './Rwbot.css'
import './RwbotDocuments.css'

const ALLOWED_EXTENSIONS = [
  'pdf',
  'doc',
  'docx',
  'jpg',
  'jpeg',
  'png',
  'txt'
]

const MAX_FILE_SIZE = 10 * 1024 * 1024

function RwbotDocuments({
  profile,
  onBack
}) {
  const [documents, setDocuments] = useState([])

  const [title, setTitle] = useState('')
  const [documentType, setDocumentType] =
    useState('OTHER')

  const [documentDate, setDocumentDate] =
    useState('')

  const [residentVisible, setResidentVisible] =
    useState(true)

  const [file, setFile] = useState(null)

  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)

  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    loadDocuments()
  }, [])

  const loadDocuments = async () => {
    setLoading(true)
    setError('')

    const {
      data,
      error: loadError
    } = await supabase
      .from('documents')
      .select(`
        id,
        title,
        document_type,
        document_date,
        file_name,
        file_path,
        mime_type,
        file_size,
        resident_visible,
        processing_status,
        created_at
      `)
      .order('created_at', {
        ascending: false
      })

    if (loadError) {
      console.error(loadError)

      setError(
        'Unable to load documents.'
      )

      setDocuments([])
      setLoading(false)
      return
    }

    setDocuments(data || [])
    setLoading(false)
  }

  const getFileExtension = (fileName) => {
    const parts = fileName
      .toLowerCase()
      .split('.')

    if (parts.length < 2) {
      return ''
    }

    return parts.pop()
  }

  const validateFile = (selectedFile) => {
    if (!selectedFile) {
      return 'Please select a file.'
    }

    const extension =
      getFileExtension(selectedFile.name)

    if (
      !ALLOWED_EXTENSIONS.includes(extension)
    ) {
      return 'Supported files: PDF, DOC, DOCX, JPG, JPEG, PNG and TXT.'
    }

    if (
      selectedFile.size >
      MAX_FILE_SIZE
    ) {
      return 'File size must be 10 MB or less.'
    }

    return ''
  }

  const handleFileChange = (event) => {
    setError('')
    setMessage('')

    const selectedFile =
      event.target.files?.[0]

    if (!selectedFile) {
      setFile(null)
      return
    }

    const validationError =
      validateFile(selectedFile)

    if (validationError) {
      setError(validationError)
      setFile(null)

      event.target.value = ''
      return
    }

    setFile(selectedFile)

    if (!title.trim()) {
      const suggestedTitle =
        selectedFile.name
          .replace(/\.[^/.]+$/, '')
          .replace(/[_-]+/g, ' ')

      setTitle(suggestedTitle)
    }
  }

  const buildSafeFileName = (
    originalName
  ) => {
    return originalName
      .trim()
      .replace(/\s+/g, '-')
      .replace(
        /[^a-zA-Z0-9._-]/g,
        ''
      )
  }

  const handleUpload = async (event) => {
    event.preventDefault()

    setError('')
    setMessage('')

    if (!title.trim()) {
      setError(
        'Please enter the document title.'
      )
      return
    }

    const validationError =
      validateFile(file)

    if (validationError) {
      setError(validationError)
      return
    }

    setUploading(true)

    let uploadedFilePath = null

    try {
      const safeFileName =
        buildSafeFileName(file.name)

      const uniquePart =
        `${Date.now()}-${crypto.randomUUID()}`

      uploadedFilePath =
        `${profile.id}/${uniquePart}-${safeFileName}`

      const {
        error: storageError
      } = await supabase.storage
        .from('rwbot-documents')
        .upload(
          uploadedFilePath,
          file,
          {
            cacheControl: '3600',
            upsert: false,
            contentType:
              file.type ||
              'application/octet-stream'
          }
        )

      if (storageError) {
        throw storageError
      }

      const {
        error: databaseError
      } = await supabase
        .from('documents')
        .insert({
          title: title.trim(),

          document_type:
            documentType,

          document_date:
            documentDate || null,

          file_name:
            file.name,

          file_path:
            uploadedFilePath,

          mime_type:
            file.type ||
            'application/octet-stream',

          file_size:
            file.size,

          uploaded_by:
            profile.id,

          resident_visible:
            residentVisible,

          processing_status:
            'UPLOADED'
        })

      if (databaseError) {
        await supabase.storage
          .from('rwbot-documents')
          .remove([
            uploadedFilePath
          ])

        throw databaseError
      }

      setMessage(
        'Document uploaded successfully.'
      )

      setTitle('')
      setDocumentType('OTHER')
      setDocumentDate('')
      setResidentVisible(true)
      setFile(null)

      const fileInput =
        document.getElementById(
          'rwbot-file-input'
        )

      if (fileInput) {
        fileInput.value = ''
      }

      await loadDocuments()

    } catch (uploadError) {
      console.error(uploadError)

      setError(
        uploadError.message ||
        'Unable to upload document.'
      )
    } finally {
      setUploading(false)
    }
  }

  const handleDownload =
    async (document) => {

      setError('')
      setMessage('')

      const {
        data,
        error: signedUrlError
      } = await supabase.storage
        .from('rwbot-documents')
        .createSignedUrl(
          document.file_path,
          60
        )

      if (signedUrlError) {
        console.error(
          signedUrlError
        )

        setError(
          'Unable to open document.'
        )
        return
      }

      window.open(
        data.signedUrl,
        '_blank',
        'noopener,noreferrer'
      )
    }

  const handleDelete =
    async (document) => {

      const confirmed =
        window.confirm(
          `Delete "${document.title}"?`
        )

      if (!confirmed) {
        return
      }

      setError('')
      setMessage('')

      const {
        error: storageError
      } = await supabase.storage
        .from('rwbot-documents')
        .remove([
          document.file_path
        ])

      if (storageError) {
        console.error(storageError)

        setError(
          'Unable to delete the stored file.'
        )
        return
      }

      const {
        error: databaseError
      } = await supabase
        .from('documents')
        .delete()
        .eq('id', document.id)

      if (databaseError) {
        console.error(
          databaseError
        )

        setError(
          'File was removed, but the database record could not be deleted.'
        )
        return
      }

      setMessage(
        'Document deleted successfully.'
      )

      await loadDocuments()
    }

  const formatFileSize = (bytes) => {
    if (!bytes) {
      return ''
    }

    if (bytes < 1024 * 1024) {
      return `${Math.round(
        bytes / 1024
      )} KB`
    }

    return `${(
      bytes /
      (1024 * 1024)
    ).toFixed(1)} MB`
  }

  return (
    <div className="rwbot-page">

      <header className="rwbot-chat-header">

        <button
          className="rwbot-back-button"
          onClick={onBack}
        >
          <ArrowLeft size={20} />
        </button>

        <div className="rwbot-chat-brand">

          <div className="rwbot-chat-brand-icon">
            <FileText size={23} />
          </div>

          <div>
            <h1>
              Manage Documents
            </h1>

            <p>
              RWBOT Knowledge Base
            </p>
          </div>

        </div>

      </header>


      <main className="rwbot-documents-main">

        <section className="rwbot-upload-card">

          <div className="rwbot-section-heading">

            <div>
              <h2>
                Upload Document
              </h2>

              <p>
                RWA Members only
              </p>
            </div>

            <Upload size={24} />

          </div>


          <form
            className="rwbot-upload-form"
            onSubmit={handleUpload}
          >

            <label>
              Document Title
            </label>

            <input
              type="text"
              value={title}
              onChange={(event) =>
                setTitle(
                  event.target.value
                )
              }
              placeholder="e.g. August 2026 GBM Minutes"
            />


            <div className="rwbot-form-grid">

              <div>

                <label>
                  Document Type
                </label>

                <select
                  value={documentType}
                  onChange={(event) =>
                    setDocumentType(
                      event.target.value
                    )
                  }
                >

                  <option value="GBM">
                    GBM
                  </option>

                  <option value="MOM">
                    Executive Body MOM
                  </option>

                  <option value="NOTICE">
                    Notice
                  </option>

                  <option value="FINANCIAL">
                    Financial Statement
                  </option>

                  <option value="BANK_STATEMENT">
                    Bank Statement
                  </option>

                  <option value="RULE">
                    Rules / Policy
                  </option>

                  <option value="SOP">
                    SOP
                  </option>

                  <option value="OTHER">
                    Other
                  </option>

                </select>

              </div>


              <div>

                <label>
                  Document Date
                </label>

                <input
                  type="date"
                  value={documentDate}
                  onChange={(event) =>
                    setDocumentDate(
                      event.target.value
                    )
                  }
                />

              </div>

            </div>


            <label>
              Select File
            </label>

            <input
              id="rwbot-file-input"
              className="rwbot-file-input"
              type="file"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.txt"
              onChange={
                handleFileChange
              }
            />


            {file && (
              <div className="rwbot-selected-file">

                <FileText size={18} />

                <div>

                  <strong>
                    {file.name}
                  </strong>

                  <span>
                    {formatFileSize(
                      file.size
                    )}
                  </span>

                </div>

              </div>
            )}


            <label className="rwbot-visibility-option">

              <input
                type="checkbox"
                checked={
                  residentVisible
                }
                onChange={(event) =>
                  setResidentVisible(
                    event.target.checked
                  )
                }
              />

              <span>
                Available to residents
              </span>

            </label>


            <p className="rwbot-upload-help">
              Supported: PDF, DOC, DOCX,
              JPG, JPEG, PNG and TXT.
              Maximum 10 MB.
            </p>


            {message && (
              <div className="rwbot-success">

                <CheckCircle2
                  size={18}
                />

                {message}

              </div>
            )}


            {error && (
              <div className="rwbot-error rwbot-document-error">

                <AlertCircle
                  size={18}
                />

                {error}

              </div>
            )}


            <button
              type="submit"
              className="rwbot-primary-button rwbot-upload-button"
              disabled={
                uploading ||
                !file
              }
            >

              {uploading ? (
                <>
                  <LoaderCircle
                    size={18}
                    className="rwbot-spin"
                  />

                  Uploading...
                </>
              ) : (
                <>
                  <Upload size={18} />

                  Upload Document
                </>
              )}

            </button>

          </form>

        </section>


        <section className="rwbot-document-list-card">

          <div className="rwbot-section-heading">

            <div>

              <h2>
                Uploaded Documents
              </h2>

              <p>
                {documents.length}
                {' '}
                document
                {documents.length === 1
                  ? ''
                  : 's'
                }
              </p>

            </div>

          </div>


          {loading ? (

            <div className="rwbot-document-loading">

              <LoaderCircle
                className="rwbot-spin"
                size={22}
              />

              Loading documents...

            </div>

          ) : documents.length === 0 ? (

            <div className="rwbot-empty-documents">

              <FileText size={34} />

              <strong>
                No documents uploaded yet
              </strong>

              <span>
                Upload your first RWA
                document above.
              </span>

            </div>

          ) : (

            <div className="rwbot-document-list">

              {documents.map(
                (document) => (

                  <div
                    key={document.id}
                    className="rwbot-document-row"
                  >

                    <div className="rwbot-document-icon">
                      <FileText size={21} />
                    </div>


                    <div className="rwbot-document-info">

                      <strong>
                        {document.title}
                      </strong>

                      <span>
                        {document.document_type}

                        {document.document_date
                          ? ` • ${document.document_date}`
                          : ''
                        }
                      </span>

                      <span>
                        {document.file_name}

                        {document.file_size
                          ? ` • ${formatFileSize(
                              document.file_size
                            )}`
                          : ''
                        }
                      </span>


                      <div className="rwbot-document-badges">

                        <span>
                          {
                            document.processing_status
                          }
                        </span>

                        <span>
                          {document.resident_visible
                            ? 'Residents'
                            : 'RWA Only'
                          }
                        </span>

                      </div>

                    </div>


                    <div className="rwbot-document-actions">

                      <button
                        type="button"
                        title="Open document"
                        onClick={() =>
                          handleDownload(
                            document
                          )
                        }
                      >
                        <Download size={18} />
                      </button>


                      <button
                        type="button"
                        className="rwbot-delete-button"
                        title="Delete document"
                        onClick={() =>
                          handleDelete(
                            document
                          )
                        }
                      >
                        <Trash2 size={18} />
                      </button>

                    </div>

                  </div>

                )
              )}

            </div>

          )}

        </section>

      </main>

    </div>
  )
}

export default RwbotDocuments