import type {
  SubscriptionQuotaFile,
  SubscriptionQuotaWindow,
} from '../../1-domain/types/subscription-quota.types.js';

export interface MinimaxModelRemains {
  model_name?: string;
  current_interval_total_count?: number;
  current_interval_usage_count?: number;
  current_interval_remaining_percent?: number;
  remains_time?: number;
  end_time?: number;
  current_weekly_total_count?: number;
  current_weekly_usage_count?: number;
  current_weekly_remaining_percent?: number;
  weekly_remains_time?: number;
  weekly_end_time?: number;
}

export interface MinimaxTokenPlanRemainsResponse {
  model_remains?: MinimaxModelRemains[];
}

function computeUsedPercentage(
  totalCount: number | undefined,
  usageCount: number | undefined,
  remainingPercent: number | undefined,
): number | null {
  if (
    typeof totalCount === 'number' &&
    totalCount > 0 &&
    typeof usageCount === 'number' &&
    usageCount >= 0
  ) {
    return Math.round((usageCount / totalCount) * 100);
  }
  if (
    typeof remainingPercent === 'number' &&
    Number.isFinite(remainingPercent) &&
    remainingPercent >= 0 &&
    remainingPercent <= 100
  ) {
    return Math.round(100 - remainingPercent);
  }
  return null;
}

function computeResetsAt(
  nowMs: number,
  remainsTimeMs: number | undefined,
  endTimeMs: number | undefined,
): number | null {
  if (typeof remainsTimeMs === 'number' && remainsTimeMs > 0) {
    return Math.floor((nowMs + remainsTimeMs) / 1000);
  }
  if (typeof endTimeMs === 'number' && Number.isFinite(endTimeMs) && endTimeMs > 0) {
    return Math.floor(endTimeMs / 1000);
  }
  return null;
}

function buildWindow(
  usedPercentage: number | null,
  resetsAt: number | null,
): SubscriptionQuotaWindow | null {
  const window: SubscriptionQuotaWindow = {};
  if (usedPercentage !== null) window.used_percentage = usedPercentage;
  if (resetsAt !== null) window.resets_at = resetsAt;
  if (window.used_percentage == null && window.resets_at == null) return null;
  return window;
}

/** Mapea la respuesta de GET /v1/token_plan/remains al shape de subscription-quota.json. */
export function mapMinimaxTokenPlanRemains(
  response: MinimaxTokenPlanRemainsResponse,
  modelFilter = 'general',
  nowMs = Date.now(),
): Pick<SubscriptionQuotaFile, 'five_hour' | 'seven_day'> {
  const remains = response.model_remains ?? [];
  if (remains.length === 0) return {};

  const entry = remains.find((m) => m.model_name === modelFilter) ?? remains[0];

  const fiveHour = buildWindow(
    computeUsedPercentage(
      entry.current_interval_total_count,
      entry.current_interval_usage_count,
      entry.current_interval_remaining_percent,
    ),
    computeResetsAt(nowMs, entry.remains_time, entry.end_time),
  );

  const sevenDay = buildWindow(
    computeUsedPercentage(
      entry.current_weekly_total_count,
      entry.current_weekly_usage_count,
      entry.current_weekly_remaining_percent,
    ),
    computeResetsAt(nowMs, entry.weekly_remains_time, entry.weekly_end_time),
  );

  const result: Pick<SubscriptionQuotaFile, 'five_hour' | 'seven_day'> = {};
  if (fiveHour) result.five_hour = fiveHour;
  if (sevenDay) result.seven_day = sevenDay;
  return result;
}
