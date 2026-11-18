import { AlertCircle, ArrowRight, ArrowUpRight, CalendarClock, CalendarPlus, CheckCircle2, CircleDot, Clock3, FileText, ListTodo, Plus, Sparkles } from 'lucide-react'
import type { AppData } from '../types'
import type { Screen } from '../App'
import { addDays, formatDate, today } from '../App'
import { meetingProcessor } from '../lib/meetingProcessor'
import { Badge, Button, Card, PageTitle } from '../components/UI'

export function DashboardPage({ data, onNavigate, onOpenReport }: { data: AppData; onNavigate: (screen: Screen) => void; onOpenReport: (id: string) => void }) {
  const activeActions = data.actions.filter(action => action.status !== 'Completed')
  const overdue = activeActions.filter(action => action.dueDate && action.dueDate < today())
  const upcomingMeetings = data.meetings.filter(meeting => meeting.date >= today() && meeting.date <= addDays(today(), 7))
  const pendingDecisions = data.decisions.filter(decision => decision.kind === 'Proposed')
    .concat(data.decisions.filter(decision => decision.kind === 'Pending' || decision.kind === 'Approval Required'))
  const dueSoon = activeActions.filter(action => action.dueDate && action.dueDate >= today() && action.dueDate <= addDays(today(), 3))
  const recent = [...data.meetings].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4)
  const intelligence = data.meetings.map(meeting => ({ meeting, result: meeting.intelligence ?? meetingProcessor.process(meeting) }))
  const openQuestions = intelligence.flatMap(({ meeting, result }) => result.questions.map(question => ({ question, meeting }))).slice(0, 3)
  const openRisks = intelligence.flatMap(({ meeting, result }) => result.risks.map(risk => ({ risk, meeting }))).slice(0, 2)
  const attentionCount = overdue.length + dueSoon.length + openQuestions.length + openRisks.length

  return (
    <div className="page">
      <PageTitle eyebrow={formatDate(today(), { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} title="Good morning, Olivia" description="Here’s what’s happening across your meetings and follow-ups." actions={<Button variant="primary" onClick={() => onNavigate('Meetings')}><Plus size={16} /> New meeting</Button>} />
      <div className="stat-grid">
        <Metric icon={CalendarClock} label="Total meetings" value={data.meetings.length} detail="In your workspace" tone="blue" onClick={() => onNavigate('Meetings')} />
        <Metric icon={CalendarPlus} label="Upcoming meetings" value={upcomingMeetings.length} detail="Over the next 7 days" tone="violet" onClick={() => onNavigate('Meetings')} />
        <Metric icon={ListTodo} label="Open action items" value={activeActions.length} detail={`${data.actions.filter(action => action.status === 'In Progress').length} in progress`} tone="amber" onClick={() => onNavigate('Action Items')} />
        <Metric icon={AlertCircle} label="Overdue" value={overdue.length} detail="Needs follow-through" tone="red" onClick={() => onNavigate('Action Items')} />
      </div>
      <div className="dashboard-grid">
        <Card className="attention-card">
          <div className="section-heading"><div><div className="heading-with-icon"><span className="attention-icon"><AlertCircle size={17} /></span><h2>Needs attention</h2>{attentionCount > 0 && <span className="count-pill">{attentionCount}</span>}</div><p>Items that may need a nudge or a decision.</p></div><button className="text-link" onClick={() => onNavigate('Action Items')}>View all <ArrowRight size={14} /></button></div>
          <div className="attention-list">
            {overdue.slice(0, 2).map(action => <div className="attention-row" key={`overdue-${action.id}`}><span className="attention-marker marker-red"><Clock3 size={15} /></span><div className="attention-content"><strong>{action.description}</strong><span>{action.owner} · due {formatDate(action.dueDate)}</span></div><Badge tone="overdue">Overdue</Badge></div>)}
            {dueSoon.slice(0, 2).map(action => <div className="attention-row" key={`soon-${action.id}`}><span className="attention-marker marker-blue"><CalendarClock size={15} /></span><div className="attention-content"><strong>{action.description}</strong><span>{action.owner} · due {formatDate(action.dueDate)}</span></div><Badge tone="upcoming">Due soon</Badge></div>)}
            {openQuestions.slice(0, 1).map(({ question, meeting }, index) => <div className="attention-row" key={`${meeting.id}-question-${index}`}><span className="attention-marker marker-amber"><CircleDot size={15} /></span><div className="attention-content"><strong>{question}</strong><span>{meeting.title} · outstanding question</span></div><Badge tone="review">Open</Badge></div>)}
              {openRisks.map(({ risk, meeting }, index) => <div className="attention-row" key={`${meeting.id}-risk-${index}`}><span className="attention-marker marker-red"><AlertCircle size={15} /></span><div className="attention-content"><strong>{risk}</strong><span>{meeting.title} · risk or concern</span></div><Badge tone="overdue">Risk</Badge></div>)}
            {attentionCount === 0 && <div className="all-clear"><CheckCircle2 size={20} /><span>Nothing needs your attention right now.</span></div>}
          </div>
        </Card>
        <Card className="decision-card">
          <div className="section-heading"><div><div className="heading-with-icon"><span className="decision-icon"><CircleDot size={17} /></span><h2>Pending decisions</h2></div><p>Proposals that still need confirmation.</p></div><button className="text-link" onClick={() => onNavigate('Decisions')}>View register <ArrowRight size={14} /></button></div>
          {pendingDecisions.length ? <div className="pending-decision-list">{pendingDecisions.slice(0, 3).map(decision => <button className="pending-decision" key={decision.id} onClick={() => onNavigate('Decisions')}><span>{decision.kind}: {decision.description}</span><small>{data.meetings.find(meeting => meeting.id === decision.meetingId)?.title ?? 'Meeting'}</small><ArrowUpRight size={15} /></button>)}</div> : <div className="small-empty"><CheckCircle2 size={17} />No pending decisions.</div>}
        </Card>
      </div>
      <Card className="recent-card">
        <div className="section-heading"><div><h2>Recent meetings</h2><p>Your latest meeting intelligence, all in one place.</p></div><button className="text-link" onClick={() => onNavigate('Meetings')}>All meetings <ArrowRight size={14} /></button></div>
        <div className="recent-list">
          {recent.map(meeting => {
            const actionCount = data.actions.filter(action => action.meetingId === meeting.id).length
            const decisionCount = data.decisions.filter(decision => decision.meetingId === meeting.id && decision.kind === 'Recorded').length
            return <button className="recent-meeting" key={meeting.id} onClick={() => onOpenReport(meeting.id)}>
              <span className="meeting-date-tile"><small>{formatDate(meeting.date, { month: 'short' }).toUpperCase()}</small><strong>{new Date(`${meeting.date}T12:00:00`).getDate()}</strong></span>
              <span className="recent-meeting-main"><strong>{meeting.title}</strong><small>{meeting.type} <span>·</span> {meeting.participants.slice(0, 3).join(', ')}{meeting.participants.length > 3 ? ` +${meeting.participants.length - 3}` : ''}</small></span>
              <span className="recent-counts"><span><ListTodo size={14} />{actionCount} actions</span><span><FileText size={14} />{decisionCount} decisions</span></span>
              <ArrowRight className="recent-arrow" size={16} />
            </button>
          })}
        </div>
      </Card>
      <div className="engine-note"><Sparkles size={16} /><span><strong>Local intelligence engine</strong> — Meeting details are extracted from explicit wording in your notes. Review flagged information before sharing.</span><button onClick={() => onNavigate('Settings')}>How it works</button></div>
    </div>
  )
}

function Metric({ icon: Icon, label, value, detail, tone, onClick }: { icon: typeof CalendarClock; label: string; value: number; detail: string; tone: string; onClick: () => void }) {
  return <button className="metric-card" onClick={onClick}><div className="metric-top"><span className={`metric-icon metric-${tone}`}><Icon size={18} /></span><ArrowUpRight size={15} className="metric-arrow" /></div><strong className="metric-value">{value}</strong><span className="metric-label">{label}</span><span className="metric-detail">{detail}</span></button>
}
