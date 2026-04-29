import { useState, useEffect, useCallback } from 'react'
import { loadData, saveData } from './storage.js'

// ─── Constants ───────────────────────────────────────────────────────────────

const TEAMS = ['Engineering', 'Product', 'Commercial', 'Operations']

const STATUS = {
  on_track:  { label: 'On Track',  badge: 'status-on-track',  dot: 'dot-on-track',  cardBorder: 'card-border-on-track',  numClass: 'num-on-track',  statActive: 'active-on-track',  btnActive: 'btn-active-on-track' },
  at_risk:   { label: 'At Risk',   badge: 'status-at-risk',   dot: 'dot-at-risk',   cardBorder: 'card-border-at-risk',   numClass: 'num-at-risk',   statActive: 'active-at-risk',   btnActive: 'btn-active-at-risk' },
  missed:    { label: 'Missed',    badge: 'status-missed',    dot: 'dot-missed',    cardBorder: 'card-border-missed',    numClass: 'num-missed',    statActive: 'active-missed',    btnActive: 'btn-active-missed' },
  completed: { label: 'Completed', badge: 'status-completed', dot: 'dot-completed', cardBorder: 'card-border-completed', numClass: 'num-completed', statActive: 'active-completed', btnActive: 'btn-active-completed' },
}

const TEAM_COLORS = {
  Engineering: 'team-engineering',
  Product:     'team-product',
  Commercial:  'team-commercial',
  Operations:  'team-operations',
}

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

function daysUntil(dateStr) {
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const d = new Date(dateStr + 'T00:00:00')
  return Math.round((d - now) / 86400000)
}

function daysSince(isoString) {
  if (!isoString) return Infinity
  return Math.round((Date.now() - new Date(isoString).getTime()) / 86400000)
}

function fmtDate(dateStr) {
  if (!dateStr) return '—'
  const [y, m, d] = dateStr.split('-')
  return new Date(+y, +m - 1, +d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtTs(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// ─── Sample Data ─────────────────────────────────────────────────────────────

const SAMPLE_COMMITMENTS = [
  {
    id: 'c1',
    team: 'Engineering',
    description: 'Launch v2 API with rate limiting and auth token rotation',
    deadline: '2026-05-02',
    owner: 'Sarah Chen',
    ownerEmail: 'sarah.chen@lightwork.ai',
    status: 'on_track',
    updates: [{ note: 'Rate limiting merged to main, auth rotation 80% done', ts: new Date(Date.now() - 2 * 86400000).toISOString() }],
    createdAt: new Date(Date.now() - 14 * 86400000).toISOString(),
  },
  {
    id: 'c2',
    team: 'Product',
    description: 'Complete user research interviews for onboarding redesign (10 sessions)',
    deadline: '2026-04-30',
    owner: 'Marcus Webb',
    ownerEmail: 'marcus.webb@lightwork.ai',
    status: 'at_risk',
    updates: [{ note: 'Only 6 of 10 interviews scheduled — 2 no-shows this week', ts: new Date(Date.now() - 1 * 86400000).toISOString() }],
    createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
  },
  {
    id: 'c3',
    team: 'Commercial',
    description: 'Close Series A lead investor term sheet',
    deadline: '2026-05-15',
    owner: 'Priya Nair',
    ownerEmail: 'priya.nair@lightwork.ai',
    status: 'on_track',
    updates: [{ note: 'Second partner meeting confirmed for Friday', ts: new Date(Date.now() - 3 * 86400000).toISOString() }],
    createdAt: new Date(Date.now() - 20 * 86400000).toISOString(),
  },
  {
    id: 'c4',
    team: 'Operations',
    description: 'Implement payroll system and onboard first 3 FTE employees',
    deadline: '2026-04-25',
    owner: 'James Okafor',
    ownerEmail: 'james.okafor@lightwork.ai',
    status: 'missed',
    updates: [{ note: 'Payroll vendor integration delayed — waiting on bank KYC docs', ts: new Date(Date.now() - 6 * 86400000).toISOString() }],
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
  },
  {
    id: 'c5',
    team: 'Engineering',
    description: 'Set up CI/CD pipeline with automated test coverage reporting',
    deadline: '2026-04-20',
    owner: 'Sarah Chen',
    ownerEmail: 'sarah.chen@lightwork.ai',
    status: 'completed',
    updates: [{ note: 'Pipeline live, coverage at 74%. All green.', ts: new Date(Date.now() - 8 * 86400000).toISOString() }],
    createdAt: new Date(Date.now() - 25 * 86400000).toISOString(),
  },
  {
    id: 'c6',
    team: 'Product',
    description: 'Ship mobile-responsive dashboard MVP to beta users',
    deadline: '2026-05-05',
    owner: 'Lena Park',
    ownerEmail: 'lena.park@lightwork.ai',
    status: 'on_track',
    updates: [],
    createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
  },
]

// ─── Markdown utilities ───────────────────────────────────────────────────────

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function inlineMd(text) {
  return escHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="md-code">$1</code>')
}

// Convert markdown summary to clean HTML string (for print window)
function summaryToHtml(text, dateStr) {
  const lines = text.split('\n')
  let html = ''
  let inList = false

  for (const line of lines) {
    if (line.startsWith('## ') || line.startsWith('# ')) {
      if (inList) { html += '</ul>'; inList = false }
      const level = line.startsWith('## ') ? 2 : 1
      const content = escHtml(line.slice(level + 1))
      html += `<h${level}>${content}</h${level}>`
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      if (!inList) { html += '<ul>'; inList = true }
      html += `<li>${inlineMdPrint(line.slice(2))}</li>`
    } else if (line.trim() === '') {
      if (inList) { html += '</ul>'; inList = false }
    } else {
      if (inList) { html += '</ul>'; inList = false }
      html += `<p>${inlineMdPrint(line)}</p>`
    }
  }
  if (inList) html += '</ul>'

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>LightWork — Weekly Operations Summary</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', system-ui, sans-serif; max-width: 720px; margin: 48px auto; padding: 0 40px 60px; color: #111827; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .print-header { border-bottom: 3px solid #2B7DE9; padding-bottom: 20px; margin-bottom: 32px; }
    .print-title { font-size: 22px; font-weight: 700; color: #2B7DE9; letter-spacing: -0.02em; }
    .print-subtitle { font-size: 13px; color: #6b7280; margin-top: 4px; }
    h2 { font-size: 14px; font-weight: 700; color: #111827; margin: 28px 0 10px; padding: 8px 12px; background: #f8fafc; border-left: 3px solid #2B7DE9; border-radius: 0 4px 4px 0; }
    ul { padding-left: 0; list-style: none; }
    li { font-size: 13px; color: #374151; line-height: 1.7; padding: 5px 0 5px 20px; position: relative; border-bottom: 1px solid #f3f4f6; }
    li::before { content: "•"; position: absolute; left: 6px; color: #9ca3af; }
    p { font-size: 13px; color: #374151; line-height: 1.7; margin: 6px 0; }
    strong { font-weight: 600; color: #111827; }
    code { background: #f3f4f6; padding: 1px 5px; border-radius: 3px; font-size: 12px; font-family: monospace; }
    .print-footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; display: flex; justify-content: space-between; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
  <div class="print-header">
    <div class="print-title">LightWork AI — Weekly Operations Summary</div>
    <div class="print-subtitle">${escHtml(dateStr)} · Confidential</div>
  </div>
  ${html}
  <div class="print-footer">
    <span>LightWork Operations Hub</span>
    <span>Generated ${new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
  </div>
</body>
</html>`
}

function inlineMdPrint(text) {
  return escHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
}

// ─── Shared UI primitives ────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const s = STATUS[status]
  return (
    <span className={`status-badge ${s.badge}`}>
      <span className={`status-dot ${s.dot}`} />
      {s.label}
    </span>
  )
}

function TeamBadge({ team }) {
  return (
    <span className={`team-badge ${TEAM_COLORS[team] || 'team-default'}`}>
      {team}
    </span>
  )
}

function DeadlinePill({ deadline, status }) {
  const days = daysUntil(deadline)
  if (status === 'completed') {
    return <span className="deadline deadline-done">Due {fmtDate(deadline)}</span>
  }
  let cls = 'deadline '
  if (days < 0)       cls += 'deadline-overdue'
  else if (days <= 3) cls += 'deadline-warning'
  else                cls += 'deadline-normal'

  const daysLabel =
    days < 0    ? `${Math.abs(days)}d overdue` :
    days === 0  ? 'Due today' :
    days === 1  ? 'Due tomorrow' :
                  `${days}d left`

  return <span className={cls}>Due {fmtDate(deadline)} · {daysLabel}</span>
}

// ─── Commitment Card ──────────────────────────────────────────────────────────

function CommitmentCard({ commitment, onStatusChange, onAddUpdate, onDelete, onEdit }) {
  const [updateText, setUpdateText] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const [showNoteInput, setShowNoteInput] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({
    team: commitment.team,
    description: commitment.description,
    deadline: commitment.deadline,
    owner: commitment.owner,
    ownerEmail: commitment.ownerEmail || '',
  })

  const lastUpdate = commitment.updates[commitment.updates.length - 1]
  const stale = commitment.status !== 'completed' && daysSince(lastUpdate?.ts) > 5

  function submitUpdate(e) {
    e.preventDefault()
    if (!updateText.trim()) return
    onAddUpdate(commitment.id, updateText.trim())
    setUpdateText('')
    setShowNoteInput(false)
  }

  function handleSaveEdit() {
    if (!editForm.description.trim() || !editForm.deadline || !editForm.owner.trim()) return
    onEdit(commitment.id, {
      team: editForm.team,
      description: editForm.description.trim(),
      deadline: editForm.deadline,
      owner: editForm.owner.trim(),
      ownerEmail: editForm.ownerEmail.trim(),
    })
    setIsEditing(false)
  }

  function handleCancelEdit() {
    setEditForm({
      team: commitment.team,
      description: commitment.description,
      deadline: commitment.deadline,
      owner: commitment.owner,
      ownerEmail: commitment.ownerEmail || '',
    })
    setIsEditing(false)
  }

  function handleNudge() {
    const subject = encodeURIComponent(`Update needed: ${commitment.description}`)
    const body = encodeURIComponent(
`Hi ${commitment.owner},

This is a reminder that the following deliverable needs an update:

Deliverable: ${commitment.description}
Team: ${commitment.team}
Deadline: ${fmtDate(commitment.deadline)}
Current status: ${STATUS[commitment.status].label}

Could you provide a quick status update?

Thanks,
LightWork Operations Hub`
    )
    window.location.href = `mailto:${commitment.ownerEmail}?subject=${subject}&body=${body}`
  }

  const s = STATUS[commitment.status]

  // ── Inline edit mode ──────────────────────────────────────────────────────
  if (isEditing) {
    return (
      <div className={`commitment-card ${s.cardBorder}`}>
        <div className="card-edit-form">
          <div className="card-edit-field">
            <label className="card-edit-label">Deliverable</label>
            <textarea
              autoFocus
              className="card-edit-textarea"
              rows={3}
              value={editForm.description}
              onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="card-edit-row">
            <div className="card-edit-field">
              <label className="card-edit-label">Team</label>
              <select
                className="card-edit-select"
                value={editForm.team}
                onChange={e => setEditForm(f => ({ ...f, team: e.target.value }))}
              >
                {TEAMS.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="card-edit-field">
              <label className="card-edit-label">Deadline</label>
              <input
                type="date"
                className="card-edit-input"
                value={editForm.deadline}
                onChange={e => setEditForm(f => ({ ...f, deadline: e.target.value }))}
              />
            </div>
          </div>
          <div className="card-edit-row">
            <div className="card-edit-field">
              <label className="card-edit-label">Owner</label>
              <input
                type="text"
                className="card-edit-input"
                placeholder="Full name"
                value={editForm.owner}
                onChange={e => setEditForm(f => ({ ...f, owner: e.target.value }))}
              />
            </div>
            <div className="card-edit-field">
              <label className="card-edit-label">Owner Email</label>
              <input
                type="email"
                className="card-edit-input"
                placeholder="email@company.com"
                value={editForm.ownerEmail}
                onChange={e => setEditForm(f => ({ ...f, ownerEmail: e.target.value }))}
              />
            </div>
          </div>
          <div className="card-edit-actions">
            <button onClick={handleCancelEdit} className="btn-cancel">Cancel</button>
            <button onClick={handleSaveEdit} className="btn-submit">Save changes</button>
          </div>
        </div>
      </div>
    )
  }

  // ── Normal view ───────────────────────────────────────────────────────────
  return (
    <div className={`commitment-card ${s.cardBorder}`}>
      <div className="card-header">
        <div className="card-header-left">
          <p className={`card-description${commitment.status === 'completed' ? ' completed' : ''}`}>
            {commitment.description}
          </p>
          <div className="card-meta">
            <TeamBadge team={commitment.team} />
            <span className="card-meta-sep">·</span>
            <span className="card-owner">{commitment.owner}</span>
          </div>
        </div>
        <div className="card-header-right">
          <StatusBadge status={commitment.status} />
          <div className="card-icon-btns">
            <button
              className={`card-icon-btn card-icon-btn-nudge${!commitment.ownerEmail ? ' card-icon-btn-disabled' : ''}`}
              onClick={commitment.ownerEmail ? handleNudge : undefined}
              title={commitment.ownerEmail ? 'Nudge owner' : 'No email set'}
              disabled={!commitment.ownerEmail}
            >
              <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </button>
            <button
              className="card-icon-btn card-icon-btn-edit"
              onClick={() => setIsEditing(true)}
              title="Edit commitment"
            >
              <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a2 2 0 01-1.414.586H7v-3a2 2 0 01.586-1.414z" />
              </svg>
            </button>
            <button
              className="card-icon-btn card-icon-btn-delete"
              onClick={() => setConfirmDelete(true)}
              title="Delete commitment"
            >
              <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <DeadlinePill deadline={commitment.deadline} status={commitment.status} />

      {lastUpdate && (
        <div className="card-update">
          <span className="card-update-label">Update:</span>
          {lastUpdate.note}
          <span className="card-update-time">· {fmtTs(lastUpdate.ts)}</span>
        </div>
      )}

      {stale && (
        <div className="card-stale">
          <svg className="stale-icon" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          No update in {daysSince(lastUpdate?.ts) === Infinity ? 'a while' : `${daysSince(lastUpdate?.ts)}d`}
        </div>
      )}

      <div className="card-actions">
        {Object.entries(STATUS).map(([key, val]) => (
          <button
            key={key}
            onClick={() => onStatusChange(commitment.id, key)}
            className={`status-btn${commitment.status === key ? ` ${val.btnActive}` : ''}`}
          >
            {val.label}
          </button>
        ))}
        <button onClick={() => setShowNoteInput(v => !v)} className="note-btn">
          + Note
        </button>
        {commitment.updates.length > 0 && (
          <button onClick={() => setShowHistory(v => !v)} className="history-btn">
            {showHistory ? 'Hide' : `${commitment.updates.length} update${commitment.updates.length !== 1 ? 's' : ''}`}
          </button>
        )}
      </div>

      {showNoteInput && (
        <form onSubmit={submitUpdate} className="note-form">
          <input
            autoFocus
            className="note-input"
            placeholder="Log a short update…"
            value={updateText}
            onChange={e => setUpdateText(e.target.value)}
          />
          <button type="submit" className="note-save">Save</button>
        </form>
      )}

      {showHistory && commitment.updates.length > 0 && (
        <div className="card-history">
          {[...commitment.updates].reverse().map((u, i) => (
            <div key={i} className="history-item">
              {u.note} <span className="history-time">· {fmtTs(u.ts)}</span>
            </div>
          ))}
        </div>
      )}

      {confirmDelete && (
        <div className="card-delete-confirm">
          <span className="card-delete-msg">Delete this commitment?</span>
          <button onClick={() => onDelete(commitment.id)} className="btn-delete-confirm">Yes, delete</button>
          <button onClick={() => setConfirmDelete(false)} className="btn-delete-cancel">Cancel</button>
        </div>
      )}
    </div>
  )
}

// ─── Add Commitment Modal ─────────────────────────────────────────────────────

function AddCommitmentModal({ onClose, onAdd }) {
  const [form, setForm] = useState({ team: 'Engineering', description: '', deadline: '', owner: '', ownerEmail: '' })
  const [error, setError] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    console.log('[LW Debug] Form submitted:', form)
    if (!form.description.trim()) return setError('Please enter a deliverable description.')
    if (!form.deadline) return setError('Please set a deadline.')
    if (!form.owner.trim()) return setError('Please enter an owner name.')
    const newCommitment = {
      id: `c${Date.now()}`,
      ...form,
      description: form.description.trim(),
      owner: form.owner.trim(),
      status: 'on_track',
      updates: [],
      createdAt: new Date().toISOString(),
    }
    console.log('[LW Debug] Calling onAdd with:', newCommitment)
    onAdd(newCommitment)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2 className="modal-title">Add Commitment</h2>
          <button onClick={onClose} className="modal-close">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-stack">
            <div className="form-field">
              <label className="form-label">Team</label>
              <select
                className="form-select"
                value={form.team}
                onChange={e => setForm(f => ({ ...f, team: e.target.value }))}
              >
                {TEAMS.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label className="form-label">Deliverable</label>
              <textarea
                className="form-textarea"
                rows={3}
                placeholder="Describe the deliverable or commitment…"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="form-row-2">
              <div className="form-field">
                <label className="form-label">Deadline</label>
                <input
                  type="date"
                  className="form-input"
                  min={todayISO()}
                  value={form.deadline}
                  onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))}
                />
              </div>
              <div className="form-field">
                <label className="form-label">Owner</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Full name"
                  value={form.owner}
                  onChange={e => setForm(f => ({ ...f, owner: e.target.value }))}
                />
              </div>
            </div>
            <div className="form-field">
              <label className="form-label">Owner Email <span className="form-label-optional">(optional)</span></label>
              <input
                type="email"
                className="form-input"
                placeholder="owner@company.com"
                value={form.ownerEmail}
                onChange={e => setForm(f => ({ ...f, ownerEmail: e.target.value }))}
              />
            </div>
            {error && <p className="form-error">{error}</p>}
            <div className="modal-actions">
              <button type="button" onClick={onClose} className="btn-cancel">Cancel</button>
              <button type="submit" className="btn-submit">Add Commitment</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Email Summary Modal ──────────────────────────────────────────────────────

function EmailSummaryModal({ summary, onClose, onOpenSummary }) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')

  function handleSend(e) {
    e.preventDefault()
    if (!email.trim()) return setError('Please enter an email address.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError('Please enter a valid email address.')
    const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    const subject = encodeURIComponent(`LightWork Ops — Weekly Summary ${date}`)
    const body = encodeURIComponent(summary)
    window.location.href = `mailto:${encodeURIComponent(email.trim())}?subject=${subject}&body=${body}`
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Email Weekly Summary</h2>
            <p className="modal-subtitle">Opens your email client with the summary pre-filled</p>
          </div>
          <button onClick={onClose} className="modal-close">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {!summary ? (
          <div className="modal-body">
            <div className="email-no-summary">
              <div className="email-no-summary-icon">✨</div>
              <p className="email-no-summary-title">No summary generated yet</p>
              <p className="email-no-summary-text">Generate a weekly summary first, then you can email it directly to your co-founder or team.</p>
              <button
                onClick={() => { onClose(); onOpenSummary() }}
                className="btn-submit"
                style={{ marginTop: '1rem' }}
              >
                Generate Summary First
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSend} className="modal-body">
            <div className="form-stack">
              <div className="email-preview">
                <div className="email-preview-row">
                  <span className="email-preview-label">Subject</span>
                  <span className="email-preview-value">
                    LightWork Ops — Weekly Summary {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </span>
                </div>
                <div className="email-preview-row">
                  <span className="email-preview-label">Body</span>
                  <span className="email-preview-value email-preview-body">
                    AI-generated operations summary ({summary.split('\n').filter(Boolean).length} lines)
                  </span>
                </div>
              </div>
              <div className="form-field">
                <label className="form-label">Send to</label>
                <input
                  type="email"
                  autoFocus
                  className="form-input"
                  placeholder="cofounder@company.com"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError('') }}
                />
              </div>
              {error && <p className="form-error">{error}</p>}
              <div className="modal-actions">
                <button type="button" onClick={onClose} className="btn-cancel">Cancel</button>
                <button type="submit" className="btn-submit">
                  <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Open in Email Client
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

function MarkdownRenderer({ text }) {
  return (
    <div className="markdown">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('## ')) {
          return <h3 key={i} className="md-h3">{line.slice(3)}</h3>
        }
        if (line.startsWith('# ')) {
          return <h2 key={i} className="md-h2">{line.slice(2)}</h2>
        }
        if (line.startsWith('- ') || line.startsWith('* ')) {
          return (
            <div key={i} className="md-li">
              <span className="md-bullet">•</span>
              <span dangerouslySetInnerHTML={{ __html: inlineMd(line.slice(2)) }} />
            </div>
          )
        }
        if (line.trim() === '') return <div key={i} className="md-spacer" />
        return <p key={i} className="md-p" dangerouslySetInnerHTML={{ __html: inlineMd(line) }} />
      })}
    </div>
  )
}

// ─── Weekly Summary Modal ─────────────────────────────────────────────────────

function WeeklySummaryModal({ commitments, summary, setSummary, onClose }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copyLabel, setCopyLabel] = useState('Copy')

  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY

  useEffect(() => {
    if (apiKey && !summary) generate()
  }, [])

  async function generate() {
    setLoading(true)
    setError('')
    setSummary('')

    const today = new Date()
    const weekEnd = new Date(today); weekEnd.setDate(today.getDate() + 7)
    const dateRange = `${today.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${weekEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`

    const lines = commitments.map(c => {
      const lastNote = c.updates.at(-1)?.note || 'No updates logged'
      const days = daysUntil(c.deadline)
      const daysLabel = days < 0 ? `${Math.abs(days)} days overdue` : days === 0 ? 'due today' : `due in ${days} days`
      return `- [${c.team}] "${c.description}" | Owner: ${c.owner} | Status: ${STATUS[c.status].label} | Deadline: ${fmtDate(c.deadline)} (${daysLabel}) | Latest update: ${lastNote}`
    }).join('\n')

    const prompt = `You are the Founder's Associate at LightWork AI, an early-stage startup. Write a professional weekly operations summary for the co-founders covering the period ${dateRange}.

Use EXACTLY these section headings (include the emoji):

## ✅ Completed This Week
## 🟡 At Risk
## 🔴 Missed Deadlines
## 📅 Upcoming Deadlines (Next 7 Days)
## 💡 Recommended Actions

Rules:
- Under each section, use bullet points starting with "- "
- "Completed This Week": list items with status "completed". If none, write "- Nothing completed this week."
- "At Risk": list items with status "at_risk". Include the owner, why it's at risk, and days until deadline. If none, write "- No items currently at risk."
- "Missed Deadlines": list items with status "missed". Include owner and how many days overdue. If none, write "- No missed deadlines."
- "Upcoming Deadlines (Next 7 Days)": list any non-completed items due within the next 7 days. Include status and owner. If none, write "- No deadlines in the next 7 days."
- "Recommended Actions": exactly 3 specific, actionable bullets the Founder's Associate should focus on this week. Be direct and prescriptive.
- Keep each bullet concise (1–2 sentences max). Total summary under 450 words.
- Do not add any text before the first section heading.

COMMITMENTS DATA:
${lines}`

    const fetchUrl = 'https://api.anthropic.com/v1/messages'
    const fetchHeaders = {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    }
    const fetchBody = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    }

    console.log('[LW Debug] VITE_ANTHROPIC_API_KEY (first 10):', apiKey ? apiKey.slice(0, 10) : 'MISSING')
    console.log('[LW Debug] Fetch URL:', fetchUrl)
    console.log('[LW Debug] Fetch headers:', fetchHeaders)
    console.log('[LW Debug] Fetch body (model/max_tokens):', { model: fetchBody.model, max_tokens: fetchBody.max_tokens })

    try {
      const res = await fetch(fetchUrl, {
        method: 'POST',
        headers: fetchHeaders,
        body: JSON.stringify(fetchBody),
      })
      console.log('[LW Debug] Response status:', res.status, res.statusText)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        console.log('[LW Debug] Error response body:', body)
        throw new Error(body?.error?.message || `API error ${res.status}`)
      }
      const data = await res.json()
      setSummary(data.content?.[0]?.text || 'No summary returned.')
    } catch (err) {
      console.log('[LW Debug] Caught error:', err.message)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function handleCopy() {
    if (!summary) return
    navigator.clipboard.writeText(summary).then(() => {
      setCopyLabel('Copied!')
      setTimeout(() => setCopyLabel('Copy'), 2000)
    })
  }

  function handlePrint() {
    const dateStr = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    const html = summaryToHtml(summary, dateStr)
    const win = window.open('', '_blank')
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print() }, 500)
  }

  const dateLabel = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg">

        {/* Header */}
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Weekly Operations Summary</h2>
            <p className="modal-subtitle">AI-generated · {dateLabel}</p>
          </div>
          <button onClick={onClose} className="modal-close">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="modal-body-scroll">
          {!apiKey && (
            <div className="no-api-key">
              <p className="no-api-title">API key not configured</p>
              <p className="no-api-text">
                Set <code className="no-api-code">VITE_ANTHROPIC_API_KEY</code> in a <code className="no-api-code">.env</code> file in the project root.
              </p>
              <div className="no-api-example">VITE_ANTHROPIC_API_KEY=sk-ant-api03-...</div>
              <p className="no-api-hint">Restart the dev server after adding the key.</p>
            </div>
          )}

          {loading && (
            <div className="summary-loading">
              <div className="spinner" />
              <p className="summary-loading-text">Analysing {commitments.length} commitments…</p>
            </div>
          )}

          {error && !loading && (
            <div className="summary-error">
              <p className="summary-error-title">Error generating summary</p>
              <p className="summary-error-text">{error}</p>
              <button onClick={generate} className="btn-retry">Try again</button>
            </div>
          )}

          {summary && !loading && <MarkdownRenderer text={summary} />}
        </div>

        {/* Footer */}
        {apiKey && (
          <div className="modal-footer summary-footer">
            {/* Share actions — only shown when summary exists */}
            {summary && !loading && (
              <div className="summary-share-row">
                <button onClick={handleCopy} className={`btn-share-action${copyLabel === 'Copied!' ? ' copied' : ''}`}>
                  {copyLabel === 'Copied!' ? (
                    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                  {copyLabel}
                </button>
                <button onClick={handlePrint} className="btn-share-action">
                  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download PDF
                </button>
              </div>
            )}
            <button
              onClick={generate}
              disabled={loading}
              className="btn-regenerate"
            >
              {loading ? 'Generating…' : summary ? 'Regenerate' : 'Generate'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [commitments, setCommitments] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [filterTeam, setFilterTeam] = useState('All')
  const [filterStatus, setFilterStatus] = useState('All')
  const [showAddModal, setShowAddModal] = useState(false)
  const [showSummaryModal, setShowSummaryModal] = useState(false)
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [alertsOpen, setAlertsOpen] = useState(true)

  // Lifted summary state so email and share can access it from outside the summary modal
  const [summary, setSummary] = useState('')

  // Load from JSONBin on mount
  useEffect(() => {
    loadData()
      .then(data => {
        console.log('[LW] Loaded from JSONBin:', data.length, 'commitments')
        setCommitments(data.length > 0 ? data : SAMPLE_COMMITMENTS)
      })
      .catch(err => {
        console.error('[LW] JSONBin load failed, falling back to sample data:', err)
        setCommitments(SAMPLE_COMMITMENTS)
      })
      .finally(() => setIsLoading(false))
  }, [])

  const counts = Object.fromEntries(
    Object.keys(STATUS).map(s => [s, commitments.filter(c => c.status === s).length])
  )

  const alerts = commitments.filter(c => {
    if (c.status === 'completed') return false
    const nearDeadline = daysUntil(c.deadline) <= 3
    const lastUpdate = c.updates.at(-1)
    const stale = daysSince(lastUpdate?.ts) > 5
    return nearDeadline || stale
  })

  const filtered = commitments.filter(c => {
    if (filterTeam !== 'All' && c.team !== filterTeam) return false
    if (filterStatus !== 'All' && c.status !== filterStatus) return false
    return true
  })

  const handleStatusChange = useCallback((id, newStatus) => {
    setCommitments(prev => {
      const next = prev.map(c => c.id === id ? { ...c, status: newStatus } : c)
      saveData(next).catch(err => console.error('[LW] Save failed:', err))
      return next
    })
  }, [])

  const handleAddUpdate = useCallback((id, note) => {
    setCommitments(prev => {
      const next = prev.map(c =>
        c.id === id ? { ...c, updates: [...c.updates, { note, ts: new Date().toISOString() }] } : c
      )
      saveData(next).catch(err => console.error('[LW] Save failed:', err))
      return next
    })
  }, [])

  const handleAdd = useCallback(commitment => {
    console.log('[LW Debug] handleAdd called with:', commitment)
    setCommitments(prev => {
      const next = [commitment, ...prev]
      console.log('[LW Debug] New commitments length:', next.length)
      saveData(next).catch(err => console.error('[LW] Save failed:', err))
      return next
    })
  }, [])

  const handleDelete = useCallback(id => {
    setCommitments(prev => {
      const next = prev.filter(c => c.id !== id)
      saveData(next).catch(err => console.error('[LW] Save failed:', err))
      return next
    })
  }, [])

  const handleEdit = useCallback((id, fields) => {
    setCommitments(prev => {
      const next = prev.map(c => c.id === id ? { ...c, ...fields } : c)
      saveData(next).catch(err => console.error('[LW] Save failed:', err))
      return next
    })
  }, [])

  if (isLoading) {
    return (
      <div className="app-loading">
        <div className="spinner" />
        <p className="app-loading-text">Loading commitments…</p>
      </div>
    )
  }

  return (
    <div className="app">

      {/* ── Header ── */}
      <header className="app-header">
        <div className="header-inner">
          <div className="logo">
            <span className="logo-brand">LightWork</span>
            <span className="logo-sub"> Operations Hub</span>
          </div>
          <div className="header-actions">
            <button
              onClick={() => setShowSummaryModal(true)}
              className="btn btn-secondary btn-desktop-only"
            >
              ✨ Weekly Summary
            </button>
            <button
              onClick={() => setShowEmailModal(true)}
              className="btn btn-secondary btn-desktop-only"
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Email Summary
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="btn btn-primary"
            >
              + Add
            </button>
          </div>
        </div>
      </header>

      <main className="app-main">

        {/* ── Summary bar ── */}
        <div className="summary-grid">
          {Object.entries(STATUS).map(([key, val]) => (
            <button
              key={key}
              onClick={() => setFilterStatus(filterStatus === key ? 'All' : key)}
              className={`stat-card${filterStatus === key ? ` active ${val.statActive}` : ''}`}
            >
              <div className="stat-top">
                <span className={`stat-number ${val.numClass}`}>{counts[key]}</span>
                <span className={`stat-dot ${val.dot}`} />
              </div>
              <p className="stat-label">{val.label}</p>
            </button>
          ))}
        </div>

        {/* ── Alerts panel ── */}
        {alerts.length > 0 && (
          <div className="alerts-panel">
            <button onClick={() => setAlertsOpen(v => !v)} className="alerts-toggle">
              <div className="alerts-toggle-left">
                <span className="alert-pulse" />
                <span className="alerts-title">Needs Attention</span>
                <span className="alert-count">{alerts.length}</span>
              </div>
              <svg className={`chevron${alertsOpen ? ' open' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {alertsOpen && (
              <div className="alerts-list">
                {alerts.map(c => {
                  const days = daysUntil(c.deadline)
                  const lastUpdate = c.updates.at(-1)
                  const reasons = []
                  if (days <= 3) reasons.push(days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : `Due in ${days}d`)
                  if (daysSince(lastUpdate?.ts) > 5) reasons.push(lastUpdate ? `No update for ${daysSince(lastUpdate.ts)}d` : 'Never updated')
                  return (
                    <div key={c.id} className="alert-item">
                      <StatusBadge status={c.status} />
                      <div className="alert-info">
                        <p className="alert-desc">{c.description}</p>
                        <p className="alert-meta">{c.owner} · {c.team} · {reasons.join(' · ')}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Filters ── */}
        <div className="filters">
          <div className="filter-group">
            <span className="filter-group-label">Team</span>
            {['All', ...TEAMS].map(t => (
              <button
                key={t}
                onClick={() => setFilterTeam(t)}
                className={`filter-pill${filterTeam === t ? ' active' : ''}`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="filter-group">
            <span className="filter-group-label">Status</span>
            {['All', ...Object.keys(STATUS)].map(s => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`filter-pill${filterStatus === s ? ' active' : ''}`}
              >
                {s === 'All' ? 'All' : STATUS[s].label}
              </button>
            ))}
          </div>
          {(filterTeam !== 'All' || filterStatus !== 'All') && (
            <button
              onClick={() => { setFilterTeam('All'); setFilterStatus('All') }}
              className="filter-clear"
            >
              Clear
            </button>
          )}
        </div>

        {/* Mobile buttons */}
        <div className="mobile-actions">
          <button onClick={() => setShowSummaryModal(true)} className="btn-mobile-summary">
            ✨ Generate Weekly Summary
          </button>
          <button onClick={() => setShowEmailModal(true)} className="btn-mobile-email">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Email Summary
          </button>
        </div>

        {/* ── Commitments grid ── */}
        {filtered.length === 0 ? (
          <div className="empty-state">
            <svg className="empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="empty-text">No commitments match your filters.</p>
            <button
              onClick={() => { setFilterTeam('All'); setFilterStatus('All') }}
              className="btn-clear-filters"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="commitments-grid">
            {filtered.map(c => (
              <CommitmentCard
                key={c.id}
                commitment={c}
                onStatusChange={handleStatusChange}
                onAddUpdate={handleAddUpdate}
                onDelete={handleDelete}
                onEdit={handleEdit}
              />
            ))}
          </div>
        )}

        <p className="app-footer">
          LightWork Operations Hub · {commitments.length} commitment{commitments.length !== 1 ? 's' : ''} tracked
        </p>
      </main>

      {/* ── Modals ── */}
      {showAddModal && (
        <AddCommitmentModal onClose={() => setShowAddModal(false)} onAdd={handleAdd} />
      )}
      {showSummaryModal && (
        <WeeklySummaryModal
          commitments={commitments}
          summary={summary}
          setSummary={setSummary}
          onClose={() => setShowSummaryModal(false)}
        />
      )}
      {showEmailModal && (
        <EmailSummaryModal
          summary={summary}
          onClose={() => setShowEmailModal(false)}
          onOpenSummary={() => setShowSummaryModal(true)}
        />
      )}
    </div>
  )
}
