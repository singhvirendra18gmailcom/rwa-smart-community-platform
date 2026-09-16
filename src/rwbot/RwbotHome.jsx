import {
  Bot,
  LogOut,
  MessageCircleQuestion,
  FileText,
  Building2,
  Home,
  ShieldCheck,
  ArrowRight,
  CircleDollarSign,
  Landmark,
  CarFront,
  Megaphone,
  ChevronRight,
  Shield
} from 'lucide-react'

import useRwbotOwnerName from './useRwbotOwnerName'
import './Rwbot.css'
import './RwbotHome.css'

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
  onAsk,
  onManageDocuments
}) {
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
      description: 'Collections, payments, monthly statements',
      icon: CircleDollarSign
    },
    {
      key: 'gbm',
      title: 'GBM Decisions',
      description: 'Meeting minutes, resolutions, action items',
      icon: Landmark
    },
    {
      key: 'parking',
      title: 'Parking Rules',
      description: 'Parking policy, allocation and guidelines',
      icon: CarFront
    },
    {
      key: 'notices',
      title: 'Notices & Policies',
      description: 'RWA notices, rules and important updates',
      icon: Megaphone
    }
  ]

  return (
    <div className="rwbot-home">

      <header className="rwbot-home-header">

        <div className="rwbot-home-brand">
          <div className="rwbot-home-brand-icon">
            <Bot size={31} strokeWidth={1.9} />
          </div>

          <div>
            <h1>RWBOT</h1>
            <p>RWA Transparency Assistant</p>
          </div>
        </div>

        <div className="rwbot-home-society">
          <strong>RWA Pocket-A</strong>
          <span>Sector-105, Noida</span>
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

      <main className="rwbot-home-main">

        <section className="rwbot-home-hero">

          <div className="rwbot-home-hero-copy">

            <p className="rwbot-home-greeting">
              {getGreeting()}
            </p>

            <h2>{displayName}</h2>

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
                    <ShieldCheck size={15} />
                    RWA Member
                  </span>
                )}

              </div>
            )}

            <p className="rwbot-home-tagline">
              Ask. Know. Stay Informed.
            </p>

          </div>

          <div className="rwbot-home-speech">
            Your RWA Information Assistant
          </div>

          <div
            className="rwbot-home-hero-art"
            aria-hidden="true"
          >
            <div className="rwbot-home-bot-glow" />

            <div className="rwbot-home-bot">
              <Bot size={58} strokeWidth={1.7} />
              <span className="rwbot-home-bot-label">
                RWBOT
              </span>
            </div>
          </div>

        </section>

        <button
          className="rwbot-home-primary"
          onClick={onAsk}
          type="button"
        >

          <div className="rwbot-home-primary-icon">
            <MessageCircleQuestion size={35} />
          </div>

          <div className="rwbot-home-primary-copy">
            <h3>Ask RWBOT</h3>
            <p>
              Get answers from approved RWA records and documents.
            </p>
          </div>

          <span className="rwbot-home-primary-arrow">
            <ArrowRight size={23} />
          </span>

        </button>

        <section className="rwbot-home-quick">

          <div className="rwbot-home-section-title">
            <h3>Quick Questions</h3>
            <span>Explore topics</span>
          </div>

          <div className="rwbot-home-quick-grid">

            {quickQuestions.map((item) => {
              const Icon = item.icon

              return (
                <button
                  key={item.key}
                  className={`rwbot-home-quick-card ${item.key}`}
                  onClick={onAsk}
                  type="button"
                >

                  <span className="rwbot-home-quick-icon">
                    <Icon size={24} />
                  </span>

                  <span className="rwbot-home-quick-copy">
                    <strong>{item.title}</strong>
                    <span>{item.description}</span>
                  </span>

                  <ChevronRight
                    className="rwbot-home-quick-chevron"
                    size={20}
                  />

                </button>
              )
            })}

          </div>

        </section>

        {isRwaMember && (
          <section className="rwbot-home-member-tools">
            <button
              className="rwbot-home-member-button"
              onClick={onManageDocuments}
              type="button"
            >
              <FileText size={22} />

              <div>
                <strong>Manage Knowledge Base</strong>
                <span>
                  Upload and manage approved RWA documents
                </span>
              </div>

              <ChevronRight size={19} />
            </button>
          </section>
        )}

        <section className="rwbot-home-trust">
          <div className="rwbot-home-trust-icon">
            <Shield size={21} />
          </div>

          <div>
            <strong>
              Answers are based on approved RWA records and documents.
            </strong>
            <span>
              Transparent information for a better informed community.
            </span>
          </div>
        </section>

      </main>

      <footer className="rwbot-home-footer">
        <strong>RWA Pocket-A</strong>
        {' '}•{' '}
        <span>Sector-105, Noida</span>

        <p>
          Powered by the RWA Pocket-A in-house App — a step towards smarter,
          transparent & technology-driven RWA management.
        </p>
      </footer>

    </div>
  )
}

export default RwbotHome
