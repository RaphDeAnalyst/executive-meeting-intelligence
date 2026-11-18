import type { AppData } from '../types'
import { initialDemoData } from '../data/demoData'

const STORAGE_KEY = 'executive-meeting-intelligence:v1'

export function loadAppData(): AppData {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return structuredClone(initialDemoData)
  const parsed: unknown = JSON.parse(raw)
  if (!isAppData(parsed)) {
    throw new Error('Saved meeting data is in an unexpected format. Clear saved data in Settings to restore the demo workspace.')
  }
  return parsed
}

export function saveAppData(data: AppData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function clearSavedData(): void {
  localStorage.removeItem(STORAGE_KEY)
}

function isAppData(value: unknown): value is AppData {
  if (!value || typeof value !== 'object') return false
  const data = value as Record<string, unknown>
  return Array.isArray(data.meetings) && Array.isArray(data.actions) && Array.isArray(data.decisions)
}
