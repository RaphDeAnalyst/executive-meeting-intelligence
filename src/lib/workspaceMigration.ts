import type { ActionItem, AppData, Decision, Meeting, TranscriptTurn } from '../types'
import { consolidateActionItems, consolidateDecisionRecords, processMeeting } from './meetingEngine.js'

export function migrateWorkspaceData(data: AppData): AppData {
  let meetingsChanged = false
  let meetings = data.meetings
  let actions = [...data.actions]
  let decisions = [...data.decisions]

  for (const original of data.meetings) {
    if (original.intelligence?.processorVersion === 15) continue
    const extracted = processMeeting(original, actions.filter(action => action.meetingId === original.id).length)
    const meeting: Meeting = {
      ...original,
      title: extracted.metadata.title ?? original.title,
      date: extracted.metadata.date ?? original.date,
      startTime: extracted.metadata.startTime ?? original.startTime,
      endTime: extracted.metadata.endTime ?? original.endTime,
      location: extracted.metadata.location ?? original.location,
      participants: extracted.metadata.participants.length ? extracted.metadata.participants : original.participants,
      intelligence: extracted,
    }
    meetings = meetings.map(item => item.id === original.id ? meeting : item)
    meetingsChanged = true
    actions = mergeActions(actions, original.id, extracted.actions)
    decisions = mergeDecisions(decisions, original.id, extracted.decisions, extracted.transcript)
  }

  return meetingsChanged ? { meetings, actions, decisions } : data
}

function mergeActions(allActions: ActionItem[], meetingId: string, extracted: ActionItem[]): ActionItem[] {
  const existing = allActions.filter(action => action.meetingId === meetingId)
  const reconciled = consolidateActionItems([...extracted, ...existing])
  return [...allActions.filter(action => action.meetingId !== meetingId), ...reconciled]
}

function mergeDecisions(allDecisions: Decision[], meetingId: string, extracted: Decision[], transcript: TranscriptTurn[]): Decision[] {
  const existing = allDecisions.filter(decision => decision.meetingId === meetingId)
  const reconciled = consolidateDecisionRecords([...extracted, ...existing], transcript)
  return [...allDecisions.filter(decision => decision.meetingId !== meetingId), ...reconciled]
}
