/**
 * PastQuest - Authentication Controller
 */

const { supabase, supabaseAdmin } = require('../config/supabase');
const { sendWelcomeEmail } = require('../utils/email');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Sign up with email and password
 * Uses admin client to create users with email already confirmed (no OTP required)
 */
async function signUp(req, res, next) {
  try {
    const { email, password, displayName, termsAccepted } = req.body;

    if (!email || !password) {
      throw new ApiError(400, 'Email and password are required');
    }

    if (!termsAccepted) {
      throw new ApiError(400, 'You must accept the Terms of Service to create an account');
    }

    // Create user using admin client with email already confirmed (bypasses email verification)
    const name = displayName || email.split('@')[0];
    const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email - no OTP/email verification needed
      user_metadata: {
        full_name: name,
        name: name,
        display_name: name,
      }
    });

    if (createError) {
      throw new ApiError(400, createError.message);
    }

    // Record terms acceptance in users table
    await supabaseAdmin
      .from('users')
      .update({ terms_accepted_at: new Date().toISOString() })
      .eq('id', userData.user.id)
      .catch(() => {});

    // Now sign in the user to get a session
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (signInError) {
      throw new ApiError(400, signInError.message);
    }

    // Send welcome email (optional, non-blocking)
    sendWelcomeEmail(email, displayName).catch(console.error);

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: {
        user: signInData.user,
        session: signInData.session
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Sign in with email and password
 */
async function signIn(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new ApiError(400, 'Email and password are required');
    }

    // First, try normal sign in
    let { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    // If "Email not confirmed" error, auto-confirm the user and retry
    if (error && error.message.includes('Email not confirmed')) {
      console.log('[Auth] Auto-confirming email for:', email);

      // Get user by email and confirm them
      const { data: users } = await supabaseAdmin.auth.admin.listUsers();
      const user = users?.users?.find(u => u.email === email);

      if (user) {
        // Update user to confirm email
        await supabaseAdmin.auth.admin.updateUserById(user.id, {
          email_confirm: true
        });

        // Retry sign in
        const retryResult = await supabase.auth.signInWithPassword({
          email,
          password
        });
        data = retryResult.data;
        error = retryResult.error;
      }
    }

    if (error) {
      throw new ApiError(401, error.message);
    }

    // Update last login
    await supabaseAdmin
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', data.user.id);

    // Get user profile
    const { data: profile } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', data.user.id)
      .single();

    res.json({
      success: true,
      data: {
        user: {
          ...data.user,
          profile
        },
        session: data.session
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Sign in with Google (web redirect flow)
 */
async function signInWithGoogle(req, res, next) {
  try {
    const redirectUrl = req.body.redirectUrl || process.env.FRONTEND_URL;

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl
      }
    });

    if (error) {
      throw new ApiError(400, error.message);
    }

    res.json({
      success: true,
      data: {
        url: data.url
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Exchange Google ID token for a Supabase session (mobile flow)
 * The mobile app uses expo-auth-session to get the Google ID token,
 * then sends it here to get a Supabase session back.
 */
async function exchangeGoogleToken(req, res, next) {
  try {
    const { idToken, accessToken } = req.body;

    if (!idToken) {
      throw new ApiError(400, 'Google ID token is required');
    }

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
      access_token: accessToken,
    });

    if (error) {
      throw new ApiError(400, error.message);
    }

    // Update last login
    await supabaseAdmin
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', data.user.id)
      .catch(() => {});

    // Get user profile
    const { data: profile } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', data.user.id)
      .single();

    res.json({
      success: true,
      data: {
        user: {
          ...data.user,
          profile,
        },
        session: data.session,
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Resend email verification link
 */
async function resendVerification(req, res, next) {
  try {
    const { email } = req.body;

    if (!email) {
      throw new ApiError(400, 'Email is required');
    }

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
    });

    if (error) {
      throw new ApiError(400, error.message);
    }

    res.json({
      success: true,
      message: 'Verification email sent'
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Sign out
 */
async function signOut(req, res, next) {
  try {
    const { error } = await supabase.auth.signOut();

    if (error) {
      throw new ApiError(400, error.message);
    }

    res.json({
      success: true,
      message: 'Signed out successfully'
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get current user
 */
async function getCurrentUser(req, res, next) {
  try {
    res.json({
      success: true,
      data: {
        user: req.user
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Refresh session
 */
async function refreshSession(req, res, next) {
  try {
    const refreshToken = req.body.refreshToken;

    if (!refreshToken) {
      throw new ApiError(400, 'Refresh token is required');
    }

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken
    });

    if (error) {
      throw new ApiError(401, error.message);
    }

    res.json({
      success: true,
      data: {
        session: data.session
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Request password reset
 */
async function requestPasswordReset(req, res, next) {
  try {
    const { email } = req.body;

    if (!email) {
      throw new ApiError(400, 'Email is required');
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.FRONTEND_URL}/reset-password`
    });

    if (error) {
      throw new ApiError(400, error.message);
    }

    res.json({
      success: true,
      message: 'Password reset email sent'
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Update password
 */
async function updatePassword(req, res, next) {
  try {
    const { password } = req.body;

    if (!password) {
      throw new ApiError(400, 'New password is required');
    }

    const { error } = await supabase.auth.updateUser({
      password
    });

    if (error) {
      throw new ApiError(400, error.message);
    }

    res.json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  signUp,
  signIn,
  signInWithGoogle,
  exchangeGoogleToken,
  resendVerification,
  signOut,
  getCurrentUser,
  refreshSession,
  requestPasswordReset,
  updatePassword
};
