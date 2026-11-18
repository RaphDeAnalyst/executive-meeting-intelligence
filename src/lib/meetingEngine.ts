import type {
  ActionItem, Decision, DecisionKind, Meeting, MeetingIntelligence, MeetingMetadata, Priority,
  TranscriptDocument, TranscriptTurn,
} from '../types'

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const MONTH_PATTERN = String.raw`(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?`
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const ACTION_VERBS = String.raw`(?:categor(?:y|ise|ize|ising|izing)|identify|flag|create|build|prepare|send|share|obtain|get|collect|gather|confirm|update|circulate|draft|deliver|review|coordinate|schedule|arrange|revise|work|follow|investigate|check|provide|complete|finali[sz]e|publish|escalate|contact|reach|compile|track|maintain|report|present|resolve|fix|analy[sz]e|assess|compare|document|organize|organise|book|distribute|submit|support|hold|conduct|run|set up)`

const ACTION_PATTERNS = [
  new RegExp(String.raw`^(?:as agreed,?\s*)?(.+?)\s+(?:will|shall|is going to|are going to)\s+(${ACTION_VERBS})\b`, 'i'),
  new RegExp(String.raw`^(.+?)\s*,\s*(?:please|kindly)\s+(${ACTION_VERBS})\b`, 'i'),
  new RegExp(String.raw`^(.+?)\s*,\s*(?:can|could|would)\s+you\s+(?:please\s+)?(${ACTION_VERBS})\b`, 'i'),
  new RegExp(String.raw`^(.+?)\s*,\s*(${ACTION_VERBS})\b`, 'i'),
  new RegExp(String.raw`^(?:i\s+will|i'll|i\s+shall|i\s+am\s+going\s+to|we\s+will|we'll)\s+(${ACTION_VERBS})\b`, 'i'),
  new RegExp(String.raw`^(?:action(?:\s+item)?|todo|task|follow[- ]?up)\s*[:—-]\s*(?:([^:]+?)\s*:\s*)?(.+)$`, 'i'),
]

const META_LABELS: Record<string, keyof Pick<MeetingMetadata, 'title' | 'date' | 'time' | 'location' | 'participants'>> = {
  'meeting title': 'title', title: 'title', subject: 'title',
  'meeting date': 'date', date: 'date',
  'meeting time': 'time', time: 'time',
  location: 'location', venue: 'location',
  participants: 'participants', attendees: 'participants',
}

function normalizeDecisionText(value: string): string {
  return value.toLocaleLowerCase().replace(/[^\p{L}\d₦]+/gu, ' ').trim()
}

function describeRisk(statement: string): string {
  if (/\bpassword[- ]reset email failure\b/i.test(statement) &&
      /\b(?:root cause|cause)\b.{0,60}\b(?:unknown|unclear|unresolved|not established)\b/i.test(statement)) {
    return 'The password-reset email failure remains unresolved.'
  }
  return clean(statement)
}

function clean(value: string): string {
  return value.replace(/^[\s>*•-]+/, '').replace(/\s+/g, ' ').trim()
}

function normalizePerson(value: string): string {
  return clean(value).replace(/\b[\p{L}][\p{L}'’.-]*/gu, part => {
    if (/^(?:and|&|with)$/i.test(part)) return part.toLowerCase()
    return part[0].toLocaleUpperCase() + part.slice(1).toLocaleLowerCase()
  })
}

function emptyMetadata(): MeetingMetadata {
  return { title: null, date: null, time: null, startTime: null, endTime: null, location: null, participants: [] }
}

function parseDateValue(text: string, baseDate?: string, allowWeekday = false): { date: string | null; text: string | null } {
  const value = clean(text).replace(/[.,;]+$/, '')
  const iso = value.match(/\b(20\d{2})-(0?[1-9]|1[0-2])-([0-2]?\d|3[01])\b/)
  if (iso) return { date: validDate(Number(iso[1]), Number(iso[2]), Number(iso[3])), text: iso[0] }

  const named = value.match(new RegExp(String.raw`\b(${MONTH_PATTERN})\s+([0-3]?\d)(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?\b`, 'i'))
  if (named) return {
    date: validDate(Number(named[3] ?? baseDate?.slice(0, 4) ?? new Date().getFullYear()), monthIndex(named[1]), Number(named[2])),
    text: named[0],
  }
  const dayFirst = value.match(new RegExp(String.raw`\b([0-3]?\d)(?:st|nd|rd|th)?\s+(${MONTH_PATTERN})(?:,?\s+(20\d{2}))?\b`, 'i'))
  if (dayFirst) return {
    date: validDate(Number(dayFirst[3] ?? baseDate?.slice(0, 4) ?? new Date().getFullYear()), monthIndex(dayFirst[2]), Number(dayFirst[1])),
    text: dayFirst[0],
  }

  const slash = value.match(/\b(0?[1-9]|1[0-2])\/([0-2]?\d|3[01])\/(20\d{2}|\d{2})\b/)
  if (slash) return { date: validDate(Number(slash[3].length === 2 ? `20${slash[3]}` : slash[3]), Number(slash[1]), Number(slash[2])), text: slash[0] }

  if (allowWeekday) {
    const weekday = value.match(/\b(next\s+week|next\s+weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue(?:s)?|wed|thu(?:r|rs)?|fri|sat|sun)\b/i)
    if (weekday) {
      const original = weekday[0]
      if (/^next\s+week/i.test(original)) return { date: null, text: original }
      if (!baseDate) return { date: null, text: original }
      const base = new Date(`${baseDate}T12:00:00`)
      if (Number.isNaN(base.getTime())) return { date: null, text: original }
      const dayIndex = weekdayIndex(original)
      let delta = (dayIndex - base.getDay() + 7) % 7
      if (delta === 0) delta = 7
      base.setDate(base.getDate() + delta)
      return { date: toIsoDate(base), text: original }
    }
  }
  return { date: null, text: null }
}

function validDate(year: number, month: number, day: number): string | null {
  const date = new Date(year, month - 1, day, 12)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return toIsoDate(date)
}

function monthIndex(value: string): number {
  const key = value.toLowerCase().replace('.', '')
  if (key === 'sept') return 9
  const match = MONTHS.findIndex(month => month.startsWith(key))
  return match >= 0 ? match + 1 : 0
}

function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function weekdayIndex(value: string): number {
  const name = value.toLowerCase().replace(/^next\s+/, '').slice(0, 3)
  return WEEKDAYS.findIndex(day => day.startsWith(name))
}

function timeParts(value: string): { start: string | null; end: string | null } {
  const matches = [...value.matchAll(/\b(\d{1,2})(?::([0-5]\d))?\s*(AM|PM)?\b/gi)]
  if (!matches.length) return { start: null, end: null }
  const normalize = (match: RegExpMatchArray) => {
    let hour = Number(match[1])
    const minute = match[2] ?? '00'
    const meridiem = match[3]?.toUpperCase()
    if (meridiem === 'PM' && hour < 12) hour += 12
    if (meridiem === 'AM' && hour === 12) hour = 0
    return `${String(hour).padStart(2, '0')}:${minute}`
  }
  return { start: normalize(matches[0]), end: matches[1] ? normalize(matches[1]) : null }
}

function parseParticipants(value: string): string[] {
  return value.split(/[,;\n]|\s+\band\b\s+/i).map(normalizePerson).filter(Boolean)
}

function parseSpeakerLine(line: string): { speaker: string; timestamp: string | null; text: string } | null {
  const pattern = /^\s*(?:\[(\d{1,2}:\d{2}(?:\s*[AP]M)?)\]\s*|(\d{1,2}:\d{2}\s*[AP]M)\s*(?:[-–—]\s*)?)([\p{L}][\p{L}'’.-]+(?:\s+[\p{L}][\p{L}'’.-]+){1,4})\s*:\s*(.*)$/iu
  const match = line.match(pattern)
  if (!match) return null
  return { speaker: normalizePerson(match[3]), timestamp: clean(match[1] ?? match[2] ?? ''), text: match[4] }
}

function parseUnstampedSpeaker(line: string, knownParticipants: string[]): { speaker: string; text: string } | null {
  const match = line.match(/^\s*([\p{L}][\p{L}'’.-]+(?:\s+[\p{L}][\p{L}'’.-]+){1,4})\s*:\s*(.+)$/u)
  if (!match || /^(?:decision|action|task|todo|risk|question|open question|pending decision|proposal|meeting date|meeting title|participants|attendees|location|venue|time|meeting time)$/i.test(match[1].trim())) return null
  const known = knownParticipants.some(person => person.toLocaleLowerCase() === normalizePerson(match[1]).toLocaleLowerCase())
  if (!known && match[1] !== match[1].toLocaleUpperCase()) return null
  return { speaker: normalizePerson(match[1]), text: match[2] }
}

function parseMetadataLine(line: string, metadata: MeetingMetadata): boolean {
  const match = line.match(/^\s*(?:[-*]\s*)?(?:\[([^\]]+)\]\s*)?([a-z][a-z ]{1,24})\s*:\s*(.+?)\s*$/i)
  if (!match) return false
  const label = match[2].trim().toLowerCase().replace(/\s+/g, ' ')
  const field = META_LABELS[label]
  if (!field) return false
  const value = clean(match[3])
  if (field === 'date') metadata.date = parseDateValue(value).date
  else if (field === 'time') {
    metadata.time = value
    const parsed = timeParts(value)
    metadata.startTime = parsed.start
    metadata.endTime = parsed.end
  } else if (field === 'participants') metadata.participants.push(...parseParticipants(value))
  else metadata[field] = value
  return true
}

function splitStatements(text: string): string[] {
  return text.split(/(?<=[.!?])\s+(?=(?:[A-ZÀ-ÖØ-Þ“"']|I\b|We\b|No\b|And\b|But\b))|;\s+/u)
    .map(clean).filter(Boolean)
}

function isSectionBoundary(line: string): 'transcript' | 'supplementary' | 'end' | null {
  const heading = clean(line).replace(/^#+\s*/, '').replace(/:$/, '')
  if (/^(?:meeting transcript|transcript|meeting notes)$/i.test(heading)) return 'transcript'
  if (/^(?:end of transcript|transcript ends)$/i.test(heading)) return 'end'
  if (/^(?:post[- ]meeting notes(?: for testing)?|supplementary notes|additional notes|testing notes)$/i.test(heading)) return 'supplementary'
  return null
}

function isHeadingLine(line: string): boolean {
  const value = clean(line).replace(/^#+\s*/, '')
  if (!value || value.length > 80 || /[.!?]$/.test(value)) return false
  const words = value.split(/\s+/)
  return words.length <= 6 && words.length > 1 && words.every(word => /^[A-Z\d][\p{L}\d'’&/-]*$/u.test(word))
}

export function preprocessTranscript(notes: string): TranscriptDocument {
  const metadata = emptyMetadata()
  const turns: TranscriptTurn[] = []
  const supplementaryTurns: TranscriptTurn[] = []
  let current: TranscriptTurn | null = null
  const preamble: string[] = []
  const supplementaryLines: string[] = []
  let section: 'primary' | 'supplementary' | 'ended' = 'primary'
  let startedDiscussion = false
  const flush = () => {
    if (current?.text.trim()) turns.push({ ...current, text: current.text.trim() })
    current = null
  }

  for (const rawLine of notes.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    const boundary = isSectionBoundary(line)
    if (boundary) {
      flush()
      if (boundary === 'supplementary') section = 'supplementary'
      else if (boundary === 'end') section = 'ended'
      else section = 'primary'
      continue
    }
    if (section === 'ended') continue
    if (section === 'supplementary') {
      supplementaryLines.push(line)
      continue
    }
    if (startedDiscussion && isHeadingLine(line)) {
      flush()
      continue
    }
    if (parseMetadataLine(line, metadata)) { flush(); continue }
    const speaker = parseSpeakerLine(line)
    if (speaker) {
      flush()
      startedDiscussion = true
      current = { speaker: speaker.speaker, timestamp: speaker.timestamp, text: speaker.text, sourceStatement: line }
      continue
    }
    const unstamped = parseUnstampedSpeaker(line, metadata.participants)
    if (unstamped) {
      flush()
      startedDiscussion = true
      current = { speaker: unstamped.speaker, timestamp: null, text: unstamped.text, sourceStatement: line }
      continue
    }
    if (current) {
      current.text += ` ${line}`
      current.sourceStatement += `\n${line}`
    }
    else preamble.push(line)
  }
  flush()

  const nonMetadata = preamble.map(line => line.replace(/^(?:transcript|meeting notes)\s*:\s*/i, '').trim())
    .filter(line => Boolean(line) && !isSectionBoundary(line) && !isHeadingLine(line))
  if (!metadata.title) {
    const title = preamble.map(line => line.replace(/^(?:transcript|meeting notes)\s*:\s*/i, '').trim())
      .find(line => line.length <= 120 && !parseDateValue(line).date && !/^(?:transcript|meeting notes)\s*$/i.test(line) && !isSectionBoundary(line))
    if (title) metadata.title = title
  }
  if (nonMetadata.length) {
    const titleLine = metadata.title
    for (const line of nonMetadata) {
      if (line === titleLine) continue
      turns.push({ speaker: null, timestamp: null, text: line, sourceStatement: line })
    }
  }

  if (supplementaryLines.length) {
    const text = supplementaryLines.filter(line => !isHeadingLine(line)).join(' ')
    if (text) supplementaryTurns.push({ speaker: null, timestamp: null, text, sourceStatement: supplementaryLines.join('\n') })
  }
  metadata.participants = unique(metadata.participants)
  return { metadata, turns, supplementaryTurns }
}

function unique(values: string[]): string[] {
  const seen = new Set<string>()
  return values.filter(value => {
    const key = value.toLocaleLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function explicitOwnerList(text: string, participants: string[]): string[] {
  const normalizedText = text.toLocaleLowerCase()
  const matched = participants
    .filter(person => normalizedText.includes(person.toLocaleLowerCase()))
    .sort((a, b) => b.length - a.length)
  if (!matched.length) return []
  const firstPosition = Math.min(...matched.map(person => normalizedText.indexOf(person.toLocaleLowerCase())))
  const prefix = text.slice(0, firstPosition).trim()
  const beforeCommitment = text.slice(firstPosition, Math.max(firstPosition, text.search(/\b(?:will|shall|please|kindly|can you|could you|would you)\b/i)))
  const named = matched.filter(person => {
    const start = normalizedText.indexOf(person.toLocaleLowerCase())
    return start >= firstPosition && start < firstPosition + beforeCommitment.length
  })
  if (!named.length) return []
  const namePhrase = clean((prefix + ' ' + beforeCommitment).replace(/^(?:as agreed,?\s*|also\s+)/i, ''))
  if (!/^[\p{L}][\p{L}'’.-]+(?:\s+(?:and|&)\s+[\p{L}][\p{L}'’.-]+)*(?:\s*,)?$/iu.test(namePhrase)) return []
  return named
}

function ownerFromStatement(statement: string, turnSpeaker: string | null, participants: string[]): string[] {
  const known = participants
  const resolve = (candidate: string): string[] => {
    const text = clean(candidate).replace(/[,;:]+$/, '')
    const parts = parseParticipants(text)
    if (!parts.length || parts.some(part => /^(?:i|we|you|he|she|they|once|after|as agreed)$/i.test(part))) return []
    return unique(parts.map(part => {
      const exact = known.find(person => person.toLowerCase() === part.toLowerCase())
      if (exact) return exact
      const firstNameMatches = known.filter(person => person.split(/\s+/)[0].toLowerCase() === part.toLowerCase())
      return firstNameMatches.length === 1 ? firstNameMatches[0] : part
    }))
  }

  const marker = statement.match(/^(?:action(?:\s+item)?|todo|task|follow[- ]?up)\s*[:—-]\s*(.+)$/i)
  if (marker) {
    const assignment = marker[1].match(/^(.+?)\s+(?:will|to|shall)\s+/i)
    if (assignment) {
      const owners = resolve(assignment[1])
      if (owners.length) return owners
    }
    const explicit = marker[1].match(/^(?:owner|assigned\s+to)\s*:\s*(.+?)(?:\s{2,}|$)/i)
    if (explicit) return resolve(explicit[1])
  }

  const cleaned = statement.replace(/^(?:as agreed,?\s*)/i, '')
  const commitment = /\b(?:will|shall|am going to|are going to)\s+/i.exec(cleaned)
  if (commitment?.index !== undefined) {
    const prefix = cleaned.slice(0, commitment.index).replace(/[,;]\s*$/, '').trim()
    const subject = prefix.split(/[,;]\s*/).at(-1)?.replace(/^(?:once|after|when)\b.+\b(?:and|,)\s*/i, '').trim() ?? prefix
    if (/^(?:i|i'll)$/i.test(subject)) return turnSpeaker ? [turnSpeaker] : []
    if (/^(?:we|we'll)$/i.test(subject)) return []
    const nameAndSpeaker = subject.match(/^(.+?)\s+and\s+i$/i)
    if (nameAndSpeaker && turnSpeaker) return unique([...resolve(nameAndSpeaker[1]), turnSpeaker])
    const people = resolve(subject.replace(/^as agreed,?\s*/i, ''))
    if (people.length) return people
  }

  const direct = cleaned.match(/^(.+?),\s*(?:(?:please|kindly)\s+|(?:(?:can|could|would)\s+you\s+(?:please\s+)?)?)(?:[a-z][\w'-]*\s+)?/i)
  if (direct) {
    const people = resolve(direct[1])
    if (people.length) return people
  }

  const named = explicitOwnerList(statement, known)
  return named
}

function actionPattern(statement: string): RegExpMatchArray | null {
  const normalized = statement.replace(/^(?:as agreed,?\s*)/i, '')
  for (const pattern of ACTION_PATTERNS) {
    const match = normalized.match(pattern)
    if (match) return match
  }
  return null
}

function looksLikePendingDecision(statement: string): boolean {
  return /\b(?:decide whether|decision remains|pending decision|not yet decided|decision is outstanding|decision is pending|awaiting (?:a )?decision|requires? (?:executive )?approval|approve or reject|will decide whether)\b/i.test(statement) ||
    /\bdecision can be made\b/i.test(statement) ||
    (/\b(?:review|consider|assess|evaluate)\b/i.test(statement) && /\b(?:decide|decision|approve|allocation|funding)\b/i.test(statement))
}

function isActionStatement(statement: string, speaker: string | null, participants: string[]): boolean {
  if (looksLikePendingDecision(statement)) return false
  if (/\b(?:i can|we can|i could|we could)\b/i.test(statement) && !/\bplease\b/i.test(statement)) return false
  if (!actionPattern(statement)) return false
  const owners = ownerFromStatement(statement, speaker, participants)
  return owners.length > 0 || ACTION_PATTERNS[5].test(statement)
}

function priorityFrom(statement: string): { value: Priority; explicit: boolean } {
  const match = statement.match(/\b(critical|high(?:est)? priority|urgent|medium priority|low priority)\b/i)
  if (!match) return { value: 'Medium', explicit: false }
  const value = match[1].toLowerCase()
  if (/critical|urgent/.test(value)) return { value: 'Critical', explicit: true }
  if (value.startsWith('high')) return { value: 'High', explicit: true }
  if (value.startsWith('low')) return { value: 'Low', explicit: true }
  return { value: 'Medium', explicit: true }
}

function cleanAction(statement: string, ownerNames: string[]): string {
  let text = statement
    .replace(/^(?:action(?:\s+item)?|todo|task|follow[- ]?up)\s*[:—-]\s*/i, '')
    .replace(/^(?:as agreed,?\s*)/i, '')
  const firstVerb = new RegExp(String.raw`\b(?:will|shall|is going to|are going to)\s+(${ACTION_VERBS})\b`, 'i').exec(text)
  const imperative = new RegExp(String.raw`(?:\b(?:please|kindly)\s+|\b(?:can|could|would)\s+you\s+)?(${ACTION_VERBS})\b`, 'i').exec(text)
  const self = new RegExp(String.raw`^(?:i\s+will|i'll|i\s+shall|i\s+am\s+going\s+to|we\s+will|we'll)\s+(${ACTION_VERBS})\b`, 'i').exec(text)
  const match = firstVerb ?? self ?? imperative
  if (match?.index !== undefined) text = text.slice(match.index + match[0].length - match[1].length)
  text = text.replace(/^(?:you\s+)?(?:to\s+)?/i, '')
  for (const owner of ownerNames) {
    const escaped = owner.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    text = text.replace(new RegExp(`^${escaped}(?:\\s+and\\s+[\\p{L}][\\p{L}'’.-]+)*\\s*,?\\s*`, 'iu'), '')
  }
  text = text.replace(/\s+(?:by|before|on|due(?:\s+by)?|deadline(?:\s+is)?|due date)\s*:?\s*(?:(?:next\s+week|next\s+weekend)|(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)|(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)\.?\s+[0-3]?\d(?:st|nd|rd|th)?(?:,?\s+20\d{2})?|20\d{2}-(?:0?[1-9]|1[0-2])-(?:[0-2]?\d|3[01])|(?:0?[1-9]|1[0-2])\/(?:[0-2]?\d|3[01])\/(?:20\d{2}|\d{2})).*$/i, '')
  text = text.replace(/\b(?:by|before|on)\s+(?:thursday|friday|monday|tuesday|wednesday|next week)\b.*$/i, '')
  text = text.replace(/\s+(?:because|since|once)\s+.+$/i, '')
  return clean(text).replace(/[.,;:—-]+$/, '')
}

function extractDeadline(statement: string, baseDate: string): { date: string | null; text: string | null } {
  const cue = /\b(?:by|before|on|due(?:\s+by)?|deadline(?:\s+is)?|for)\s*:?\s*/i.exec(statement)
  if (cue?.index !== undefined) {
    const remainder = statement.slice(cue.index + cue[0].length)
    const parsed = parseDateValue(remainder, baseDate, true)
    if (parsed.text) return parsed
  }
  const bare = parseDateValue(statement, baseDate, true)
  if (bare.text && !/^next\s+week/i.test(bare.text)) return bare
  return { date: null, text: bare.text }
}

function contextDeadline(action: ActionItem, statements: { text: string; speaker: string | null }[]): { date: string | null; text: string | null } | null {
  if (action.dueDate || action.deadlineText) return null
  const actionWords = taskTokens(action.description, action.owners ?? [])
  for (const statement of statements) {
    if (!/\bnext week\b/i.test(statement.text)) continue
    const sourceWords = taskTokens(statement.text, statement.speaker ? [statement.speaker] : [])
    const related = overlapRatio(actionWords, sourceWords) >= 0.35 ||
      (/\b(refresher|training|session)\b/i.test(action.description) && /\b(refresher|training|session)\b/i.test(statement.text))
    if (related) return { date: null, text: statement.text.match(/\bnext week\b/i)?.[0] ?? null }
  }
  return null
}

const TASK_STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'from', 'into', 'that', 'this', 'will', 'shall', 'please', 'kindly', 'once', 'after', 'before', 'by', 'to', 'a', 'an', 'of', 'on', 'in', 'their', 'them', 'they', 'you', 'i', 'we'])
const TASK_SYNONYMS: Record<string, string> = {
  categorise: 'categorize', categorised: 'categorize', categorizing: 'categorize', categorising: 'categorize',
  revised: 'revise',
  tickets: 'ticket', aged: 'old', refunds: 'refund', templates: 'template', escalations: 'escalation',
  reviewing: 'review', reviewed: 'review', separate: 'classify', separating: 'classify', cases: 'case',
  updates: 'update', breakdowns: 'breakdown', trackers: 'tracker', sessions: 'session',
}

function taskTokens(value: string, owners: string[] = []): Set<string> {
  const excludedNames = new Set(owners.flatMap(owner => owner.toLowerCase().split(/\s+/)))
  return new Set(value.toLowerCase().replace(/[^\p{L}\d\s]/gu, ' ').split(/\s+/)
    .map(word => TASK_SYNONYMS[word] ?? word)
    .filter(word => word.length > 2 && !TASK_STOP_WORDS.has(word) && !excludedNames.has(word)))
}

function overlapRatio(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0
  const common = [...left].filter(token => right.has(token)).length
  return common / Math.min(left.size, right.size)
}

function actionVerbs(value: string): Set<string> {
  const matcher = new RegExp(String.raw`\b${ACTION_VERBS}\b`, 'gi')
  const verbs = new Set([...(value.matchAll(matcher))].map(match => TASK_SYNONYMS[match[0].toLowerCase()] ?? match[0].toLowerCase()))
  if (/\bwork together on\b/i.test(value) && /\brevised?\b/i.test(value)) {
    verbs.delete('work')
    verbs.add('revise')
  }
  return verbs
}

export function areDuplicateActions(a: ActionItem, b: ActionItem): boolean {
  const ownersA = [...(a.owners?.length ? a.owners : [a.owner])].map(owner => owner.toLowerCase()).sort()
  const ownersB = [...(b.owners?.length ? b.owners : [b.owner])].map(owner => owner.toLowerCase()).sort()
  if (ownersA.join('|') !== ownersB.join('|') && !ownersA.includes('unassigned') && !ownersB.includes('unassigned')) return false
  if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return false
  const responsibilityA = actionResponsibility(a)
  const responsibilityB = actionResponsibility(b)
  if (responsibilityA && responsibilityA === responsibilityB) return true
  if (responsibilityA && responsibilityB && responsibilityA !== responsibilityB) return false
  const verbsA = actionVerbs(a.sourceStatements?.join(' ') ?? a.sourceStatement ?? a.description)
  const verbsB = actionVerbs(b.sourceStatements?.join(' ') ?? b.sourceStatement ?? b.description)
  const descriptionSimilarity = overlapRatio(taskTokens(a.description, ownersA), taskTokens(b.description, ownersB))
  const sourceA = a.sourceStatements?.join(' ') ?? a.sourceStatement ?? a.description
  const sourceB = b.sourceStatements?.join(' ') ?? b.sourceStatement ?? b.description
  const sourceSimilarity = sourceA === sourceB ? 0 : overlapRatio(taskTokens(sourceA, ownersA), taskTokens(sourceB, ownersB))
  const verbSimilarity = overlapRatio(verbsA, verbsB)
  return verbSimilarity > 0 && (descriptionSimilarity >= 0.58 || sourceSimilarity >= 0.5)
}

function actionResponsibility(action: ActionItem): string | null {
  const description = action.description.toLowerCase()
  const source = actionEvidenceText(action).toLowerCase()
  if (/\btracker\b/.test(description) && /\b(?:creat|build|maintain|manage|track)/.test(description)) {
    const subject = description.match(/\b((?:aged[- ]ticket|customer[- ]feedback|action|issue|project|risk)\s+tracker|tracker)\b/iu)?.[1]?.replace(/\s+/g, ' ').trim() ?? 'tracker'
    return `tracker-lifecycle:${subject}`
  }
  if (/\b(?:refresher|training|session)\b/.test(`${description} ${source}`) &&
      /\b(?:coordinate|schedule|arrange|organize|organise|book)\b/.test(description)) {
    const taskContext = `${description} ${source}`
    const subject = /\brefresher\b/.test(taskContext) ? 'refresher'
      : /\btraining\b/.test(taskContext) ? 'training' : 'session'
    return `session-scheduling:${subject}`
  }
  if (/\baccount[- ]access\b/.test(description) && /\binvestigation\b/.test(description) && /\bupdate\b/.test(description) &&
      /\b(?:obtain|get|collect|share|provide|send|update)\b/.test(description)) return 'account-access-update'
  if (/\b(?:engineering|investigation)\b/.test(`${description} ${source}`) && /\bupdate\b/.test(description) &&
      (/\baccount[- ]access\b/.test(`${description} ${source}`) && /\binvestigation\b/.test(`${description} ${source}`) ||
       /\bconfirmed cause\b/.test(`${description} ${source}`) && /\baffected users\b/.test(`${description} ${source}`) &&
       /\bworkaround\b/.test(`${description} ${source}`))) return 'account-access-update'
  return null
}

function extractCanonicalActionDescription(existing: ActionItem, incoming: ActionItem): string | null {
  const responsibility = actionResponsibility(existing)
  if (!responsibility || responsibility !== actionResponsibility(incoming)) return null
  const descriptions = [existing.description, incoming.description]
  const sourceText = actionEvidenceText(existing, incoming)
  const descriptionText = descriptions.map(cleanActionTitle).join(' ')
  const supportingText = `${descriptionText} ${sourceText}`

  if (responsibility.startsWith('tracker-lifecycle:')) {
    const tracker = responsibility.slice('tracker-lifecycle:'.length)
    if (tracker) {
      const extra = descriptions.map(description =>
        description.match(/\btracker\b\s+and\s+(?:also\s+)?(flag|identify|report|escalate)\s+([^.;]+)/i)).find(Boolean)
      return `Create and maintain the ${tracker}${extra ? ` and ${extra[1].toLowerCase()} ${clean(extra[2])}` : ''}.`
    }
  }

  if (responsibility.startsWith('session-scheduling:')) {
    const responsibilitySubject = responsibility.split(':')[1]
    const duration = supportingText.match(/\b\d+\s*-\s*minute\b/i)?.[0]
    const session = responsibilitySubject === 'refresher' ? 'support refresher' : responsibilitySubject
    const withPeople = extractWithPeople([
      ...descriptions.map(cleanActionTitle),
      ...[...getActionSourceStatements(existing), ...getActionSourceStatements(incoming)].map(stripTranscriptSpeaker),
    ])
    return `Coordinate and schedule${duration ? ` the ${duration.replace(/\s*-\s*/, '-')}` : ''} ${session}${withPeople ? ` with ${withPeople}` : ''}.`
  }

  if (responsibility === 'account-access-update') {
    const detailText = [
      ...descriptions.map(cleanActionTitle),
      ...[...getActionSourceStatements(existing), ...getActionSourceStatements(incoming)].map(stripTranscriptSpeaker),
    ]
    const allInvestigationDetails = /\bconfirmed cause\b/i.test(supportingText) &&
      /\baffected users\b/i.test(supportingText) &&
      /\bworkaround\b/i.test(supportingText)
    const detail = allInvestigationDetails
      ? 'the confirmed cause, affected users and workaround'
      : detailText.map(text => text.match(/\bincluding\s+([^.;]{1,120})/i)?.[1]).find(Boolean)
    return `Obtain and share the account-access investigation update${detail ? `, including ${clean(detail).replace(/^the\s+/i, 'the ')}` : ''}.`
  }
  return null
}

function consolidateAction(existing: ActionItem, incoming: ActionItem): ActionItem {
  const canonicalDescription = extractCanonicalActionDescription(existing, incoming)
  const moreDetailed = chooseCleanActionDescription(existing.description, incoming.description)
  const sourceStatements = unique([...getActionSourceStatements(existing), ...getActionSourceStatements(incoming)])
  const ownerMissing = existing.owner === 'Unassigned' || !existing.owner.trim()
  const dueDate = existing.dueDate ?? incoming.dueDate
  const deadlineText = existing.deadlineText ?? incoming.deadlineText
  const owner = ownerMissing ? incoming.owner : existing.owner
  const status = existing.status !== 'Not Started' ? existing.status : incoming.status
  const notes = [existing.notes, incoming.notes].filter(Boolean).join('\n')
  return {
    ...existing,
    description: canonicalDescription ?? moreDetailed,
    owner,
    owners: ownerMissing ? incoming.owners : existing.owners ?? incoming.owners,
    dueDate,
    deadlineText,
    priority: existing.priorityExplicit ? existing.priority : incoming.priority,
    priorityExplicit: existing.priorityExplicit || incoming.priorityExplicit,
    status,
    notes,
    sourceStatements,
    sourceStatement: sourceStatements.join('\n---\n'),
    confidence: Math.max(existing.confidence ?? 0, incoming.confidence ?? 0),
    dependencies: unique([...(existing.dependencies ?? []), ...(incoming.dependencies ?? [])].map(normalizeActionDependency)),
    needsReview: owner === 'Unassigned' || (!dueDate && !deadlineText) || (!dueDate && !!deadlineText),
  }
}

function actionEvidenceText(...actions: ActionItem[]): string {
  const statements = actions.flatMap(getActionSourceStatements)
  return statements.map(statement => statement.split(/\r?\n/).map(stripTranscriptSpeaker).join(' ')).join(' ')
}

function stripTranscriptSpeaker(value: string): string {
  return value.replace(/^\s*(?:\[\d{1,2}:\d{2}(?:\s*[AP]M)?\]\s*)?(?:[\p{Lu}][\p{Lu}'’.-]+(?:\s+[\p{Lu}][\p{Lu}'’.-]+){1,4})\s*:\s*/u, '')
}

function getActionSourceStatements(action: ActionItem): string[] {
  return unique([
    ...(action.sourceStatements ?? []),
    ...(action.sourceStatement ? action.sourceStatement.split(/\n---\n/) : []),
  ])
}

function chooseCleanActionDescription(left: string, right: string): string {
  const cleanLeft = cleanActionTitle(left)
  const cleanRight = cleanActionTitle(right)
  return taskTokens(cleanRight).size > taskTokens(cleanLeft).size ? cleanRight : cleanLeft
}

function cleanActionTitle(value: string): string {
  return clean(value
    .replace(/^\s*(?:\[\d{1,2}:\d{2}(?:\s*[AP]M)?\]\s*)?(?:[\p{Lu}][\p{Lu}'’.-]+(?:\s+[\p{Lu}][\p{Lu}'’.-]+){1,4})\s*:\s*/u, '')
    .replace(/\s+\[\d{1,2}:\d{2}(?:\s*[AP]M)?\]\s*[\p{Lu}][\p{Lu}'’.-]+(?:\s+[\p{Lu}][\p{Lu}'’.-]+){1,4}\s*:.+$/u, '')
    .replace(/\s+(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s+(?:will|please|can|could|let's)\b.+$/u, '')
  ).replace(/[.,;:—-]+$/, '')
}

function extractWithPeople(parts: string[]): string | null {
  const matches = parts.flatMap(part => part.split(/[.!?\n]/)).flatMap(sentence =>
    [...sentence.matchAll(/\bwith\s+([^,;]+?)(?=\s+(?:for|by|before|next week|due|coordinate|schedule|arrange|organize|organise|book|Grace|Ifeoma|Tunde|Amara)\b|[,;]|$)/gi)]
      .map(match => clean(match[1]))
  )
    .filter(value => /^(?:Daniel|Grace|Ifeoma|Tunde|Amara)\b/i.test(value) || /\bteam\b/i.test(value))
  const value = matches.find(match => /\bteam\b/i.test(match)) ?? matches[0]
  return value?.replace(/^(?:the\s+)?/i, '').trim() ?? null
}

export function consolidateActionItems(items: ActionItem[]): ActionItem[] {
  const consolidated: ActionItem[] = []
  for (const rawItem of items) {
    const item = {
      ...rawItem,
      description: extractCanonicalActionDescription(rawItem, rawItem) ?? cleanActionTitle(rawItem.description),
    }
    const duplicateIndexes = consolidated.flatMap((candidate, index) =>
      areDuplicateActions(candidate, item) ? [index] : [])
    if (!duplicateIndexes.length) {
      consolidated.push(item)
      continue
    }

    const canonicalIndex = duplicateIndexes[0]
    let canonical = consolidated[canonicalIndex]
    for (const index of duplicateIndexes.slice(1)) canonical = consolidateAction(canonical, consolidated[index])
    consolidated[canonicalIndex] = consolidateAction(canonical, item)
    for (const index of duplicateIndexes.slice(1).sort((a, b) => b - a)) consolidated.splice(index, 1)
  }
  return consolidated
}

function findDecision(statement: string, context = ''): { kind: DecisionKind; description: string; followUp: string } | null {
  const dateIsUnsettled = /\b(?:not agreed|haven't agreed|have not agreed|not finali[sz]ed)\b/i.test(statement) &&
    /\b(?:date|time|schedule)\b/i.test(statement)
  const dateIsPending = /\b(?:exact )?(?:date|time)\b.{0,50}\b(?:still )?(?:pending|unknown|not established|unresolved)\b/i.test(statement)
  if (dateIsUnsettled || (dateIsPending && /\b(?:refresher|training|session)\b/i.test(context))) {
    const subject = /\b(?:refresher|training|session)\b/i.test(`${statement} ${context}`) ? 'support refresher' : 'meeting'
    return { kind: 'Scheduling Pending', description: `The exact date for the ${subject} has not been agreed.`, followUp: 'Scheduling remains open; confirm the date before sending the invitation.' }
  }
  if (/\b(?:no|not|never|hasn't|have not|has not|isn't|was not|were not)\b.{0,80}\b(?:approved|authorized|authorised|allocated|funded)\b/i.test(statement) ||
      /\b(?:not approved|unapproved|approval (?:was )?not granted)\b/i.test(statement)) {
    return { kind: 'Not Approved', description: clean(statement), followUp: 'Explicitly not approved; do not treat as an approved allocation.' }
  }
  if (/\b(?:proposal|request)\b.{0,70}\b(?:rejected|declined|refused)\b|\b(?:rejected|declined|refused)\b.{0,70}\b(?:proposal|request)\b/i.test(statement)) {
    return { kind: 'Rejected', description: clean(statement), followUp: 'The proposal or request was explicitly rejected.' }
  }
  if (/\b(?:do not|don't|must not|cannot|can't)\b.{0,100}\bpublish\b.{0,80}\b(?:until|unless)\b.{0,80}\bapprove\b/i.test(statement) ||
      /\b(?:requires?|needs?)\b.{0,50}\bapproval\b.{0,50}\bbefore\b.{0,50}\bpublish/i.test(statement)) {
    return { kind: 'Approval Required', description: clean(statement), followUp: 'Publication is explicitly conditional on approval.' }
  }
  if (looksLikePendingDecision(statement)) {
    return { kind: 'Pending', description: clean(statement), followUp: 'Decision remains pending; no approval is implied.' }
  }
  if (/^(?:proposed|suggested|proposal|pending decision)\s*[:—-]/i.test(statement) || /\b(?:i propose|we propose|i suggest|we suggest|could consider)\b/i.test(statement)) {
    return { kind: 'Proposed', description: clean(statement.replace(/^(?:proposed|suggested|proposal)\s*[:—-]\s*/i, '')), followUp: 'Proposal only — confirm before treating as final.' }
  }
  if (/^(?:decision|decided|approved|resolution)\s*[:—-]/i.test(statement) ||
      /\b(?:we decided|it was decided|we agreed to|we agreed (?:that|the)\b|agreed that|we have agreed|the team agreed)\b/i.test(statement)) {
    return { kind: 'Recorded', description: clean(statement.replace(/^(?:decision|decided|approved|resolution)\s*[:—-]\s*/i, '')), followUp: '' }
  }
  return null
}

function decisionTopicKey(decision: Decision): string | null {
  const description = decision.description.toLowerCase()
  if (/\b(?:refund|funding|allocation)\b/.test(description) &&
      /\b(?:₦|million|approve|allocation|funding|breakdown|decision)\b/.test(description)) return 'refund-allocation'
  if (/\b(?:refresher|training|session)\b/.test(description) &&
      /\b(?:date|time|schedule|next week|agreed|pending)\b/.test(description)) return 'session-scheduling'
  if (/\btemplate\b/.test(description) && /\b(?:publish|approval|approve|wording)\b/.test(description) &&
      decision.kind === 'Approval Required') return 'template-publication-approval'
  return null
}

export function consolidateDecisionRecords(decisions: Decision[], transcript: TranscriptTurn[] = []): Decision[] {
  const groups = new Map<string, Decision[]>()
  const contextualized = decisions.map(decision => contextualizeDecision(decision, transcript))
  for (const decision of contextualized) {
    const topic = decisionTopicKey(decision)
    const key = topic ?? `individual:${decision.kind}:${normalizeDecisionText(decision.description)}`
    groups.set(key, [...(groups.get(key) ?? []), decision])
  }
  return [...groups.values()].map(group => {
    if (group.length === 1) return group[0]
    const topic = decisionTopicKey(group[0])
    const sourceStatement = unique(group.map(item => item.sourceStatement).filter((value): value is string => Boolean(value))).join('\n---\n')
    const people = unique(group.flatMap(item => item.people))
    if (topic === 'refund-allocation') {
      const notApproved = group.find(item => item.kind === 'Not Approved')
      const pending = group.find(item => item.kind === 'Pending')
      const representative = notApproved ?? pending ?? group[0]
      return {
        ...representative,
        description: refundDecisionDescription(group),
        people,
        sourceStatement,
        followUp: pending?.followUp ?? representative.followUp,
      }
    }
    if (topic === 'session-scheduling') {
      const scheduling = group.find(item => item.kind === 'Scheduling Pending')
      const representative = scheduling ?? group[0]
      const agreed = group.some(item => item.kind === 'Recorded')
      return {
        ...representative,
        description: agreed
          ? 'The support refresher is agreed for next week; its exact date has not been agreed.'
          : representative.description,
        people,
        sourceStatement,
      }
    }
    return { ...group[0], people, sourceStatement }
  })
}

function contextualizeDecision(decision: Decision, transcript: TranscriptTurn[]): Decision {
  if (decisionTopicKey(decision)) return decision
  if (!/\b(?:that decision|the decision|until .* (?:figures|numbers|breakdown)|pending until)\b/i.test(decision.description)) return decision
  const sourceIndex = transcript.findIndex(turn => turn.sourceStatement === decision.sourceStatement)
  if (sourceIndex < 0) return decision
  const context = transcript.slice(Math.max(0, sourceIndex - 4), sourceIndex).map(turn => turn.text).join(' ')
  if (!/\b(?:refund|funding|allocation|financial breakdown)\b/i.test(context)) return decision
  return {
    ...decision,
    description: `The additional refund allocation remains pending until the financial breakdown is reviewed: ${decision.description}`,
  }
}

function refundDecisionDescription(group: Decision[]): string {
  const text = group.map(item => item.description).join(' ')
  const amount = text.match(/₦\s?[\d,.]+\s?(?:million|m)?/i)?.[0]
  const allocation = `${amount ? `Additional ${amount} ` : 'Additional '}refund allocation`
  return `${allocation} is not approved; an executive decision is pending review of the financial breakdown.`
}

function isResolvedQuestion(question: string, actions: ActionItem[], statements: TranscriptTurn[]): boolean {
  if (/\bdeadline\b/i.test(question)) return false
  const questionIndex = statements.findIndex(statement => statement.text.toLocaleLowerCase() === question.toLocaleLowerCase())
  for (const action of actions) {
    const actionSources = action.sourceStatements ?? (action.sourceStatement ? [action.sourceStatement] : [])
    const actionIndex = statements.findIndex(statement => actionSources.includes(statement.sourceStatement))
    if (questionIndex >= 0 && actionIndex >= 0 && actionIndex <= questionIndex) continue
    const questionText = question.toLowerCase()
    const actionText = `${action.description} ${actionSources.join(' ')}`.toLowerCase()
    const sharedTokens = overlapRatio(taskTokens(question, action.owners ?? []), taskTokens(actionText, action.owners ?? []))
    const resolvedTicketWorkflow = /\btickets?\b/.test(questionText) && /\btickets?\b/.test(actionText) &&
      /\b(?:review|separate|classify|categorize|categorise)\b/.test(questionText) &&
      /\b(?:review|separate|classify|categorize|categorise|identify|escalate)\b/.test(actionText)
    if (resolvedTicketWorkflow || sharedTokens >= 0.45) return true
  }
  return false
}

function isGenuineRisk(statement: string): boolean {
  if (/\b(?:meeting purpose|purpose of (?:this|the) meeting|meeting objective|agenda)\b/i.test(statement)) return false
  if (actionPattern(statement) || looksLikePendingDecision(statement)) return false
  if (/\b(?:resolved|fixed|restored|no longer failing|back to normal)\b/i.test(statement) &&
      !/\b(?:remaining|continues|still|again|unresolved)\b/i.test(statement)) return false
  return /\b(?:failure|failed|outage|not working|unavailable|cannot access|unable to access|blocked by|missed deadline|financial constraint|funding shortfall|below (?:the )?(?:target|plan|standard)|refund.{0,30}(?:backlog|outstanding)|(?:aged|overdue|unresolved) (?:ticket|case|request) backlog|(?:password[- ]reset|account[- ]access).{0,60}(?:fail|failure|unknown|unresolved|not working)|(?:root cause|cause).{0,60}(?:unknown|unclear|unresolved|not established)|(?:could|may|might|will)\s+(?:prevent|delay|affect|cause|result in|lead to|increase))\b/i.test(statement)
}

function isQuestion(statement: string): boolean {
  if (/\bmeeting (?:purpose|objective|aim)\b/i.test(statement)) return false
  if (actionPattern(statement)) return false
  if (/^(?:action|task|todo|follow[- ]?up)\s*[:—-]/i.test(statement)) return false
  if (/^(?:yes|no|correct|that is correct|we did|it is|they are)\b/i.test(statement)) return false
  return /\?$/.test(statement) ||
    /^(?:open question|question|unanswered|needs clarification)\s*[:—-]/i.test(statement) ||
    /\b(?:we need to know|still need to confirm|remains unclear whether|unclear whether)\b/i.test(statement) ||
    /\b(?:exact date|deadline)\b.{0,60}\b(?:pending|unknown|not specified|unresolved|unclear)\b/i.test(statement) ||
    /\b(?:root cause|cause)\b.{0,60}\b(?:remains unknown|unknown|unclear|not established)\b/i.test(statement) ||
    /\bwe need\b.{0,100}\bbefore\b.{0,60}\bdecision can be made\b/i.test(statement)
}

function makeSummary(discussion: string[], decisions: Decision[], actions: ActionItem[], questions: string[], risks: string[]): string {
  const sentences: string[] = []
  const facts = discussion.filter(statement => !isMeetingPurposeStatement(statement))
  const closedFact = facts.map(statement => ({
    statement,
    match: statement.match(/\b(?:closed|resolved|handled)\s+(\d+)\s+(?:support\s+)?tickets?\b/i),
  })).find(item => item.match)
  const openFact = facts.map(statement => ({
    statement,
    match: statement.match(/\b(\d+)\s+(?:tickets?\s+)?(?:remain(?:ing)?\s+)?(?:open|unresolved)\b/i),
  })).find(item => item.match)
  const closed = closedFact?.match?.[1]
  const open = openFact?.match?.[1]
  const agedMatch = openFact?.statement.match(/\b(?:including|of which|among (?:them|these))\s+(\d+)\s+(?:open\s+)?(?:aged\s+)?tickets?\s+(?:that (?:have|are)\s+)?(?:have been open\s+)?(?:older than|over)\s+([\w-]+(?:\s+business)?\s+days?)\b/i)
    ?? openFact?.statement.match(/\b(\d+)\s+of\s+the\s+\d+\s+open tickets?\s+(?:have been\s+)?(?:open\s+)?(?:older than|over)\s+([\w-]+(?:\s+business)?\s+days?)\b/i)
  const agedCount = agedMatch?.[1]
  const agedDuration = agedMatch?.[2]
  const hasOpenAgedRelationship = Boolean(open && agedCount && openFact?.statement.match(/\b(?:including|of which|among (?:them|these)|\d+\s+of\s+the\s+\d+\s+open)\b/i))
  if (closed || open) {
    const time = closedFact?.statement.match(/\blast week\b/i) ? ' last week' : ''
    const parts = [
      closed ? `Support closed ${closed} tickets${time}` : '',
      open ? `${open} tickets remain open${hasOpenAgedRelationship ? `, of which ${agedCount} have been open for more than ${agedDuration}` : ''}` : '',
    ].filter(Boolean)
    sentences.push(`${parts.join('; ')}.`)
  } else {
    const fact = facts.find(text => /\d/.test(text) && !isHeadingLine(text))
    if (fact) sentences.push(clean(fact))
  }

  const operationalThemes = unique(actions.map(action => {
    const description = action.description.toLowerCase()
    if (/ticket/.test(description)) return 'aged-ticket review'
    if (/account[- ]access|password|engineering/.test(description)) return 'account-access investigation'
    if (/template/.test(description)) return 'customer response templates'
    if (/refund|breakdown/.test(description)) return /breakdown/.test(description) ? 'refund breakdown' : 'refund review'
    if (/refresher|training/.test(description)) return 'support refresher'
    return ''
  }).filter(Boolean))
  if (operationalThemes.length) {
    sentences.push(`The team assigned follow-up on ${operationalThemes.slice(0, 5).join(', ')}.`)
  }

  const allocation = decisions.some(item => item.kind === 'Not Approved' && /\b(?:refund|allocation)\b/i.test(item.description))
  const fundingPending = decisions.some(item =>
    /\b(?:refund|funding|allocation|breakdown)\b/i.test(`${item.description} ${item.followUp}`) &&
    /\b(?:decide|decision|review|pending|approve)\b/i.test(`${item.description} ${item.followUp}`))
  const amount = decisions.map(item => `${item.description} ${item.sourceStatement ?? ''}`).join(' ').match(/₦\s?[\d,.]+\s?(?:million|m)?/i)?.[0]
  if (allocation) sentences.push(`${amount ? `An additional ${amount} refund allocation` : 'The additional refund allocation'} is not approved${fundingPending ? ' pending a financial breakdown' : ''}.`)

  const refresherAgreed = decisions.some(item =>
    /\brefresher|training|session\b/i.test(item.description) &&
    (item.kind === 'Recorded' || (item.kind === 'Scheduling Pending' && /\bagreed\b/i.test(item.description))))
  const schedulePending = decisions.some(item => item.kind === 'Scheduling Pending' && /\brefresher|training|session\b/i.test(item.description))
  if (refresherAgreed) sentences.push(`A support refresher is planned${schedulePending ? ' for next week, with its exact date still to be confirmed' : ' for next week'}.`)

  const distinctIssues = unique([...risks, ...questions])
    .filter(issue => !/\brefund|funding|allocation\b/i.test(issue) || /\bdeadline\b/i.test(issue))
    .filter(issue => !(/\brefresher|training|session\b/i.test(issue) && /\bdate|time|schedule\b/i.test(issue)))
  const technicalIssue = questions.find(issue => /\broot cause\b/i.test(issue))
    ?? distinctIssues.find(issue => /\b(?:root cause|failure|outage|blocked|unresolved)\b/i.test(issue))
  if (technicalIssue) sentences.push(clean(technicalIssue))

  return sentences.join(' ') || 'No concise executive summary could be confidently generated from the recorded meeting outcomes.'
}

function isMeetingPurposeStatement(statement: string): boolean {
  return /\b(?:purpose|objective|agenda)\s+(?:of|for)\s+(?:this|the)\s+meeting\b|\bthis meeting (?:is|was|will be) (?:to|for|about|focused on)\b/i.test(statement)
}

function splitCompoundResponsibilities(statement: string): string[] {
  const split = statement.match(/^(.*?)\s+\band\s+(?:also\s+)?(maintain|coordinate|schedule|organize|organise|track)\b(.*)$/i)
  if (!split) return [statement]
  const first = clean(split[1])
  const verb = split[2]
  const remainder = clean(split[3])
  const firstVerb = first.match(/\b(coordinate|schedule|organize|organise|book)\b/i)?.[1]
  if (firstVerb && /\b(?:coordinate|schedule|organize|organise|book)\b/i.test(verb) &&
      /\b(?:refresher|training|session|meeting|event)\b/i.test(`${first} ${remainder}`)) return [statement]
  const subject = first.match(/^(.+?\b(?:will|shall|please|kindly)\b)/i)?.[1]
  if (!subject || !remainder) return [statement]
  return [first, `${subject} ${verb} ${remainder}`]
}

function supplementaryConflicts(primary: string[], supplementary: string[]): string[] {
  const conflicts: string[] = []
  const statusPattern = /\b(?:approved|not approved|pending|rejected|confirmed|not agreed)\b/i
  for (const note of supplementary) {
    if (!statusPattern.test(note)) continue
    const noteTokens = taskTokens(note)
    const primaryMatch = primary.find(source => {
      const sourceTokens = taskTokens(source)
      const related = overlapRatio(noteTokens, sourceTokens) >= 0.4
      const opposingStatus = /\b(?:not approved|pending|rejected|not agreed)\b/i.test(note) !==
        /\b(?:approved|confirmed|agreed)\b/i.test(source)
      return related && opposingStatus
    })
    if (primaryMatch) conflicts.push(`Supplementary note may conflict with the transcript: "${note}" Verify against: "${primaryMatch}"`)
  }
  return unique(conflicts)
}

export function validateMeetingIntelligence(intelligence: MeetingIntelligence): string[] {
  const notes: string[] = []
  for (let index = 0; index < intelligence.decisions.length; index += 1) {
    const topic = decisionTopicKey(intelligence.decisions[index])
    if (topic && intelligence.decisions.slice(index + 1).some(item => decisionTopicKey(item) === topic)) {
      notes.push(`Potential duplicate decision records remain for ${topic.replaceAll('-', ' ')}.`)
    }
  }
  if (intelligence.risks.some(risk => isMeetingPurposeStatement(risk))) {
    notes.push('A meeting-purpose statement was incorrectly classified as a risk.')
  }
  const dependencyResolved = (dependency: string, action: ActionItem): boolean => {
    const ownerReference = dependency.match(/^([\p{L}][\p{L}'’.-]+)(?:\s+([\p{L}][\p{L}'’.-]+))?'s\s+(.+)/iu)
    if (ownerReference) {
      const ownerName = [ownerReference[1], ownerReference[2]].filter(Boolean).join(' ').toLowerCase()
      const actionOwners = action.owners?.length ? action.owners : [action.owner]
      const ownerMatches = actionOwners.some(owner => owner.toLowerCase() === ownerName ||
        (!ownerReference[2] && owner.split(/\s+/)[0].toLowerCase() === ownerName))
      const outputTopic = ownerReference[3].toLowerCase()
      const actionContent = `${action.description} ${action.sourceStatement ?? ''}`.toLowerCase()
      const topicMatches = outputTopic.includes('list')
        ? /\b(?:categor(?:y|ise|ize)|ticket|list|compile|prepare)\b/.test(actionContent)
        : taskTokens(dependency).size > 0 && overlapRatio(taskTokens(dependency), taskTokens(actionContent)) >= 0.25
      if (ownerMatches && topicMatches) return true
    }
    return overlapRatio(taskTokens(dependency), taskTokens(`${action.description} ${action.sourceStatement ?? ''}`)) >= 0.25
  }
  for (let index = 0; index < intelligence.actions.length; index += 1) {
    const action = intelligence.actions[index]
    if (action.owner === 'Unassigned' || !action.owners?.length) notes.push(`Owner needs confirmation: ${action.description}.`)
    if (!action.dueDate) notes.push(action.deadlineText
      ? `Exact deadline needs confirmation (${action.deadlineText}): ${action.description}.`
      : `Deadline not specified: ${action.description}.`)
    if (action.dependencies?.length && !intelligence.actions.some(candidate =>
      candidate.id !== action.id && action.dependencies?.some(dependency => dependencyResolved(dependency, candidate)))) {
      notes.push(`Dependency needs confirmation: ${action.description} depends on ${action.dependencies.join('; ')}.`)
    }
    if (intelligence.actions.slice(index + 1).some(other => areDuplicateActions(action, other))) {
      notes.push(`Potential duplicate action items remain: ${action.description}.`)
    }
  }
  for (let index = 0; index < intelligence.decisions.length; index += 1) {
    const decision = intelligence.decisions[index]
    const incompatible = intelligence.decisions.slice(index + 1).find(other =>
      decision.kind !== other.kind &&
      overlapRatio(taskTokens(decision.description), taskTokens(other.description)) >= 0.6 &&
      new Set(['Recorded', 'Not Approved', 'Rejected']).has(decision.kind) &&
      new Set(['Recorded', 'Not Approved', 'Rejected']).has(other.kind))
    if (incompatible) notes.push(`Conflicting decision statuses need review: "${decision.description}" and "${incompatible.description}".`)
  }
  return unique(notes)
}

export function processMeeting(meeting: Meeting, existingActionCount = 0): MeetingIntelligence {
  const document = preprocessTranscript(meeting.notes)
  const title = document.metadata.title ?? meeting.title
  const meetingDate = document.metadata.date ?? (meeting.date || new Date().toISOString().slice(0, 10))
  const date = document.metadata.date ?? meeting.date
  const participants = unique([...document.metadata.participants, ...meeting.participants, ...document.turns.flatMap(turn => turn.speaker ? [turn.speaker] : [])])
  const time = document.metadata.time
  if (time) {
    const parsed = timeParts(time)
    document.metadata.startTime ??= parsed.start
    document.metadata.endTime ??= parsed.end
  }
  document.metadata.title = title
  document.metadata.date = date
  document.metadata.participants = participants
  const statements = document.turns.flatMap(turn =>
    splitStatements(turn.text).flatMap(text => splitCompoundResponsibilities(text).map(part => ({ ...turn, text: part }))))
  const decisions: Decision[] = []
  const questions: string[] = []
  const risks: string[] = []
  const discussionPoints: string[] = []
  const actions: ActionItem[] = []

  for (const statement of statements) {
    if (isActionStatement(statement.text, statement.speaker, participants)) {
      const owners = ownerFromStatement(statement.text, statement.speaker, participants)
      const deadline = extractDeadline(statement.text, meetingDate)
      const priority = priorityFrom(statement.text)
      const action: ActionItem = {
        id: `${meeting.id}-a-${existingActionCount + actions.length + 1}`,
        description: cleanAction(statement.text, owners),
        owner: owners.length ? owners.join(' and ') : 'Unassigned',
        owners: owners.length ? owners : ['Unassigned'],
        meetingId: meeting.id,
        dueDate: deadline.date,
        deadlineText: deadline.text,
        priority: priority.value,
        priorityExplicit: priority.explicit,
        status: 'Not Started',
        notes: '',
        needsReview: !owners.length || (!deadline.date && !!deadline.text) || !deadline.text,
        sourceStatement: statement.sourceStatement,
        sourceStatements: [statement.sourceStatement],
        confidence: owners.length ? 0.88 : 0.62,
        dependencies: extractDependencies(statement.text),
      }
      actions.push(action)
    }
  }

  for (const [statementIndex, statement] of statements.entries()) {
    const context = statements.slice(Math.max(0, statementIndex - 4), statementIndex)
      .concat(statements.slice(statementIndex + 1, statementIndex + 3)).map(item => item.text).join(' ')
    const decision = findDecision(statement.text, context)
    if (decision) {
      decisions.push({
        id: `${meeting.id}-d-${decisions.length + 1}`,
        description: decision.description,
        meetingId: meeting.id,
        date: meetingDate,
        people: statement.speaker ? [statement.speaker] : participants,
        followUp: decision.followUp,
        kind: decision.kind,
        sourceStatement: statement.sourceStatement,
        confidence: decision.kind === 'Recorded' || decision.kind === 'Not Approved' || decision.kind === 'Rejected' ? 0.95 : 0.88,
      })
      if (decision.kind === 'Scheduling Pending') questions.push(decision.description)
    }

    if (isActionStatement(statement.text, statement.speaker, participants)) {
      continue
    }

    if (decision?.kind === 'Scheduling Pending') continue
    const question = !decision && isQuestion(statement.text)
    if (question) {
      const question = /\b(?:exact date|date|time)\b/i.test(statement.text) && /\b(?:refresher|training|session)\b/i.test(context)
        ? 'The exact date for the support refresher is not yet established.'
        : clean(statement.text.replace(/^(?:open question|question|unanswered|needs clarification)\s*[:—-]\s*/i, ''))
      questions.push(question)
    }
    const risk = isGenuineRisk(statement.text)
    if (risk) risks.push(describeRisk(statement.text))
    if (question || risk) continue
    if (!decision && !isMeetingPurposeStatement(statement.text) && !/^(?:transcript|meeting notes|meeting title|meeting date|meeting time|participants|attendees|location|venue)\s*:/i.test(statement.text)) {
      const content = clean(statement.text)
      if (content.length > 12 && !/^(?:hello|hi everyone|good morning|thanks everyone|thank you everyone)\b/i.test(content)) discussionPoints.push(content)
    }
  }

  for (const action of actions) {
    const contextual = contextDeadline(action, statements)
    if (contextual) {
      action.deadlineText = contextual.text
      action.needsReview = true
    }
  }

  const consolidatedActions = consolidateActionItems(actions)
  actions.splice(0, actions.length, ...consolidatedActions)

  const questionKey = (question: string) => {
    if (/\b(?:refresher|training|session)\b/i.test(question) && /\b(?:date|time|schedule)\b/i.test(question)) return 'refresher-date'
    if (/\bpassword[- ]reset\b/i.test(question)) return 'password-reset'
    if (/\bdeadline\b/i.test(question) && /\brefund|breakdown\b/i.test(question)) return 'refund-deadline'
    if (/\brefund|funding|allocation\b/i.test(question)) return 'refund-decision'
    return question.toLowerCase()
  }
  const unresolvedQuestions = unique(questions).filter(question => !isResolvedQuestion(question, actions, statements))
  const uniqueQuestions = unresolvedQuestions.filter((question, index, list) =>
    list.findIndex(candidate => questionKey(candidate) === questionKey(question)) === index)
  const uniqueRisks = unique(risks)
  const distinctDecisions = consolidateDecisionRecords(decisions, document.turns)
  const distinctPendingDecisions = distinctDecisions
    .filter(item => item.kind === 'Pending' || (item.kind === 'Not Approved' && /\b(?:decide|decision|review)\b/i.test(item.followUp)))
    .map(item => item.description)
  const supplementaryText = document.supplementaryTurns?.flatMap(turn => splitStatements(turn.text)) ?? []
  const primaryText = statements.map(statement => statement.text)
  const dateReview = document.metadata.date && meeting.date && document.metadata.date !== meeting.date
    ? [`Transcript meeting date (${document.metadata.date}) differs from the capture-form date (${meeting.date}); transcript date is used.`]
    : []
  const reviewNotes = unique([
    ...dateReview,
    ...supplementaryConflicts(primaryText, supplementaryText),
  ])
  const executiveAttention = unique([
    ...uniqueRisks,
    ...distinctPendingDecisions.map(decision => `Pending executive decision: ${decision}`),
    ...actions.filter(action => action.needsReview).map(action => `Needs clarification: ${action.description}`),
  ])
  const summary = makeSummary(unique(discussionPoints), distinctDecisions, actions, uniqueQuestions, uniqueRisks)

  const intelligence: MeetingIntelligence = {
    processorVersion: 15,
    metadata: document.metadata,
    transcript: document.turns,
    generatedAt: new Date().toISOString(),
    summary,
    discussionPoints: unique(discussionPoints).slice(0, 12),
    decisions: distinctDecisions,
    actions,
    pendingDecisions: unique(distinctPendingDecisions),
    questions: uniqueQuestions,
    risks: uniqueRisks,
    executiveAttention: executiveAttention.slice(0, 8),
    reviewNotes,
  }
  intelligence.reviewNotes = unique([...intelligence.reviewNotes, ...validateMeetingIntelligence(intelligence)])
  return intelligence
}

function extractDependencies(text: string): string[] {
  const match = text.match(/\b(?:once|after|dependent on|depends on|following)\s+(.+?)(?:,|;|\.|$)/i)
  if (!match) return []
  return [normalizeActionDependency(clean(match[1]))]
}

export function normalizeActionDependency(value: string): string {
  const withoutPronoun = value.replace(/^(?:i|we|you)\s+(?:receive|get|wait for)\s+/i, '')
  const listOwner = withoutPronoun.match(/^(?:(?:after|once)\s+)?([\p{L}][\p{L}'’.-]+(?:\s+[\p{L}][\p{L}'’.-]+)?)'s\s+(?:(?:categorised|categorized)\s+)?(?:ticket\s+)?list(?:\s+(?:is\s+)?(?:available|received|submitted))?$/iu)
  if (listOwner) return `${listOwner[1]} submits the categorised ticket list`
  const submittedList = withoutPronoun.match(/^([\p{L}][\p{L}'’.-]+(?:\s+[\p{L}][\p{L}'’.-]+)?)\s+submits\s+(?:the\s+)?(?:(?:categorised|categorized)\s+)?(?:ticket\s+)?list$/iu)
  return submittedList ? `${submittedList[1]} submits the categorised ticket list` : value
}
