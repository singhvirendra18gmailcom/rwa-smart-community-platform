import {
  AlertTriangle,
  CheckCircle2,
  LoaderCircle,
  X
} from 'lucide-react'
import { formatCurrency } from '../utils'

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="acc-page-header">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {actions ? <div className="acc-page-actions">{actions}</div> : null}
    </div>
  )
}

export function StatCard({ label, value, tone = 'blue', helper, icon: Icon }) {
  return (
    <div className={`acc-stat-card tone-${tone}`}>
      <div className="acc-stat-top">
        <span>{label}</span>
        {Icon ? <Icon size={20} strokeWidth={1.9} /> : null}
      </div>
      <strong>{typeof value === 'number' ? formatCurrency(value) : value}</strong>
      {helper ? <small>{helper}</small> : null}
    </div>
  )
}

export function Section({ title, subtitle, actions, className = '', children }) {
  return (
    <section className={`acc-section ${className}`}>
      <div className="acc-section-head">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {actions ? <div className="acc-section-actions">{actions}</div> : null}
      </div>
      <div className="acc-section-body">{children}</div>
    </section>
  )
}

export function Field({ label, required, hint, children, className = '' }) {
  return (
    <label className={`acc-field ${className}`}>
      <span className="acc-label">
        {label}{required ? <em>*</em> : null}
      </span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  )
}

export function EmptyState({ children = 'No records found.' }) {
  return <div className="acc-empty">{children}</div>
}

export function LoadingBlock({ text = 'Loading...' }) {
  return (
    <div className="acc-loading">
      <LoaderCircle className="spin" size={20} /> {text}
    </div>
  )
}

export function Message({ type = 'success', children, onClose }) {
  return (
    <div className={`acc-message ${type}`}>
      {type === 'error' || type === 'warning'
        ? <AlertTriangle size={18} />
        : <CheckCircle2 size={18} />}
      <span>{children}</span>
      {onClose ? (
        <button type="button" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>
      ) : null}
    </div>
  )
}

export function PaymentBadge({ mode }) {
  const bank = mode !== 'CASH'
  return (
    <span className={`acc-badge ${bank ? 'bank' : 'cash'}`}>
      {bank ? 'BANK' : 'CASH'}
    </span>
  )
}

export function StatusBadge({ status }) {
  const key = String(status || '').toLowerCase()
  return <span className={`acc-status ${key}`}>{status}</span>
}
