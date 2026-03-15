/**
 * PastQuest - Authentication Middleware
 */

const { supabase, supabaseAdmin } = require('../config/supabase');

/**
 * Verify JWT token and attach user to request
 */
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const token = authHeader.replace('Bearer ', '');

    // Verify token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    // Get user profile from database
    const { data: userProfile, error: profileError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError) {
      return res.status(401).json({
        success: false,
        message: 'User profile not found'
      });
    }

    // Check if user is suspended or banned
    if (userProfile.account_status !== 'active') {
      return res.status(403).json({
        success: false,
        message: `Account ${userProfile.account_status}: ${userProfile.suspension_reason || 'Contact support'}`
      });
    }

    // Attach user to request
    req.user = {
      ...user,
      profile: userProfile
    };
    req.token = token;

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication failed'
    });
  }
}

/**
 * Check if user is a contributor
 */
function requireContributor(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  const allowedRoles = ['contributor', 'admin', 'super_admin'];
  if (!allowedRoles.includes(req.user.profile.role)) {
    return res.status(403).json({
      success: false,
      message: 'Contributor access required'
    });
  }

  next();
}

/**
 * Check if user is an admin
 */
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  const allowedRoles = ['admin', 'super_admin'];
  if (!allowedRoles.includes(req.user.profile.role)) {
    return res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }

  next();
}

/**
 * Check if user is a super admin
 */
function requireSuperAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  if (req.user.profile.role !== 'super_admin') {
    return res.status(403).json({
      success: false,
      message: 'Super admin access required'
    });
  }

  next();
}

/**
 * Optional authentication - doesn't fail if no token
 */
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = null;
      return next();
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (!error && user) {
      const { data: userProfile } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

      req.user = userProfile ? { ...user, profile: userProfile } : null;
      req.token = token;
    } else {
      req.user = null;
    }

    next();
  } catch (error) {
    req.user = null;
    next();
  }
}

module.exports = {
  authenticate,
  requireContributor,
  requireAdmin,
  requireSuperAdmin,
  optionalAuth
};
