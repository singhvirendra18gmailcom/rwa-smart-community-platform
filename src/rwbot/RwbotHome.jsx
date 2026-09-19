import {
  useEffect,
  useRef,
  useState
} from 'react'

import {
  LogOut,
  FileText,
  Building2,
  Home,
  ShieldCheck,
  CircleDollarSign,
  Landmark,
  CarFront,
  Megaphone,
  ChevronRight,
  Shield,
  Send,
  Bot,
  UserRound,
  LoaderCircle,
  AlertCircle,
  ExternalLink,
  RotateCcw,
  Sparkles
} from 'lucide-react'

import { supabase } from '../supabase'
import useRwbotOwnerName from './useRwbotOwnerName'
import rwbotMascot from '../assets/rwbot-mascot.png'

import './Rwbot.css'
import './RwbotHome.css'
import './RwbotMascot.css'


function getGreeting() {
  const hour = new Date().getHours()

  if (hour < 12) {
    return 'Good morning,'
  }

  if (hour < 17) {
    return 'Good afternoon,'
  }

  return 'Good evening,'
}


function RwbotHome({
  profile,
  onLogout,
  onManageDocuments
}) {
  const [question, setQuestion] =
    useState('')

  const [messages, setMessages] =
    useState([])

  const [asking, setAsking] =
    useState(false)

  const [error, setError] =
    useState('')

  const messagesEndRef =
    useRef(null)

  const {
    flat,
    displayName
  } = useRwbotOwnerName(profile)

  const isRwaMember =
    profile.role === 'RWA_MEMBER'


  const quickQuestions = [
    {
      key: 'accounts',
      title: 'Accounts & Expenses',
      description:
        'Collections, payments, monthly statements',
      question:
        'How much was spent on civil work?',
      icon: CircleDollarSign
    },
    {
      key: 'gbm',
      title: 'GBM Decisions',
      description:
        'Meeting minutes, resolutions, action items',
      question:
        'Summarize the August 2026 GBM.',
      icon: Landmark
    },
    {
      key: 'parking',
      title: 'Parking Rules',
      description:
        'Parking policy and allocation',
      question:
        'What was decided about parking?',
      icon: CarFront
    },
    {
      key: 'notices',
      title: 'Notices & Policies',
      description:
        'Rules and approved society records',
      question:
        'How many flats do we have?',
      icon: Megaphone
    }
  ]


  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current
        ?.scrollIntoView({
          behavior: 'smooth'
        })
    }
  }, [messages, asking])


  const openSource =
    async (source) => {

      if (!source?.filePath) {
        return
      }

      setError('')

      const {
        data,
        error: signedUrlError
      } =
        await supabase.storage
          .from('rwbot-documents')
          .createSignedUrl(
            source.filePath,
            60
          )


      if (
        signedUrlError ||
        !data?.signedUrl
      ) {
        console.error(
          signedUrlError
        )

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


  const askQuestion =
    async (text) => {

      const cleanQuestion =
        text.trim()


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


      setMessages(
        (current) => [
          ...current,
          userMessage
        ]
      )


      try {

        const {
          data,
          error: functionError
        } =
          await supabase.functions
            .invoke(
              'rwbot-ask',
              {
                body: {
                  question:
                    cleanQuestion
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


        setMessages(
          (current) => [
            ...current,
            {
              id:
                crypto.randomUUID(),

              type: 'bot',

              text:
                data.answer,

              sources:
                Array.isArray(
                  data.sources
                )
                  ? data.sources
                  : []
            }
          ]
        )

      } catch (askError) {

        console.error(
          'RWBOT question failed:',
          askError
        )


        setError(
          askError?.message ||
          'Unable to contact RWBOT.'
        )


        setMessages(
          (current) => [
            ...current,
            {
              id:
                crypto.randomUUID(),

              type: 'bot',

              text:
                'I could not complete that request. Please try again.',

              sources: []
            }
          ]
        )

      } finally {

        setAsking(false)

      }
    }


  const handleSubmit =
    (event) => {

      event.preventDefault()

      askQuestion(question)
    }


  const clearConversation = () => {
    if (asking) {
      return
    }

    setMessages([])
    setQuestion('')
    setError('')
  }


  return (

    <div className="rwbot-home">


      {/* =================================================
          HEADER
          ================================================= */}

      <header className="rwbot-home-header">


        <div className="rwbot-home-brand">


          <div className="rwbot-home-brand-icon rwbot-home-brand-image-wrap">

            <img
              src={rwbotMascot}
              alt="RWBOT AI Assistant"
              className="rwbot-home-brand-image"
            />

          </div>


          <div>

            <h1>
              RWBOT
            </h1>

            <p>
              RWA Transparency Assistant
            </p>

          </div>


        </div>


        <div className="rwbot-home-society">

          <strong>
            RWA Pocket-A
          </strong>

          <span>
            Sector-105, Noida
          </span>

        </div>


        <button
          className="rwbot-home-logout"
          onClick={onLogout}
          type="button"
          aria-label="Logout"
          title="Logout"
        >

          <LogOut size={19} />

        </button>


      </header>


      {/* =================================================
          MAIN
          ================================================= */}

      <main className="rwbot-home-main">


        {/* ===============================================
            HERO
            =============================================== */}

        <section
          className={
            messages.length > 0
              ? 'rwbot-home-hero rwbot-home-hero-compact'
              : 'rwbot-home-hero'
          }
        >


          <div className="rwbot-home-hero-copy">


            <p className="rwbot-home-greeting">

              {getGreeting()}

            </p>


            <h2>
              {displayName}
            </h2>


            {flat && (

              <div className="rwbot-home-resident-chips">


                <span className="rwbot-home-resident-chip">

                  <Home size={15} />

                  Flat {flat.flat_no}

                </span>


                <span className="rwbot-home-resident-chip">

                  <Building2 size={15} />

                  Tower {flat.tower_no}

                </span>


                {isRwaMember && (

                  <span className="rwbot-home-resident-chip rwbot-home-role">

                    <ShieldCheck
                      size={15}
                    />

                    RWA Member

                  </span>

                )}


              </div>

            )}


            {messages.length === 0 && (

              <p className="rwbot-home-tagline">

                Ask. Know. Stay Informed.

              </p>

            )}


          </div>


          <div className="rwbot-home-mascot-art">

            <div className="rwbot-home-mascot-glow" />

            <div className="rwbot-home-mascot-frame">

              <img
                src={rwbotMascot}
                alt="RWBOT AI Assistant"
                className="rwbot-home-mascot-image"
              />

            </div>

          </div>


        </section>


        {/* ===============================================
            INLINE CHAT
            =============================================== */}

        <section
          className={
            messages.length > 0
              ? 'rwbot-home-chat rwbot-home-chat-active'
              : 'rwbot-home-chat'
          }
        >


          <div className="rwbot-home-chat-heading">


            <div className="rwbot-home-chat-title">


              <div className="rwbot-home-chat-icon">

                <Bot size={22} />

              </div>


              <div>

                <h3>
                  Ask RWBOT
                </h3>

                {messages.length === 0 && (

                  <p>
                    Type your question below
                  </p>

                )}

              </div>


            </div>


            {messages.length > 0 && (

              <button
                type="button"
                className="rwbot-home-new-chat"
                onClick={clearConversation}
                disabled={asking}
              >

                <RotateCcw size={15} />

                New Chat

              </button>

            )}


          </div>


          {/* =============================================
              CONVERSATION
              ============================================= */}

          {messages.length > 0 && (

            <div className="rwbot-home-conversation">


              {messages.map(
                (message) => (

                  <div
                    key={message.id}
                    className={
                      message.type === 'user'
                        ? 'rwbot-home-message rwbot-home-message-user'
                        : 'rwbot-home-message rwbot-home-message-bot'
                    }
                  >


                    <div className="rwbot-home-message-avatar">

                      {message.type === 'user'
                        ? (
                          <UserRound
                            size={17}
                          />
                        )
                        : (
                          <Bot
                            size={17}
                          />
                        )
                      }

                    </div>


                    <div className="rwbot-home-message-body">


                      <div className="rwbot-home-message-bubble">

                        {message.text}

                      </div>


                      {message.type === 'bot' &&
                        Array.isArray(
                          message.sources
                        ) &&
                        message.sources.length > 0 && (

                          <div className="rwbot-home-sources">


                            <span className="rwbot-home-sources-title">
                              Sources
                            </span>


                            {message.sources.map(
                              (
                                source,
                                index
                              ) => {

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


                                if (
                                  !source.filePath
                                ) {
                                  return (

                                    <div
                                      className="rwbot-home-source-static"
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
                                    className="rwbot-home-source-button"
                                    key={
                                      `${source.filePath}-${index}`
                                    }
                                    onClick={() =>
                                      openSource(
                                        source
                                      )
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

                )
              )}


              {asking && (

                <div className="rwbot-home-message rwbot-home-message-bot">


                  <div className="rwbot-home-message-avatar">

                    <Bot size={17} />

                  </div>


                  <div className="rwbot-home-thinking">

                    <LoaderCircle
                      size={18}
                      className="rwbot-spin"
                    />


                    <div>

                      <strong>
                        Searching RWA records
                      </strong>

                      <span>
                        Please wait...
                      </span>

                    </div>

                  </div>


                </div>

              )}


              <div ref={messagesEndRef} />


            </div>

          )}


          {/* =============================================
              QUESTION INPUT
              ============================================= */}

          <form
            className="rwbot-home-question-form"
            onSubmit={handleSubmit}
          >


            <div className="rwbot-home-question-wrap">


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

                    askQuestion(
                      question
                    )

                  }

                }}
              />


              <button
                type="submit"
                className="rwbot-home-send"
                disabled={
                  asking ||
                  !question.trim()
                }
                aria-label="Ask RWBOT"
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


            <div className="rwbot-home-question-note">

              <ShieldCheck size={13} />

              Answers from approved RWA records

            </div>


          </form>


          {error && (

            <div className="rwbot-home-chat-error">

              <AlertCircle size={16} />

              <span>
                {error}
              </span>

            </div>

          )}


        </section>


        {/* ===============================================
            QUICK QUESTIONS
            =============================================== */}

        <section className="rwbot-home-quick">


          <div className="rwbot-home-section-title">

            <h3>
              Quick Questions
            </h3>

            <Sparkles size={17} />

          </div>


          <div className="rwbot-home-quick-grid">


            {quickQuestions.map(
              (item) => {

                const Icon =
                  item.icon


                return (

                  <button
                    key={item.key}
                    className={
                      `rwbot-home-quick-card ${item.key}`
                    }
                    onClick={() =>
                      askQuestion(
                        item.question
                      )
                    }
                    type="button"
                    disabled={asking}
                  >


                    <span className="rwbot-home-quick-icon">

                      <Icon size={22} />

                    </span>


                    <span className="rwbot-home-quick-copy">

                      <strong>
                        {item.title}
                      </strong>

                      <span>
                        {item.description}
                      </span>

                    </span>


                    <ChevronRight
                      className="rwbot-home-quick-chevron"
                      size={18}
                    />


                  </button>

                )
              }
            )}


          </div>


        </section>


        {/* ===============================================
            MEMBER TOOLS
            =============================================== */}

        {isRwaMember && (

          <section className="rwbot-home-member-tools">


            <button
              className="rwbot-home-member-button"
              onClick={onManageDocuments}
              type="button"
            >


              <FileText size={21} />


              <div>

                <strong>
                  Manage Knowledge Base
                </strong>

                <span>
                  Upload and manage RWA documents
                </span>

              </div>


              <ChevronRight size={18} />


            </button>


          </section>

        )}


        {/* ===============================================
            TRUST
            =============================================== */}

        <section className="rwbot-home-trust">


          <div className="rwbot-home-trust-icon">

            <Shield size={19} />

          </div>


          <div>

            <strong>
              Approved RWA information
            </strong>

            <span>
              Transparent information for residents.
            </span>

          </div>


        </section>


      </main>


      <footer className="rwbot-home-footer">

        <strong>
          RWA Pocket-A
        </strong>

        {' '}•{' '}

        <span>
          Sector-105, Noida
        </span>

      </footer>


    </div>

  )
}


export default RwbotHome