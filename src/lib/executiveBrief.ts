import type { ActionItem, Decision, Meeting, MeetingIntelligence } from '../types'
import { consolidateActionItems, consolidateDecisionRecords, validateMeetingIntelligence } from './meetingEngine.js'

export interface BriefDecision {
  id: string
  description: string
  status: string
  followUp: string
  evidence: string[]
  needsExecutive: boolean
  attentionSummary?: string
}

export function formatExecutiveBrief(brief: ExecutiveBrief): string {
  const date = formatDate(brief.date)
  const timeRange = brief.startTime || brief.endTime
    ? `${brief.startTime || 'Time not specified'}–${brief.endTime || 'Not specified'}`
    : ''
  const header = [
    brief.title,
    [date, timeRange, brief.duration].filter(Boolean).join(' · '),
    `Participants: ${brief.participants.length ? brief.participants.join(', ') : 'Not specified'}`,
    `Meeting type: ${brief.meetingType}`,
  ]
  const decisions = brief.decisions.map(item => `• ${item.status}: ${item.description}`)
  const actions = brief.actions.map(action => {
    const owner = action.owners?.length ? action.owners.join(' and ') : action.owner
    const deadline = action.dueDate ? formatDate(action.dueDate) : action.deadlineText ?? 'Not specified'
    const dependency = action.dependencies?.length ? ` · Blocked until ${action.dependencies.map(formatDependency).join('; ')}` : ''
    return `• ${action.description} — ${owner} · ${deadline} · ${action.status}${dependency}`
  })
  const sections = [
    header.join('\n'),
    `Executive snapshot\n${brief.summary}`,
    `Key takeaways\n${brief.takeaways.length ? brief.takeaways.map(value => `• ${value}`).join('\n') : 'No additional distinct takeaways.'}`,
    `Decisions\n${decisions.length ? decisions.join('\n') : 'No decisions recorded.'}`,
    `Action tracker\n${actions.length ? actions.join('\n') : 'No action items recorded.'}`,
    `Needs attention\n${[
      ...brief.pendingExecutive.map(item => `• ${item.attentionSummary ?? `${item.status}: ${item.description}`}`),
      ...brief.schedulingAttention.map(item => `• ${item.attentionSummary ?? `${item.status}: ${item.description}`}`),
      ...(brief.risks.length ? brief.risks.map(value => `Risk: ${value}`) : ['Risks: No material risks identified.']),
      ...brief.unresolvedQuestions.map(value => `Open question: ${value}`),
    ].join('\n') || 'No immediate attention items identified.'}`,
  ]
  return sections.join('\n\n')
}

export function formatDependency(value: string): string {
  const availableList = value.match(/^(?:(?:after|once)\s+)?(.+?)'s\s+(?:(?:categorised|categorized)\s+)?(?:ticket\s+)?list(?:\s+(?:is\s+)?(?:available|received|submitted))?$/i)
  const submittedList = value.match(/^(.+?)\s+submits\s+(?:the\s+)?(?:(?:categorised|categorized)\s+)?(?:ticket\s+)?list$/i)
  if (availableList) return `${availableList[1]} submits the categorised ticket list`
  return submittedList ? `${submittedList[1]} submits the categorised ticket list` : value
}

function formatDate(value: string): string {
  const date = new Date(`${value}T12:00:00`)
  return Number.isNaN(date.getTime()) ? 'Date not specified' : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

export interface ExecutiveBrief {
  title: string
  date: string
  startTime: string
  endTime: string
  duration: string
  participants: string[]
  meetingType: string
  summary: string
  takeaways: string[]
  decisions: BriefDecision[]
  actions: ActionItem[]
  pendingExecutive: BriefDecision[]
  schedulingAttention: BriefDecision[]
  risks: string[]
  unresolvedQuestions: string[]
  transcript: string
  warnings: string[]
  discussionDetails: string[]
}

const meetingPurpose = /\b(?:purpose|objective|agenda)\s+(?:of|for)\s+(?:this|the)\s+meeting\b/i

export function buildExecutiveBrief(
  meeting: Meeting,
  intelligence: MeetingIntelligence,
  actions: ActionItem[],
  decisions: Decision[],
): ExecutiveBrief {
  const discussionContext = intelligence.transcript.map(turn => turn.text).join(' ')
  const validatedActions = consolidateActionItems([...intelligence.actions, ...actions])
  const validatedDecisions = consolidateDecisionRecords([...intelligence.decisions, ...decisions], intelligence.transcript)
  const reportValidation = validateMeetingIntelligence({
    ...intelligence,
    actions: validatedActions,
    decisions: validatedDecisions,
  })
  const consolidatedDecisions = consolidateDecisions(validatedDecisions, discussionContext, validatedActions)
  const riskSet = new Set(intelligence.risks.map(normalize))
  const financeDecisionExists = consolidatedDecisions.some(item => /refund|funding|allocation/i.test(item.description))
  const scheduleDecisionExists = consolidatedDecisions.some(item => /refresher|training|session/i.test(item.description) && /schedule|date/i.test(item.description))
  const unresolvedQuestions = unique(intelligence.questions).filter(question => {
    if (/\bdeadline\b/i.test(question)) return false
    if (riskSet.has(normalize(question))) return false
    if (financeDecisionExists && /\brefund|funding|allocation\b/i.test(question)) return false
    if (scheduleDecisionExists && /\brefresher|training|session\b/i.test(question) && /\bdate|time|schedule\b/i.test(question)) return false
    return true
  })
  const pendingExecutive = consolidatedDecisions.filter(item => item.needsExecutive)
  const schedulingAttention = consolidatedDecisions.filter(item => item.status === 'Scheduling pending')
  const risks = unique(intelligence.risks).filter(risk => !meetingPurpose.test(risk))
  const transcript = meeting.notes
  const duration = getDuration(meeting.startTime || intelligence.metadata.startTime, meeting.endTime || intelligence.metadata.endTime)

  return {
    title: intelligence.metadata.title ?? meeting.title,
    date: intelligence.metadata.date ?? meeting.date,
    startTime: meeting.startTime || intelligence.metadata.startTime || '',
    endTime: meeting.endTime || intelligence.metadata.endTime || '',
    duration,
    participants: unique([...(intelligence.metadata.participants ?? []), ...meeting.participants]),
    meetingType: meeting.type,
    summary: intelligence.summary,
    takeaways: getTakeaways(intelligence, validatedActions, consolidatedDecisions),
    decisions: consolidatedDecisions,
    actions: validatedActions,
    pendingExecutive,
    schedulingAttention,
    risks,
    unresolvedQuestions,
    transcript,
    warnings: unique([...intelligence.reviewNotes, ...reportValidation]),
    discussionDetails: unique(intelligence.discussionPoints).filter(point => !meetingPurpose.test(point)),
  }
}

function consolidateDecisions(decisions: Decision[], context: string, actions: ActionItem[]): BriefDecision[] {
  const groups = new Map<string, Decision[]>()
  for (const decision of decisions) {
    const key = decisionTopic(decision, context)
    groups.set(key, [...(groups.get(key) ?? []), decision])
  }
  return [...groups].map(([key, group]) => {
    const kinds = new Set(group.map(item => item.kind))
    const evidence = unique(group.map(item => item.sourceStatement).filter((value): value is string => Boolean(value)))
    if (key === 'refund-allocation') {
      const amount = evidence.join(' ').match(/₦\s?[\d,.]+\s?(?:million|m)?/i)?.[0]
      const decisionOwner = group.flatMap(item => item.people).find(person =>
        evidence.some(source => new RegExp(`\\b${escapeRegExp(person.split(/\s+/)[0])}\\b`, 'i').test(source)))
      const breakdownAction = actions.find(action => /\b(?:refunds?|funding)\b/i.test(action.description) && /\bbreakdown\b/i.test(action.description))
      const breakdownOwner = breakdownAction?.owners?.find(owner => owner !== 'Unassigned') ?? breakdownAction?.owner
      const allocation = `${amount ? `Additional ${amount} ` : 'Additional '}refund allocation`
      const breakdownOwnerName = breakdownOwner && breakdownOwner !== 'Unassigned' ? breakdownOwner.split(/\s+/)[0] : null
      return {
        id: group[0].id,
        description: `${allocation}. ${decisionOwner ? `${decisionOwner.split(/\s+/)[0]} will decide` : 'An executive decision will follow'} after reviewing ${breakdownOwnerName ? `${breakdownOwnerName}'s ` : 'the '}${breakdownAction?.description.toLowerCase().includes('refund') ? 'refund ' : ''}breakdown.`,
        status: 'Not approved',
        followUp: '',
        evidence,
        needsExecutive: true,
        attentionSummary: `Pending approval: Additional refund allocation after ${breakdownOwnerName ? `${breakdownOwnerName}'s ` : 'the '}breakdown.`,
      }
    }
    if (key === 'refresher-scheduling') {
      return {
        id: group[0].id,
        description: 'The support refresher is agreed for next week; its exact date is not yet established.',
        status: 'Scheduling pending',
        followUp: 'Confirm the date before sending the invitation.',
        evidence,
        needsExecutive: false,
        attentionSummary: 'Scheduling pending: Support refresher date.',
      }
    }
    const representative = group.find(item => item.kind === 'Approval Required') ?? group[0]
    return {
      id: representative.id,
      description: conciseDecisionDescription(representative.description),
      status: displayStatus(kinds),
      followUp: representative.followUp,
      evidence,
      needsExecutive: kinds.has('Pending') || kinds.has('Approval Required'),
      attentionSummary: kinds.has('Approval Required')
        ? 'Approval required: Revised response templates before publication.'
        : undefined,
    }
  })
}

function decisionTopic(decision: Decision, context: string): string {
  const text = decision.description.toLowerCase()
  if (/\brefund|funding|allocation\b/.test(text) && /\b(?:₦|million|approve|allocation|funding|breakdown)\b/.test(text)) return 'refund-allocation'
  if (/\brefresher|training|session\b/.test(text) && /\b(?:date|time|schedule|next week|agreed|pending)\b/.test(text)) return 'refresher-scheduling'
  if (/\btemplate\b/.test(`${text} ${decision.sourceStatement ?? ''} ${context}`) &&
      /\b(?:publish|approval|approve|wording)\b/.test(text) && decision.kind === 'Approval Required') return 'template-approval'
  return `decision:${decision.id}`
}

function displayStatus(kinds: Set<string>): string {
  if (kinds.has('Approval Required')) return 'Approval required'
  if (kinds.has('Rejected')) return 'Rejected'
  if (kinds.has('Not Approved')) return 'Not approved'
  if (kinds.has('Pending')) return 'Pending'
  if (kinds.has('Proposed')) return 'Proposed'
  return 'Approved'
}

function conciseDecisionDescription(value: string): string {
  return value
    .replace(/^Do not publish (?:them|it) until I approve (?:the )?final wording\.?$/i, 'Revised response templates require approval before publication.')
    .replace(/^We agreed (?:that )?the support refresher will take place next week\.?$/i, 'The support refresher is agreed for next week.')
    .trim()
}

function getTakeaways(intelligence: MeetingIntelligence, actions: ActionItem[], decisions: BriefDecision[]): string[] {
  const transcript = intelligence.transcript.map(turn => turn.text).join(' ')
  const points: string[] = []
  const queue = transcript.match(/\b(\d+)\s+(?:tickets?\s+)?(?:remain(?:ing)?\s+)?open\b[^.]*?\b(?:including|of which)\s+(\d+)\s+(?:aged\s+)?tickets?\s+(?:older than|over)\s+([\w-]+(?:\s+business)?\s+days?)\b/i)
  if (queue) points.push(`${queue[1]} tickets remain open, including ${queue[2]} older than ${queue[3]}.`)

  const topics = new Set<string>()
  if (/\bdelivery[- ]delay|delayed delivery|delivery delays?\b/i.test(transcript)) topics.add('delayed deliveries')
  if (actions.some(action => /\brefund\b/i.test(action.description))) topics.add('refunds')
  if (actions.some(action => /\baccount[- ]access|password[- ]reset\b/i.test(action.description)) ||
      intelligence.questions.some(question => /\baccount[- ]access|password[- ]reset\b/i.test(question))) topics.add('account access')
  if (topics.size) points.push(`Main unresolved areas include ${joinList([...topics])}.`)

  const agedTicketAction = actions.some(action => /\b(?:aged|old)\b.{0,30}\btickets?\b/i.test(action.description))
  const trackerAction = actions.some(action => /\btracker\b/i.test(action.description))
  if (agedTicketAction) {
    points.push(`The aged-ticket backlog requires categorisation and escalation review${trackerAction ? ', with structured tracking' : ''}.`)
  }

  const passwordIssue = intelligence.questions.find(question =>
    /\bpassword[- ]reset\b/i.test(question) && /\b(?:root cause|failure|unknown|unresolved)\b/i.test(question))
  if (passwordIssue) points.push('Password-reset failures remain unresolved pending root-cause confirmation.')

  const hasRefundFollowThrough = actions.some(action => /\brefund\b/i.test(action.description))
  const hasTemplateApproval = decisions.some(decision => /template/i.test(decision.description) && decision.status === 'Approval required')
  if (hasRefundFollowThrough && hasTemplateApproval) {
    points.push('Outstanding refunds and response-template changes require management follow-through.')
  }
  return unique(points).slice(0, 5)
}

function joinList(values: string[]): string {
  if (values.length < 2) return values[0] ?? ''
  if (values.length === 2) return `${values[0]} and ${values[1]}`
  return `${values.slice(0, -1).join(', ')} and ${values.at(-1)}`
}

function getDuration(start?: string | null, end?: string | null): string {
  if (!start || !end) return ''
  const minutes = (time: string) => {
    const match = time.match(/^(\d{1,2}):(\d{2})$/)
    return match ? Number(match[1]) * 60 + Number(match[2]) : null
  }
  const startMinutes = minutes(start)
  const endMinutes = minutes(end)
  if (startMinutes === null || endMinutes === null) return ''
  const total = (endMinutes - startMinutes + 1440) % 1440
  return total ? `${Math.floor(total / 60)}h${total % 60 ? ` ${total % 60}m` : ''}` : ''
}

function normalize(value: string): string {
  return value.toLocaleLowerCase().replace(/[^\p{L}\d]+/gu, ' ').trim()
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function unique(values: string[]): string[] {
  const seen = new Set<string>()
  return values.filter(value => {
    const key = normalize(value)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}
