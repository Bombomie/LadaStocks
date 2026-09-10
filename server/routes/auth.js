import express from 'express';
import { createSupabaseClient } from '../config/supabase.js';
import { requireAuth } from '../middleware/requireAuth.js';
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
      console.error('--- SUPABASE LOGIN ERROR ---', error);
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

    return res.json({
      message: 'Login successful.',
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

router.get('/me', requireAuth, async (req, res) => {
  try {
    const { supabase, user } = req.auth;

    const { data: profile, error } = await supabase
      .from('users')
      .select('user_id, username, email, birth_date, created_at, last_login')
      .eq('user_id', user.id)
      .single();

    if (error || !profile) {
      console.error('Profile lookup error:', error?.message);
      return res.status(404).json({ message: 'User profile not found.' });
    }

    return res.json({
      user: profile,
    });
  } catch (error) {
    console.error('Me route error:', error);
    return res.status(500).json({ message: 'Could not load user profile.' });
  }
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

export default router;
