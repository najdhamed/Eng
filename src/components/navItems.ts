import type { MessageKey } from '../i18n/translate';
import type { IconName } from '../icons/paths';
import type { RouteName } from '../router/useHashRoute';

export const NAV_ITEMS: readonly { route: RouteName; label: MessageKey; icon: IconName }[] = [
  { route: 'home', label: 'nav.home', icon: 'home' },
  { route: 'places', label: 'nav.places', icon: 'search' },
  { route: 'map', label: 'nav.map', icon: 'map' },
  { route: 'lost', label: 'nav.lost', icon: 'camera' },
];
