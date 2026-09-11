import { useState } from 'react'
import {
  ArrowLeft,
  Bot,
  Send,
  UserRound,
  Lightbulb
} from 'lucide-react'

import './Rwbot.css'

function RwbotChat({
  profile,
  onBack
}) {
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState([])

  const flat = Array.isArray(profile.flat)
    ? profile.flat[0]
    : profile.flat

  const suggestedQuestions = [
    'How much was spent on civil work?',
    'What was the total collection in January 2026?',
    'Summarize the August 2026 GBM.',
    'What was decided about parking?'
  ]

  const getPrototypeAnswer = (userQuestion) => {
    const text = userQuestion.toLowerCase()

    if (
      text.includes('civil') ||
      text.includes('spent') ||
      text.includes('expense')
    ) {
      return {
        answer:
          'The RWBOT chat screen is working correctly. Financial records are not connected yet. In the next phase, I will calculate this answer from the RWA financial data instead of guessing the amount.',
        source:
          'Financial data connection pending'
      }
    }

    if (
      text.includes('collection') ||
      text.includes('maintenance')
    ) {
      return {
        answer:
          'The collection database is not connected to RWBOT yet. Once connected, I will return the exact collection amount for the requested month directly from RWA records.',
        source:
          'Collection data connection pending'
      }
    }

    if (
      text.includes('gbm') ||
      text.includes('meeting') ||
      text.includes('parking')
    ) {
      return {
        answer:
          'The document knowledge base is not connected yet. Once RWA members upload GBM, MOM and other approved documents, I will search those records, answer the question and show the source document.',
        source:
          'Document knowledge base pending'
      }
    }

    return {
      answer:
        'RWBOT is ready to receive your question. The next step is to connect approved RWA documents and structured financial records so I can provide factual answers with sources.',
      source:
        'RWBOT prototype'
    }
  }

  const askQuestion = (text) => {
    const cleanQuestion = text.trim()

    if (!cleanQuestion) {
      return
    }

    const result =
      getPrototypeAnswer(cleanQuestion)

    setMessages((current) => [
      ...current,
      {
        id: Date.now(),
        type: 'user',
        text: cleanQuestion
      },
      {
        id: Date.now() + 1,
        type: 'bot',
        text: result.answer,
        source: result.source
      }
    ])

    setQuestion('')
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    askQuestion(question)
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
            <Bot size={24} />
          </div>

          <div>
            <h1>Ask RWBOT</h1>

            <p>
              RWA Transparency Assistant
            </p>
          </div>

        </div>

      </header>

      <main className="rwbot-chat-main">

        <div className="rwbot-chat-user-info">

          <span>
            {profile.full_name}
          </span>

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

            <h2>
              What would you like to know?
            </h2>

            <p>
              Ask about RWA accounts, expenses,
              collections, GBM decisions, notices,
              rules and records.
            </p>

            <div className="rwbot-suggestion-title">
              <Lightbulb size={16} />
              Try asking
            </div>

            <div className="rwbot-chat-suggestions">

              {suggestedQuestions.map(
                (item) => (
                  <button
                    key={item}
                    onClick={() =>
                      askQuestion(item)
                    }
                  >
                    {item}
                  </button>
                )
              )}

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

                <div className="rwbot-message-bubble">
                  {message.text}
                </div>

                {message.source && (
                  <div className="rwbot-message-source">
                    Source: {message.source}
                  </div>
                )}

              </div>

            </div>

          ))}

        </section>

      </main>

      <form
        className="rwbot-chat-input-area"
        onSubmit={handleSubmit}
      >

        <div className="rwbot-chat-input-wrap">

          <textarea
            value={question}
            onChange={(e) =>
              setQuestion(e.target.value)
            }
            placeholder="Ask RWBOT..."
            rows="1"
            onKeyDown={(e) => {
              if (
                e.key === 'Enter' &&
                !e.shiftKey
              ) {
                e.preventDefault()
                askQuestion(question)
              }
            }}
          />

          <button
            type="submit"
            className="rwbot-send-button"
            disabled={!question.trim()}
          >
            <Send size={19} />
          </button>

        </div>

        <p className="rwbot-chat-note">
          RWBOT answers will be based on approved RWA records.
        </p>

      </form>

    </div>
  )
}

export default RwbotChat