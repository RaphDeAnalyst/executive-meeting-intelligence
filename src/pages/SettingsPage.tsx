import { useState } from 'react'
import { AlertCircle, Check, Database, RefreshCcw, ShieldCheck, Sparkles, Trash2 } from 'lucide-react'
import { Button, Card, Modal, PageTitle } from '../components/UI'

export function SettingsPage({ onRestoreDemo }: { onRestoreDemo: () => void }) {
  const [confirmReset, setConfirmReset] = useState(false)
  return <div className="page">
    <PageTitle eyebrow="Workspace preferences" title="Settings" description="Manage local data and understand how meeting intelligence works." />
    <div className="settings-layout">
      <div className="settings-main">
        <Card className="settings-card"><div className="settings-card-heading"><span className="settings-icon"><Database size={18} /></span><div><h2>Workspace data</h2><p>Your meetings and follow-ups are saved locally in this browser.</p></div></div><div className="settings-detail-row"><div><strong>Storage</strong><span>Browser localStorage on this device</span></div><span className="storage-status"><span />Active</span></div><div className="settings-detail-row"><div><strong>Sample workspace</strong><span>Restore the original demonstration meetings, actions, and decisions.</span></div><Button onClick={() => setConfirmReset(true)}><RefreshCcw size={14} />Restore demo data</Button></div></Card>
        <Card className="settings-card"><div className="settings-card-heading"><span className="settings-icon settings-icon-violet"><Sparkles size={18} /></span><div><h2>Meeting intelligence engine</h2><p>Transparent extraction, no external AI service.</p></div></div><div className="engine-capability-list"><div><Check size={15} /><span>Recognizes explicit “Decision:” and “Action:” markers.</span></div><div><Check size={15} /><span>Matches owners against stated participants or explicit owner labels.</span></div><div><Check size={15} /><span>Recognizes written dates and relative weekdays in clear action statements.</span></div><div><AlertCircle size={15} /><span>Unclear owners, dates, proposals, and open questions are surfaced for human review.</span></div></div><div className="settings-info"><strong>AI integration, when you’re ready</strong><p>The meeting processor is isolated from the UI. A future provider can implement the same structured output without changing meeting, action, or decision workflows. No notes are currently sent outside your browser.</p></div></Card>
      </div>
      <Card className="privacy-card"><span className="privacy-large"><ShieldCheck size={22} /></span><h3>Local by default</h3><p>Meeting notes, participants, actions, and decisions stay in this browser. Browser storage is not encrypted, so use a trusted device for sensitive information.</p><div className="privacy-divider" /><div className="privacy-list"><span><Check size={14} />No API key needed</span><span><Check size={14} />No server-side processing</span><span><Check size={14} />Data persists on refresh</span></div></Card>
    </div>
    {confirmReset && <Modal title="Restore demonstration data?" onClose={() => setConfirmReset(false)}><div className="confirm-copy"><p>This replaces your current browser workspace with the original sample meetings, action items, and decisions. This cannot be undone.</p></div><div className="modal-actions"><Button onClick={() => setConfirmReset(false)}>Cancel</Button><Button variant="danger" onClick={() => { onRestoreDemo(); setConfirmReset(false) }}><Trash2 size={15} />Restore demo data</Button></div></Modal>}
  </div>
}
