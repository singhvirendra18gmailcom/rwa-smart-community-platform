import {
  useEffect,
  useRef,
  useState
} from 'react'

import {
  ArrowLeft,
  Bot,
  Send,
  UserRound,
  LoaderCircle,
  AlertCircle,
  ExternalLink,
  CircleDollarSign,
  Landmark,
  CarFront,
  Megaphone,
  Sparkles,
  ShieldCheck,
  Home,
  Building2
} from 'lucide-react'

import { supabase } from '../supabase'
import useRwbotOwnerName from './useRwbotOwnerName'

import rwbotMascot from '../assets/rwbot-mascot.png'

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

  const messagesEndRef = useRef(null)

  const {
    flat,
    displayName
  } = useRwbotOwnerName(profile)


  const suggestedQuestions = [
    {
      key: 'accounts',
      title: 'Accounts & Expenses',
      subtitle: 'Collections, expenses and statements',
      question: 'How much was spent on civil work?',
      icon: CircleDollarSign
    },
    {
      key: 'gbm',
      title: 'GBM Decisions',
      subtitle: 'Minutes, resolutions and decisions',
      question: 'Summarize the August 2026 GBM.',
      icon: Landmark
    },
    {
      key: 'parking',
      title: 'Parking Rules',
      subtitle: 'Policy, allocation and guidelines',
      question: 'What was decided about parking?',
      icon: CarFront
    },
    {
      key: 'notices',
      title: 'Society Information',
      subtitle: 'Rules, notices and approved records',
      question: 'How many flats do we have?',
      icon: Megaphone
    }
  ]


  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({
        behavior: 'smooth'
      })
    }
  }, [messages, asking])


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

    if (
      signedUrlError ||
      !data?.signedUrl
    ) {
      console.error(signedUrlError)

      setError(
        'Unable to open the source document.'
      )

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

    if (
      !cleanQuestion ||
      asking
    ) {
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
        throw new Error(
          'RWBOT returned an empty answer.'
        )
      }


      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          type: 'bot',
          text: data.answer,
          sources:
            Array.isArray(data.sources)
              ? data.sources
              : []
        }
      ])
    } catch (askError) {
      console.error(
        'RWBOT question failed:',
        askError
      )

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


  const renderQuestionBox = (
    mode = 'center'
  ) => {
    const isCenter =
      mode === 'center'

    return (
      <form
        className={
          isCenter
            ? 'rwbot-question-box rwbot-question-box-center'
            : 'rwbot-question-box rwbot-question-box-bottom'
        }
        onSubmit={handleSubmit}
      >

        {isCenter && (
          <div className="rwbot-question-box-heading">

            <div className="rwbot-question-box-icon">
              <Sparkles size={18} />
            </div>

            <div>
              <h3>
                Type your question here
              </h3>

              <p>
                Ask anything about approved
                RWA records and information.
              </p>
            </div>

          </div>
        )}


        <div className="rwbot-question-input-wrap">

          <textarea
            value={question}
            onChange={(event) =>
              setQuestion(
                event.target.value
              )
            }
            placeholder="Type your question here..."
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
            className="rwbot-question-send"
            disabled={
              asking ||
              !question.trim()
            }
            aria-label="Ask RWBOT"
            title="Ask RWBOT"
          >

            {asking
              ? (
                <LoaderCircle
                  size={21}
                  className="rwbot-spin"
                />
              )
              : (
                <Send size={21} />
              )
            }

          </button>

        </div>


        <div className="rwbot-question-box-note">

          <ShieldCheck size={13} />

          <span>
            Answers are based on RWA records
            available to your account.
          </span>

        </div>

      </form>
    )
  }


  return (
    <div className="rwbot-chat-page">

      {/* ===================================================
          TOP HEADER
          =================================================== */}

      <header className="rwbot-chat-topbar">

        <button
          className="rwbot-chat-back"
          onClick={onBack}
          type="button"
          aria-label="Back"
        >
          <ArrowLeft size={20} />
        </button>


        <div className="rwbot-chat-brand-new">

          <div className="rwbot-chat-brand-mascot">

            <img
              src={rwbotMascot}
              alt="RWBOT"
            />

          </div>


          <div>

            <h1>
              Ask RWBOT
            </h1>

            <p>
              RWA Transparency Assistant
            </p>

          </div>

        </div>


        <div className="rwbot-chat-record-status">

          <ShieldCheck size={15} />

          <span>
            Approved Records
          </span>

        </div>

      </header>


      {/* ===================================================
          MAIN
          =================================================== */}

      <main className="rwbot-chat-content">


        {/* =================================================
            RESIDENT IDENTITY
            ================================================= */}

        <div className="rwbot-chat-profile">

          <div className="rwbot-chat-profile-name">

            <UserRound size={17} />

            <strong>
              {displayName}
            </strong>

          </div>


          {flat && (
            <div className="rwbot-chat-profile-chips">

              <span>
                <Home size={14} />
                Flat {flat.flat_no}
              </span>

              <span>
                <Building2 size={14} />
                Tower {flat.tower_no}
              </span>

            </div>
          )}

        </div>


        {/* =================================================
            INITIAL / EMPTY CHAT SCREEN
            ================================================= */}

        {messages.length === 0 && (

          <div className="rwbot-chat-welcome-area">


            {/* ================= HERO ================= */}

            <section className="rwbot-chat-hero">

              <div className="rwbot-chat-hero-copy">

                <div className="rwbot-chat-ai-label">

                  <Sparkles size={15} />

                  <span>
                    RWBOT AI Assistant
                  </span>

                </div>


                <h2>
                  What would you like to know?
                </h2>


                <p>
                  Ask questions about RWA accounts,
                  expenses, collections, GBM decisions,
                  parking, notices, rules and approved
                  society records.
                </p>


                <div className="rwbot-chat-trust-line">

                  <ShieldCheck size={16} />

                  <span>
                    Answers based on approved
                    RWA information.
                  </span>

                </div>

              </div>


              <div className="rwbot-chat-hero-mascot">

                <div className="rwbot-chat-hero-glow" />

                <div className="rwbot-chat-hero-image-wrap">

                  <img
                    src={rwbotMascot}
                    alt="RWBOT AI Assistant"
                  />

                </div>

              </div>

            </section>


            {/* ============================================
                PRIMARY QUESTION INPUT
                Centered on initial screen
                ============================================ */}

            {renderQuestionBox('center')}


            {/* ================= QUICK QUESTIONS ================= */}

            <section className="rwbot-chat-quick-section">

              <div className="rwbot-chat-section-title">

                <div>

                  <span className="rwbot-chat-section-kicker">
                    QUICK QUESTIONS
                  </span>

                  <h3>
                    Or start with a topic
                  </h3>

                </div>

                <Sparkles size={19} />

              </div>


              <div className="rwbot-chat-quick-grid">

                {suggestedQuestions.map(
                  (item) => {

                    const Icon = item.icon

                    return (
                      <button
                        key={item.key}
                        type="button"
                        className={
                          `rwbot-chat-quick-card ${item.key}`
                        }
                        disabled={asking}
                        onClick={() =>
                          askQuestion(
                            item.question
                          )
                        }
                      >

                        <div className="rwbot-chat-quick-icon">

                          <Icon size={23} />

                        </div>


                        <div className="rwbot-chat-quick-copy">

                          <strong>
                            {item.title}
                          </strong>

                          <span>
                            {item.subtitle}
                          </span>

                        </div>

                      </button>
                    )
                  }
                )}

              </div>

            </section>

          </div>
        )}


        {/* =================================================
            CHAT CONVERSATION
            ================================================= */}

        {messages.length > 0 && (

          <section className="rwbot-chat-conversation">

            {messages.map((message) => (

              <div
                key={message.id}
                className={
                  message.type === 'user'
                    ? 'rwbot-chat-message rwbot-chat-message-user'
                    : 'rwbot-chat-message rwbot-chat-message-bot'
                }
              >

                <div className="rwbot-chat-message-avatar">

                  {message.type === 'user'
                    ? (
                      <UserRound size={18} />
                    )
                    : (
                      <Bot size={18} />
                    )
                  }

                </div>


                <div className="rwbot-chat-message-body">

                  <div className="rwbot-chat-message-bubble">

                    {message.text}

                  </div>


                  {message.type === 'bot' &&
                    Array.isArray(
                      message.sources
                    ) &&
                    message.sources.length > 0 && (

                      <div className="rwbot-source-list">

                        <span className="rwbot-source-heading">
                          Sources
                        </span>


                        {message.sources.map(
                          (source, index) => {

                            const citationPrefix =
                              Array.isArray(
                                source.labels
                              ) &&
                              source.labels.length > 0
                                ? `[${source.labels.join(', ')}] `
                                : ''


                            const label =
                              source.documentDate
                                ? `${citationPrefix}${source.title} • ${source.documentDate}`
                                : `${citationPrefix}${source.title}`


                            if (!source.filePath) {
                              return (
                                <div
                                  className="rwbot-source-static"
                                  key={
                                    `${source.title}-${index}`
                                  }
                                >
                                  {label}
                                </div>
                              )
                            }


                            return (
                              <button
                                type="button"
                                className="rwbot-source-button"
                                key={
                                  `${source.filePath}-${index}`
                                }
                                onClick={() =>
                                  openSource(source)
                                }
                              >

                                <span>

                                  {label}

                                  {source.pageNo
                                    ? ` • Page ${source.pageNo}`
                                    : ''
                                  }

                                </span>


                                <ExternalLink
                                  size={14}
                                />

                              </button>
                            )
                          }
                        )}

                      </div>
                    )
                  }

                </div>

              </div>
            ))}


            {/* ============================================
                RWBOT THINKING
                ============================================ */}

            {asking && (

              <div className="rwbot-chat-message rwbot-chat-message-bot">

                <div className="rwbot-chat-message-avatar">

                  <Bot size={18} />

                </div>


                <div className="rwbot-chat-thinking">

                  <LoaderCircle
                    size={18}
                    className="rwbot-spin"
                  />


                  <div>

                    <strong>
                      RWBOT is searching
                    </strong>

                    <span>
                      Checking approved RWA records...
                    </span>

                  </div>

                </div>

              </div>
            )}


            <div ref={messagesEndRef} />

          </section>
        )}


        {/* =================================================
            ERROR
            ================================================= */}

        {error && (

          <div className="rwbot-chat-error">

            <AlertCircle size={17} />

            <span>
              {error}
            </span>

          </div>
        )}

      </main>


      {/* ===================================================
          BOTTOM QUESTION BOX
          Appears only after first question
          =================================================== */}

      {messages.length > 0 &&
        renderQuestionBox('bottom')
      }

    </div>
  )
}


export default RwbotChat