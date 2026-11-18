import { useMemo, useRef, useState } from 'react'
import { AlertCircle, CalendarDays, Check, ChevronRight, Clock3, FileText, Plus, Search, Sparkles, Upload, Users } from 'lucide-react'
import type { AppData, Meeting, MeetingIntelligence, MeetingType } from '../types'
import { meetingProcessor } from '../lib/meetingProcessor'
import { preprocessTranscript } from '../lib/meetingEngine'
import { formatDate, today } from '../App'
import { Badge, Button, Card, EmptyState, Modal, PageTitle } from '../components/UI'

const meetingTypes: MeetingType[] = ['Leadership', 'Team sync', 'Project review', 'Client', 'Planning', 'Other']

export function MeetingsPage({ data, query, onCreate, onOpenReport }: { data: AppData; query: string; onCreate: (meeting: Meeting, intelligence: MeetingIntelligence) => void; onOpenReport: (id: string) => void }) {
  const [captureOpen, setCaptureOpen] = useState(false)
  const [filter, setFilter] = useState('All meetings')
  const [feedback, setFeedback] = useState('')
  const sortedMeetings = useMemo(() => [...data.meetings].filter(meeting => {
    const matchesQuery = !query || `${meeting.title} ${meeting.type} ${meeting.participants.join(' ')} ${meeting.notes}`.toLowerCase().includes(query.toLowerCase())
    const matchesFilter = filter === 'All meetings' || (filter === 'Upcoming' && meeting.date >= today()) || (filter === 'Past' && meeting.date < today())
    return matchesQuery && matchesFilter
  }).sort((a, b) => b.date.localeCompare(a.date)), [data.meetings, query, filter])

  return (
    <div className="page">
      <PageTitle eyebrow="Your workspace" title="Meetings" description="Capture the conversation. Leave with clarity on what happens next." actions={<Button variant="primary" onClick={() => setCaptureOpen(true)}><Plus size={16} /> Add meeting</Button>} />
      <div className="meeting-toolbar"><div className="filter-tabs">{['All meetings', 'Upcoming', 'Past'].map(item => <button key={item} className={filter === item ? 'filter-tab filter-tab-active' : 'filter-tab'} onClick={() => setFilter(item)}>{item}</button>)}</div><span className="result-count">{sortedMeetings.length} {sortedMeetings.length === 1 ? 'meeting' : 'meetings'}</span></div>
      {sortedMeetings.length ? <div className="meeting-list">{sortedMeetings.map(meeting => {
        const actionCount = data.actions.filter(action => action.meetingId === meeting.id).length
        const decisions = data.decisions.filter(decision => decision.meetingId === meeting.id)
        const outstanding = data.actions.filter(action => action.meetingId === meeting.id && action.status !== 'Completed').length
        return <Card className="meeting-card" key={meeting.id}>
          <div className="meeting-card-leading"><div className="meeting-icon-tile"><FileText size={18} /></div><div className="meeting-date-line"><CalendarDays size={14} />{formatDate(meeting.date)}<span>·</span><Clock3 size={14} />{meeting.startTime || 'Time not specified'}</div></div>
          <button className="meeting-card-body" onClick={() => onOpenReport(meeting.id)}><div className="meeting-card-title"><h2>{meeting.title}</h2><Badge>{meeting.type}</Badge></div><p>{meeting.participants.length ? meeting.participants.join(', ') : 'Participants not specified'}</p><div className="meeting-card-stats"><span><Users size={14} />{meeting.participants.length} participants</span><span><Check size={14} />{decisions.length} decisions</span><span><AlertCircle size={14} />{actionCount} actions · {outstanding} open</span></div></button>
          <button className="meeting-open" onClick={() => onOpenReport(meeting.id)} aria-label={`Open report for ${meeting.title}`}><ChevronRight size={19} /></button>
        </Card>
      })}</div> : <Card><EmptyState icon={<Search size={22} />} title="No meetings found" message="Try a different search, or add a new meeting to your workspace." /></Card>}
      <div className="local-engine-banner"><span className="banner-sparkle"><Sparkles size={17} /></span><div><strong>Practical, transparent meeting intelligence</strong><p>The local extraction engine uses clearly stated phrases in your notes. Anything it cannot confidently establish is flagged for review — no AI provider or API key required.</p></div></div>
      {captureOpen && <MeetingCapture onClose={() => setCaptureOpen(false)} onCreate={(meeting, intel) => { onCreate(meeting, intel); setCaptureOpen(false) }} feedback={feedback} setFeedback={setFeedback} />}
    </div>
  )
}

function MeetingCapture({ onClose, onCreate, feedback, setFeedback }: { onClose: () => void; onCreate: (meeting: Meeting, intel: MeetingIntelligence) => void; feedback: string; setFeedback: (value: string) => void }) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(today())
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [participants, setParticipants] = useState('')
  const [type, setType] = useState<MeetingType>('Leadership')
  const [notes, setNotes] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  async function handleFile(file?: File) {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.txt') && file.type !== 'text/plain') {
      setFeedback('Please choose a plain text (.txt) file.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setFeedback('This file is larger than 2 MB. Please choose a smaller text file.')
      return
    }
    try {
      const text = await file.text()
      setNotes(value => value ? `${value}\n\n${text}` : text)
      setFeedback(`Imported ${file.name}`)
    } catch {
      setFeedback('Could not read this file. Check that it is a valid text file and try again.')
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback('')
    const transcriptMetadata = preprocessTranscript(notes)
    if (!title.trim() && !transcriptMetadata.metadata.title) { setFeedback('Add a meeting title or include a title in the transcript metadata.'); return }
    if (!date) { setFeedback('Choose the meeting date to continue.'); return }
    if (!notes.trim()) { setFeedback('Add meeting notes or upload a text transcript to continue.'); return }
    if (startTime && endTime && endTime <= startTime) { setFeedback('The end time should be later than the start time.'); return }
    const meeting: Meeting = {
      id: crypto.randomUUID(),
      title: title.trim() || transcriptMetadata.metadata.title || 'Meeting awaiting title',
      date,
      startTime,
      endTime,
      participants: participants.split(/[,;\n]/).map(name => name.trim()).filter(Boolean),
      type,
      notes: notes.trim(),
      createdAt: new Date().toISOString(),
    }
    onCreate(meeting, meetingProcessor.process(meeting))
  }

  return <Modal title="Capture a meeting" wide onClose={onClose}>
    <form className="capture-form" onSubmit={submit}>
      <div className="form-grid">
        <label className="field field-span"><span>Meeting title <b>*</b></span><input autoFocus value={title} onChange={event => setTitle(event.target.value)} placeholder="e.g. Q4 operating review" /></label>
        <label className="field"><span>Date <b>*</b></span><input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
        <label className="field"><span>Meeting type</span><select value={type} onChange={event => setType(event.target.value as MeetingType)}>{meetingTypes.map(item => <option key={item}>{item}</option>)}</select></label>
        <label className="field"><span>Start time</span><input type="time" value={startTime} onChange={event => setStartTime(event.target.value)} /></label>
        <label className="field"><span>End time</span><input type="time" value={endTime} onChange={event => setEndTime(event.target.value)} /></label>
        <label className="field field-span"><span>Participants <small>Separate names with commas</small></span><div className="input-with-icon"><Users size={16} /><input value={participants} onChange={event => setParticipants(event.target.value)} placeholder="Olivia Chen, Marcus Reed" /></div></label>
        <label className="field field-span"><span>Meeting notes or transcript <b>*</b><small>Timestamped speaker turns and metadata such as “Meeting Date:” and “Participants:” are supported. Clear decision/action markers also help.</small></span><textarea rows={9} value={notes} onChange={event => setNotes(event.target.value)} placeholder={'Paste your meeting notes or transcript here...\n\nMeeting Date: November 17, 2026\nParticipants: Amara Okafor, Daniel Mensah\n[10:02 AM] DANIEL MENSAH: We closed 412 support tickets last week.'} /></label>
      </div>
      <div className="file-upload-row"><input ref={fileInput} type="file" accept=".txt,text/plain" hidden onChange={event => { void handleFile(event.target.files?.[0]); event.currentTarget.value = '' }} /><Button type="button" onClick={() => fileInput.current?.click()}><Upload size={15} /> Upload .txt file</Button><span>Plain text only · up to 2 MB</span>{feedback && <span className={`form-feedback ${feedback.startsWith('Imported') ? 'feedback-success' : ''}`}>{feedback.startsWith('Imported') ? <Check size={14} /> : <AlertCircle size={14} />}{feedback}</span>}</div>
      <div className="engine-disclosure"><Sparkles size={15} /><span>Processed locally in your browser. This prototype does not send notes to an AI service.</span></div>
      <div className="modal-actions"><Button type="button" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary"><Sparkles size={15} /> Process meeting</Button></div>
    </form>
  </Modal>
}
