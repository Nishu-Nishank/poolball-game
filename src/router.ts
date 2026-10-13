import { useSyncExternalStore } from 'react';

/** The app has four screens, so a tiny History API router avoids a routing dependency. */
export type RouteId = 'dashboard' | 'login' | 'admin' | 'users';

export const ROUTE_PATHS: Record<RouteId, string> = {
  dashboard: '/',
  login: '/login',
  admin: '/admin',
  users: '/admin/users',
};

export function routeFromPath(pathname: string): RouteId {
  const path = pathname.replace(/\/+$/, '') || '/';
  const match = (Object.entries(ROUTE_PATHS) as [RouteId, string][]).find(([, p]) => p === path);
  return match?.[0] ?? 'dashboard';
}

const NAVIGATE_EVENT = 'app:navigate';

export function navigate(route: RouteId, options: { replace?: boolean } = {}) {
  const path = ROUTE_PATHS[route];
  if (window.location.pathname !== path) {
    window.history[options.replace ? 'replaceState' : 'pushState'](null, '', path);
    window.dispatchEvent(new Event(NAVIGATE_EVENT));
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener('popstate', onChange);
  window.addEventListener(NAVIGATE_EVENT, onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(NAVIGATE_EVENT, onChange);
  };
}

export function useRoute(): RouteId {
  return routeFromPath(useSyncExternalStore(subscribe, () => window.location.pathname));
}

/** Props for an <a> that navigates client-side but still works as a normal link (new tab, copy). */
export function linkProps(route: RouteId) {
  return {
    href: ROUTE_PATHS[route],
    onClick: (e: { preventDefault: () => void; metaKey?: boolean; ctrlKey?: boolean; button?: number }) => {
      if (e.metaKey || e.ctrlKey || (e.button !== undefined && e.button !== 0)) return;
      e.preventDefault();
      navigate(route);
    },
  };
}
