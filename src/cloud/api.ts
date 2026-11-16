/**
 * The few Supabase calls Engram Cloud makes, written with fetch so there is no
 * SDK to bundle. Only the project's public address and publishable key are in
 * the app; every call that touches data carries the signed-in person's own token.
 */
export const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
export const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '';

/** False in a build made without the cloud's address and key. Engram then works exactly as before, with no cloud option. */
export const cloudConfigured = /^https:\/\/.+/.test(SUPABASE_URL) && SUPABASE_KEY.length > 10;

export type Session = { access_token: string; refresh_token: string; expires_at: number; user: { id: string; email: string } };

export class CloudError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

/** Turns the server's wording into something a person can act on. */
function explain(status: number, body: Record<string, unknown>): CloudError {
  const code = String(body.error_code ?? body.code ?? body.error ?? '');
  const raw = String(body.msg ?? body.message ?? body.error_description ?? body.error ?? '');
  let message = raw || `Engram Cloud answered with an error (${status}).`;
  if (code === 'invalid_credentials' || /invalid login/i.test(raw)) message = 'That email and password do not match an account.';
  else if (code === 'email_not_confirmed') message = 'Confirm your email first: open the message Engram Cloud sent you and tap the link, then sign in here.';
  else if (code === 'user_already_exists' || /already registered/i.test(raw)) message = 'There is already an account for that email. Sign in instead.';
  else if (code === 'weak_password' || /password should be/i.test(raw)) message = 'Choose a longer password: at least 8 characters.';
  else if (code === 'over_email_send_rate_limit' || status === 429) message = 'Too many attempts just now. Wait a few minutes and try again.';
  else if (code === 'validation_failed' || /valid email/i.test(raw)) message = 'That does not look like an email address.';
  return new CloudError(message, status, code);
}

async function call(path: string, init: { method?: string; token?: string; body?: unknown } = {}): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}${path}`, {
      method: init.method ?? 'POST',
      // The project key always goes in `apikey`. `Authorization` is only for a signed-in
      // person's own token: Supabase's publishable keys are not accepted there.
      headers: {
        apikey: SUPABASE_KEY,
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
        'Content-Type': 'application/json',
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new CloudError('Engram Cloud could not be reached. Check your connection; your thoughts are safe on this phone.', 0, 'offline');
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) throw explain(res.status, (body ?? {}) as Record<string, unknown>);
  return body;
}

type TokenReply = { access_token?: string; refresh_token?: string; expires_in?: number; user?: { id: string; email?: string } };

function toSession(r: TokenReply): Session | null {
  if (!r.access_token || !r.refresh_token || !r.user) return null;
  return {
    access_token: r.access_token,
    refresh_token: r.refresh_token,
    expires_at: Date.now() + (r.expires_in ?? 3600) * 1000,
    user: { id: r.user.id, email: r.user.email ?? '' },
  };
}

/** Creates an account. Returns a session, or null when the email must be confirmed first. */
export async function signUp(email: string, password: string): Promise<Session | null> {
  return toSession((await call('/auth/v1/signup', { body: { email, password } })) as TokenReply);
}

export async function signIn(email: string, password: string): Promise<Session> {
  const s = toSession((await call('/auth/v1/token?grant_type=password', { body: { email, password } })) as TokenReply);
  if (!s) throw new CloudError('Signing in did not work. Try again.', 0);
  return s;
}

export async function refresh(refreshToken: string): Promise<Session> {
  const s = toSession((await call('/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: refreshToken } })) as TokenReply);
  if (!s) throw new CloudError('Your session has ended. Sign in again.', 401);
  return s;
}

export async function signOut(token: string): Promise<void> {
  await call('/auth/v1/logout?scope=local', { token }).catch(() => {});
}

export function rpc<T>(name: string, args: Record<string, unknown>, token: string): Promise<T> {
  return call(`/rest/v1/rpc/${name}`, { token, body: args }) as Promise<T>;
}

export function select<T>(query: string, token?: string): Promise<T> {
  return call(`/rest/v1/${query}`, { method: 'GET', token }) as Promise<T>;
}

/** Deletes the account and every row it owns in the cloud. */
export async function deleteAccount(token: string): Promise<void> {
  await call('/functions/v1/delete-account', { token, body: {} });
}
