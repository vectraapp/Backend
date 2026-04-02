/**
 * Vectra - Authentication Controller
 */

const { supabase, supabaseAdmin } = require('../config/supabase');
const { sendWelcomeEmail } = require('../utils/email');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Sign up with email and password
 * Auto-confirms email via admin client — no OTP required
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

    const name = displayName || email.split('@')[0];

    const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: name,
        name: name,
        display_name: name,
      }
    });

    if (createError) {
      throw new ApiError(400, createError.message);
    }

    // Record terms acceptance (non-blocking)
    try {
      await supabaseAdmin
        .from('users')
        .update({ terms_accepted_at: new Date().toISOString() })
        .eq('id', userData.user.id);
    } catch (_) {}

    // Sign in to get a session
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (signInError) {
      throw new ApiError(400, signInError.message);
    }

    sendWelcomeEmail(email, name).catch(console.error);

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: {
        user: signInData.user,
        session: signInData.session,
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Verify OTP after signup
 * User submits the 6-digit code from their email
 */
async function verifyOtp(req, res, next) {
  try {
    const { email, token } = req.body;

    if (!email || !token) {
      throw new ApiError(400, 'Email and verification code are required');
    }

    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'signup',
    });

    if (error) {
      throw new ApiError(400, error.message);
    }

    // Update last login
    try {
      await supabaseAdmin
        .from('users')
        .update({ last_login: new Date().toISOString() })
        .eq('id', data.user.id);
    } catch (_) {}

    // Get profile
    const { data: profile } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', data.user.id)
      .single();

    // Send welcome email (non-blocking)
    sendWelcomeEmail(email, profile?.display_name).catch(console.error);

    res.json({
      success: true,
      message: 'Email verified successfully',
      data: {
        user: { ...data.user, profile },
        session: data.session,
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Resend OTP verification code
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
      message: 'Verification code resent'
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

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      throw new ApiError(401, error.message);
    }

    // Update last login
    try {
      await supabaseAdmin
        .from('users')
        .update({ last_login: new Date().toISOString() })
        .eq('id', data.user.id);
    } catch (_) {}

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
    try {
      await supabaseAdmin
        .from('users')
        .update({ last_login: new Date().toISOString() })
        .eq('id', data.user.id);
    } catch (_) {}

    // Get user profile
    const { data: profile } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', data.user.id)
      .single();

    res.json({
      success: true,
      data: {
        user: { ...data.user, profile },
        session: data.session,
      }
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
  verifyOtp,
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
