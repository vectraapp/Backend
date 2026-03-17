/**
 * Vectra - Study Streak Controller
 */

const { supabaseAdmin } = require('../config/supabase');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Get streak data for the current user
 */
async function getStreak(req, res, next) {
  try {
    const userId = req.user.id;
    const today = new Date().toISOString().split('T')[0];

    // Get or create streak record
    let streakData = null;

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('study_streaks')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError) {
      // Table may not exist yet — return defaults
      return res.json({
        success: true,
        data: {
          current_streak: 0,
          longest_streak: 0,
          last_study_date: null,
          total_study_days: 0,
          xp_points: 0,
          heatmap: [],
          leaderboard: []
        }
      });
    }

    if (!existing) {
      // Create default record
      const { data: created, error: createError } = await supabaseAdmin
        .from('study_streaks')
        .insert({
          user_id: userId,
          current_streak: 0,
          longest_streak: 0,
          last_study_date: null,
          total_study_days: 0,
          xp_points: 0,
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      streakData = createError ? {
        user_id: userId,
        current_streak: 0,
        longest_streak: 0,
        last_study_date: null,
        total_study_days: 0,
        xp_points: 0
      } : created;
    } else {
      streakData = existing;
    }

    // Fetch last 35 days of activity for heatmap
    const thirtyFiveDaysAgo = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const { data: activityData } = await supabaseAdmin
      .from('study_activity')
      .select('activity_date')
      .eq('user_id', userId)
      .gte('activity_date', thirtyFiveDaysAgo)
      .order('activity_date', { ascending: true });

    // Build heatmap array (last 35 days)
    const activeDates = new Set((activityData || []).map(a => a.activity_date));
    const heatmap = [];
    for (let i = 34; i >= 0; i--) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];
      heatmap.push({ date, active: activeDates.has(date) });
    }

    res.json({
      success: true,
      data: {
        current_streak: streakData.current_streak,
        longest_streak: streakData.longest_streak,
        last_study_date: streakData.last_study_date,
        total_study_days: streakData.total_study_days,
        xp_points: streakData.xp_points,
        heatmap,
        leaderboard: [] // Placeholder — no leaderboard table yet
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Record study activity for the current user
 */
async function recordActivity(req, res, next) {
  try {
    const userId = req.user.id;
    const today = new Date().toISOString().split('T')[0];

    // Insert today's activity (ignore duplicate via upsert)
    const { data: activityInsert, error: activityError } = await supabaseAdmin
      .from('study_activity')
      .upsert(
        { user_id: userId, activity_date: today },
        { onConflict: 'user_id,activity_date', ignoreDuplicates: true }
      )
      .select();

    if (activityError) {
      // Table may not exist — return gracefully
      return res.json({
        success: true,
        data: { message: 'Activity tracking not available yet' }
      });
    }

    const isNewDay = activityInsert && activityInsert.length > 0;

    // Get existing streak record
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('study_streaks')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError) {
      return res.json({
        success: true,
        data: { message: 'Streak tracking not available yet' }
      });
    }

    let currentStreak = existing ? existing.current_streak : 0;
    let longestStreak = existing ? existing.longest_streak : 0;
    let totalStudyDays = existing ? existing.total_study_days : 0;
    let xpPoints = existing ? existing.xp_points : 0;
    const lastStudyDate = existing ? existing.last_study_date : null;

    if (isNewDay) {
      // Calculate streak
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      if (lastStudyDate === yesterday) {
        // Extend streak
        currentStreak += 1;
      } else if (lastStudyDate === today) {
        // Same day — no change (shouldn't happen since isNewDay, but guard anyway)
      } else {
        // Reset streak
        currentStreak = 1;
      }

      longestStreak = Math.max(longestStreak, currentStreak);
      totalStudyDays += 1;
      xpPoints += 10;
    }

    // Upsert streak record
    const { data: updated, error: upsertError } = await supabaseAdmin
      .from('study_streaks')
      .upsert(
        {
          user_id: userId,
          current_streak: currentStreak,
          longest_streak: longestStreak,
          last_study_date: today,
          total_study_days: totalStudyDays,
          xp_points: xpPoints,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'user_id' }
      )
      .select()
      .single();

    if (upsertError) {
      return res.json({
        success: true,
        data: {
          current_streak: currentStreak,
          longest_streak: longestStreak,
          total_study_days: totalStudyDays,
          xp_points: xpPoints,
          is_new_day: isNewDay
        }
      });
    }

    res.json({
      success: true,
      data: {
        current_streak: updated.current_streak,
        longest_streak: updated.longest_streak,
        total_study_days: updated.total_study_days,
        xp_points: updated.xp_points,
        is_new_day: isNewDay
      }
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getStreak,
  recordActivity
};
