// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadTriagePatients,
  normalizeTriagePatients,
  patientsForIncident,
  removeTriagePatientsForIncident,
  saveTriagePatients,
} from './triageSession';

describe('triageSession', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('keeps legacy patients unassigned instead of guessing an incident', () => {
    const patients = normalizeTriagePatients([{
      id: 'legacy-1',
      mode: 'adult',
      color: 'red',
      label: '환자 1',
      createdAt: '오전 10:00',
    }]);

    expect(patients).toEqual([expect.objectContaining({
      id: 'legacy-1',
      incidentId: null,
      status: 'triaged',
    })]);
    expect(patientsForIncident(patients, 'incident-a')).toEqual([]);
    expect(patientsForIncident(patients, null)).toHaveLength(1);
  });

  it('returns only patients that belong to the requested incident', () => {
    const patients = normalizeTriagePatients([
      {
        id: 'a-1',
        incidentId: 'incident-a',
        mode: 'adult',
        color: 'yellow',
        label: 'A 환자',
        createdAt: '오전 10:01',
      },
      {
        id: 'b-1',
        incidentId: 'incident-b',
        mode: 'child',
        color: 'green',
        label: 'B 환자',
        createdAt: '오전 10:02',
      },
    ]);

    expect(patientsForIncident(patients, 'incident-a').map(patient => patient.id)).toEqual(['a-1']);
    expect(patientsForIncident(patients, 'incident-b').map(patient => patient.id)).toEqual(['b-1']);
  });

  it('drops malformed records and bounds user-entered fields', () => {
    const patients = normalizeTriagePatients([
      null,
      { id: '', mode: 'adult', color: 'red' },
      {
        id: 'valid',
        incidentId: ' x '.repeat(100),
        mode: 'adult',
        color: 'red',
        label: '가'.repeat(200),
        createdAt: '오전 10:03',
        destination: '나'.repeat(300),
        note: '다'.repeat(800),
      },
    ]);

    expect(patients).toHaveLength(1);
    expect(patients[0].incidentId?.length).toBeLessThanOrEqual(80);
    expect(patients[0].label.length).toBe(120);
    expect(patients[0].destination?.length).toBe(160);
    expect(patients[0].note?.length).toBe(500);
  });

  it('removes only the closed incident patients and preserves other scopes', () => {
    saveTriagePatients(normalizeTriagePatients([
      {
        id: 'a-1',
        incidentId: 'incident-a',
        mode: 'adult',
        color: 'red',
        label: 'A 환자',
        createdAt: '오전 10:01',
      },
      {
        id: 'b-1',
        incidentId: 'incident-b',
        mode: 'adult',
        color: 'yellow',
        label: 'B 환자',
        createdAt: '오전 10:02',
      },
      {
        id: 'legacy-1',
        mode: 'adult',
        color: 'green',
        label: '독립 환자',
        createdAt: '오전 10:03',
      },
    ]));

    removeTriagePatientsForIncident('incident-a');

    expect(loadTriagePatients().map(patient => patient.id)).toEqual(['b-1', 'legacy-1']);
  });
});
