import React from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../App.jsx';

/** Shared chrome: top bar with brand + signed-in email, footer with build id. */
export default function Layout({ children, narrow = false }) {
  const { session } = useSession();
  return (
    <>
      <header className="site-header">
        <Link className="brand" to="/">
          Go<span>Time</span>
        </Link>
        <div className="spacer" />
        {session?.user?.email && <div className="who">{session.user.email}</div>}
      </header>
      <main className={narrow ? 'page narrow' : 'page'}>{children}</main>
      <footer className="site-footer">
        GoTime v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'}
        {' · '}
        {typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : ''}
      </footer>
    </>
  );
}
