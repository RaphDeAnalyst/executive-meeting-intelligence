import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { areDuplicateActions, consolidateActionItems, normalizeActionDependency, processMeeting, preprocessTranscript, validateMeetingIntelligence } from '../.test-dist/lib/meetingEngine.js'
import { buildExecutiveBrief, formatDependency, formatExecutiveBrief } from '../.test-dist/lib/executiveBrief.js'
import { createFollowUpEmail } from '../.test-dist/lib/followUpEmail.js'
import { migrateWorkspaceData } from '../.test-dist/lib/workspaceMigration.js'

const transcript = readFileSync(new URL('./fixtures/customer-support-operations.txt', import.meta.url), 'utf8')
const meeting = {
  id: 'support-ops',
  title: 'Untitled meeting',
  date: '2026-11-18',
  startTime: '',
  endTime: '',
  participants: [],
  type: 'Leadership',
  notes: transcript,
  createdAt: '2026-11-18T00:00:00.000Z',
}
const result = processMeeting(meeting)

test('parses meeting metadata and timestamped named speakers', () => {
  const parsed = preprocessTranscript(transcript)
  assert.equal(parsed.metadata.title, 'Customer Support Operations Improvement')
  assert.equal(parsed.metadata.date, '2026-11-17')
  assert.equal(parsed.metadata.startTime, '10:00')
  assert.equal(parsed.metadata.endTime, '11:00')
  assert.deepEqual(parsed.metadata.participants, ['Amara Okafor', 'Daniel Mensah', 'Ifeoma Eze', 'Tunde Bakare', 'Grace Williams'])
  assert.equal(parsed.turns[0].speaker, 'Daniel Mensah')
  assert.equal(parsed.turns[0].timestamp, '10:02 AM')
  assert.match(parsed.turns[0].sourceStatement, /^\[10:02 AM\] DANIEL MENSAH:/)
  assert.doesNotMatch(result.summary, /Meeting Date:|Participants:|\[10:/)
})

test('uses transcript date and consolidates repeated assignments into seven distinct responsibilities', () => {
  assert.equal(result.metadata.date, '2026-11-17')
  assert.equal(result.actions.length, 7)
  const byDescription = new Map(result.actions.map(action => [action.description.toLowerCase(), action]))
  const daniel = [...byDescription.values()].find(action => /29 aged tickets/.test(action.description))
  const grace = [...byDescription.values()].find(action => /create and maintain the aged-ticket tracker/i.test(action.description))
  const ifeoma = [...byDescription.values()].find(action => /account[- ]access investigation update/.test(action.description))
  const refunds = [...byDescription.values()].find(action => /refund breakdown/.test(action.description))
  const templates = [...byDescription.values()].find(action => /response templates/.test(action.description))
  const refresher = [...byDescription.values()].find(action => /support refresher/.test(action.description))
  const graceReview = [...byDescription.values()].find(action => /review the final wording/.test(action.description))
  assert.ok(daniel && grace && ifeoma && refunds && templates && refresher && graceReview)
  assert.deepEqual(daniel.owners, ['Daniel Mensah'])
  assert.equal(daniel.dueDate, '2026-11-19')
  assert.equal((daniel.sourceStatements ?? []).length, 4)
  assert.deepEqual(grace.owners, ['Grace Williams'])
  assert.match(grace.description, /flag management issues/i)
  assert.match(grace.dependencies.join(' '), /Daniel submits the categorised ticket list/i)
  assert.deepEqual(grace.dependencies, ['Daniel submits the categorised ticket list'])
  assert.equal(normalizeActionDependency("Daniel's list is available"), 'Daniel submits the categorised ticket list')
  assert.equal(normalizeActionDependency('I receive Daniel submits the categorized ticket list'), 'Daniel submits the categorised ticket list')
  assert.equal(ifeoma.dueDate, '2026-11-20')
  assert.match(ifeoma.description, /Obtain and share.*confirmed cause, affected users and workaround/i)
  assert.deepEqual(templates.owners, ['Daniel Mensah', 'Ifeoma Eze'])
  assert.equal(templates.dueDate, '2026-11-23')
  assert.equal(refresher.deadlineText.toLowerCase(), 'next week')
  assert.equal(refresher.dueDate, null)
  assert.equal(refunds.dueDate, null)
  assert.equal(refunds.owner, 'Tunde Bakare')
  assert.match(refunds.description, /amount per refund, approval date and payment status/)
  assert.deepEqual(graceReview.owners, ['Grace Williams'])
  assert.match(refresher.deadlineText.toLowerCase(), /next week/)
  assert.match(refresher.description, /coordinate and schedule the 30-minute support refresher with Daniel and the team/i)
  assert.equal(result.questions.some(item => /can your team review the old tickets/i.test(item)), false)
  assert.ok(result.actions.every(action => action.sourceStatement && action.confidence > 0))
  assert.ok(!validateMeetingIntelligence(result).some(note => /duplicate action/i.test(note)))
})

test('distinguishes confirmed, pending, not-approved, and approval-required decisions', () => {
  assert.equal(result.decisions.length, 3)
  const allocation = result.decisions.filter(item => /refund allocation|funding decision/i.test(item.description))
  assert.equal(allocation.length, 1)
  assert.equal(allocation[0].kind, 'Not Approved')
  assert.match(allocation[0].followUp, /pending/i)
  assert.ok(result.decisions.some(item => item.kind === 'Approval Required' && /publish/.test(item.description)))
  assert.ok(result.decisions.some(item => item.kind === 'Scheduling Pending' && /support refresher.*agreed for next week/i.test(item.description)))
  assert.equal(result.decisions.filter(item => /support refresher/i.test(item.description)).length, 1)
  assert.equal(result.pendingDecisions.length, 1)
  assert.ok(result.pendingDecisions.some(item => /refund allocation/i.test(item)))
  assert.ok(!result.decisions.some(item => item.kind === 'Recorded' && /₦2\.4 million/.test(item.description)))
})

test('classifies genuine operational risks and questions without labeling assignments as either', () => {
  assert.ok(result.risks.some(item => /password-reset email failure/i.test(item)))
  assert.ok(result.questions.some(item => /exact date for the support refresher has not been agreed/i.test(item)))
  assert.ok(!result.questions.some(item => /deadline for/i.test(item)))
  assert.ok(!result.questions.some(item => /categorise|tracker|templates|coordinate/i.test(item)))
  assert.ok(!result.risks.some(item => /categorise|tracker|templates|coordinate/i.test(item)))
  assert.ok(result.questions.some(item => /password-reset email failure/i.test(item)))
  assert.ok(result.reviewNotes.some(item => /supplementary note may conflict/i.test(item)))
})

test('builds a concise structured summary without headings or supplementary testing notes', () => {
  const words = result.summary.split(/\s+/).length
  assert.ok(words >= 60 && words <= 90, `summary should be 60–90 words for this meeting (got ${words} words)`)
  assert.match(result.summary, /closed 412 tickets/i)
  assert.match(result.summary, /86 tickets remain open, of which 29 have been open for more than five business days/i)
  assert.doesNotMatch(result.summary, /closed 412 tickets[^.]*including 29/i)
  assert.doesNotMatch(result.summary, /Meeting Date|Meeting Time|Participants:/i)
  assert.doesNotMatch(result.summary, /One More Issue|POST-MEETING NOTES|testing note|supplementary notes/i)
  assert.match(result.summary, /account-access investigation/i)
  assert.match(result.summary, /not approved/i)
  assert.match(result.summary, /refund breakdown/i)
  assert.match(result.summary, /support refresher/i)
  assert.match(result.summary, /password-reset.*root cause|root cause.*password-reset/i)
})

test('builds a concise report model with deduplicated decisions, progressive source evidence, and no repeated action metadata', () => {
  const brief = buildExecutiveBrief(meeting, result, result.actions, result.decisions)
  assert.equal(brief.title, 'Customer Support Operations Improvement')
  assert.equal(brief.date, '2026-11-17')
  assert.equal(brief.duration, '1h')
  assert.deepEqual(brief.participants, ['Amara Okafor', 'Daniel Mensah', 'Ifeoma Eze', 'Tunde Bakare', 'Grace Williams'])
  assert.equal(brief.actions.length, 7)
  assert.equal(brief.decisions.length, 3)
  assert.ok(brief.decisions.some(item => /₦2\.4 million/.test(item.description) &&
    /Additional ₦2\.4 million refund allocation\. Amara will decide after reviewing Tunde's refund breakdown/i.test(item.description) &&
    item.status === 'Not approved'))
  assert.ok(brief.decisions.some(item => /support refresher/i.test(item.description) && /Scheduling pending/i.test(item.status)))
  assert.ok(brief.pendingExecutive.some(item => /refund allocation/i.test(item.description)))
  assert.ok(brief.risks.some(item => /password-reset/i.test(item)))
  assert.ok(brief.unresolvedQuestions.some(item => /root cause.*password-reset/i.test(item)))
  assert.equal(brief.risks.some(item => /purpose|objective/i.test(item)), false)
  assert.deepEqual(brief.takeaways, [
    '86 tickets remain open, including 29 older than five business days.',
    'Main unresolved areas include delayed deliveries, refunds and account access.',
    'The aged-ticket backlog requires categorisation and escalation review, with structured tracking.',
    'Password-reset failures remain unresolved pending root-cause confirmation.',
    'Outstanding refunds and response-template changes require management follow-through.',
  ])
  assert.ok(brief.takeaways.every(item => !/^(?:however|i can|we should|we need)\b/i.test(item)))
  assert.ok(!brief.takeaways.some(item => result.discussionPoints.includes(item)))
  assert.equal(brief.pendingExecutive.length, 2)
  assert.ok(brief.pendingExecutive.some(item => /Pending approval: Additional refund allocation after Tunde's breakdown\./i.test(item.attentionSummary ?? '')))
  assert.ok(brief.pendingExecutive.some(item => item.attentionSummary === 'Approval required: Revised response templates before publication.'))
  assert.equal(brief.schedulingAttention.length, 1)
  assert.ok(!brief.unresolvedQuestions.some(item => /deadline/i.test(item)))
  assert.ok(!brief.unresolvedQuestions.some(item => /refund breakdown before/i.test(item)))
  assert.ok(!brief.takeaways.some(item => /meeting purpose|objective/i.test(item)))
  assert.doesNotMatch(brief.summary, /POST-MEETING NOTES|Testing note|One More Issue/)
  assert.match(brief.transcript, /POST-MEETING NOTES FOR TESTING/)
  const text = formatExecutiveBrief(brief)
  assert.match(text, /Action tracker/)
  assert.doesNotMatch(text, /Assigned owners|^Deadlines$/m)
  assert.doesNotMatch(text, /POST-MEETING NOTES|Testing note/)
  assert.doesNotMatch(text, /Source statement/)
  assert.equal((text.match(/• Not approved: Additional ₦2\.4 million refund allocation/gi) ?? []).length, 1)
  assert.match(text, /Pending approval: Additional refund allocation after Tunde's breakdown/)
  assert.match(text, /Approval required: Revised response templates before publication/)
  assert.match(text, /Scheduling pending: Support refresher date/)
  assert.equal((text.match(/Blocked until Daniel submits the categorised ticket list/g) ?? []).length, 1)
  assert.equal(formatDependency("Daniel's list is available"), 'Daniel submits the categorised ticket list')
  assert.equal(formatDependency('Daniel submits the categorised ticket list'), 'Daniel submits the categorised ticket list')
})

test('central report consolidation removes persisted duplicate records without merging distinct responsibilities', () => {
  const actionBy = pattern => result.actions.find(action => pattern.test(action.description))
  const tracker = actionBy(/aged-ticket tracker/)
  const engineering = actionBy(/account-access investigation update/)
  const refresher = actionBy(/support refresher/)
  const duplicatedStoredActions = [
    { ...tracker, id: 'stored-tracker-duplicate', description: 'Maintain the aged-ticket tracker', dependencies: ["I receive Daniel's list"] },
    {
      ...engineering,
      id: 'stored-engineering-duplicate',
      description: 'Get an update from Engineering and share the confirmed cause, affected users, and workaround',
      sourceStatement: '[10:24 AM] IFEOMA EZE: I will get an update from Engineering and share the confirmed cause, affected users, and workaround.',
    },
    { ...refresher, id: 'stored-refresher-duplicate', description: 'Coordinate and schedule refresher' },
    {
      ...refresher,
      id: 'stored-refresher-suitable-time',
      description: 'Coordinate a suitable time with Daniel and the team',
      sourceStatement: "[10:38 AM] AMARA OKAFOR: Let's arrange a 30-minute refresher session next week.",
    },
  ]
  const consolidatedActions = consolidateActionItems([...result.actions, ...duplicatedStoredActions])
  assert.equal(consolidatedActions.length, 7)
  assert.equal(consolidatedActions.filter(action => /tracker/i.test(action.description)).length, 1)
  assert.equal(consolidatedActions.filter(action => /account.access.*investigation/i.test(action.description)).length, 1)
  assert.equal(consolidatedActions.filter(action => /support refresher/i.test(action.description)).length, 1)
  assert.equal(consolidatedActions.filter(action => /response templates/i.test(action.description)).length, 2)
  const accountAction = consolidatedActions.find(action => /account-access investigation update/i.test(action.description))
  assert.match(accountAction.description, /including the confirmed cause, affected users and workaround/i)
  assert.equal(accountAction.owner, 'Ifeoma Eze')
  assert.equal(accountAction.dueDate, '2026-11-20')
  assert.ok(accountAction.sourceStatements.some(source => /confirmed cause, affected users, and workaround/i.test(source)))
  const refresherAction = consolidatedActions.find(action => /support refresher/i.test(action.description))
  assert.equal(refresherAction.description, 'Coordinate and schedule the 30-minute support refresher with Daniel and the team.')
  assert.doesNotMatch(refresherAction.description, /\[\d{1,2}:\d{2}|AMARA OKAFOR|Let's arrange|coordinate the refresher session/i)
  assert.ok(refresherAction.sourceStatements.some(source => /\[10:38 AM\] AMARA OKAFOR/.test(source)))
  const legacyPollutedRefresher = consolidateActionItems([{
    ...refresher,
    description: "Coordinate and schedule the 30-minute refresher with Daniel and the team coordinate the refresher session [10:38 AM] AMARA OKAFOR: Let's arrange a 30-minute refresher session next week.",
  }])[0]
  assert.equal(legacyPollutedRefresher.description, 'Coordinate and schedule the 30-minute support refresher with Daniel and the team.')
  assert.doesNotMatch(legacyPollutedRefresher.description, /\[\d{1,2}:\d{2}|AMARA OKAFOR|Let's arrange|coordinate the refresher session/i)
  assert.equal(refresherAction.owner, 'Grace Williams')
  assert.equal(refresherAction.deadlineText.toLowerCase(), 'next week')
  assert.equal(refresherAction.status, 'Not Started')

  const refundSource = result.transcript.find(turn => /That decision remains pending/i.test(turn.text))?.sourceStatement
  const financialSource = result.transcript.find(turn => /executive funding decision/i.test(turn.text))?.sourceStatement
  const duplicatedDecisions = [
    ...result.decisions,
    {
      id: 'stored-refund-pending-1',
      description: 'The refund allocation decision is pending until the financial breakdown is reviewed.',
      meetingId: meeting.id,
      date: result.metadata.date,
      people: ['Amara Okafor'],
      followUp: 'Review the financial breakdown.',
      kind: 'Pending',
      sourceStatement: financialSource,
    },
    {
      id: 'stored-refund-pending-2',
      description: 'That decision remains pending until I see the figures.',
      meetingId: meeting.id,
      date: result.metadata.date,
      people: ['Amara Okafor'],
      followUp: 'Review the figures.',
      kind: 'Pending',
      sourceStatement: refundSource,
    },
  ]
  const brief = buildExecutiveBrief(meeting, result, duplicatedStoredActions, duplicatedDecisions)
  assert.equal(brief.actions.length, 7)
  assert.equal(brief.decisions.length, 3)
  assert.equal(brief.decisions.filter(decision => /refund allocation/i.test(decision.description)).length, 1)
  const reportText = formatExecutiveBrief(brief)
  assert.equal((reportText.match(/Create and maintain the aged-ticket tracker/gi) ?? []).length, 1)
  assert.equal((reportText.match(/• Not approved: Additional ₦2\.4 million refund allocation/gi) ?? []).length, 1)
  assert.equal((reportText.match(/Blocked until Daniel submits the categorised ticket list/g) ?? []).length, 1)
  assert.doesNotMatch(reportText, /Blocked until I receive/i)
})

test('consolidates engineering update wording with account-access action and retains both evidence sources', () => {
  const accountAction = result.actions.find(action => /account-access investigation update/i.test(action.description))
  const engineeringUpdate = {
    ...accountAction,
    id: 'account-access-engineering-update',
    description: 'Get an update from Engineering and share the confirmed cause, affected users, and workaround',
    sourceStatement: '[10:24 AM] IFEOMA EZE: I will get an update from Engineering and share the confirmed cause, affected users, and workaround.',
    sourceStatements: undefined,
  }
  const consolidated = consolidateActionItems([engineeringUpdate, accountAction])
  assert.equal(consolidated.length, 1)
  assert.equal(consolidated[0].description, 'Obtain and share the account-access investigation update, including the confirmed cause, affected users and workaround.')
  assert.equal(consolidated[0].owner, 'Ifeoma Eze')
  assert.equal(consolidated[0].dueDate, '2026-11-20')
  assert.equal(consolidated[0].status, 'Not Started')
  assert.ok(consolidated[0].sourceStatements.some(source => /10:24 AM.*confirmed cause/i.test(source)))
  assert.ok(consolidated[0].sourceStatements.some(source => /10:08 AM.*account access investigation update/i.test(source)))

  const report = buildExecutiveBrief(meeting, result, [...result.actions, engineeringUpdate], result.decisions)
  assert.equal(report.actions.filter(action => /account-access investigation update/i.test(action.description)).length, 1)
})

test('generates follow-up email from the same structured extraction without promoting pending decisions', () => {
  const email = createFollowUpEmail(meeting, result, result.actions, result.decisions)
  assert.match(email, /Customer Support Operations Improvement on Nov 17, 2026/)
  assert.match(email, /categorise the 29 aged tickets and identify any escalations — Daniel Mensah; due Nov 19, 2026/i)
  assert.match(email, /revise|work together on revised delivery-delay/i)
  assert.match(email, /Not approved:/i)
  assert.match(email, /Approval required:/i)
  assert.match(email, /Scheduling pending:/i)
  assert.match(email, /next week/)
  assert.match(email, /blocked until Daniel submits the categorised ticket list/i)
  assert.match(email, /Not approved: Additional ₦2\.4 million refund allocation\. Amara will decide after reviewing Tunde's refund breakdown/i)
  assert.match(email, /Scheduling pending: The support refresher is agreed for next week/i)
  assert.match(email, /due next week \(exact date not established\)/)
  const validatedBrief = buildExecutiveBrief(meeting, result, result.actions, result.decisions)
  for (const action of validatedBrief.actions) assert.ok(email.includes(action.description))
  assert.equal((email.match(/• Not approved: Additional ₦2\.4 million refund allocation/gi) ?? []).length, 1)
  assert.equal((email.match(/root cause of the password-reset email failure/gi) ?? []).length, 1)
  assert.doesNotMatch(email, /One More Issue|POST-MEETING NOTES|Testing note/)
  assert.doesNotMatch(email, /Confirmed decisions/)
  assert.doesNotMatch(email, /No action items were explicitly recorded/)
})

test('supports unrelated transcripts, direct instructions, multiple owners, and unknown fields', () => {
  const other = processMeeting({
    ...meeting,
    id: 'other',
    title: 'Quarterly planning',
    date: '2026-11-17',
    participants: [],
    notes: [
      'Quarterly planning',
      'Date: November 17, 2026',
      '[9:05 AM] NIA PATEL: Omar, please send the revised budget by Friday.',
      '[9:10 AM] OMAR DIAZ: Nia and Omar will review the vendor proposals.',
      '[9:15 AM] NIA PATEL: I can look at the timeline.',
    ].join('\n'),
  })
  assert.deepEqual(other.metadata.participants, ['Nia Patel', 'Omar Diaz'])
  assert.equal(other.actions.length, 2)
  assert.ok(other.actions.some(action => action.owner === 'Omar Diaz' && action.dueDate === '2026-11-20'))
  assert.ok(other.actions.some(action => action.owners?.length === 2))
  assert.ok(!other.actions.some(action => /look at the timeline/i.test(action.description)))
})

test('keeps distinct same-owner assignments separate and splits independent compound responsibilities', () => {
  const separate = processMeeting({
    ...meeting,
    id: 'separate',
    date: '2026-11-17',
    participants: [],
    notes: [
      'Meeting Title: Access review',
      'Meeting Date: November 17, 2026',
      '[9:00 AM] NIA PATEL: Omar, please review account access logs by Friday.',
      '[9:01 AM] NIA PATEL: Omar, please send account access logs to Security by Friday.',
    ].join('\n'),
  })
  assert.equal(separate.actions.length, 2)
  assert.notEqual(separate.actions[0].description, separate.actions[1].description)
  assert.equal(areDuplicateActions(separate.actions[0], separate.actions[1]), false)

  const compound = processMeeting({
    ...meeting,
    id: 'compound',
    date: '2026-11-17',
    participants: [],
    notes: [
      'Meeting Title: Support planning',
      'Meeting Date: November 17, 2026',
      '[9:00 AM] GRACE WILLIAMS: Grace will coordinate the refresher session and maintain the action tracker.',
    ].join('\n'),
  })
  assert.equal(compound.actions.length, 2)
  assert.ok(compound.actions.some(action => /coordinate.*refresher/i.test(action.description)))
  assert.ok(compound.actions.some(action => /maintain.*tracker/i.test(action.description)))

  const differentTrackers = processMeeting({
    ...meeting,
    id: 'different-trackers',
    date: '2026-11-17',
    participants: [],
    notes: [
      'Meeting Title: Support planning',
      'Meeting Date: November 17, 2026',
      '[9:00 AM] GRACE WILLIAMS: Grace will create an aged-ticket tracker by Friday.',
      '[9:01 AM] GRACE WILLIAMS: Grace will maintain the customer-feedback tracker by Friday.',
    ].join('\n'),
  })
  assert.equal(differentTrackers.actions.length, 2)
})

test('excludes meeting purpose from takeaways and reports no risks when none are evidenced', () => {
  const noRisk = processMeeting({
    ...meeting,
    id: 'no-risk',
    title: 'Planning check-in',
    date: '2026-11-17',
    participants: [],
    notes: [
      'Meeting Title: Planning check-in',
      'Meeting Date: November 17, 2026',
      '[9:00 AM] NIA PATEL: The purpose of this meeting is to review the quarterly calendar.',
      '[9:02 AM] NIA PATEL: We reviewed the agenda and confirmed the next check-in.',
    ].join('\n'),
  })
  const brief = buildExecutiveBrief(meeting, noRisk, noRisk.actions, noRisk.decisions)
  assert.deepEqual(noRisk.risks, [])
  assert.doesNotMatch(noRisk.summary, /purpose of this meeting/i)
  assert.doesNotMatch(brief.takeaways.join(' '), /purpose of this meeting/i)
  assert.match(formatExecutiveBrief(brief), /Risks: No material risks identified\./)
})

test('upgrades previously saved meeting records without losing existing action status or adding duplicates', () => {
  const legacyMeeting = { ...meeting, intelligence: { processorVersion: 8 } }
  const legacyAction = {
    id: 'legacy-action',
    description: 'categorise the 29 aged tickets and identify any escalations',
    owner: 'Unassigned',
    meetingId: meeting.id,
    dueDate: null,
    priority: 'High',
    status: 'In Progress',
    notes: 'Existing user note',
    needsReview: true,
  }
  const legacyDuplicates = [
    { ...result.actions.find(action => /aged-ticket tracker/i.test(action.description)), id: 'legacy-tracker-duplicate', description: 'maintain the aged-ticket tracker' },
    { ...result.actions.find(action => /account-access investigation/i.test(action.description)), id: 'legacy-access-duplicate', description: 'provide the account-access investigation update from Engineering' },
  ]
  const legacyDecisions = [
    ...result.decisions,
    {
      id: 'legacy-refund-pending',
      description: 'The refund allocation remains pending until the financial breakdown is reviewed.',
      meetingId: meeting.id,
      date: result.metadata.date,
      people: ['Amara Okafor'],
      followUp: 'Review the financial breakdown.',
      kind: 'Pending',
      sourceStatement: result.transcript.find(turn => /executive funding decision/i.test(turn.text))?.sourceStatement,
    },
  ]
  const upgraded = migrateWorkspaceData({
    meetings: [legacyMeeting],
    actions: [legacyAction, ...legacyDuplicates],
    decisions: legacyDecisions,
  })
  assert.equal(upgraded.meetings[0].date, '2026-11-17')
  assert.equal(upgraded.meetings[0].intelligence.processorVersion, 15)
  assert.equal(upgraded.actions.length, 7)
  assert.equal(upgraded.decisions.filter(decision => /refund allocation/i.test(decision.description)).length, 1)
  const daniel = upgraded.actions.find(action => /29 aged tickets/.test(action.description))
  const grace = upgraded.actions.find(action => /aged-ticket tracker/i.test(action.description))
  assert.equal(daniel.owner, 'Daniel Mensah')
  assert.equal(daniel.status, 'In Progress')
  assert.equal(daniel.dueDate, '2026-11-19')
  assert.equal(daniel.notes, 'Existing user note')
  assert.equal(grace.dependencies.length, 1)
})
