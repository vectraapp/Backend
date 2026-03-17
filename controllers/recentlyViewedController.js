/**
 * Vectra - Recently Viewed Controller
 */

const { supabaseAdmin } = require('../config/supabase');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Get recently viewed items for the current user (top 20)
 */
async function getRecentlyViewed(req, res, next) {
  try {
    const { data, error } = await supabaseAdmin
      .from('recently_viewed')
      .select('*')
      .eq('user_id', req.user.id)
      .order('viewed_at', { ascending: false })
      .limit(20);

    if (error) {
      throw new ApiError(400, error.message);
    }

    res.json({
      success: true,
      data: data || []
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Add or update a recently viewed item
 */
async function addRecentlyViewed(req, res, next) {
  try {
    const { resource_type, resource_id, title, subtitle, route } = req.body;

    if (!resource_id) {
      throw new ApiError(400, 'resource_id is required');
    }

    const userId = req.user.id;

    // Check if record already exists for this user + resource
    const { data: existing, error: checkError } = await supabaseAdmin
      .from('recently_viewed')
      .select('id')
      .eq('user_id', userId)
      .eq('resource_id', resource_id)
      .maybeSingle();

    if (checkError) {
      throw new ApiError(400, checkError.message);
    }

    let result;

    if (existing) {
      // Update viewed_at timestamp
      const { data, error } = await supabaseAdmin
        .from('recently_viewed')
        .update({
          viewed_at: new Date().toISOString(),
          title,
          subtitle,
          route,
          resource_type
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        throw new ApiError(400, error.message);
      }

      result = data;
    } else {
      // Insert new record
      const { data, error } = await supabaseAdmin
        .from('recently_viewed')
        .insert({
          user_id: userId,
          resource_type,
          resource_id,
          title,
          subtitle,
          route,
          viewed_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        throw new ApiError(400, error.message);
      }

      result = data;

      // Keep max 50 records per user — delete oldest if over limit
      const { data: allRecords, error: countError } = await supabaseAdmin
        .from('recently_viewed')
        .select('id, viewed_at')
        .eq('user_id', userId)
        .order('viewed_at', { ascending: false });

      if (!countError && allRecords && allRecords.length > 50) {
        const toDelete = allRecords.slice(50).map(r => r.id);
        await supabaseAdmin
          .from('recently_viewed')
          .delete()
          .in('id', toDelete);
      }
    }

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getRecentlyViewed,
  addRecentlyViewed
};
