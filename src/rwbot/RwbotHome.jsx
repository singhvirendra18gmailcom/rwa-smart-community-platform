import {
  Bot,
  LogOut,
  MessageCircleQuestion,
  FileText,
  Building2,
  Home,
  ShieldCheck,
  ArrowRight
} from 'lucide-react'

import './Rwbot.css'

function RwbotHome({
  profile,
  onLogout,
  onAsk
}) {
  const flat = Array.isArray(profile.flat)
    ? profile.flat[0]
    : profile.flat

  const isRwaMember =
    profile.role === 'RWA_MEMBER'

  return (
    <div className="rwbot-page">

      <header className="rwbot-header">

        <div className="rwbot-header-brand">

          <div className="rwbot-header-icon">
            <Bot size={29} />
          </div>

          <div>
            <h1>RWBOT</h1>

            <p>
              RWA Transparency Assistant
            </p>
          </div>

        </div>

        <button
          className="rwbot-logout"
          onClick={onLogout}
        >
          <LogOut size={17} />
          Logout
        </button>

      </header>

      <main className="rwbot-main">

        <section className="rwbot-welcome">

          <p className="rwbot-welcome-small">
            Welcome
          </p>

          <h2>
            {profile.full_name}
          </h2>

          {flat && (
            <div className="rwbot-resident-info">

              <span>
                <Home size={16} />
                Flat {flat.flat_no}
              </span>

              <span>
                <Building2 size={16} />
                Tower {flat.tower_no}
              </span>

            </div>
          )}

          {isRwaMember && (
            <div className="rwbot-role-badge">
              <ShieldCheck size={15} />
              RWA Member
            </div>
          )}

          <p className="rwbot-welcome-tagline">
            Ask. Know. Stay Informed.
          </p>

        </section>

        <section className="rwbot-actions">

          <button
            className="rwbot-action-card rwbot-action-button"
            onClick={onAsk}
          >

            <div className="rwbot-action-icon">
              <MessageCircleQuestion size={28} />
            </div>

            <div className="rwbot-action-content">

              <h3>
                Ask RWBOT
              </h3>

              <p>
                Ask questions about RWA
                expenses, collections, GBM,
                notices, rules and records.
              </p>

              <span className="rwbot-next-label">
                Start asking questions
              </span>

            </div>

            <ArrowRight
              className="rwbot-action-arrow"
              size={20}
            />

          </button>

          {isRwaMember && (
            <div className="rwbot-action-card">

              <div className="rwbot-action-icon">
                <FileText size={28} />
              </div>

              <div className="rwbot-action-content">

                <h3>
                  Manage Documents
                </h3>

                <p>
                  Upload and manage documents
                  used by the RWBOT knowledge
                  base.
                </p>

                <span className="rwbot-next-label">
                  RWA Members only
                </span>

              </div>

            </div>
          )}

        </section>

        <section className="rwbot-question-section">

          <h3>
            You can ask questions like
          </h3>

          <button
            onClick={() => onAsk()}
            className="rwbot-question"
          >
            How much was spent on civil work?
          </button>

          <button
            onClick={() => onAsk()}
            className="rwbot-question"
          >
            What was the total collection in January 2026?
          </button>

          <button
            onClick={() => onAsk()}
            className="rwbot-question"
          >
            Summarize the August 2026 GBM.
          </button>

          <button
            onClick={() => onAsk()}
            className="rwbot-question"
          >
            What was decided about parking?
          </button>

        </section>

      </main>

      <footer className="rwbot-footer">

        <strong>
          RWA Pocket-A
        </strong>

        <span>•</span>

        <span>
          Sector -105 Noida
        </span>

      </footer>

    </div>
  )
}

export default RwbotHome