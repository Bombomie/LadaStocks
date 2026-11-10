import express from 'express';
import { createSupabaseClient } from '../config/supabase.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearAuthCookies,
  setAuthCookies,
} from '../utils/authCookies.js';

const router = express.Router();

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

router.post('/register', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const birthDate = String(req.body.birthDate || '').trim();
    const password = String(req.body.password || '');

    if (!username || !email || !birthDate || !password) {
      return res.status(400).json({ message: 'Please fill out all required fields.' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: 'Please enter a valid email address.' });
    }

    if (!isIsoDate(birthDate)) {
      return res.status(400).json({ message: 'Please enter a valid birth date.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long.' });
    }

    const supabase = createSupabaseClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
          birth_date: birthDate,
        },
      },
    });

    if (error) {
      console.error('Supabase registration error:', error.message);
      return res.status(400).json({
        message: error.message || 'Registration failed.',
      });
    }

    return res.status(201).json({
      message: data.session
        ? 'Account created successfully. You can now log in.'
        : 'Account created. Check your email if email confirmation is enabled.',
      requiresEmailConfirmation: !data.session,
    });
  } catch (error) {
    console.error('Registration route error:', error);
    return res.status(500).json({ message: 'Registration failed.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: 'Please enter a valid email address.' });
    }

    const supabase = createSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data.session || !data.user) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    setAuthCookies(res, data.session);

    // RLS allows an authenticated user to update their own profile.
    const { error: loginUpdateError } = await supabase
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('user_id', data.user.id);

    if (loginUpdateError) {
      // Login itself is still valid; log this separately rather than failing authentication.
      console.warn('Could not update last_login:', loginUpdateError.message);
    }

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('user_id, username, email, birth_date, created_at, last_login')
      .eq('user_id', data.user.id)
      .single();

        if (profileError) {
      console.warn('Could not load profile after login:', profileError.message);
    }

      const { data: adminRow } = await supabase
      .from('admins')
      .select('admin_id')
      .eq('auth_user_id', data.user.id)
      .maybeSingle();

    return res.json({
      message: 'Login successful.',
      isAdmin: Boolean(adminRow),
      user: {
        id: data.user.id,
        email: data.user.email,
        username:
          profile?.username ||
          data.user.user_metadata?.username ||
          data.user.email?.split('@')[0] ||
          'User',
      },
    });
  } catch (error) {
    console.error('Login route error:', error);
    return res.status(500).json({ message: 'Login failed.' });
  }
});

// GET /api/auth/me — full profile, now including avatar_url
router.get('/me', requireAuth, async (req, res) => {
  try {
    const { supabase, user } = req.auth;

    const { data, error } = await supabase
      .from('users')
      .select('user_id, username, email, birth_date, avatar_url, created_at, last_login')
      .eq('user_id', user.id)
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ user: data });
  } catch (err) {
    console.error('Load profile error:', err.message);
    return res.status(500).json({ error: 'Failed to load profile.' });
  }
});

// GET /api/auth/admin/check: 200 if admin, 403 if not
router.get('/admin/check', requireAuth, requireAdmin, (req, res) => {
  res.json({ isAdmin: true });
});

router.post('/logout', async (req, res) => {
  try {
    const accessToken = req.cookies[ACCESS_COOKIE];
    const refreshToken = req.cookies[REFRESH_COOKIE];

    if (accessToken && refreshToken) {
      const supabase = createSupabaseClient();
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (!sessionError) {
        await supabase.auth.signOut();
      }
    }
  } catch (error) {
    console.warn('Logout cleanup warning:', error);
  } finally {
    clearAuthCookies(res);
  }

  return res.json({ message: 'Logged out.' });
});

// PATCH /api/auth/me — ONLY username and avatar_url are writable.
// email and birthDate are refused: they must go through the administrator.
router.patch('/me', requireAuth, async (req, res) => {
  try {
    const { supabase, user } = req.auth;

    // Locked fields — explicit 400 instead of silently ignoring.
    if (req.body.email !== undefined) {
      return res.status(400).json({
        error: 'Email cannot be changed. Contact the administrator.',
      });
    }
    if (req.body.birthDate !== undefined || req.body.birth_date !== undefined) {
      return res.status(400).json({
        error: 'Birth date cannot be changed. Contact the administrator.',
      });
    }

    const updates = {};

    if (req.body.username !== undefined) {
      const username = String(req.body.username).trim();
      if (username.length < 1 || username.length > 30) {
        return res.status(400).json({ error: 'Username must be 1-30 characters.' });
      }
      updates.username = username;
    }

    if (req.body.avatarUrl !== undefined) {
      const url = String(req.body.avatarUrl);
      if (!/^https:\/\/res\.cloudinary\.com\//.test(url)) {
        return res.status(400).json({ error: 'Avatar must be a Cloudinary URL.' });
      }
      updates.avatar_url = url;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No updatable fields provided.' });
    }

    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('user_id', user.id)
      .select('user_id, username, email, birth_date, avatar_url, created_at')
      .single();

    if (error) {
      // Duplicate username hits the users_username_key unique constraint.
      if (error.code === '23505') {
        return res.status(400).json({ error: 'That username is already taken.' });
      }
      return res.status(400).json({ error: error.message });
    }

    return res.json({ user: data, message: 'Profile updated.' });
  } catch (err) {
    console.error('Update profile error:', err.message);
    return res.status(500).json({ error: 'Failed to update profile.' });
  }
});

// Change password
router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { user } = req.auth;
    const currentPassword = String(req.body.currentPassword || '');
    const newPassword = String(req.body.newPassword || '');

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Please fill out all fields.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'New password must be at least 8 characters long.' });
    }
    if (newPassword === currentPassword) {
      return res.status(400).json({ message: 'New password must be different from the current one.' });
    }

    // Verify the current password with a separate, fresh client
    const verifier = createSupabaseClient();
    const { data, error: verifyError } = await verifier.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

    // IMPORTANT: use 400, not 401. The frontend's apiFetch treats 401 as
    // "session expired" and redirects to the login page.
    if (verifyError || !data.session) {
      return res.status(400).json({ message: 'Current password is incorrect.' });
    }

    const { error: updateError } = await verifier.auth.updateUser({ password: newPassword });
    if (updateError) {
      return res.status(400).json({ message: updateError.message || 'Could not change password.' });
    }

    // Use the fresh session so the cookies stay valid
    setAuthCookies(res, data.session);

    return res.json({ message: 'Password updated.' });
  } catch (error) {
    console.error('Change password route error:', error);
    return res.status(500).json({ message: 'Could not change password.' });
  }
});

export default router;
