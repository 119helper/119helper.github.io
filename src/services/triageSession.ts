import { loadStoredJson, saveStoredJson } from './privacySettings';
import type { TriageColor } from '../utils/triage';

export const TRIAGE_PATIENTS_KEY = '119helper-triage-patients';

export type TriageMode = 'adult' | 'child';
export type TriagePatientStatus = 'triaged' | 'treating' | 'waiting' | 'transferred';

export interface TriagePatient {
  id: string;
  incidentId: string | null;
  mode: TriageMode;
  color: TriageColor;
  label: string;
  createdAt: string;
  status?: TriagePatientStatus;
  destination?: string;
  note?: string;
}

const TRIAGE_COLORS = new Set<TriageColor>(['red', 'yellow', 'green', 'black']);
const TRIAGE_STATUSES = new Set<TriagePatientStatus>(['triaged', 'treating', 'waiting', 'transferred']);

function normalizedIncidentId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const incidentId = value.trim().slice(0, 80);
  return incidentId || null;
}

export function normalizeTriagePatients(value: unknown): TriagePatient[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry): TriagePatient[] => {
    if (!entry || typeof entry !== 'object') return [];
    const patient = entry as Partial<TriagePatient>;
    if (
      typeof patient.id !== 'string'
      || patient.id.trim() === ''
      || (patient.mode !== 'adult' && patient.mode !== 'child')
      || !TRIAGE_COLORS.has(patient.color as TriageColor)
    ) {
      return [];
    }

    const status = TRIAGE_STATUSES.has(patient.status as TriagePatientStatus)
      ? patient.status as TriagePatientStatus
      : 'triaged';

    return [{
      id: patient.id.trim().slice(0, 80),
      incidentId: normalizedIncidentId(patient.incidentId),
      mode: patient.mode,
      color: patient.color as TriageColor,
      label: typeof patient.label === 'string' ? patient.label.trim().slice(0, 120) : '',
      createdAt: typeof patient.createdAt === 'string'
        ? patient.createdAt.trim().slice(0, 80)
        : '',
      status,
      destination: typeof patient.destination === 'string'
        ? patient.destination.slice(0, 160)
        : '',
      note: typeof patient.note === 'string' ? patient.note.slice(0, 500) : '',
    }];
  });
}

export function patientsForIncident(
  patients: readonly TriagePatient[],
  incidentId: string | null | undefined,
): TriagePatient[] {
  const normalized = normalizedIncidentId(incidentId);
  return patients.filter(patient => patient.incidentId === normalized);
}

export function loadTriagePatients(): TriagePatient[] {
  return loadStoredJson<TriagePatient[]>(
    TRIAGE_PATIENTS_KEY,
    [],
    normalizeTriagePatients,
  );
}

export function saveTriagePatients(patients: readonly TriagePatient[]): void {
  saveStoredJson(TRIAGE_PATIENTS_KEY, normalizeTriagePatients(patients));
}

export function removeTriagePatientsForIncident(incidentId: string): void {
  const normalized = normalizedIncidentId(incidentId);
  if (!normalized) return;
  saveTriagePatients(loadTriagePatients().filter(patient => patient.incidentId !== normalized));
}
