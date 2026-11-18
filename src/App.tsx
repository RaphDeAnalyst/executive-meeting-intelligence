import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle, Bell, CalendarDays, Check, ChevronDown, ClipboardList, FileText, LayoutDashboard,
  ListChecks, Menu, Search, Settings2, ShieldCheck, Sparkles, X, type LucideIcon,
} from 'lucide-react'
import { initialDemoData } from './data/demoData'
import { clearSavedData, loadAppData, saveAppData } from './lib/storage'
import { meetingProcessor } from './lib/meetingProcessor'
import { migrateWorkspaceData } from './lib/workspaceMigration'
import type { ActionItem, AppData, Decision, Meeting, MeetingIntelligence } from './types'
import { ActionItemsPage } from './pages/ActionItemsPage'
import { DecisionsPage } from './pages/DecisionsPage'
import { DashboardPage } from './pages/DashboardPage'
import { MeetingsPage } from './pages/MeetingsPage'
import { ReportsPage } from './pages/ReportsPage'
import { SettingsPage } from './pages/SettingsPage'
import { IconButton, Toast } from './components/UI'
import { MeetingReport } from './components/MeetingReport'
import { FollowUpEmail } from './components/FollowUpEmail'
import './styles.css'

export type Screen = 'Overview' | 'Meetings' | 'Action Items' | 'Decisions' | 'Reports' | 'Settings'
const navItems: { label: Screen; icon: LucideIcon }[] = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Meetings', icon: CalendarDays },
  { label: 'Action Items', icon: ListChecks },
  { label: 'Decisions', icon: ClipboardList },
  { label: 'Reports', icon: FileText },
  { label: 'Settings', icon: Settings2 },
]

function initialData(): { data: AppData; error: string } {
  try {
    return { data: migrateWorkspaceData(loadAppData()), error: '' }
  } catch (error) {
    return { data: structuredClone(initialDemoData), error: error instanceof Error ? error.message : 'Could not load saved workspace data.' }
  }
}

export default function App() {
  const [data, setData] = useState<AppData>(() => initialData().data)
  const [screen, setScreen] = useState<Screen>('Overview')
  const [query, setQuery] = useState('')
  const [toast, setToast] = useState(() => initialData().error)
  const [reportId, setReportId] = useState<string | null>(null)
  const [emailMeetingId, setEmailMeetingId] = useState<string | null>(null)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    try { saveAppData(data) }
    catch { setToast('Your browser could not save workspace changes. Check local storage permissions or available storage.') }
  }, [data])

  const meetingById = useMemo(() => new Map(data.meetings.map(meeting => [meeting.id, meeting])), [data.meetings])
  const reportMeeting = reportId ? meetingById.get(reportId) ?? null : null
  const emailMeeting = emailMeetingId ? meetingById.get(emailMeetingId) ?? null : null
  const reportIntelligence = useMemo(
    () => reportMeeting
      ? reportMeeting.intelligence?.processorVersion === 15 ? reportMeeting.intelligence : meetingProcessor.process(reportMeeting)
      : null,
    [reportMeeting],
  )
  const emailIntelligence = useMemo(
    () => emailMeeting
      ? emailMeeting.intelligence?.processorVersion === 15 ? emailMeeting.intelligence : meetingProcessor.process(emailMeeting)
      : null,
    [emailMeeting],
  )
  const overdue = data.actions.filter(action => action.status !== 'Completed' && action.dueDate && action.dueDate < today()).length
  const upcoming = data.actions.filter(action => action.status !== 'Completed' && action.dueDate && action.dueDate >= today() && action.dueDate <= addDays(today(), 3))
  const notifications = [
    ...data.actions.filter(action => action.status !== 'Completed' && action.dueDate && action.dueDate < today()).map(action => `Overdue: ${action.description}`),
    ...upcoming.map(action => `Due soon: ${action.description}`),
  ]

  function updateAction(updated: ActionItem) {
    setData(current => ({
      ...current,
      actions: current.actions.some(action => action.id === updated.id)
        ? current.actions.map(action => action.id === updated.id ? updated : action)
        : [updated, ...current.actions],
    }))
  }

  function saveMeeting(meeting: Meeting, intelligence: MeetingIntelligence) {
    const resolvedMeeting: Meeting = {
      ...meeting,
      title: intelligence.metadata.title ?? meeting.title,
      date: intelligence.metadata.date ?? meeting.date,
      startTime: intelligence.metadata.startTime ?? meeting.startTime,
      endTime: intelligence.metadata.endTime ?? meeting.endTime,
      location: intelligence.metadata.location ?? meeting.location,
      participants: intelligence.metadata.participants.length ? intelligence.metadata.participants : meeting.participants,
      intelligence,
    }
    setData(current => ({
      meetings: [resolvedMeeting, ...current.meetings],
      actions: [...intelligence.actions, ...current.actions],
      decisions: [...intelligence.decisions, ...current.decisions],
    }))
    setReportId(resolvedMeeting.id)
    setToast('Meeting processed. Review any flagged details before sharing.')
  }

  function updateDecision(updated: Decision) {
    setData(current => ({
      ...current,
      decisions: current.decisions.some(decision => decision.id === updated.id)
        ? current.decisions.map(decision => decision.id === updated.id ? updated : decision)
        : [updated, ...current.decisions],
    }))
  }

  function openReport(id: string) { setReportId(id); setEmailMeetingId(null) }
  function restoreDemo() {
    try {
      clearSavedData()
      setData(structuredClone(initialDemoData))
      setToast('Demo workspace restored.')
    } catch {
      setToast('Could not reset saved workspace data. Check your browser storage settings.')
    }
  }

  const activeContent = reportMeeting ? (
    <MeetingReport
      meeting={reportMeeting}
      intelligence={reportIntelligence!}
      actions={data.actions.filter(action => action.meetingId === reportMeeting.id)}
      decisions={data.decisions.filter(decision => decision.meetingId === reportMeeting.id)}
      onBack={() => setReportId(null)}
      onEmail={() => setEmailMeetingId(reportMeeting.id)}
    />
  ) : (
    <>
      {screen === 'Overview' && <DashboardPage data={data} onNavigate={setScreen} onOpenReport={openReport} />}
      {screen === 'Meetings' && <MeetingsPage data={data} query={query} onCreate={saveMeeting} onOpenReport={openReport} />}
      {screen === 'Action Items' && <ActionItemsPage data={data} query={query} onUpdate={updateAction} />}
      {screen === 'Decisions' && <DecisionsPage data={data} query={query} onUpdate={updateDecision} />}
      {screen === 'Reports' && <ReportsPage data={data} query={query} onOpenReport={openReport} onOpenEmail={id => setEmailMeetingId(id)} />}
      {screen === 'Settings' && <SettingsPage onRestoreDemo={restoreDemo} />}
    </>
  )

  return (
    <div className="app-shell">
      {mobileNavOpen && <button aria-label="Close navigation" className="mobile-backdrop" onClick={() => setMobileNavOpen(false)} />}
      <aside className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`}>
        <div className="brand"><div className="brand-mark"><Sparkles size={19} /></div><div><strong>Executive</strong><span>MEETING INTELLIGENCE</span></div><IconButton className="mobile-close" label="Close navigation" onClick={() => setMobileNavOpen(false)}><X size={18} /></IconButton></div>
        <div className="workspace-switch"><div className="workspace-avatar">N</div><div className="workspace-info"><strong>Northstar Studio</strong><span>Workspace</span></div><ChevronDown size={15} /></div>
        <div className="nav-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          {navItems.map(item => {
            const Icon = item.icon
            return <button key={item.label} className={`nav-item ${!reportMeeting && screen === item.label ? 'nav-active' : ''}`} onClick={() => { setScreen(item.label); setReportId(null); setMobileNavOpen(false) }}><Icon size={18} /><span>{item.label}</span>{item.label === 'Action Items' && overdue > 0 && <span className="nav-count">{overdue}</span>}</button>
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-note"><ShieldCheck size={16} /><span>Local to this browser<br /><small>Not encrypted on shared devices</small></span></div>
          <button className="profile-menu" onClick={() => setMenuOpen(value => !value)}><div className="user-avatar">OC</div><span className="profile-copy"><strong>Olivia Chen</strong><small>Executive assistant</small></span><ChevronDown size={15} /></button>
          {menuOpen && <div className="profile-popover"><strong>Olivia Chen</strong><span>olivia@northstar.studio</span><button onClick={() => { setScreen('Settings'); setMenuOpen(false) }}>Workspace settings</button></div>}
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left"><IconButton className="mobile-menu" label="Open navigation" onClick={() => setMobileNavOpen(true)}><Menu size={19} /></IconButton><div className="breadcrumb">Workspace <span>/</span> <strong>{reportMeeting ? 'Meeting report' : screen}</strong></div></div>
          <div className="topbar-actions">
            <label className="global-search"><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search anything..." aria-label="Search workspace" /><kbd>⌘ K</kbd></label>
            <div className="notification-wrap"><IconButton label="Notifications" className={notificationsOpen ? 'icon-button-on' : ''} onClick={() => setNotificationsOpen(value => !value)}><Bell size={18} />{notifications.length > 0 && <i className="notification-dot" />}</IconButton>
              {notificationsOpen && <div className="notification-popover"><div className="popover-heading"><strong>Needs attention</strong><span>{notifications.length}</span></div>{notifications.length ? notifications.slice(0, 5).map((notification, index) => <div className="notification-line" key={`${notification}-${index}`}><AlertCircle size={15} /><span>{notification}</span></div>) : <div className="notification-empty"><Check size={17} />You’re all caught up</div>}</div>}
            </div>
            <div className="top-avatar">OC</div>
          </div>
        </header>
        <div className="content-area">{activeContent}</div>
      </main>
      {emailMeeting && emailIntelligence && <FollowUpEmail meeting={emailMeeting} intelligence={emailIntelligence} actions={data.actions.filter(action => action.meetingId === emailMeeting.id)} decisions={data.decisions.filter(decision => decision.meetingId === emailMeeting.id)} onClose={() => setEmailMeetingId(null)} />}
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </div>
  )
}

export function today() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
export function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00`)
  value.setDate(value.getDate() + days)
  return value.toISOString().slice(0, 10)
}
export function formatDate(date?: string | null, options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }) {
  if (!date) return 'Not specified'
  const value = new Date(`${date}T12:00:00`)
  return Number.isNaN(value.getTime()) ? 'Not specified' : new Intl.DateTimeFormat('en-US', options).format(value)
}
