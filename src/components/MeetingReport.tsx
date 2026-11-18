import { useMemo, useState } from 'react'
import { AlertCircle, ArrowLeft, CalendarDays, Check, Clipboard, Download, FileText, Users } from 'lucide-react'
import type { ActionItem, Decision, Meeting, MeetingIntelligence } from '../types'
import { formatDate } from '../App'
import { buildExecutiveBrief, formatDependency, formatExecutiveBrief } from '../lib/executiveBrief'
import { Badge, Button } from './UI'

export function MeetingReport({ meeting, intelligence, actions, decisions, onBack, onEmail }: { meeting: Meeting; intelligence: MeetingIntelligence; actions: ActionItem[]; decisions: Decision[]; onBack: () => void; onEmail: () => void }) {
  const [copyMessage, setCopyMessage] = useState('')
  const brief = useMemo(() => buildExecutiveBrief(meeting, intelligence, actions, decisions), [meeting, intelligence, actions, decisions])
  const reportText = useMemo(() => formatExecutiveBrief(brief), [brief])

  async function copyReport() {
    try { await navigator.clipboard.writeText(reportText); setCopyMessage('Executive brief copied to clipboard.') }
    catch { setCopyMessage('Could not access the clipboard. Select and copy the report text manually.') }
  }

  function downloadPdf() { window.print() }

  return <div className="page report-page">
    <button className="back-link" onClick={onBack}><ArrowLeft size={15} />Back to meetings</button>
    <div className="report-header">
      <div>
        <div className="eyebrow">EXECUTIVE MEETING BRIEF</div>
        <h1>{brief.title}</h1>
        <div className="report-meta">
          <span><CalendarDays size={14} />{formatDate(brief.date)} · {meeting.startTime || intelligence.metadata.startTime || 'Time not specified'}–{meeting.endTime || intelligence.metadata.endTime || 'Not specified'}{brief.duration ? ` · ${brief.duration}` : ''}</span>
          <span><Users size={14} />{brief.participants.length ? brief.participants.join(', ') : 'Participants not specified'}</span>
          {brief.meetingType && <Badge>{brief.meetingType}</Badge>}
        </div>
      </div>
      <div className="report-actions"><Button onClick={() => void copyReport()}><Clipboard size={15} />Copy brief</Button><Button onClick={downloadPdf}><Download size={15} />Export PDF</Button><Button variant="primary" onClick={onEmail}><FileText size={15} />Follow-up email</Button></div>
    </div>
    {copyMessage && <div className={`copy-feedback ${copyMessage.startsWith('Executive') ? 'copy-success' : 'copy-error'}`}>{copyMessage.startsWith('Executive') ? <Check size={14} /> : <AlertCircle size={14} />}{copyMessage}<button onClick={() => setCopyMessage('')}>Dismiss</button></div>}

    <div className="brief-layout">
      <main className="brief-main">
        <section className="brief-snapshot">
          <div className="brief-section-label">EXECUTIVE SNAPSHOT</div>
          <p>{brief.summary}</p>
        </section>

        <section className="brief-section">
          <div className="brief-section-heading"><h2>Key takeaways</h2><span>{brief.takeaways.length ? `${brief.takeaways.length} points` : ''}</span></div>
          {brief.takeaways.length
            ? <ul className="brief-takeaways">{brief.takeaways.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>
            : <p className="brief-empty">No additional distinct takeaways beyond the snapshot, decisions, and actions.</p>}
        </section>

        <section className="brief-section" id="brief-decisions">
          <div className="brief-section-heading"><h2>Decisions</h2><span>{brief.decisions.length}</span></div>
          {brief.decisions.length ? <div className="brief-decision-list">{brief.decisions.map(decision =>
            <article className="brief-decision" id={`decision-${decision.id}`} key={decision.id}>
              <div className="brief-decision-main">
                <Badge tone={decision.status}>{decision.status}</Badge>
                <p>{decision.description}</p>
                {decision.followUp && <small>{decision.followUp}</small>}
                {decision.evidence.length > 0 && <details className="brief-evidence">
                  <summary>Show source</summary>
                  <div>{decision.evidence.map((source, index) => <blockquote key={`${decision.id}-evidence-${index}`}>{source}</blockquote>)}</div>
                </details>}
              </div>
            </article>
          )}</div> : <p className="brief-empty">No decisions recorded.</p>}
        </section>

        <section className="brief-section">
          <div className="brief-section-heading"><h2>Action tracker</h2><span>{brief.actions.length} responsibilities</span></div>
          {brief.actions.length ? <div className="brief-table-scroll"><table className="brief-action-table">
            <thead><tr><th>Action</th><th>Owner</th><th>Deadline</th><th>Status</th></tr></thead>
            <tbody>{brief.actions.map(action => <ActionRow action={action} key={action.id} />)}</tbody>
          </table></div> : <p className="brief-empty">No action items recorded.</p>}
        </section>

        <section className="brief-section brief-attention">
          <div className="brief-section-heading"><h2>Needs attention</h2></div>
          {brief.pendingExecutive.length > 0 && <div className="attention-group">
            <h3>Executive follow-through</h3>
            <ul>{brief.pendingExecutive.map(item =>
              <li key={`attention-${item.id}`}><a href={`#decision-${item.id}`}>{item.attentionSummary ?? `${item.status}: ${item.description}`}</a></li>
            )}</ul>
          </div>}
          {brief.schedulingAttention.length > 0 && <div className="attention-group">
            <h3>Scheduling</h3>
            <ul>{brief.schedulingAttention.map(item =>
              <li key={`scheduling-${item.id}`}><a href={`#decision-${item.id}`}>{item.attentionSummary ?? `${item.status}: ${item.description}`}</a></li>
            )}</ul>
          </div>}
          <div className="attention-group">
            <h3>Blockers and risks</h3>
            {brief.risks.length
              ? <ul>{brief.risks.map((risk, index) => <li key={`risk-${index}`}>{risk}</li>)}</ul>
              : <p>No material risks identified.</p>}
          </div>
          {brief.unresolvedQuestions.length > 0 && <div className="attention-group">
            <h3>Important unresolved questions</h3>
            <ul>{brief.unresolvedQuestions.map((question, index) => <li key={`question-${index}`}>{question}</li>)}</ul>
          </div>}
          {!brief.pendingExecutive.length && !brief.risks.length && !brief.unresolvedQuestions.length && <p className="brief-empty">No immediate attention items identified.</p>}
        </section>

        <details className="brief-progressive">
          <summary>Expand discussion details <span>{brief.discussionDetails.length} items</span></summary>
          <ul>{brief.discussionDetails.map((detail, index) => <li key={`discussion-${index}`}>{detail}</li>)}</ul>
        </details>
        <details className="brief-progressive">
          <summary>View full transcript</summary>
          <pre>{brief.transcript || 'No transcript text was saved.'}</pre>
        </details>
        {brief.warnings.length > 0 && <details className="brief-progressive brief-warnings">
          <summary>View extraction warnings <span>{brief.warnings.length}</span></summary>
          <ul>{brief.warnings.map((warning, index) => <li key={`warning-${index}`}>{warning}</li>)}</ul>
        </details>}
      </main>
    </div>
    <div className="brief-caveat">Locally extracted information. Expand source evidence or warnings to verify uncertain details.</div>
  </div>
}

function ActionRow({ action }: { action: ActionItem }) {
  const owners = action.owners?.length ? action.owners.join(' and ') : action.owner
  const deadline = action.dueDate
    ? formatDate(action.dueDate)
    : action.deadlineText
      ? `${action.deadlineText} (exact date not established)`
      : 'Not specified'
  return <>
    <tr>
      <td className="brief-action-description">
        <strong>{action.description}</strong>
        {action.dependencies?.length ? <small>Blocked until {action.dependencies.map(formatDependency).join('; ')}</small> : null}
        {action.sourceStatements?.length || action.sourceStatement ? <details className="brief-evidence">
          <summary>Show source</summary>
          <div>{(action.sourceStatements?.length ? action.sourceStatements : [action.sourceStatement!]).map((source, index) =>
            <blockquote key={`${action.id}-source-${index}`}>{source}</blockquote>)}</div>
        </details> : null}
      </td>
      <td>{owners || 'Unassigned'}</td>
      <td>{deadline}</td>
      <td><Badge tone={action.status}>{action.status}</Badge></td>
    </tr>
  </>
}
