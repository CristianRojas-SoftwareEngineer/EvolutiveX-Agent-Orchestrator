import { describe, it, expect } from 'vitest';
import { mapMinimaxTokenPlanRemains } from '../../src/2-services/subscription-quota/minimax-token-plan-remains.adapter.js';

const NOW_MS = 1_700_000_000_000;

describe('mapMinimaxTokenPlanRemains', () => {
  it('deriva used_percentage desde remaining_percent cuando counts son 0', () => {
    const remainsTime = 11_852_894;
    const result = mapMinimaxTokenPlanRemains(
      {
        model_remains: [
          {
            model_name: 'general',
            current_interval_total_count: 0,
            current_interval_usage_count: 0,
            current_interval_remaining_percent: 86,
            remains_time: remainsTime,
            current_weekly_total_count: 0,
            current_weekly_remaining_percent: 20,
            weekly_remains_time: 259_200_000,
          },
        ],
      },
      'general',
      NOW_MS,
    );

    expect(result.five_hour?.used_percentage).toBe(14);
    expect(result.seven_day?.used_percentage).toBe(80);
    expect(result.five_hour?.resets_at).toBe(Math.floor((NOW_MS + remainsTime) / 1000));
    expect(result.seven_day?.resets_at).toBe(Math.floor((NOW_MS + 259_200_000) / 1000));
  });

  it('retorna vacío si model_remains está ausente', () => {
    expect(mapMinimaxTokenPlanRemains({})).toEqual({});
    expect(mapMinimaxTokenPlanRemains({ model_remains: [] })).toEqual({});
  });
});
