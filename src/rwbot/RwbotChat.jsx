import { useState } from 'react'
import {
  ArrowLeft,
  Bot,
  Send,
  UserRound,
  Lightbulb,
  LoaderCircle,
  AlertCircle,
  ExternalLink
} from 'lucide-react'

import { supabase } from '../supabase'
import useRwbotOwnerName from './useRwbotOwnerName'
import './Rwbot.css'
import './RwbotChat.css'

function RwbotChat({
  profile,
  onBack
}) {
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState([])
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState('')

  const {
    flat,
    displayName
  } = useRwbotOwnerName(profile)

  const suggestedQuestions = [
    'How many flats do we have?',
    'How much was spent on civil work?',
    'Summarize the August 2026 GBM.',
    'What was decided about parking?'
  ]

  const openSource = async (source) => {
    if (!source?.filePath) {
      return
    }

    setError('')

    const {
      data,
      error: signedUrlError
    } = await supabase.storage
      .from('rwbot-documents')
      .createSignedUrl(
        source.filePath,
        60
      )

    if (signedUrlError || !data?.signedUrl) {
      console.error(signedUrlError)
      setError('Unable to open the source document.')
      return
    }

    window.open(
      data.signedUrl,
      '_blank',
      'noopener,noreferrer'
    )
  }

  const askQuestion = async (text) => {
    const cleanQuestion = text.trim()

    if (!cleanQuestion || asking) {
      return
    }

    setError('')
    setQuestion('')
    setAsking(true)

    const userMessage = {
      id: crypto.randomUUID(),
      type: 'user',
      text: cleanQuestion
    }

    setMessages((current) => [
      ...current,
      userMessage
    ])

    try {
      const {
        data,
        error: functionError
      } = await supabase.functions.invoke(
        'rwbot-ask',
        {
          body: {
            question: cleanQuestion
          }
        }
      )

      if (functionError) {
        throw functionError
      }

      if (!data?.answer) {
        throw new Error('RWBOT returned an empty answer.')
      }

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          type: 'bot',
          text: data.answer,
          sources: Array.isArray(data.sources)
            ? data.sources
            : []
        }
      ])
    } catch (askError) {
      console.error('RWBOT question failed:', askError)

      const message =
        askError?.message ||
        'Unable to contact the RWBOT service.'

      setError(message)

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          type: 'bot',
          text:
            'I could not complete that request. Please try again in a moment.',
          sources: []
        }
      ])
    } finally {
      setAsking(false)
    }
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    askQuestion(question)
  }

  return (
    <div className="rwbot-page">

      <header className="rwbot-chat-header">

        <button
          className="rwbot-back-button"
          onClick={onBack}
          type="button"
          aria-label="Back"
        >
          <ArrowLeft size={20} />
        </button>

        <div className="rwbot-chat-brand">

          <div className="rwbot-chat-brand-icon">
            <Bot size={24} />
          </div>

          <div>
            <h1>Ask RWBOT</h1>
            <p>RWA Transparency Assistant</p>
          </div>

        </div>

      </header>

      <main className="rwbot-chat-main">

        <div className="rwbot-chat-user-info">
          <span>{displayName}</span>

          {flat && (
            <span>
              Flat {flat.flat_no} • Tower {flat.tower_no}
            </span>
          )}
        </div>

        {messages.length === 0 && (
          <section className="rwbot-chat-intro">

            <div className="rwbot-chat-intro-icon">
              <Bot size={34} />
            </div>

            <h2>What would you like to know?</h2>

            <p>
              Ask about RWA accounts, expenses,
              collections, GBM decisions, notices,
              rules and approved records.
            </p>

            <div className="rwbot-suggestion-title">
              <Lightbulb size={16} />
              Try asking
            </div>

            <div className="rwbot-chat-suggestions">
              {suggestedQuestions.map((item) => (
                <button
                  key={item}
                  onClick={() => askQuestion(item)}
                  type="button"
                  disabled={asking}
                >
                  {item}
                </button>
              ))}
            </div>

          </section>
        )}

        <section className="rwbot-messages">

          {messages.map((message) => (
            <div
              key={message.id}
              className={
                message.type === 'user'
                  ? 'rwbot-message-row rwbot-message-user'
                  : 'rwbot-message-row rwbot-message-bot'
              }
            >

              <div className="rwbot-message-avatar">
                {message.type === 'user'
                  ? <UserRound size={18} />
                  : <Bot size={18} />
                }
              </div>

              <div className="rwbot-message-content">

                <div className="rwbot-message-bubble rwbot-message-text">
                  {message.text}
                </div>

                {message.type === 'bot' &&
                  Array.isArray(message.sources) &&
                  message.sources.length > 0 && (
                    <div className="rwbot-source-list">
                      <span className="rwbot-source-heading">
                        Sources
                      </span>

                      {message.sources.map((source, index) => {
                        const citationPrefix =
                          Array.isArray(source.labels) && source.labels.length > 0
                            ? `[${source.labels.join(', ')}] `
                            : ''

                        const label = source.documentDate
                          ? `${citationPrefix}${source.title} • ${source.documentDate}`
                          : `${citationPrefix}${source.title}`

                        if (!source.filePath) {
                          return (
                            <div
                              className="rwbot-source-static"
                              key={`${source.title}-${index}`}
                            >
                              {label}
                            </div>
                          )
                        }

                        return (
                          <button
                            type="button"
                            className="rwbot-source-button"
                            key={`${source.filePath}-${index}`}
                            onClick={() => openSource(source)}
                          >
                            <span>
                              {label}
                              {source.pageNo
                                ? ` • Page ${source.pageNo}`
                                : ''
                              }
                            </span>

                            <ExternalLink size={14} />
                          </button>
                        )
                      })}
                    </div>
                  )}

              </div>

            </div>
          ))}

          {asking && (
            <div className="rwbot-message-row rwbot-message-bot">
              <div className="rwbot-message-avatar">
                <Bot size={18} />
              </div>

              <div className="rwbot-thinking">
                <LoaderCircle
                  size={17}
                  className="rwbot-spin"
                />
                Searching RWA records...
              </div>
            </div>
          )}

        </section>

        {error && (
          <div className="rwbot-chat-error">
            <AlertCircle size={17} />
            <span>{error}</span>
          </div>
        )}

      </main>

      <form
        className="rwbot-chat-input-area"
        onSubmit={handleSubmit}
      >

        <div className="rwbot-chat-input-wrap">

          <textarea
            value={question}
            onChange={(event) =>
              setQuestion(event.target.value)
            }
            placeholder="Ask RWBOT..."
            rows="1"
            disabled={asking}
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.shiftKey
              ) {
                event.preventDefault()
                askQuestion(question)
              }
            }}
          />

          <button
            type="submit"
            className="rwbot-send-button"
            disabled={
              asking ||
              !question.trim()
            }
            aria-label="Send question"
          >
            {asking
              ? <LoaderCircle size={19} className="rwbot-spin" />
              : <Send size={19} />
            }
          </button>

        </div>

        <p className="rwbot-chat-note">
          RWBOT answers from RWA records available to your account.
        </p>

      </form>

    </div>
  )
}

export default RwbotChat
