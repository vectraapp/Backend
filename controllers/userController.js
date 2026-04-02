/**
 * Vectra - User Controller
 */

const { supabaseAdmin } = require('../config/supabase');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Get user profile
 */
async function getProfile(req, res, next) {
  try {
    const userId = req.params.id || req.user.id;

    const { data, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      throw new ApiError(404, 'User not found');
    }

    res.json({
      success: true,
      data: data
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Update user profile
 */
async function updateProfile(req, res, next) {
  try {
    const userId = req.user.id;
    const {
      displayName,
      universityId,
      facultyId,
      departmentId,
      currentLevel,
      onboardingCompleted
    } = req.body;

    const updates = {};
    if (displayName !== undefined) updates.display_name = displayName;
    if (universityId !== undefined) updates.university_id = universityId;
    if (facultyId !== undefined) updates.faculty_id = facultyId;
    if (departmentId !== undefined) updates.department_id = departmentId;
    if (currentLevel !== undefined) updates.current_level = currentLevel;
    if (onboardingCompleted !== undefined) updates.onboarding_completed = onboardingCompleted;

    const { data, error } = await supabaseAdmin
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      throw new ApiError(400, error.message);
    }

    res.json({
      success: true,
      data: data
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Complete onboarding
 */
async function completeOnboarding(req, res, next) {
  try {
    const userId = req.user.id;
    const { universityId, facultyId, departmentId, currentLevel } = req.body;

    if (!universityId || !facultyId || !departmentId || !currentLevel) {
      throw new ApiError(400, 'All fields are required');
    }

    const { data, error } = await supabaseAdmin
      .from('users')
      .update({
        university_id: universityId,
        faculty_id: facultyId,
        department_id: departmentId,
        current_level: currentLevel,
        onboarding_completed: true
      })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      throw new ApiError(400, error.message);
    }

    res.json({
      success: true,
      message: 'Onboarding completed',
      data: data
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get user's subscriptions
 */
async function getSubscriptions(req, res, next) {
  try {
    const userId = req.user.id;

    const { data, error } = await supabaseAdmin.rpc('get_user_subscriptions', {
      p_user_id: userId
    });

    if (error) {
      throw new ApiError(400, error.message);
    }

    res.json({
      success: true,
      data: data
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get user's notes
 */
async function getNotes(req, res, next) {
  try {
    const userId = req.user.id;
    const { courseId, academicSession } = req.query;

    let query = supabaseAdmin
      .from('user_notes')
      .select('*')
      .eq('user_id', userId);

    if (courseId) {
      query = query.eq('course_id', courseId);
    }

    if (academicSession) {
      query = query.eq('academic_session', academicSession);
    }

    const { data, error } = await query.order('updated_at', { ascending: false });

    if (error) {
      throw new ApiError(400, error.message);
    }

    res.json({
      success: true,
      data: data
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Save user note
 */
async function saveNote(req, res, next) {
  try {
    const userId = req.user.id;
    const { courseId, courseCode, courseTitle, academicSession, content } = req.body;

    if (!courseId || !courseCode || !academicSession || !content) {
      throw new ApiError(400, 'Missing required fields');
    }

    const { data, error } = await supabaseAdmin
      .from('user_notes')
      .upsert(
        {
          user_id: userId,
          course_id: courseId,
          course_code: courseCode,
          course_title: courseTitle,
          academic_session: academicSession,
          content
        },
        {
          onConflict: 'user_id,course_id,academic_session'
        }
      )
      .select()
      .single();

    if (error) {
      throw new ApiError(400, error.message);
    }

    res.json({
      success: true,
      data: data
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Delete user note
 */
async function deleteNote(req, res, next) {
  try {
    const userId = req.user.id;
    const noteId = req.params.id;

    const { error } = await supabaseAdmin
      .from('user_notes')
      .delete()
      .eq('id', noteId)
      .eq('user_id', userId);

    if (error) {
      throw new ApiError(400, error.message);
    }

    res.json({
      success: true,
      message: 'Note deleted'
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get user's search history
 */
async function getSearchHistory(req, res, next) {
  try {
    const userId = req.user.id;

    const { data, error } = await supabaseAdmin
      .from('search_history')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false })
      .limit(20);

    if (error) {
      throw new ApiError(400, error.message);
    }

    res.json({
      success: true,
      data: data
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Clear search history
 */
async function clearSearchHistory(req, res, next) {
  try {
    const userId = req.user.id;

    const { error } = await supabaseAdmin
      .from('search_history')
      .delete()
      .eq('user_id', userId);

    if (error) {
      throw new ApiError(400, error.message);
    }

    res.json({
      success: true,
      message: 'Search history cleared'
    });
  } catch (error) {
    next(error);
  }
}

// ============================================
// ADMIN FUNCTIONS
// ============================================

/**
 * Get all users (admin)
 */
async function getAllUsers(req, res, next) {
  try {
    const { page = 1, limit = 20, role, status, search } = req.query;
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('users')
      .select('*', { count: 'exact' });

    if (role) {
      query = query.eq('role', role);
    }

    if (status) {
      query = query.eq('account_status', status);
    }

    if (search) {
      query = query.or(`email.ilike.%${search}%,display_name.ilike.%${search}%`);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new ApiError(400, error.message);
    }

    res.json({
      success: true,
      data: data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Update user role (admin)
 */
async function updateUserRole(req, res, next) {
  try {
    const { id } = req.params;
    const { role } = req.body;

    const validRoles = ['user', 'contributor', 'admin', 'super_admin'];
    if (!validRoles.includes(role)) {
      throw new ApiError(400, 'Invalid role');
    }

    // Only super_admin can create other admins
    if (['admin', 'super_admin'].includes(role) && req.user.profile.role !== 'super_admin') {
      throw new ApiError(403, 'Only super admin can assign admin roles');
    }

    const { data, error } = await supabaseAdmin
      .from('users')
      .update({ role })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new ApiError(400, error.message);
    }

    res.json({
      success: true,
      data: data
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Suspend user (admin)
 */
async function suspendUser(req, res, next) {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const { data, error } = await supabaseAdmin
      .from('users')
      .update({
        account_status: 'suspended',
        suspension_reason: reason,
        suspended_at: new Date().toISOString(),
        suspended_by: req.user.id
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new ApiError(400, error.message);
    }

    res.json({
      success: true,
      message: 'User suspended',
      data: data
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Unsuspend user (admin)
 */
async function unsuspendUser(req, res, next) {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('users')
      .update({
        account_status: 'active',
        suspension_reason: null,
        suspended_at: null,
        suspended_by: null
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new ApiError(400, error.message);
    }

    res.json({
      success: true,
      message: 'User unsuspended',
      data: data
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Delete the authenticated user's account permanently
 * DELETE /api/v1/users/account
 */
async function deleteAccount(req, res, next) {
  try {
    const userId = req.user.id;
    const { supabaseAdmin } = require('../config/supabase');

    // Delete the user from Supabase Auth (cascades to associated data via FK constraints)
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw new ApiError(400, error.message);

    res.json({ success: true, message: 'Account deleted successfully' });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getProfile,
  updateProfile,
  completeOnboarding,
  getSubscriptions,
  getNotes,
  saveNote,
  deleteNote,
  getSearchHistory,
  clearSearchHistory,
  getAllUsers,
  updateUserRole,
  suspendUser,
  unsuspendUser,
  deleteAccount,
};
