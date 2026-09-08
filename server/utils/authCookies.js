import { env } from '../config/env.js';

export const ACCESS_COOKIE = 'lada_access_token';
export const REFRESH_COOKIE = 'lada_refresh_token';

const baseCookieOptions = {
  httpOnly: true,
  secure: env.nodeEnv === 'production',
  sameSite: 'lax',
  path: '/',
};

export function setAuthCookies(res, session) {
  const accessMaxAge = Math.max(Number(session.expires_in || 3600), 60) * 1000;
  const refreshMaxAge = 30 * 24 * 60 * 60 * 1000;

  res.cookie(ACCESS_COOKIE, session.access_token, {
    ...baseCookieOptions,
    maxAge: accessMaxAge,
  });

  res.cookie(REFRESH_COOKIE, session.refresh_token, {
    ...baseCookieOptions,
    maxAge: refreshMaxAge,
  });
}

export function clearAuthCookies(res) {
  res.clearCookie(ACCESS_COOKIE, baseCookieOptions);
  res.clearCookie(REFRESH_COOKIE, baseCookieOptions);
}
