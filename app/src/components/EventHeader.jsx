import React from 'react';
import { NavLink } from 'react-router-dom';

/** Event title/description plus the Respond | Results | Manage tab strip. */
export default function EventHeader({ event, isOrganizer, hideDescription = false }) {
  return (
    <div className="event-header">
      <h1>{event.title}</h1>
      {!hideDescription && event.description && <p className="desc">{event.description}</p>}
      <nav className="event-tabs">
        <NavLink to={`/e/${event.token}`} end className={({ isActive }) => (isActive ? 'active' : '')}>
          Respond
        </NavLink>
        <NavLink to={`/e/${event.token}/results`} className={({ isActive }) => (isActive ? 'active' : '')}>
          Results
        </NavLink>
        {isOrganizer && (
          <NavLink to={`/e/${event.token}/manage`} className={({ isActive }) => (isActive ? 'active' : '')}>
            Manage
          </NavLink>
        )}
      </nav>
      {event.locked && (
        <div className="banner banner-locked">
          This form is locked — responses can no longer be added or changed.
        </div>
      )}
    </div>
  );
}
