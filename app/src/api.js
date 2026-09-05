/**
 * api.js — every network call in one place, as one async interface
 * (the pattern that made the khomas scenario tool easy to extend).
 *
 * Respondent paths use the token-gated RPCs; organizer paths use RLS-scoped
 * table access. All functions throw Error with a message that
 * friendlyError() in supabaseClient.js knows how to translate.
 */

import { getSupabase } from './supabaseClient.js';

async function client() {
  const supabase = await getSupabase();
  if (!supabase) throw new Error('failed to fetch');
  return supabase;
}

function unwrap({ data, error }) {
  if (error) throw new Error(error.message || String(error));
  return data;
}

// ---------------------------------------------------------------- respondent

/** Full event payload, filtered server-side by role and event settings. */
export async function getEvent(token) {
  const supabase = await client();
  return unwrap(await supabase.rpc('get_event', { p_token: token }));
}

/**
 * Create or update a response. fields = { name, email, availability,
 * answers }.
 */
export async function saveResponse(token, responseId, fields, claim = false) {
  const supabase = await client();
  return unwrap(
    await supabase.rpc('save_response', {
      p_token: token,
      p_response_id: responseId || null,
      p_fields: fields,
      p_claim: claim,
    }),
  );
}

export async function addComment(token, authorName, body, responseId = null) {
  const supabase = await client();
  return unwrap(
    await supabase.rpc('add_comment', {
      p_token: token,
      p_author_name: authorName,
      p_body: body,
      p_response_id: responseId,
    }),
  );
}

export async function suggestDate(token, date) {
  const supabase = await client();
  return unwrap(await supabase.rpc('suggest_date', { p_token: token, p_date: date }));
}

// ---------------------------------------------------------------- auth

export async function sendMagicLink(email) {
  const supabase = await client();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.href },
  });
  if (error) throw new Error(error.message);
}

export async function signOut() {
  const supabase = await client();
  await supabase.auth.signOut();
}

// ---------------------------------------------------------------- organizer

/** Events where the signed-in user is an organizer, newest first. */
export async function listMyEvents() {
  const supabase = await client();
  const rows = unwrap(
    await supabase
      .from('events')
      .select('id, token, title, locked, archived, created_at, granularity, weekdays, event_dates(date)')
      .order('created_at', { ascending: false }),
  );
  return rows || [];
}

/**
 * Create an event plus its dates and questions in one go.
 * settings: { title, description, timezone, slot_minutes, day_start,
 * day_end, preference_levels, responses_visible, anonymize_names,
 * allow_suggestions, granularity, weekdays }; dates: ["yyyy-MM-dd"]
 * (empty for recurring events, which use settings.weekdays instead);
 * questions: [{type,label,options,required}]
 */
export async function createEvent(userId, settings, dates, questions) {
  const supabase = await client();
  const event = unwrap(
    await supabase
      .from('events')
      .insert({ ...settings, created_by: userId })
      .select()
      .single(),
  );
  if (dates.length) {
    unwrap(
      await supabase
        .from('event_dates')
        .insert(dates.map((date) => ({ event_id: event.id, date }))),
    );
  }
  if (questions.length) {
    unwrap(
      await supabase.from('questions').insert(
        questions.map((q, i) => ({
          event_id: event.id,
          type: q.type,
          label: q.label,
          options: q.options || [],
          required: Boolean(q.required),
          position: i,
        })),
      ),
    );
  }
  return event;
}

export async function updateEvent(eventId, patch) {
  const supabase = await client();
  return unwrap(
    await supabase.from('events').update(patch).eq('id', eventId).select().single(),
  );
}

/**
 * Permanently delete an event and everything attached to it (dates,
 * questions, responses, comments, co-organizers all cascade). RLS allows
 * this only for the event's owner, not co-organizers.
 */
export async function deleteEvent(eventId) {
  const supabase = await client();
  unwrap(await supabase.from('events').delete().eq('id', eventId));
}

export async function addEventDate(eventId, date) {
  const supabase = await client();
  return unwrap(
    await supabase
      .from('event_dates')
      .upsert({ event_id: eventId, date, approved: true }, { onConflict: 'event_id,date' })
      .select()
      .single(),
  );
}

export async function setDateApproval(dateId, approved) {
  const supabase = await client();
  return unwrap(
    await supabase.from('event_dates').update({ approved }).eq('id', dateId).select().single(),
  );
}

export async function removeEventDate(dateId) {
  const supabase = await client();
  unwrap(await supabase.from('event_dates').delete().eq('id', dateId));
}

/** Replace the question list (simple + predictable for a small editor). */
export async function replaceQuestions(eventId, questions) {
  const supabase = await client();
  unwrap(await supabase.from('questions').delete().eq('event_id', eventId));
  if (questions.length) {
    unwrap(
      await supabase.from('questions').insert(
        questions.map((q, i) => ({
          event_id: eventId,
          type: q.type,
          label: q.label,
          options: q.options || [],
          required: Boolean(q.required),
          position: i,
        })),
      ),
    );
  }
}

export async function deleteResponse(responseId) {
  const supabase = await client();
  unwrap(await supabase.from('responses').delete().eq('id', responseId));
}

export async function deleteComment(commentId) {
  const supabase = await client();
  unwrap(await supabase.from('comments').delete().eq('id', commentId));
}

// ---------------------------------------------------------------- team

export async function searchProfiles(query) {
  const supabase = await client();
  return unwrap(await supabase.rpc('search_profiles', { p_query: query })) || [];
}

export async function listOrganizers(eventId) {
  const supabase = await client();
  return unwrap(await supabase.rpc('list_event_organizers', { p_event: eventId })) || [];
}

export async function addOrganizer(eventId, userId) {
  const supabase = await client();
  unwrap(
    await supabase
      .from('event_organizers')
      .insert({ event_id: eventId, user_id: userId, role: 'co' }),
  );
}

export async function removeOrganizer(eventId, userId) {
  const supabase = await client();
  unwrap(
    await supabase
      .from('event_organizers')
      .delete()
      .eq('event_id', eventId)
      .eq('user_id', userId)
      .eq('role', 'co'),
  );
}

/**
 * Events the signed-in user has responded to (their claimed responses),
 * newest first — excluding events they organize, which listMyEvents covers.
 */
export async function listMyResponses() {
  const supabase = await client();
  return unwrap(await supabase.rpc('list_my_responses')) || [];
}

export async function getMyProfile() {
  const supabase = await client();
  const { data } = await supabase.auth.getUser();
  const uid = data?.user?.id;
  if (!uid) return null;
  return unwrap(await supabase.from('profiles').select('*').eq('id', uid).maybeSingle());
}

/** Save (or clear) this user's own published-calendar ICS URL. */
export async function updateMyIcsUrl(icsUrl) {
  const supabase = await client();
  const { data } = await supabase.auth.getUser();
  const uid = data?.user?.id;
  if (!uid) throw new Error('not_authenticated');
  unwrap(await supabase.from('profiles').update({ ics_url: icsUrl.trim() }).eq('id', uid));
}

/**
 * Fetch this user's published calendar via the fetch-ics edge function
 * (browsers can't request Outlook/Google ICS URLs directly). Pass a url to
 * preview one before saving; omit it to use the saved one.
 * Returns the raw ICS text.
 */
export async function fetchMyCalendarIcs(url) {
  const supabase = await client();
  const { data, error } = await supabase.functions.invoke('fetch-ics', {
    body: url ? { url } : {},
  });
  if (error) {
    // Edge errors carry the reason in the response body.
    let detail = '';
    try {
      detail = (await error.context?.json())?.error || '';
    } catch {
      /* not json */
    }
    throw new Error(detail || error.message || 'fetch_failed');
  }
  if (!data?.ics) throw new Error(data?.error || 'fetch_failed');
  return data.ics;
}

export async function updateMyDisplayName(displayName) {
  const supabase = await client();
  const { data } = await supabase.auth.getUser();
  const uid = data?.user?.id;
  if (!uid) throw new Error('not_authenticated');
  unwrap(
    await supabase.from('profiles').update({ display_name: displayName }).eq('id', uid),
  );
}
