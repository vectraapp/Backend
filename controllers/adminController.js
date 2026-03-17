/**
 * PastQuest - Admin Controller
 */

const { supabaseAdmin } = require('../config/supabase');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Get admin dashboard stats
 */
async function getDashboardStats(req, res, next) {
  try {
    const { data, error } = await supabaseAdmin.rpc('get_admin_dashboard_stats');

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
 * Get admin activity logs
 */
async function getActivityLogs(req, res, next) {
  try {
    const { page = 1, limit = 50, adminId, action } = req.query;
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('admin_activity_logs')
      .select('*', { count: 'exact' });

    if (adminId) {
      query = query.eq('admin_id', adminId);
    }

    if (action) {
      query = query.eq('action', action);
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
 * Update platform settings (super admin)
 */
async function updateSettings(req, res, next) {
  try {
    const {
      levelAccessPrice,
      courseAccessPrice,
      studentDiscountPercent,
      pointsPerQuestion,
      ratePerPoint,
      minWithdrawalPoints,
      withdrawalFee,
      levelSubscriptionMonths,
      courseSubscriptionMonths,
      maintenanceMode,
      maintenanceMessage
    } = req.body;

    const updates = {};
    if (levelAccessPrice !== undefined) updates.level_access_price = levelAccessPrice;
    if (courseAccessPrice !== undefined) updates.course_access_price = courseAccessPrice;
    if (studentDiscountPercent !== undefined) updates.student_discount_percent = studentDiscountPercent;
    if (pointsPerQuestion !== undefined) updates.points_per_question = pointsPerQuestion;
    if (ratePerPoint !== undefined) updates.rate_per_point = ratePerPoint;
    if (minWithdrawalPoints !== undefined) updates.min_withdrawal_points = minWithdrawalPoints;
    if (withdrawalFee !== undefined) updates.withdrawal_fee = withdrawalFee;
    if (levelSubscriptionMonths !== undefined) updates.level_subscription_months = levelSubscriptionMonths;
    if (courseSubscriptionMonths !== undefined) updates.course_subscription_months = courseSubscriptionMonths;
    if (maintenanceMode !== undefined) updates.maintenance_mode = maintenanceMode;
    if (maintenanceMessage !== undefined) updates.maintenance_message = maintenanceMessage;

    updates.updated_by = req.user.id;

    const { data, error } = await supabaseAdmin
      .from('platform_settings')
      .update(updates)
      .eq('id', 'default')
      .select()
      .single();

    if (error) {
      throw new ApiError(400, error.message);
    }

    // Log activity
    await supabaseAdmin.from('admin_activity_logs').insert({
      admin_id: req.user.id,
      admin_email: req.user.email,
      action: 'update_settings',
      resource_type: 'platform_settings',
      resource_id: 'default',
      details: { updates }
    });

    res.json({
      success: true,
      data: data
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get revenue analytics
 */
async function getRevenueAnalytics(req, res, next) {
  try {
    const { period = '30d' } = req.query;

    let startDate;
    switch (period) {
      case '7d':
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '1y':
        startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    // Get subscription revenue
    const { data: subscriptions, error: subError } = await supabaseAdmin
      .from('subscriptions')
      .select('price, created_at, type')
      .gte('created_at', startDate.toISOString())
      .eq('status', 'active');

    if (subError) {
      throw new ApiError(400, subError.message);
    }

    // Get withdrawals
    const { data: withdrawals, error: wdError } = await supabaseAdmin
      .from('withdrawals')
      .select('net_amount, created_at')
      .gte('created_at', startDate.toISOString())
      .eq('status', 'completed');

    if (wdError) {
      throw new ApiError(400, wdError.message);
    }

    // Calculate totals
    const totalRevenue = subscriptions.reduce((sum, s) => sum + parseFloat(s.price), 0);
    const totalWithdrawals = withdrawals.reduce((sum, w) => sum + parseFloat(w.net_amount), 0);
    const levelRevenue = subscriptions
      .filter(s => s.type === 'level')
      .reduce((sum, s) => sum + parseFloat(s.price), 0);
    const courseRevenue = subscriptions
      .filter(s => s.type === 'course')
      .reduce((sum, s) => sum + parseFloat(s.price), 0);

    res.json({
      success: true,
      data: {
        period,
        totalRevenue,
        totalWithdrawals,
        netRevenue: totalRevenue - totalWithdrawals,
        levelRevenue,
        courseRevenue,
        subscriptionCount: subscriptions.length,
        withdrawalCount: withdrawals.length
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get user analytics
 */
async function getUserAnalytics(req, res, next) {
  try {
    const { period = '30d' } = req.query;

    let startDate;
    switch (period) {
      case '7d':
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    // Get new users
    const { data: newUsers, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, created_at, role, is_student_email')
      .gte('created_at', startDate.toISOString());

    if (userError) {
      throw new ApiError(400, userError.message);
    }

    // Get total users by role
    const { data: roleStats, error: roleError } = await supabaseAdmin
      .from('users')
      .select('role')
      .then(result => {
        const counts = { user: 0, contributor: 0, admin: 0, super_admin: 0 };
        result.data.forEach(u => counts[u.role]++);
        return { data: counts };
      });

    res.json({
      success: true,
      data: {
        period,
        newUsers: newUsers.length,
        newStudents: newUsers.filter(u => u.is_student_email).length,
        newContributors: newUsers.filter(u => u.role === 'contributor').length,
        totalByRole: roleStats
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get content analytics
 */
async function getContentAnalytics(req, res, next) {
  try {
    // Get question stats
    const { data: questionStats, error: qError } = await supabaseAdmin
      .from('past_questions')
      .select('status, department_id')
      .then(result => {
        const stats = { total: 0, approved: 0, pending: 0, rejected: 0 };
        const byDepartment = {};
        result.data.forEach(q => {
          stats.total++;
          stats[q.status]++;
          byDepartment[q.department_id] = (byDepartment[q.department_id] || 0) + 1;
        });
        return { data: { stats, byDepartment } };
      });

    // Get top contributors
    const { data: topContributors, error: cError } = await supabaseAdmin
      .from('contributor_stats')
      .select('user_id, approved_uploads, total_earnings, user:users(email, display_name)')
      .order('approved_uploads', { ascending: false })
      .limit(10);

    if (cError) {
      throw new ApiError(400, cError.message);
    }

    res.json({
      success: true,
      data: {
        questions: questionStats,
        topContributors: topContributors
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Expire old subscriptions (maintenance task)
 */
async function expireSubscriptions(req, res, next) {
  try {
    const { data, error } = await supabaseAdmin.rpc('expire_subscriptions');

    if (error) {
      throw new ApiError(400, error.message);
    }

    res.json({
      success: true,
      message: `Expired ${data} subscriptions`
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get general platform analytics
 */
async function getAnalytics(req, res, next) {
  try {
    // Total users
    const { count: total_users, error: usersError } = await supabaseAdmin
      .from('users')
      .select('*', { count: 'exact', head: true });

    if (usersError) {
      throw new ApiError(400, usersError.message);
    }

    // Total approved questions
    const { count: total_questions, error: questionsError } = await supabaseAdmin
      .from('past_questions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'approved');

    if (questionsError) {
      throw new ApiError(400, questionsError.message);
    }

    // Total lectures
    const { count: total_lectures, error: lecturesError } = await supabaseAdmin
      .from('lectures')
      .select('*', { count: 'exact', head: true });

    if (lecturesError) {
      throw new ApiError(400, lecturesError.message);
    }

    // Total uploads (optional — skip if table doesn't exist)
    let total_uploads = 0;
    const { count: uploadsCount, error: uploadsError } = await supabaseAdmin
      .from('uploads')
      .select('*', { count: 'exact', head: true });

    if (!uploadsError) {
      total_uploads = uploadsCount || 0;
    }

    // Signups in last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: signups_last_7_days, error: signupsError } = await supabaseAdmin
      .from('users')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', sevenDaysAgo);

    res.json({
      success: true,
      data: {
        total_users: total_users || 0,
        total_questions: total_questions || 0,
        total_lectures: total_lectures || 0,
        total_uploads,
        signups_last_7_days: signupsError ? 0 : (signups_last_7_days || 0),
        active_today: 0,
        questions_viewed_today: 0
      }
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getDashboardStats,
  getActivityLogs,
  updateSettings,
  getRevenueAnalytics,
  getUserAnalytics,
  getContentAnalytics,
  expireSubscriptions,
  getAnalytics
};
