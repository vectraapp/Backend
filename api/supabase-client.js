/**
 * PastQuest - Supabase Client Setup
 *
 * This file provides the Supabase client configuration for use in
 * the backend API and scripts.
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Validate configuration
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase configuration. Please check your .env file.');
  console.error('Required: SUPABASE_URL, SUPABASE_ANON_KEY');
}

/**
 * Create a Supabase client with the anonymous key (for client-side operations)
 * Use this for operations that respect Row Level Security (RLS)
 */
const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Create a Supabase client with the service role key (for admin operations)
 * Use this for operations that bypass Row Level Security (RLS)
 * WARNING: Only use server-side, never expose to client
 */
const supabaseAdmin = supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : null;

/**
 * Create a Supabase client with a user's access token
 * Use this to make requests on behalf of an authenticated user
 * @param {string} accessToken - The user's JWT access token
 */
function createAuthenticatedClient(accessToken) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  });
}

/**
 * Database helper functions
 */
const db = {
  /**
   * Check if a user has access to content
   * @param {string} userId - User ID
   * @param {string} departmentId - Department ID
   * @param {string} level - Level (Part 1, Part 2, etc.)
   * @param {string} courseId - Optional course ID
   */
  async checkUserAccess(userId, departmentId, level, courseId = null) {
    const { data, error } = await supabase.rpc('check_user_access', {
      p_user_id: userId,
      p_department_id: departmentId,
      p_level: level,
      p_course_id: courseId
    });

    if (error) throw error;
    return data;
  },

  /**
   * Get user's active subscriptions
   * @param {string} userId - User ID
   */
  async getUserSubscriptions(userId) {
    const { data, error } = await supabase.rpc('get_user_subscriptions', {
      p_user_id: userId
    });

    if (error) throw error;
    return data;
  },

  /**
   * Calculate subscription price
   * @param {string} type - 'level' or 'course'
   * @param {boolean} isStudentEmail - Whether user has student email
   */
  async calculatePrice(type, isStudentEmail) {
    const { data, error } = await supabase.rpc('calculate_subscription_price', {
      p_type: type,
      p_is_student_email: isStudentEmail
    });

    if (error) throw error;
    return data;
  },

  /**
   * Approve a question (admin only)
   * @param {string} questionId - Question UUID
   * @param {string} adminId - Admin user ID
   */
  async approveQuestion(questionId, adminId) {
    const { data, error } = await supabaseAdmin.rpc('approve_question', {
      p_question_id: questionId,
      p_admin_id: adminId
    });

    if (error) throw error;
    return data;
  },

  /**
   * Reject a question (admin only)
   * @param {string} questionId - Question UUID
   * @param {string} adminId - Admin user ID
   * @param {string} reason - Rejection reason
   */
  async rejectQuestion(questionId, adminId, reason) {
    const { data, error } = await supabaseAdmin.rpc('reject_question', {
      p_question_id: questionId,
      p_admin_id: adminId,
      p_reason: reason
    });

    if (error) throw error;
    return data;
  },

  /**
   * Request withdrawal (contributor)
   * @param {string} userId - User ID
   * @param {number} points - Points to redeem
   * @param {object} bankDetails - Bank account details
   */
  async requestWithdrawal(userId, points, bankDetails) {
    const { data, error } = await supabase.rpc('request_withdrawal', {
      p_user_id: userId,
      p_points: points,
      p_account_number: bankDetails.accountNumber,
      p_account_name: bankDetails.accountName,
      p_bank_code: bankDetails.bankCode,
      p_bank_name: bankDetails.bankName
    });

    if (error) throw error;
    return data;
  },

  /**
   * Get admin dashboard stats
   */
  async getAdminDashboardStats() {
    const { data, error } = await supabaseAdmin.rpc('get_admin_dashboard_stats');

    if (error) throw error;
    return data;
  },

  /**
   * Get contributor stats
   * @param {string} userId - User ID
   */
  async getContributorStats(userId) {
    const { data, error } = await supabase.rpc('get_contributor_stats', {
      p_user_id: userId
    });

    if (error) throw error;
    return data;
  }
};

module.exports = {
  supabase,
  supabaseAdmin,
  createAuthenticatedClient,
  db
};
