import { createSupabaseClient } from '../config/supabase.js';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearAuthCookies,
  setAuthCookies,
} from '../utils/authCookies.js';

export async function requireAuth(req, res, next) {
  try {
    const accessToken = req.cookies[ACCESS_COOKIE];
    const refreshToken = req.cookies[REFRESH_COOKIE];

    if (!accessToken && !refreshToken) {
      return res.status(401).json({ message: 'Not authenticated.' });
    }

    const supabase = createSupabaseClient();
    let authResult;

    if (accessToken && refreshToken) {
      authResult = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
    } else if (refreshToken) {
      authResult = await supabase.auth.refreshSession({
        refresh_token: refreshToken,
      });
    }

    if (authResult.error || !authResult.data.session) {
      clearAuthCookies(res);
      return res.status(401).json({ message: 'Session expired. Please log in again.' });
    }

    const session = authResult.data.session;
    setAuthCookies(res, session);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(session.access_token);

    if (userError || !user) {
      clearAuthCookies(res);
      return res.status(401).json({ message: 'Invalid session.' });
    }

    req.auth = { supabase, session, user };
    next();
  } catch (error) {
    console.error('Authentication middleware error:', error);
    clearAuthCookies(res);
    return res.status(500).json({ message: 'Authentication check failed.' });
  }
}
