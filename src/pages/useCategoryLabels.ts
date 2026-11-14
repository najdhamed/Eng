import { useMemo } from 'react';
import { useI18n } from '../i18n/I18nContext';

export const CATEGORY_FILTERS = [
  'all',
  'clinic',
  'diagnostic',
  'service',
  'facility',
  'ward',
  'emergency',
] as const;
export type CategoryFilter = (typeof CATEGORY_FILTERS)[number];

/** Category names in both languages, so "عيادات" or "clinics" finds every clinic. */
export function useCategoryLabels(): Record<string, string> {
  const { t } = useI18n();
  return useMemo(
    () => ({
      clinic: t('cat.clinic'),
      diagnostic: t('cat.diagnostic'),
      service: t('cat.service'),
      facility: t('cat.facility'),
      ward: t('cat.ward'),
      emergency: t('cat.emergency'),
    }),
    [t],
  );
}
