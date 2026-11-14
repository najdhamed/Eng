import { useI18n } from '../i18n/I18nContext';
import type { RouteName } from '../router/useHashRoute';
import { Icon } from './Icon';
import { NAV_ITEMS } from './navItems';

/** Thumb-reach navigation for phones; wider screens use the links in the header. */
export function BottomNav({ route }: { route: RouteName }) {
  const { t } = useI18n();
  return (
    <nav className="bottomnav" aria-label={t('nav.main')}>
      {NAV_ITEMS.map((item) => {
        const current = route === item.route;
        return (
          <a
            key={item.route}
            href={`#${item.route}`}
            className={
              item.route === 'lost' ? 'bottomnav__link bottomnav__link--lost' : 'bottomnav__link'
            }
            aria-current={current ? 'page' : undefined}
          >
            <span className="bottomnav__icon">
              <Icon name={item.icon} size={24} strokeWidth={current ? 2.2 : 1.8} />
            </span>
            <span className="bottomnav__label">{t(item.label)}</span>
          </a>
        );
      })}
    </nav>
  );
}
