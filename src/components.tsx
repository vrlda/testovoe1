import type { ReactNode } from 'react';

export function Shell({
  children,
  admin = false,
  onSignOut,
}: {
  children: ReactNode;
  admin?: boolean;
  onSignOut?: () => void;
}) {
  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <a className="wordmark" href={admin ? '/admin' : '/'}>
          Funnel
        </a>
        <div className="header-actions">
          <a href={admin ? '/' : '/admin'}>{admin ? 'Open funnel' : 'Admin'}</a>
          {onSignOut && (
            <button className="text-button" onClick={onSignOut}>
              Sign out
            </button>
          )}
        </div>
      </header>
      {children}
    </div>
  );
}
export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return (
    <p className={error ? 'notice error' : 'notice'} role={error ? 'alert' : 'status'}>
      {children}
    </p>
  );
}
