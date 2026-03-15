/**
 * Vectra - Study Group Controller
 */

const { supabaseAdmin } = require('../config/supabase');
const { ApiError } = require('../middleware/errorHandler');
const crypto = require('crypto');

// Generate a short unique invite code
function generateInviteCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase(); // e.g. "A3F2B1C9"
}

/**
 * Create a new study group
 * POST /api/v1/groups
 */
async function createGroup(req, res, next) {
  try {
    const userId = req.user.id;
    const { name, course_code, course_name, description, university_id, max_members } = req.body;

    if (!name || !course_code) {
      throw new ApiError(400, 'name and course_code are required');
    }

    const invite_code = generateInviteCode();

    const { data: group, error } = await supabaseAdmin
      .from('study_groups')
      .insert({
        name: name.trim(),
        course_code: course_code.trim().toUpperCase(),
        course_name: course_name?.trim() || null,
        description: description?.trim() || null,
        invite_code,
        created_by: userId,
        university_id: university_id || null,
        max_members: max_members || 50,
      })
      .select()
      .single();

    if (error) throw new ApiError(400, error.message);

    // Auto-add creator as admin member
    await supabaseAdmin
      .from('study_group_members')
      .insert({ group_id: group.id, user_id: userId, role: 'admin' });

    res.status(201).json({ success: true, data: group });
  } catch (error) {
    next(error);
  }
}

/**
 * Get groups the current user is a member of
 * GET /api/v1/groups/my
 */
async function getMyGroups(req, res, next) {
  try {
    const userId = req.user.id;

    const { data: memberships, error } = await supabaseAdmin
      .from('study_group_members')
      .select(`
        role,
        joined_at,
        study_groups (
          id, name, course_code, course_name, description,
          invite_code, created_by, max_members, is_active, created_at
        )
      `)
      .eq('user_id', userId)
      .eq('study_groups.is_active', true);

    if (error) throw new ApiError(400, error.message);

    // Get member counts for each group
    const groups = (memberships || [])
      .filter((m) => m.study_groups)
      .map((m) => ({ ...m.study_groups, my_role: m.role, joined_at: m.joined_at }));

    // Attach member counts
    const groupIds = groups.map((g) => g.id);
    let memberCounts = {};
    if (groupIds.length > 0) {
      const { data: counts } = await supabaseAdmin
        .from('study_group_members')
        .select('group_id')
        .in('group_id', groupIds);
      (counts || []).forEach((c) => {
        memberCounts[c.group_id] = (memberCounts[c.group_id] || 0) + 1;
      });
    }

    const result = groups.map((g) => ({ ...g, member_count: memberCounts[g.id] || 1 }));

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/**
 * Join a group via invite code
 * POST /api/v1/groups/join
 */
async function joinGroup(req, res, next) {
  try {
    const userId = req.user.id;
    const { invite_code } = req.body;

    if (!invite_code) throw new ApiError(400, 'invite_code is required');

    // Find group by invite code
    const { data: group, error: groupError } = await supabaseAdmin
      .from('study_groups')
      .select('*')
      .eq('invite_code', invite_code.trim().toUpperCase())
      .eq('is_active', true)
      .single();

    if (groupError || !group) throw new ApiError(404, 'Group not found. Check your invite code.');

    // Check if already a member
    const { data: existing } = await supabaseAdmin
      .from('study_group_members')
      .select('id')
      .eq('group_id', group.id)
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      return res.json({ success: true, data: group, message: 'Already a member' });
    }

    // Check member limit
    const { count } = await supabaseAdmin
      .from('study_group_members')
      .select('id', { count: 'exact', head: true })
      .eq('group_id', group.id);

    if (count >= group.max_members) {
      throw new ApiError(400, 'This group is full');
    }

    // Add member
    await supabaseAdmin
      .from('study_group_members')
      .insert({ group_id: group.id, user_id: userId, role: 'member' });

    res.json({ success: true, data: group });
  } catch (error) {
    next(error);
  }
}

/**
 * Get group details + members
 * GET /api/v1/groups/:id
 */
async function getGroup(req, res, next) {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    // Check membership
    const { data: membership } = await supabaseAdmin
      .from('study_group_members')
      .select('role')
      .eq('group_id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (!membership) throw new ApiError(403, 'You are not a member of this group');

    const { data: group, error } = await supabaseAdmin
      .from('study_groups')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !group) throw new ApiError(404, 'Group not found');

    // Get members with profile info
    const { data: members } = await supabaseAdmin
      .from('study_group_members')
      .select('user_id, role, joined_at')
      .eq('group_id', id);

    // Get display names from profiles
    const memberIds = (members || []).map((m) => m.user_id);
    let profiles = {};
    if (memberIds.length > 0) {
      const { data: profileData } = await supabaseAdmin
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', memberIds);
      (profileData || []).forEach((p) => { profiles[p.id] = p; });
    }

    const membersWithProfiles = (members || []).map((m) => ({
      ...m,
      display_name: profiles[m.user_id]?.display_name || 'Unknown',
      avatar_url: profiles[m.user_id]?.avatar_url || null,
    }));

    res.json({
      success: true,
      data: { ...group, my_role: membership.role, members: membersWithProfiles },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get messages for a group (paginated)
 * GET /api/v1/groups/:id/messages?before=<timestamp>&limit=50
 */
async function getMessages(req, res, next) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { before, limit = 50 } = req.query;

    // Check membership
    const { data: membership } = await supabaseAdmin
      .from('study_group_members')
      .select('role')
      .eq('group_id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (!membership) throw new ApiError(403, 'You are not a member of this group');

    let query = supabaseAdmin
      .from('study_group_messages')
      .select('id, content, user_id, created_at')
      .eq('group_id', id)
      .order('created_at', { ascending: false })
      .limit(Math.min(parseInt(limit, 10) || 50, 100));

    if (before) {
      query = query.lt('created_at', before);
    }

    const { data: messages, error } = await query;
    if (error) throw new ApiError(400, error.message);

    // Get profile info for message senders
    const senderIds = [...new Set((messages || []).map((m) => m.user_id))];
    let profiles = {};
    if (senderIds.length > 0) {
      const { data: profileData } = await supabaseAdmin
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', senderIds);
      (profileData || []).forEach((p) => { profiles[p.id] = p; });
    }

    const result = (messages || [])
      .map((m) => ({
        ...m,
        display_name: profiles[m.user_id]?.display_name || 'Unknown',
        avatar_url: profiles[m.user_id]?.avatar_url || null,
        is_mine: m.user_id === userId,
      }))
      .reverse(); // Return chronological order

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/**
 * Send a message to a group
 * POST /api/v1/groups/:id/messages
 */
async function sendMessage(req, res, next) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { content } = req.body;

    if (!content?.trim()) throw new ApiError(400, 'content is required');

    // Check membership
    const { data: membership } = await supabaseAdmin
      .from('study_group_members')
      .select('role')
      .eq('group_id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (!membership) throw new ApiError(403, 'You are not a member of this group');

    const { data: message, error } = await supabaseAdmin
      .from('study_group_messages')
      .insert({ group_id: id, user_id: userId, content: content.trim() })
      .select('id, content, user_id, created_at')
      .single();

    if (error) throw new ApiError(400, error.message);

    // Get sender profile
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('display_name, avatar_url')
      .eq('id', userId)
      .maybeSingle();

    res.status(201).json({
      success: true,
      data: {
        ...message,
        display_name: profile?.display_name || 'Unknown',
        avatar_url: profile?.avatar_url || null,
        is_mine: true,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Leave a group
 * DELETE /api/v1/groups/:id/leave
 */
async function leaveGroup(req, res, next) {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    // Check if creator — creators can't leave (must delete instead)
    const { data: group } = await supabaseAdmin
      .from('study_groups')
      .select('created_by')
      .eq('id', id)
      .single();

    if (group?.created_by === userId) {
      throw new ApiError(400, 'As the group creator, you cannot leave. Delete the group instead.');
    }

    await supabaseAdmin
      .from('study_group_members')
      .delete()
      .eq('group_id', id)
      .eq('user_id', userId);

    res.json({ success: true, message: 'Left the group' });
  } catch (error) {
    next(error);
  }
}

/**
 * Delete a group (creator only)
 * DELETE /api/v1/groups/:id
 */
async function deleteGroup(req, res, next) {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const { data: group } = await supabaseAdmin
      .from('study_groups')
      .select('created_by')
      .eq('id', id)
      .single();

    if (!group) throw new ApiError(404, 'Group not found');
    if (group.created_by !== userId) throw new ApiError(403, 'Only the group creator can delete it');

    // Soft delete
    await supabaseAdmin
      .from('study_groups')
      .update({ is_active: false })
      .eq('id', id);

    res.json({ success: true, message: 'Group deleted' });
  } catch (error) {
    next(error);
  }
}

module.exports = { createGroup, getMyGroups, joinGroup, getGroup, getMessages, sendMessage, leaveGroup, deleteGroup };
