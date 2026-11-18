import { useMemo, useState } from 'react'
import { ArrowDownToLine, ArrowRight, CalendarDays, Clipboard, FileText, Mail, Printer, Search, Table2 } from 'lucide-react'
import type { AppData } from '../types'
import { formatDate } from '../App'
import { Badge, Button, Card, EmptyState, PageTitle } from '../components/UI'

export function ReportsPage({ data, query, onOpenReport, onOpenEmail }: { data: AppData; query: string; onOpenReport: (id: string) => void; onOpenEmail: (id: string) => void }) {
  const [feedback, setFeedback] = useState('')
  const meetings = useMemo(() => [...data.meetings].filter(meeting => `${meeting.title} ${meeting.type} ${meeting.participants.join(' ')}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => b.date.localeCompare(a.date)), [data.meetings, query])
  const recordedCount = data.decisions.filter(decision => decision.kind === 'Recorded').length
  const openActions = data.actions.filter(action => action.status !== 'Completed').length

  function exportCsv() {
    if (!data.actions.length) { setFeedback('There are no action items to export yet.'); return }
    const headers = ['Task description', 'Owner', 'Owners', 'Source meeting', 'Due date', 'Deadline wording', 'Priority', 'Status', 'Notes', 'Source statement', 'Confidence', 'Dependencies']
    const rows = data.actions.map(action => [
      action.description,
      action.owner,
      (action.owners ?? []).join('; '),
      data.meetings.find(meeting => meeting.id === action.meetingId)?.title ?? 'Meeting removed',
      action.dueDate ?? 'Not specified',
      action.deadlineText ?? '',
      action.priority,
      action.status,
      action.notes,
      action.sourceStatement ?? '',
      action.confidence === undefined ? '' : `${Math.round(action.confidence * 100)}%`,
      (action.dependencies ?? []).join('; '),
    ])
    const csv = [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n')
    downloadFile(`meeting-action-items-${new Date().toISOString().slice(0, 10)}.csv`, `\uFEFF${csv}`, 'text/csv;charset=utf-8')
    setFeedback('Action items exported as CSV.')
  }

  return <div className="page">
    <PageTitle eyebrow="Workspace outputs" title="Reports & exports" description="Share a clear record of what was discussed and what happens next." actions={<Button variant="primary" onClick={exportCsv}><ArrowDownToLine size={16} />Export actions CSV</Button>} />
    <div className="report-stat-grid"><div className="report-stat"><span className="summary-icon summary-blue"><FileText size={18} /></span><span><strong>{data.meetings.length}</strong><small>Meeting reports</small></span></div><div className="report-stat"><span className="summary-icon summary-amber"><Table2 size={18} /></span><span><strong>{openActions}</strong><small>Open action items</small></span></div><div className="report-stat"><span className="summary-icon summary-green"><Clipboard size={18} /></span><span><strong>{recordedCount}</strong><small>Recorded decisions</small></span></div></div>
    {feedback && <div className="report-export-feedback"><span>{feedback}</span><button onClick={() => setFeedback('')}>Dismiss</button></div>}
    <Card className="reports-card"><div className="reports-card-heading"><div><h2>Meeting reports</h2><p>Choose a report to read, print, or prepare a follow-up.</p></div><span className="count-pill">{meetings.length}</span></div>
      {meetings.length ? <div className="reports-list">{meetings.map(meeting => {
        const actions = data.actions.filter(action => action.meetingId === meeting.id).length
        const decisions = data.decisions.filter(decision => decision.meetingId === meeting.id).length
        return <article className="report-list-item" key={meeting.id}><div className="report-item-icon"><FileText size={18} /></div><div className="report-item-main"><h3>{meeting.title}</h3><div><span><CalendarDays size={13} />{formatDate(meeting.date)}</span><Badge>{meeting.type}</Badge><span>{actions} actions · {decisions} decisions</span></div></div><div className="report-item-actions"><button title="Draft follow-up email" onClick={() => onOpenEmail(meeting.id)}><Mail size={15} /><span>Email</span></button><button className="report-open-button" onClick={() => onOpenReport(meeting.id)}>Open report <ArrowRight size={14} /></button></div></article>
      })}</div> : <EmptyState icon={<Search size={22} />} title="No reports found" message="Add a meeting to create your first report." />}</Card>
    <div className="export-guidance"><Printer size={16} /><div><strong>Print or save a report as PDF</strong><p>Open any report and choose “Export PDF”. Your browser’s print dialog lets you save a clean copy as a PDF.</p></div></div>
  </div>
}

function csvCell(value: string) {
  const safeValue = /^[=+\-@]/.test(value.trimStart()) ? `'${value}` : value
  return `"${safeValue.replaceAll('"', '""')}"`
}
function downloadFile(filename: string, contents: string, type: string) {
  const blob = new Blob([contents], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
