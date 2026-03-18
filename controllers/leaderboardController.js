/**
 * Vectra — Leaderboard Controller
 *
 * Two leaderboard scopes:
 *   1. Course leaderboard  — ranks everyone who has activity for a given course
 *   2. My-courses leaderboard — ranks students in the same dept + level as viewer
 *
 * Two time periods: 'weekly' (since Monday 00:00 WAT) and 'alltime'.
 *
 * Privacy: users with show_on_leaderboard = false appear as "Anonymous Student".
 */

const { supabaseAdmin } = require('../config/supabase');
const { ApiError } = require('../middleware/errorHandler');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Monday 00:00 WAT expressed as a UTC ISO timestamp. */
function weekStartUTC() {
  const nowWAT = new Date(Date.now() + 60 * 60 * 1000); // shift to WAT
  const day = nowWAT.getUTCDay(); // 0=Sun
  const daysFromMonday = day === 0 ? 6 : day - 1;
  const mondayWAT = new Date(nowWAT.getTime() - daysFromMonday * 86400000);
  mondayWAT.setUTCHours(0, 0, 0, 0); // midnight WAT
  return new Date(mondayWAT.getTime() - 60 * 60 * 1000).toISOString(); // back to UTC
}

/** Deterministic avatar color from user_id. */
function avatarColor(userId) {
  const palette = [
    '#2563EB', '#22D3EE', '#10B981', '#F59E0B',
    '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6',
  ];
  let h = 0;
  for (let i = 0; i < userId.length; i++) {
    h = Math.imul(31, h) + userId.charCodeAt(i) | 0;
  }
  return palette[Math.abs(h) % palette.length];
}

/**
 * Aggregate streak_events rows into a sorted leaderboard array.
 * events: [{ user_id, points }]
 * usersMap: Map<user_id, { display_name, show_on_leaderboard, current_streak }>
 */
function buildRanking(events, usersMap, viewerId) {
  // Sum points per user
  const totals = new Map();
  for (const e of events) {
    totals.set(e.user_id, (totals.get(e.user_id) || 0) + e.points);
  }

  // Build entries
  const entries = [];
  for (const [userId, points] of totals.entries()) {
    const info = usersMap.get(userId);
    if (!info) continue;
    const anonymous = !info.show_on_leaderboard && userId !== viewerId;
    entries.push({
      user_id:        anonymous ? null : userId,
      display_name:   anonymous ? 'Anonymous Student' : (info.display_name || 'Student'),
      avatar_color:   anonymous ? '#6B7280' : avatarColor(userId),
      points,
      current_streak: info.current_streak || 0,
      is_self:        userId === viewerId,
    });
  }

  // Sort descending by points, then by streak as tiebreak
  entries.sort((a, b) => b.points - a.points || b.current_streak - a.current_streak);

  // Assign rank (ties share a rank)
  let rank = 1;
  for (let i = 0; i < entries.length; i++) {
    if (i > 0 && entries[i].points < entries[i - 1].points) rank = i + 1;
    entries[i].rank = rank;
  }

  return entries;
}

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * GET /api/v1/leaderboard/course/:courseCode?period=weekly|alltime
 *
 * Returns top 50 students ranked by points for a given course.
 * The viewer's own entry is always included even if outside top 50.
 */
async function getCourseLeaderboard(req, res, next) {
  try {
    const viewerId = req.user.id;
    const { courseCode } = req.params;
    const { period = 'weekly' } = req.query;

    if (!courseCode) throw new ApiError(400, 'courseCode is required');

    // ── 1. Fetch relevant streak_events ──────────────────────────────────────
    let eventsQuery = supabaseAdmin
      .from('streak_events')
      .select('user_id, points')
      .eq('course_code', courseCode)
      .neq('action_type', 'milestone_bonus'); // milestone bonuses are not course-specific

    if (period === 'weekly') {
      eventsQuery = eventsQuery.gte('created_at', weekStartUTC());
    }

    const { data: events, error: eventsErr } = await eventsQuery;
    if (eventsErr) throw new ApiError(500, 'Failed to fetch leaderboard data');

    if (!events || events.length === 0) {
      return res.json({ success: true, data: { period, course_code: courseCode, entries: [], self_rank: null } });
    }

    // ── 2. Fetch user profiles for everyone in the event set ──────────────
    const userIds = [...new Set(events.map((e) => e.user_id))];

    const { data: users, error: usersErr } = await supabaseAdmin
      .from('users')
      .select('id, display_name')
      .in('id', userIds);

    const { data: streaks } = await supabaseAdmin
      .from('study_streaks')
      .select('user_id, current_streak, show_on_leaderboard')
      .in('user_id', userIds);

    if (usersErr) throw new ApiError(500, 'Failed to fetch user data');

    // Build lookup map
    const usersMap = new Map();
    for (const u of users || []) {
      const streakRow = (streaks || []).find((s) => s.user_id === u.id);
      usersMap.set(u.id, {
        display_name:        u.display_name,
        show_on_leaderboard: streakRow?.show_on_leaderboard ?? true,
        current_streak:      streakRow?.current_streak ?? 0,
      });
    }

    // ── 3. Build ranking ──────────────────────────────────────────────────
    const allEntries = buildRanking(events, usersMap, viewerId);
    const top50      = allEntries.slice(0, 50);
    const selfEntry  = allEntries.find((e) => e.is_self);

    // Ensure viewer appears even if outside top 50
    const selfInTop50 = top50.some((e) => e.is_self);
    if (selfEntry && !selfInTop50) top50.push(selfEntry);

    res.json({
      success: true,
      data: {
        period,
        course_code: courseCode,
        entries:     top50,
        self_rank:   selfEntry?.rank ?? null,
        total_participants: allEntries.length,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/leaderboard/my-courses?period=weekly|alltime
 *
 * Aggregates points across ALL courses for students in the same
 * department + level as the viewer. Top 50 returned.
 */
async function getMyCoursesLeaderboard(req, res, next) {
  try {
    const viewerId  = req.user.id;
    const viewerDept  = req.user.profile?.department_id;
    const viewerLevel = req.user.profile?.current_level;
    const { period = 'weekly' } = req.query;

    // ── 1. Find classmates (same dept + level) ────────────────────────────
    let classmatesQuery = supabaseAdmin
      .from('users')
      .select('id, display_name');

    if (viewerDept)  classmatesQuery = classmatesQuery.eq('department_id', viewerDept);
    if (viewerLevel) classmatesQuery = classmatesQuery.eq('current_level', viewerLevel);

    const { data: classmates, error: classmatesErr } = await classmatesQuery;
    if (classmatesErr) throw new ApiError(500, 'Failed to fetch classmates');

    if (!classmates || classmates.length === 0) {
      return res.json({ success: true, data: { period, entries: [], self_rank: null } });
    }

    const classmateIds = classmates.map((c) => c.id);

    // ── 2. Fetch all events for classmates ────────────────────────────────
    let eventsQuery = supabaseAdmin
      .from('streak_events')
      .select('user_id, points')
      .in('user_id', classmateIds);

    if (period === 'weekly') {
      eventsQuery = eventsQuery.gte('created_at', weekStartUTC());
    }

    const { data: events, error: eventsErr } = await eventsQuery;
    if (eventsErr) throw new ApiError(500, 'Failed to fetch event data');

    if (!events || events.length === 0) {
      return res.json({ success: true, data: { period, entries: [], self_rank: null } });
    }

    // ── 3. Fetch streak rows for show_on_leaderboard + current_streak ─────
    const activeUserIds = [...new Set(events.map((e) => e.user_id))];

    const { data: streaks } = await supabaseAdmin
      .from('study_streaks')
      .select('user_id, current_streak, show_on_leaderboard')
      .in('user_id', activeUserIds);

    const usersMap = new Map();
    for (const c of classmates) {
      const streakRow = (streaks || []).find((s) => s.user_id === c.id);
      usersMap.set(c.id, {
        display_name:        c.display_name,
        show_on_leaderboard: streakRow?.show_on_leaderboard ?? true,
        current_streak:      streakRow?.current_streak ?? 0,
      });
    }

    // ── 4. Build ranking ──────────────────────────────────────────────────
    const allEntries = buildRanking(events, usersMap, viewerId);
    const top50      = allEntries.slice(0, 50);
    const selfEntry  = allEntries.find((e) => e.is_self);

    if (selfEntry && !top50.some((e) => e.is_self)) top50.push(selfEntry);

    res.json({
      success: true,
      data: {
        period,
        entries:     top50,
        self_rank:   selfEntry?.rank ?? null,
        total_participants: allEntries.length,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/leaderboard/my-rank/:courseCode?period=weekly|alltime
 *
 * Lightweight endpoint: returns only the viewer's rank + points for a course.
 * Used by the course header "My Rank" badge without loading the full list.
 */
async function getMyRank(req, res, next) {
  try {
    const viewerId   = req.user.id;
    const { courseCode } = req.params;
    const { period = 'weekly' } = req.query;

    if (!courseCode) throw new ApiError(400, 'courseCode is required');

    let eventsQuery = supabaseAdmin
      .from('streak_events')
      .select('user_id, points')
      .eq('course_code', courseCode)
      .neq('action_type', 'milestone_bonus');

    if (period === 'weekly') {
      eventsQuery = eventsQuery.gte('created_at', weekStartUTC());
    }

    const { data: events, error } = await eventsQuery;
    if (error) throw new ApiError(500, 'Failed to fetch rank data');

    if (!events || events.length === 0) {
      return res.json({ success: true, data: { rank: null, points: 0, total_participants: 0 } });
    }

    // Sum per user
    const totals = new Map();
    for (const e of events) {
      totals.set(e.user_id, (totals.get(e.user_id) || 0) + e.points);
    }

    const myPoints = totals.get(viewerId) || 0;
    const sorted   = [...totals.values()].sort((a, b) => b - a);
    const rank     = sorted.findIndex((p) => p <= myPoints) + 1;

    res.json({
      success: true,
      data: {
        rank:               myPoints > 0 ? rank : null,
        points:             myPoints,
        total_participants: totals.size,
        period,
        course_code:        courseCode,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getCourseLeaderboard,
  getMyCoursesLeaderboard,
  getMyRank,
};
