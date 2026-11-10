// server/routes/password.js
// ------------------------------------------------------------
// Unauthenticated password-reset flow ("Forgot my password").
//
//   1. POST /api/auth/forgot-password  { email }
//        → Asks Supabase to send the recovery email. The link inside it
//          redirects to the change_password page with the recovery
//          session in the URL fragment (#access_token=…&refresh_token=…).
//   2. The change_password page posts { accessToken, refreshToken,
//      newPassword } to POST /api/auth/update-password
//        → We set that recovery session on a throwaway Supabase client
//          and change the password server-side.
//
// Mount in server/index.js next to the other routers:
//   import passwordRouter from './routes/password.js';
//   app.use('/api/auth', passwordRouter);
//
// NOTE: the logged-in "change password" (profile page modal) already
// lives in auth.js as POST /api/auth/change-password. This file only
// covers the forgot-my-password flow for logged-out users.
//
// WHY A DEDICATED CLIENT? The Supabase client here is created with
// `flowType: 'implicit'`, which makes the recovery link redirect back to
// our page with the session tokens in the URL fragment — a format the
// change_password page can read without any Supabase JS in the browser.
// If your main client is configured differently (e.g. PKCE), the link
// format changes and the page cannot parse it.
// ------------------------------------------------------------

import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Public address of THIS app. The recovery email's "Reset password"
// button sends the user to `${APP_URL}/pages/authentication/change_password/
// change_password.html`. Set APP_URL in .env / Render (no trailing slash).
const APP_URL = (process.env.APP_URL || 'http://localhost:20269').replace(/\/+$/, '');

const RESET_REDIRECT_URL = `${APP_URL}/pages/authentication/change_password/change_password.html`;

// Sends the recovery email. 'implicit' flow → link returns tokens in the
// URL fragment (see comment at the top).
const resetMailer = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { flowType: 'implicit', persistSession: false, autoRefreshToken: false },
});

// Throwaway session holder for the actual password change.
const sessionClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// POST /api/auth/forgot-password — send the recovery email
router.post('/forgot-password', async (req, res) => {
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return res
        .status(500)
        .json({ message: 'Password reset is not configured on the server.' });
    }

    const email = String(req.body.email || '').trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ message: 'Please enter your email.' });
    }

    const { error } = await resetMailer.auth.resetPasswordForEmail(email, {
      redirectTo: RESET_REDIRECT_URL,
    });

    if (error) {
      console.error('Forgot password error:', error.message);
      return res
        .status(500)
        .json({ message: 'Could not send the reset email. Please try again later.' });
    }

    // Same answer whether or not the account exists (no email enumeration).
    return res.json({
      message: 'If that email is registered, a reset link is on its way. Check your inbox.',
    });
  } catch (error) {
    console.error('Forgot password error:', error.message);
    return res
      .status(500)
      .json({ message: 'Could not send the reset email. Please try again later.' });
  }
});

// POST /api/auth/update-password — perform the password change
router.post('/update-password', async (req, res) => {
  try {
    const accessToken = String(req.body.accessToken || '');
    const refreshToken = String(req.body.refreshToken || '');
    const newPassword = String(req.body.newPassword || '');

    if (!accessToken || !refreshToken) {
      return res.status(400).json({
        message: 'This reset link is invalid or has expired. Please request a new one.',
      });
    }

    if (newPassword.length < 8) {
      return res
        .status(400)
        .json({ message: 'Password must be at least 8 characters long.' });
    }

    // Activate the recovery session that came from the email link…
    const { error: sessionError } = await sessionClient.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (sessionError) {
      console.error('Reset session error:', sessionError.message);
      return res.status(400).json({
        message: 'This reset link is invalid or has expired. Please request a new one.',
      });
    }

    // …then change the password as that user.
    const { error: updateError } = await sessionClient.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      console.error('Update password error:', updateError.message);
      return res
        .status(400)
        .json({ message: updateError.message || 'Could not update the password.' });
    }

    return res.json({
      message: 'Password updated successfully! You can now log in with your new password.',
    });
  } catch (error) {
    console.error('Update password error:', error.message);
    return res
      .status(500)
      .json({ message: 'Could not update the password. Please try again later.' });
  }
});

export default router;