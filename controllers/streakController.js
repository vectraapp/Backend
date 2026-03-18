/**
 * Vectra — Streak Controller
 *
 * Handles streak tracking, point logging, freeze mechanics,
 * grace period, and milestone bonuses.
 *
 * Timezone: All day-boundary calculations use WAT (UTC+1) so that
 * Nigerian students' midnight is the correct reset point.
 */

const { supabaseAdmin } = require('../config/supabase');
const { ApiError } = require('../middleware/errorHandler');

// ─── Constants ────────────────────────────────────────────────────────────────

const POINT_VALUES = {
  record_lecture:    20,
  answer_question:   5,
  view_notes:        5,
  complete_ai_quiz:  15,
  upload_material:   10,
  open_pdf:          3,
  share_lecture:     8,
  milestone_bonus:   0,  // set dynamically per milestone
};

const MILESTONES = [
  { streak: 3,   bonus: 10,  badge: 'warm_up' },
  { streak: 7,   bonus: 25,  badge: 'week_warrior' },
  { streak: 14,  bonus: 50,  badge: 'fortnight_scholar' },
  { streak: 30,  bonus: 100, badge: 'monthly_machine' },
  { streak: 60,  bonus: 200, badge: 'semester_legend' },
  { streak: 100, bonus: 500, badge: 'century_scholar' },
];

// ─── Date helpers (WAT = UTC+1) ───────────────────────────────────────────────

/** Returns today's date string (YYYY-MM-DD) in WAT. */
function todayWAT() {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString().split('T')[0];
}

/** Returns yesterday's date string (YYYY-MM-DD) in WAT. */
function yesterdayWAT() {
  return new Date(Date.now() + 60 * 60 * 1000 - 86400000).toISOString().split('T')[0];
}

/**
 * Returns the absolute day difference between two YYYY-MM-DD strings.
 * E.g. diffDays('2025-01-01', '2025-01-03') === 2
 */
function diffDays(dateA, dateB) {
  const a = new Date(dateA + 'T00:00:00Z').getTime();
  const b = new Date(dateB + 'T00:00:00Z').getTime();
  return Math.abs(Math.round((b - a) / 86400000));
}

/**
 * Returns true if `graceUsedAt` (YYYY-MM-DD) falls within the last 7 days
 * in WAT, meaning grace is NOT available.
 */
function graceUsedRecently(graceUsedAt) {
  if (!graceUsedAt) return false;
  const today = todayWAT();
  return diffDays(graceUsedAt, today) < 7;
}

/**
 * Check if the previous streak value crossed a milestone threshold with
 * the new value, and return the first newly crossed milestone (if any).
 */
function findNewMilestone(previousStreak, newStreak) {
  for (const m of MILESTONES) {
    if (previousStreak < m.streak && newStreak >= m.streak) {
      return m;
    }
  }
  return null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Ensure a streak row exists for the user; returns the row. */
async function ensureStreakRow(userId) {
  const { data: existing, error } = await supabaseAdmin
    .from('study_streaks')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new ApiError(500, 'Failed to fetch streak data');

  if (existing) return existing;

  const { data: created, error: insertErr } = await supabaseAdmin
    .from('study_streaks')
    .insert({
      user_id: userId,
      current_streak: 0,
      longest_streak: 0,
      last_study_date: null,
      total_study_days: 0,
      xp_points: 0,
      freeze_count: 0,
      grace_used_at: null,
      show_on_leaderboard: true,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (insertErr) throw new ApiError(500, 'Failed to create streak record');
  return created;
}

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * GET /api/v1/streaks/me
 * Returns the current user's full streak profile including heatmap.
 */
async function getMyStreak(req, res, next) {
  try {
    const userId = req.user.id;

    const streak = await ensureStreakRow(userId);

    // Heatmap: last 35 days of activity
    const since = new Date(Date.now() - 35 * 86400000).toISOString().split('T')[0];
    const { data: activityRows } = await supabaseAdmin
      .from('study_activity')
      .select('activity_date')
      .eq('user_id', userId)
      .gte('activity_date', since);

    const activeDates = new Set((activityRows || []).map((r) => r.activity_date));
    const heatmap = [];
    for (let i = 34; i >= 0; i--) {
      const d = new Date(Date.now() + 60 * 60 * 1000 - i * 86400000)
        .toISOString()
        .split('T')[0];
      heatmap.push({ date: d, active: activeDates.has(d) });
    }

    // Next milestone
    const nextMilestone = MILESTONES.find((m) => m.streak > streak.current_streak) || null;

    res.json({
      success: true,
      data: {
        current_streak:      streak.current_streak,
        longest_streak:      streak.longest_streak,
        last_study_date:     streak.last_study_date,
        total_study_days:    streak.total_study_days,
        xp_points:           streak.xp_points,
        freeze_count:        streak.freeze_count ?? 0,
        show_on_leaderboard: streak.show_on_leaderboard ?? true,
        heatmap,
        next_milestone: nextMilestone
          ? { streak: nextMilestone.streak, badge: nextMilestone.badge, bonus: nextMilestone.bonus }
          : null,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/streaks/log-activity
 * Body: { action_type, course_code? }
 *
 * Awards points, updates streak counters, handles freeze/grace, and
 * awards milestone bonuses.
 *
 * Response includes a `notifications` array that the client can use to
 * trigger toasts / animations (streak_saved, streak_broken, milestone, etc.).
 */
async function logActivity(req, res, next) {
  try {
    const userId = req.user.id;
    const { action_type, course_code } = req.body;

    // Validate action type
    if (!action_type || !(action_type in POINT_VALUES)) {
      throw new ApiError(400, `Invalid action_type. Must be one of: ${Object.keys(POINT_VALUES).join(', ')}`);
    }

    const points = POINT_VALUES[action_type];
    const today = todayWAT();
    const notifications = [];

    // ── 1. Record the event ──────────────────────────────────────────────────
    await supabaseAdmin.from('streak_events').insert({
      user_id:     userId,
      action_type,
      course_code: course_code || null,
      points,
      created_at:  new Date().toISOString(),
    });

    // ── 2. Check if today is a new study day ─────────────────────────────────
    const { data: upsertResult } = await supabaseAdmin
      .from('study_activity')
      .upsert(
        { user_id: userId, activity_date: today },
        { onConflict: 'user_id,activity_date', ignoreDuplicates: true }
      )
      .select();

    const isNewDay = upsertResult && upsertResult.length > 0;

    // ── 3. Load current streak row ───────────────────────────────────────────
    const streak = await ensureStreakRow(userId);

    let {
      current_streak,
      longest_streak,
      total_study_days,
      xp_points,
      freeze_count,
      grace_used_at,
      last_study_date,
    } = streak;

    xp_points = (xp_points || 0) + points;

    // ── 4. Update streak counters for a new day ──────────────────────────────
    let streakEvent = null; // 'extended' | 'freeze_used' | 'grace_used' | 'reset' | null

    if (isNewDay) {
      const previousStreak = current_streak;

      if (!last_study_date) {
        // First ever study day
        current_streak = 1;
        streakEvent = 'started';
        notifications.push({ type: 'streak_started', streak: 1 });

      } else {
        const gap = diffDays(last_study_date, today);

        if (gap === 1) {
          // Yesterday was last active — extend streak
          current_streak += 1;
          streakEvent = 'extended';

        } else if (gap === 2) {
          // Missed exactly one day — try freeze, then grace, then reset
          if (freeze_count > 0) {
            freeze_count -= 1;
            current_streak += 1;
            streakEvent = 'freeze_used';
            notifications.push({ type: 'streak_saved', method: 'freeze', streak: current_streak });

          } else if (!graceUsedRecently(grace_used_at)) {
            grace_used_at = today;
            current_streak += 1;
            streakEvent = 'grace_used';
            notifications.push({ type: 'streak_saved', method: 'grace', streak: current_streak });

          } else {
            current_streak = 1;
            streakEvent = 'reset';
            notifications.push({ type: 'streak_broken', previous: previousStreak });
          }

        } else {
          // Gap ≥ 3: no recovery possible
          current_streak = 1;
          streakEvent = 'reset';
          if (previousStreak > 1) {
            notifications.push({ type: 'streak_broken', previous: previousStreak });
          }
        }
      }

      total_study_days += 1;
      longest_streak = Math.max(longest_streak, current_streak);

      // ── 5. Milestone check ─────────────────────────────────────────────────
      const milestone = findNewMilestone(previousStreak ?? 0, current_streak);
      if (milestone) {
        xp_points += milestone.bonus;
        // Log the bonus as its own event
        await supabaseAdmin.from('streak_events').insert({
          user_id:     userId,
          action_type: 'milestone_bonus',
          course_code: null,
          points:      milestone.bonus,
          created_at:  new Date().toISOString(),
        });
        notifications.push({ type: 'milestone', badge: milestone.badge, bonus: milestone.bonus, streak: milestone.streak });
      }

      // ── 6. Freeze earned every 14 active study days (max 2) ───────────────
      const prevTotalStudyDays = total_study_days - 1;
      const freezesEarned = Math.floor(total_study_days / 14) - Math.floor(prevTotalStudyDays / 14);
      if (freezesEarned > 0 && freeze_count < 2) {
        freeze_count = Math.min(2, freeze_count + freezesEarned);
        notifications.push({ type: 'freeze_earned', freeze_count });
      }
    }

    // ── 7. Persist streak row ─────────────────────────────────────────────────
    await supabaseAdmin
      .from('study_streaks')
      .upsert(
        {
          user_id:         userId,
          current_streak,
          longest_streak,
          last_study_date: today,
          total_study_days,
          xp_points,
          freeze_count,
          grace_used_at:   grace_used_at || streak.grace_used_at || null,
          updated_at:      new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

    res.json({
      success: true,
      data: {
        current_streak,
        longest_streak,
        total_study_days,
        xp_points,
        freeze_count,
        points_earned: points,
        is_new_day:    isNewDay,
        streak_event:  streakEvent,
        notifications,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/v1/streaks/leaderboard-visibility
 * Body: { show: boolean }
 * Toggles whether this user appears by name on leaderboards.
 */
async function setLeaderboardVisibility(req, res, next) {
  try {
    const userId = req.user.id;
    const { show } = req.body;

    if (typeof show !== 'boolean') {
      throw new ApiError(400, '`show` must be a boolean');
    }

    await ensureStreakRow(userId);

    const { error } = await supabaseAdmin
      .from('study_streaks')
      .update({ show_on_leaderboard: show, updated_at: new Date().toISOString() })
      .eq('user_id', userId);

    if (error) throw new ApiError(500, 'Failed to update leaderboard visibility');

    res.json({ success: true, data: { show_on_leaderboard: show } });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/streaks/milestones
 * Returns the full milestones list so the client can render progress.
 */
async function getMilestones(req, res, next) {
  try {
    const userId = req.user.id;
    const streak = await ensureStreakRow(userId);

    const list = MILESTONES.map((m) => ({
      streak:    m.streak,
      badge:     m.badge,
      bonus:     m.bonus,
      achieved:  streak.current_streak >= m.streak,
    }));

    res.json({ success: true, data: list });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getMyStreak,
  logActivity,
  setLeaderboardVisibility,
  getMilestones,
};
