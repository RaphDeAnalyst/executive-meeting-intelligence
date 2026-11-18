import { useMemo, useState } from 'react'
import { AlertCircle, CalendarDays, Check, ChevronDown, CircleDot, FileText, Pencil, Plus, Search, Users } from 'lucide-react'
import type { AppData, Decision, DecisionKind } from '../types'
import { formatDate } from '../App'
import { Badge, Button, Card, EmptyState, Modal, PageTitle } from '../components/UI'

export function DecisionsPage({ data, query, onUpdate }: { data: AppData; query: string; onUpdate: (decision: Decision) => void }) {
  const [kind, setKind] = useState('All decisions')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Decision | null>(null)
  const [adding, setAdding] = useState(false)
  const meetingsById = useMemo(() => new Map(data.meetings.map(meeting => [meeting.id, meeting])), [data.meetings])
  const filtered = useMemo(() => data.decisions.filter(decision => {
    const meeting = meetingsById.get(decision.meetingId)
    const term = `${decision.description} ${decision.people.join(' ')} ${decision.followUp} ${meeting?.title ?? ''}`.toLowerCase()
    return (!query || term.includes(query.toLowerCase())) && (!search || term.includes(search.toLowerCase())) && (kind === 'All decisions' || decision.kind === kind.replace(/ decisions?$/, ''))
  }).sort((a, b) => b.date.localeCompare(a.date)), [data.decisions, meetingsById, query, search, kind])

  function save(decision: Decision) { onUpdate(decision); setEditing(null); setAdding(false) }

  return <div className="page">
    <PageTitle eyebrow="Institutional memory" title="Decision register" description="A searchable record of what was decided, proposed, and what still needs confirmation." actions={<Button variant="primary" onClick={() => setAdding(true)}><Plus size={16} /> Add decision</Button>} />
    <div className="decision-summary-row"><div className="decision-summary"><span className="summary-icon summary-green"><Check size={17} /></span><span><strong>{data.decisions.filter(item => item.kind === 'Recorded').length}</strong><small>Recorded decisions</small></span></div><div className="decision-summary"><span className="summary-icon summary-amber"><CircleDot size={17} /></span><span><strong>{data.decisions.filter(item => item.kind === 'Proposed').length}</strong><small>Proposals</small></span></div><div className="decision-summary"><span className="summary-icon summary-amber"><AlertCircle size={17} /></span><span><strong>{data.decisions.filter(item => item.kind === 'Pending').length}</strong><small>Pending</small></span></div><div className="decision-summary"><span className="summary-icon summary-red"><AlertCircle size={17} /></span><span><strong>{data.decisions.filter(item => item.kind === 'Not Approved').length}</strong><small>Not approved</small></span></div></div>
    <Card className="decision-register-card">
      <div className="register-toolbar"><div><h2>All decisions</h2><p>{filtered.length} records across {data.meetings.length} meetings</p></div><div className="register-controls"><label className="inline-search"><Search size={15} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search decisions" /></label><label className="select-filter"><select aria-label="Filter decision type" value={kind} onChange={event => setKind(event.target.value)}><option>All decisions</option>{(['Recorded', 'Proposed', 'Pending', 'Not Approved', 'Approval Required'] as DecisionKind[]).map(value => <option key={value}>{value} decision{value === 'Not Approved' || value === 'Approval Required' ? '' : 's'}</option>)}</select><ChevronDown size={13} /></label></div></div>
      {filtered.length ? <div className="decision-list">{filtered.map(decision => <article className={`decision-item ${decision.kind !== 'Recorded' ? 'decision-proposed' : ''}`} key={decision.id}>
        <span className={`decision-dot ${decision.kind !== 'Recorded' ? 'decision-dot-proposed' : ''}`}>{decision.kind === 'Recorded' ? <Check size={14} /> : <CircleDot size={14} />}</span>
        <div className="decision-main"><div className="decision-description-row"><h3>{decision.description}</h3><Badge tone={decision.kind}>{decision.kind}</Badge></div><div className="decision-metadata"><span><FileText size={13} />{meetingsById.get(decision.meetingId)?.title ?? 'Meeting removed'}</span><span><CalendarDays size={13} />{formatDate(decision.date)}</span><span><Users size={13} />{decision.people.length ? decision.people.join(', ') : 'People not specified'}</span></div>{decision.followUp && <div className="decision-followup"><AlertCircle size={14} />{decision.followUp}</div>}</div>
        <button className="edit-action decision-edit" aria-label={`Edit decision ${decision.description}`} onClick={() => setEditing(decision)}><Pencil size={15} /></button>
      </article>)}</div> : <EmptyState icon={<Search size={22} />} title="No decisions found" message="Try a different search, or add a decision to the register." />}
    </Card>
    {(editing || adding) && <DecisionEditor decision={editing} data={data} onClose={() => { setEditing(null); setAdding(false) }} onSave={save} />}
  </div>
}

function DecisionEditor({ decision, data, onClose, onSave }: { decision: Decision | null; data: AppData; onClose: () => void; onSave: (decision: Decision) => void }) {
  const [description, setDescription] = useState(decision?.description ?? '')
  const [meetingId, setMeetingId] = useState(decision?.meetingId ?? data.meetings[0]?.id ?? '')
  const [date, setDate] = useState(decision?.date ?? data.meetings[0]?.date ?? '')
  const [people, setPeople] = useState(decision?.people.join(', ') ?? '')
  const [followUp, setFollowUp] = useState(decision?.followUp ?? '')
  const [kind, setKind] = useState<DecisionKind>(decision?.kind ?? 'Recorded')
  const [error, setError] = useState('')
  return <Modal title={decision ? 'Edit decision' : 'Add decision'} onClose={onClose}>
    <form className="editor-form" onSubmit={event => {
      event.preventDefault()
      if (!description.trim()) { setError('Add a decision description.'); return }
      if (!meetingId) { setError('Add a meeting before creating a linked decision.'); return }
      onSave({ id: decision?.id ?? crypto.randomUUID(), description: description.trim(), meetingId, date: date || new Date().toISOString().slice(0, 10), people: people.split(/[,;\n]/).map(value => value.trim()).filter(Boolean), followUp: followUp.trim(), kind })
    }}>
      <label className="field"><span>Description <b>*</b></span><textarea rows={3} value={description} onChange={event => setDescription(event.target.value)} placeholder="What was decided or proposed?" /></label>
      <label className="field"><span>Meeting <b>*</b></span><select value={meetingId} onChange={event => { setMeetingId(event.target.value); setDate(data.meetings.find(meeting => meeting.id === event.target.value)?.date ?? date) }}>{data.meetings.map(meeting => <option value={meeting.id} key={meeting.id}>{meeting.title}</option>)}</select></label>
      <div className="form-grid form-grid-two"><label className="field"><span>Decision date</span><input type="date" value={date} onChange={event => setDate(event.target.value)} /></label><label className="field"><span>Record type</span><select value={kind} onChange={event => setKind(event.target.value as DecisionKind)}>{(['Recorded', 'Proposed', 'Pending', 'Not Approved', 'Approval Required'] as DecisionKind[]).map(value => <option key={value}>{value}</option>)}</select></label></div>
      <label className="field"><span>People involved</span><input value={people} onChange={event => setPeople(event.target.value)} placeholder="Separate names with commas" /></label>
      <label className="field"><span>Follow-up requirements</span><textarea rows={2} value={followUp} onChange={event => setFollowUp(event.target.value)} placeholder="Optional follow-up context" /></label>
      {error && <p className="editor-error"><AlertCircle size={14} />{error}</p>}
      <div className="modal-actions"><Button type="button" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary">{decision ? 'Save changes' : 'Add decision'}</Button></div>
    </form>
  </Modal>
}
