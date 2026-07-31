import { describe, expect, it } from 'vitest';
import type { IncidentType } from '../services/incidentSession';
import {
  getIncidentActionOrder,
  type IncidentActionCardId,
} from './incidentActionOrder';

describe('getIncidentActionOrder', () => {
  it.each([
    ['fire', ['fireWater', 'road', 'hospital']],
    ['ems', ['hospital', 'road', 'fireWater']],
    ['rescue', ['road', 'hospital', 'fireWater']],
    ['support', ['road', 'fireWater', 'hospital']],
  ] satisfies Array<[IncidentType, IncidentActionCardId[]]>)(
    'returns the operational card order for %s incidents',
    (incidentType, expectedOrder) => {
      expect(getIncidentActionOrder(incidentType)).toEqual(expectedOrder);
    },
  );

  it.each<IncidentType>(['fire', 'ems', 'rescue', 'support'])(
    'includes each action card exactly once for %s incidents',
    incidentType => {
      const order = getIncidentActionOrder(incidentType);

      expect(order).toHaveLength(3);
      expect(new Set(order)).toEqual(new Set<IncidentActionCardId>([
        'road',
        'fireWater',
        'hospital',
      ]));
    },
  );
});
