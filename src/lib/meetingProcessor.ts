import type { MeetingProcessor } from '../types'
import { processMeeting } from './meetingEngine'

export const meetingProcessor: MeetingProcessor = {
  process: processMeeting,
}
