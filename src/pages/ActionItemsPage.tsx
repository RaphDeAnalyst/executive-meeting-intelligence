import { useMemo, useState } from 'react'
import { AlertCircle, CalendarDays, Check, ChevronDown, Clock3, Filter, ListTodo, Pencil, Plus, Search } from 'lucide-react'
import type { ActionItem, ActionStatus, AppData, Priority } from '../types'
import { formatDate, today } from '../App'
import { Badge, Button, Card, EmptyState, Modal, PageTitle } from '../components/UI'

const statuses: ActionStatus[] = ['Not Started', 'In Progress', 'Completed', 'Blocked']
const priorities: Priority[] = ['Critical', 'High', 'Medium', 'Low']

export function ActionItemsPage({ data, query, onUpdate }: { data: AppData; query: string; onUpdate: (action: ActionItem) => void }) {
  const [statusFilter, setStatusFilter] = useState('All statuses')
  const [priorityFilter, setPriorityFilter] = useState('All priorities')
  const [editing, setEditing] = useState<ActionItem | null>(null)
  const [adding, setAdding] = useState(false)
  const [overdueOnly, setOverdueOnly] = useState(false)
  const meetingsById = useMemo(() => new Map(data.meetings.map(meeting => [meeting.id, meeting])), [data.meetings])
  const filtered = useMemo(() => data.actions.filter(action => {
    const source = meetingsById.get(action.meetingId)?.title ?? ''
    const term = `${action.description} ${action.owner} ${action.notes} ${source}`.toLowerCase()
    const overdue = action.status !== 'Completed' && !!action.dueDate && action.dueDate < today()
    return (!query || term.includes(query.toLowerCase())) &&
      (statusFilter === 'All statuses' || action.status === statusFilter) &&
      (priorityFilter === 'All priorities' || action.priority === priorityFilter) &&
      (!overdueOnly || overdue)
  }).sort((a, b) => {
    const priority = priorities.indexOf(a.priority) - priorities.indexOf(b.priority)
    if (priority !== 0) return priority
    return (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31')
  }), [data.actions, meetingsById, query, statusFilter, priorityFilter, overdueOnly])
  const overdueCount = data.actions.filter(action => action.status !== 'Completed' && action.dueDate && action.dueDate < today()).length

  function save(action: ActionItem) {
    onUpdate(action)
    setEditing(null)
    setAdding(false)
  }

  return <div className="page">
    <PageTitle eyebrow="Follow-through" title="Action items" description="Keep ownership clear and deadlines visible across every meeting." actions={<Button variant="primary" onClick={() => setAdding(true)}><Plus size={16} /> Add action item</Button>} />
    <div className="action-overview">
      <div className="action-summary"><span className="summary-icon summary-blue"><ListTodo size={18} /></span><span><strong>{data.actions.filter(action => action.status !== 'Completed').length}</strong><small>Open items</small></span></div>
      <div className="summary-divider" />
      <div className="action-summary"><span className="summary-icon summary-red"><Clock3 size={18} /></span><span><strong>{overdueCount}</strong><small>Overdue</small></span></div>
      <div className="summary-divider" />
      <div className="action-summary"><span className="summary-icon summary-green"><Check size={18} /></span><span><strong>{data.actions.filter(action => action.status === 'Completed').length}</strong><small>Completed</small></span></div>
    </div>
    <Card className="action-table-card">
      <div className="table-toolbar">
        <div className="table-toolbar-title"><h2>All action items</h2><span className="count-pill">{filtered.length}</span></div>
        <div className="table-filters">
          <label className="select-filter"><Filter size={14} /><select aria-label="Filter by status" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option>All statuses</option>{statuses.map(status => <option key={status}>{status}</option>)}</select><ChevronDown size={13} /></label>
          <label className="select-filter"><select aria-label="Filter by priority" value={priorityFilter} onChange={event => setPriorityFilter(event.target.value)}><option>All priorities</option>{priorities.map(priority => <option key={priority}>{priority}</option>)}</select><ChevronDown size={13} /></label>
          <button className={`overdue-toggle ${overdueOnly ? 'overdue-toggle-active' : ''}`} onClick={() => setOverdueOnly(value => !value)}><Clock3 size={14} /> Overdue</button>
        </div>
      </div>
      {filtered.length ? <div className="action-table-wrap"><table className="data-table action-table"><thead><tr><th>Task</th><th>Owner</th><th>Source meeting</th><th>Due date</th><th>Priority</th><th>Status</th><th></th></tr></thead><tbody>
        {filtered.map(action => {
          const meeting = meetingsById.get(action.meetingId)
          const isOverdue = action.status !== 'Completed' && !!action.dueDate && action.dueDate < today()
          return <tr key={action.id} className={isOverdue ? 'row-overdue' : ''}>
            <td><div className="task-cell"><button className={`task-check ${action.status === 'Completed' ? 'task-check-done' : ''}`} aria-label={`Mark ${action.description} ${action.status === 'Completed' ? 'not started' : 'completed'}`} onClick={() => onUpdate({ ...action, status: action.status === 'Completed' ? 'Not Started' : 'Completed' })}>{action.status === 'Completed' && <Check size={12} />}</button><div><strong className={action.status === 'Completed' ? 'task-completed' : ''}>{action.description}</strong>{action.needsReview && <span className="review-inline"><AlertCircle size={12} /> Needs review</span>}</div></div></td>
            <td><span className="owner-cell"><span className="owner-avatar">{action.owner === 'Unassigned' ? '?' : initials(action.owner)}</span>{action.owner}</span></td>
            <td><span className="source-link">{meeting?.title ?? 'Meeting removed'}</span></td>
            <td><span className={isOverdue ? 'due-overdue' : ''}>{action.dueDate ? <><CalendarDays size={13} />{formatDate(action.dueDate, { month: 'short', day: 'numeric' })}</> : <span className="muted-text">Not specified</span>}</span></td>
            <td><Badge tone={action.priority}>{action.priority}</Badge></td>
            <td><label className={`status-select status-${action.status.toLowerCase().replace(' ', '-')}`}><select value={action.status} aria-label={`Status for ${action.description}`} onChange={event => onUpdate({ ...action, status: event.target.value as ActionStatus })}>{statuses.map(status => <option key={status}>{status}</option>)}</select><ChevronDown size={12} /></label></td>
            <td><button className="edit-action" aria-label={`Edit ${action.description}`} onClick={() => setEditing(action)}><Pencil size={15} /></button></td>
          </tr>
        })}
      </tbody></table></div> : <EmptyState icon={<Search size={22} />} title="No action items match" message="Try adjusting your filters or add a new action item." />}
    </Card>
    {(editing || adding) && <ActionEditor action={editing} data={data} onClose={() => { setEditing(null); setAdding(false) }} onSave={save} />}
  </div>
}

function ActionEditor({ action, data, onClose, onSave }: { action: ActionItem | null; data: AppData; onClose: () => void; onSave: (action: ActionItem) => void }) {
  const [description, setDescription] = useState(action?.description ?? '')
  const [owner, setOwner] = useState(action?.owner === 'Unassigned' ? '' : action?.owner ?? '')
  const [meetingId, setMeetingId] = useState(action?.meetingId ?? data.meetings[0]?.id ?? '')
  const [dueDate, setDueDate] = useState(action?.dueDate ?? '')
  const [priority, setPriority] = useState<Priority>(action?.priority ?? 'Medium')
  const [status, setStatus] = useState<ActionStatus>(action?.status ?? 'Not Started')
  const [notes, setNotes] = useState(action?.notes ?? '')
  const [error, setError] = useState('')
  return <Modal title={action ? 'Edit action item' : 'Add action item'} onClose={onClose}>
    <form className="editor-form" onSubmit={event => {
      event.preventDefault()
      if (!description.trim()) { setError('Add a task description.'); return }
      if (!meetingId) { setError('Add a meeting before creating a linked action item.'); return }
      const owners = owner.split(/\s*(?:,|;|&|\band\b)\s*/i).map(value => value.trim()).filter(Boolean)
      onSave({ id: action?.id ?? crypto.randomUUID(), description: description.trim(), owner: owners.join(' and ') || 'Unassigned', owners: owners.length ? owners : ['Unassigned'], meetingId, dueDate: dueDate || null, priority, status, notes: notes.trim(), needsReview: !owners.length || !dueDate })
    }}>
      <label className="field"><span>Task description <b>*</b></span><textarea rows={3} value={description} onChange={event => setDescription(event.target.value)} placeholder="What needs to be done?" /></label>
      <label className="field"><span>Responsible person</span><input value={owner} onChange={event => setOwner(event.target.value)} placeholder="Unassigned" /></label>
      <label className="field"><span>Source meeting <b>*</b></span><select value={meetingId} onChange={event => setMeetingId(event.target.value)}>{data.meetings.map(meeting => <option key={meeting.id} value={meeting.id}>{meeting.title}</option>)}</select></label>
      <div className="form-grid form-grid-two"><label className="field"><span>Due date</span><input type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} /></label><label className="field"><span>Priority</span><select value={priority} onChange={event => setPriority(event.target.value as Priority)}>{priorities.map(value => <option key={value}>{value}</option>)}</select></label></div>
      <label className="field"><span>Status</span><select value={status} onChange={event => setStatus(event.target.value as ActionStatus)}>{statuses.map(value => <option key={value}>{value}</option>)}</select></label>
      <label className="field"><span>Notes</span><textarea rows={2} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Optional context" /></label>
      {error && <p className="editor-error"><AlertCircle size={14} />{error}</p>}
      <div className="modal-actions"><Button type="button" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary">{action ? 'Save changes' : 'Create action'}</Button></div>
    </form>
  </Modal>
}

function initials(name: string) { return name.split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || '?' }
