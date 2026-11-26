import { createSupabaseClient } from '../config/supabase.js';
import { getAccountAccess } from '../utils/accountAccess.js';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearAuthCookies,
  setAuthCookies,
} from '../utils/authCookies.js';

export async function requireAuth(req, res, next) {
  res.set('Cache-Control', 'no-store');
  try {
    const accessToken = req.cookies[ACCESS_COOKIE];
    const refreshToken = req.cookies[REFRESH_COOKIE];

    if (!accessToken && !refreshToken) {
      return denyAccess(res, 401, 'Not authenticated.');
    }

    const supabase = createSupabaseClient(refreshToken ? undefined : accessToken);
    let authResult;
    if (accessToken && refreshToken) {
      authResult = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
    } else if (refreshToken) {
      authResult = await supabase.auth.refreshSession({ refresh_token: refreshToken });
    } else {
      authResult = await supabase.auth.getUser(accessToken);
    }

    const { data, error } = authResult;
    if (error?.status >= 500 || error?.name === 'AuthRetryableFetchError') throw error;
    if (error || !data?.user) {
      clearAuthCookies(res);
      return denyAccess(res, 401, 'Session expired. Please log in again.');
    }

    if (data.session && (data.session.access_token !== accessToken || data.session.refresh_token !== refreshToken)) {
      setAuthCookies(res, data.session);
    }
    const accountAccess = await getAccountAccess(supabase);
    if (accountAccess.suspended) {
      clearAuthCookies(res);
      return denyAccess(res, 403, 'This account is suspended.');
    }

    req.auth = { supabase, user: data.user, isAdmin: accountAccess.isAdmin };
    next();
  } catch (error) {
    console.error('Authentication middleware error:', error);
    return denyAccess(res, 500, 'Authentication check failed.');
  }
}

export function requireAdmin(req, res, next) {
  if (!req.auth.isAdmin) {
    return denyAccess(res, 403, 'Administrator access required.');
  }
  next();
}

function denyAccess(res, status, message) {
  if (res.locals.adminPage) {
    if (status === 401) return res.redirect('/pages/authentication/login/login.html');
    return res.status(status).type('text').send(message);
  }
  return res.status(status).json({ message });
}
