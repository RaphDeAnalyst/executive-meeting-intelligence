import type { ActionItem, Decision, Meeting, MeetingIntelligence } from '../types'
import { buildExecutiveBrief, formatDependency } from './executiveBrief.js'

export function createFollowUpEmail(meeting: Meeting, intelligence: MeetingIntelligence, actions: ActionItem[], decisions: Decision[]): string {
  const brief = buildExecutiveBrief(meeting, intelligence, actions, decisions)
  const summaryTerms = new Set(brief.summary.toLowerCase().match(/[\p{L}\d₦]+/gu) ?? [])
  const isRepeatedInSummary = (value: string) => {
    const terms = value.toLowerCase().match(/[\p{L}\d₦]+/gu) ?? []
    const meaningful = terms.filter(term => term.length > 3)
    return meaningful.length > 0 && meaningful.filter(term => summaryTerms.has(term)).length / meaningful.length >= 0.7
  }
  const openRisks = brief.risks.filter(risk => !isRepeatedInSummary(risk))
  const openQuestions = brief.unresolvedQuestions.filter(question => !isRepeatedInSummary(question))
  const lines = [
    'Hi everyone,',
    '',
    `Thank you for joining ${brief.title} on ${formatMeetingDate(brief.date)}. Here is a concise recap of decisions and follow-ups.`,
    '',
    brief.summary,
    '',
    'Decisions and approvals',
    ...(brief.decisions.length
      ? brief.decisions.map(decision => `• ${decision.status}: ${decision.description}`)
      : ['• No decisions were recorded.']),
    '',
    'Action tracker',
    ...(brief.actions.length
      ? brief.actions.map(action => {
        const owners = action.owners?.length ? action.owners.join(' and ') : action.owner || 'Unassigned'
        const deadline = action.dueDate
          ? formatMeetingDate(action.dueDate)
          : action.deadlineText
            ? `${action.deadlineText} (exact date not established)`
            : 'Not specified'
        const dependencies = action.dependencies?.length ? `; blocked until ${action.dependencies.map(formatDependency).join('; ')}` : ''
        return `• ${action.description} — ${owners}; due ${deadline}${dependencies}`
      })
      : ['• No confirmed action items were extracted.']),
    ...(openRisks.length || openQuestions.length ? [
      '',
      'Open follow-ups',
      ...openRisks.map(risk => `• Risk: ${risk}`),
      ...openQuestions.map(question => `• Question: ${question}`),
    ] : []),
    '',
    'Please reply if anything needs correction.',
    '',
    'Best,',
  ]
  return lines.join('\n')
}

function formatMeetingDate(date: string): string {
  const value = new Date(`${date}T12:00:00`)
  return Number.isNaN(value.getTime()) ? 'date not specified' : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(value)
}
