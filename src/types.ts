export type MeetingType = 'Leadership' | 'Team sync' | 'Project review' | 'Client' | 'Planning' | 'Other'
export type ActionStatus = 'Not Started' | 'In Progress' | 'Completed' | 'Blocked'
export type Priority = 'Critical' | 'High' | 'Medium' | 'Low'
export type DecisionKind = 'Recorded' | 'Proposed' | 'Pending' | 'Not Approved' | 'Rejected' | 'Approval Required' | 'Scheduling Pending'

export interface TranscriptTurn {
  speaker: string | null
  timestamp: string | null
  text: string
  sourceStatement: string
}

export interface MeetingMetadata {
  title: string | null
  date: string | null
  time: string | null
  startTime: string | null
  endTime: string | null
  location: string | null
  participants: string[]
}

export interface TranscriptDocument {
  metadata: MeetingMetadata
  turns: TranscriptTurn[]
  supplementaryTurns?: TranscriptTurn[]
}

export interface Meeting {
  id: string
  title: string
  date: string
  startTime: string
  endTime: string
  participants: string[]
  type: MeetingType
  notes: string
  createdAt: string
  location?: string
  intelligence?: MeetingIntelligence
}

export interface ActionItem {
  id: string
  description: string
  owner: string
  meetingId: string
  dueDate: string | null
  priority: Priority
  status: ActionStatus
  notes: string
  needsReview: boolean
  owners?: string[]
  deadlineText?: string | null
  sourceStatement?: string
  sourceStatements?: string[]
  confidence?: number
  priorityExplicit?: boolean
  dependencies?: string[]
}

export interface Decision {
  id: string
  description: string
  meetingId: string
  date: string
  people: string[]
  followUp: string
  kind: DecisionKind
  sourceStatement?: string
  confidence?: number
}

export interface MeetingIntelligence {
  processorVersion: number
  metadata: MeetingMetadata
  transcript: TranscriptTurn[]
  generatedAt: string
  summary: string
  discussionPoints: string[]
  decisions: Decision[]
  actions: ActionItem[]
  pendingDecisions: string[]
  questions: string[]
  risks: string[]
  executiveAttention: string[]
  reviewNotes: string[]
}

export interface MeetingProcessor {
  process(meeting: Meeting, existingActionCount?: number): MeetingIntelligence
}

export interface AppData {
  meetings: Meeting[]
  actions: ActionItem[]
  decisions: Decision[]
}
