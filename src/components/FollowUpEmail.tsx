import { useState } from 'react'
import { AlertCircle, Check, Clipboard, Mail, Sparkles } from 'lucide-react'
import type { ActionItem, Decision, Meeting, MeetingIntelligence } from '../types'
import { createFollowUpEmail } from '../lib/followUpEmail'
import { Button, Modal } from './UI'

export function FollowUpEmail({ meeting, intelligence, actions, decisions, onClose }: { meeting: Meeting; intelligence: MeetingIntelligence; actions: ActionItem[]; decisions: Decision[]; onClose: () => void }) {
  const [email, setEmail] = useState(() => createFollowUpEmail(meeting, intelligence, actions, decisions))
  const [feedback, setFeedback] = useState('')

  async function copyEmail() {
    try { await navigator.clipboard.writeText(email); setFeedback('Email copied to clipboard.') }
    catch { setFeedback('Could not access the clipboard. Select and copy the email text manually.') }
  }

  return <Modal title="Follow-up email" wide onClose={onClose}>
    <div className="email-modal-content">
      <div className="email-generated-note"><Sparkles size={15} /><span>Drafted only from information recorded in this meeting. Review and personalize before sending.</span></div>
      <label className="field email-subject"><span>Subject</span><input readOnly value={`Follow-up: ${meeting.title}`} /></label>
      <label className="field"><span>Email draft</span><textarea className="email-textarea" rows={17} value={email} onChange={event => setEmail(event.target.value)} aria-label="Editable follow-up email" /></label>
      {feedback && <div className={`copy-feedback ${feedback.startsWith('Email') ? 'copy-success' : 'copy-error'}`}>{feedback.startsWith('Email') ? <Check size={14} /> : <AlertCircle size={14} />}{feedback}</div>}
      <div className="modal-actions"><span className="email-edit-hint"><Mail size={14} />Editable draft · not sent automatically</span><Button onClick={() => void copyEmail()} variant="primary"><Clipboard size={15} />Copy email</Button></div>
    </div>
  </Modal>
}
