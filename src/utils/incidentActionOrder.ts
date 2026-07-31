import type { IncidentType } from '../services/incidentSession';

export type IncidentActionCardId = 'road' | 'fireWater' | 'hospital';

const INCIDENT_ACTION_ORDER = {
  fire: ['fireWater', 'road', 'hospital'],
  ems: ['hospital', 'road', 'fireWater'],
  rescue: ['road', 'hospital', 'fireWater'],
  support: ['road', 'fireWater', 'hospital'],
} as const satisfies Record<IncidentType, readonly IncidentActionCardId[]>;

export function getIncidentActionOrder(
  incidentType: IncidentType,
): readonly IncidentActionCardId[] {
  return INCIDENT_ACTION_ORDER[incidentType];
}
