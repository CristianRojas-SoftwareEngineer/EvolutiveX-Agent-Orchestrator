/** Ventana de cuota normalizada (5h o 7d). */
export interface SubscriptionQuotaWindow {
  used_percentage?: number | null;
  resets_at?: number | null;
}

/** Artefacto persistido en sessions/<dir>/subscription-quota.json. */
export interface SubscriptionQuotaFile {
  fetched_at: string;
  provider: string;
  adapter: string;
  five_hour?: SubscriptionQuotaWindow;
  seven_day?: SubscriptionQuotaWindow;
}

/** Bloque declarativo en routing/providers/<name>/config.json. */
export interface SubscriptionQuotaProviderConfig {
  enabled: boolean;
  adapter: string;
  endpoint: string;
  auth_credential: string;
  model_filter?: string;
  refresh_interval_seconds?: number;
}
