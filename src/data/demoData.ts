import type { ActionItem, AppData, Decision, Meeting } from '../types'

export const demoMeetings: Meeting[] = [
  {
    id: 'm-1',
    title: 'Q4 operating review',
    date: '2026-11-18',
    startTime: '09:00',
    endTime: '10:00',
    participants: ['Olivia Chen', 'Marcus Reed', 'Priya Shah', 'James Walker'],
    type: 'Leadership',
    notes: 'Reviewed Q4 performance and the December launch timeline. Decision: keep the current launch date of December 8. Action: Priya Shah to share the final launch checklist by November 20. Action: Marcus Reed to confirm support coverage by November 23. Open question: do we have enough onboarding capacity for the first week? Risk: Support coverage is still below the planned level.',
    createdAt: '2026-11-18T09:00:00.000Z',
  },
  {
    id: 'm-2',
    title: 'Product roadmap alignment',
    date: '2026-11-17',
    startTime: '14:00',
    endTime: '14:45',
    participants: ['Olivia Chen', 'Daniel Kim', 'Priya Shah'],
    type: 'Planning',
    notes: 'Decision: the reporting dashboard remains the top priority for the November sprint. Action: Daniel Kim to circulate revised estimates by November 19. The team discussed dependencies on data access. Proposed: move the export work to the following sprint. Question: when will access credentials be available?',
    createdAt: '2026-11-17T14:00:00.000Z',
  },
  {
    id: 'm-3',
    title: 'Northstar client check-in',
    date: '2026-11-14',
    startTime: '11:00',
    endTime: '11:30',
    participants: ['James Walker', 'Amara Okafor', 'Helen Brooks'],
    type: 'Client',
    notes: 'Client walkthrough of the revised onboarding flow. Decision: use the shorter welcome sequence for the pilot. Action: Amara Okafor to send the updated prototype by November 16. Open question: confirm the pilot cohort size with the client. Risk: Client review window is compressed.',
    createdAt: '2026-11-14T11:00:00.000Z',
  },
  {
    id: 'm-4',
    title: 'People & hiring sync',
    date: '2026-11-12',
    startTime: '15:00',
    endTime: '15:30',
    participants: ['Olivia Chen', 'Marcus Reed', 'Elena Torres'],
    type: 'Team sync',
    notes: 'Discussed open operations and engineering roles. Action: Elena Torres to prepare an updated hiring plan by November 14. The team raised concerns about interview panel availability. Decision: keep two interview rounds for the operations role.',
    createdAt: '2026-11-12T15:00:00.000Z',
  },
  {
    id: 'm-5',
    title: 'Weekly leadership touchpoint',
    date: '2026-11-10',
    startTime: '09:30',
    endTime: '10:00',
    participants: ['Olivia Chen', 'James Walker', 'Marcus Reed'],
    type: 'Leadership',
    notes: 'Decision: move the weekly leadership update to Monday morning. Action: James Walker to update the recurring agenda. Pending decision: finalize the December all-hands format. Open question: who will present the customer highlights?',
    createdAt: '2026-11-10T09:30:00.000Z',
  },
]

export const demoActions: ActionItem[] = [
  { id: 'a-1', description: 'Share the final launch checklist', owner: 'Priya Shah', meetingId: 'm-1', dueDate: '2026-11-20', priority: 'High', status: 'In Progress', notes: '', needsReview: false },
  { id: 'a-2', description: 'Confirm support coverage', owner: 'Marcus Reed', meetingId: 'm-1', dueDate: '2026-11-23', priority: 'High', status: 'Not Started', notes: '', needsReview: false },
  { id: 'a-3', description: 'Circulate revised estimates', owner: 'Daniel Kim', meetingId: 'm-2', dueDate: '2026-11-19', priority: 'Medium', status: 'Not Started', notes: '', needsReview: false },
  { id: 'a-4', description: 'Send the updated prototype', owner: 'Amara Okafor', meetingId: 'm-3', dueDate: '2026-11-16', priority: 'High', status: 'Blocked', notes: 'Waiting on final client assets.', needsReview: false },
  { id: 'a-5', description: 'Prepare an updated hiring plan', owner: 'Elena Torres', meetingId: 'm-4', dueDate: '2026-11-14', priority: 'Medium', status: 'Not Started', notes: '', needsReview: false },
  { id: 'a-6', description: 'Update the recurring agenda', owner: 'James Walker', meetingId: 'm-5', dueDate: null, priority: 'Low', status: 'Completed', notes: '', needsReview: false },
]

export const demoDecisions: Decision[] = [
  { id: 'd-1', description: 'Keep the current launch date of December 8.', meetingId: 'm-1', date: '2026-11-18', people: ['Olivia Chen', 'Marcus Reed', 'Priya Shah', 'James Walker'], followUp: 'Confirm launch readiness against the final checklist.', kind: 'Recorded' },
  { id: 'd-2', description: 'The reporting dashboard remains the top priority for the November sprint.', meetingId: 'm-2', date: '2026-11-17', people: ['Olivia Chen', 'Daniel Kim', 'Priya Shah'], followUp: '', kind: 'Recorded' },
  { id: 'd-3', description: 'Move the export work to the following sprint.', meetingId: 'm-2', date: '2026-11-17', people: ['Olivia Chen', 'Daniel Kim', 'Priya Shah'], followUp: 'Proposal only — confirm before treating as final.', kind: 'Proposed' },
  { id: 'd-4', description: 'Use the shorter welcome sequence for the pilot.', meetingId: 'm-3', date: '2026-11-14', people: ['James Walker', 'Amara Okafor', 'Helen Brooks'], followUp: '', kind: 'Recorded' },
]

export const initialDemoData: AppData = {
  meetings: demoMeetings,
  actions: demoActions,
  decisions: demoDecisions,
}
