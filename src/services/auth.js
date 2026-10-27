const UNAVAILABLE_MESSAGE = "We couldn't verify your session. Check your connection and try again.";
const SIGN_IN_UNAVAILABLE_MESSAGE = "Sign-in is temporarily unavailable. Try again later.";

function safeUser(value) {
  if (!value || typeof value !== 'object'
    || typeof value.email !== 'string' || !value.email.trim()
    || typeof value.displayName !== 'string' || !value.displayName.trim()
    || !['admin', 'user'].includes(value.role)) return null;
  return { email: value.email, displayName: value.displayName, role: value.role };
}

async function responseBody(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function signInError(code) {
  if (code === 'UNAUTHENTICATED') return 'Email or password is incorrect.';
  if (code === 'RATE_LIMITED') return 'Too many sign-in attempts. Wait a few minutes and try again.';
  if (code === 'INVALID_INPUT') return 'Check your email and password, then try again.';
  return SIGN_IN_UNAVAILABLE_MESSAGE;
}

export async function getCurrentUser({ fetchImpl = fetch, signal } = {}) {
  let response;
  try {
    response = await fetchImpl('/api/auth/me', {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new Error(UNAVAILABLE_MESSAGE, { cause: error });
  }
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(UNAVAILABLE_MESSAGE);

  const body = await responseBody(response);
  const user = safeUser(body?.data?.user);
  if (!user) throw new Error(UNAVAILABLE_MESSAGE);
  return user;
}

export async function signIn(email, password, { fetchImpl = fetch } = {}) {
  let response;
  try {
    response = await fetchImpl('/api/auth/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    throw new Error(SIGN_IN_UNAVAILABLE_MESSAGE);
  }

  const body = await responseBody(response);
  if (!response.ok) throw new Error(signInError(body?.error?.code));
  const user = safeUser(body?.data?.user);
  if (!user) throw new Error(SIGN_IN_UNAVAILABLE_MESSAGE);
  return user;
}

export async function signOut({ fetchImpl = fetch } = {}) {
  let response;
  try {
    response = await fetchImpl('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new Error('Unable to sign out. Check your connection and try again.');
  }
  if (!response.ok && response.status !== 401) {
    throw new Error('Unable to sign out. Check your connection and try again.');
  }
}

export function getSafeReturnTo(destination, origin) {
  if (typeof destination !== 'string' || !destination.startsWith('/') || destination.startsWith('//') || destination.includes('\\')) return null;
  try {
    const url = new URL(destination, origin);
    if (url.origin !== origin || url.pathname === '/login') return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}
