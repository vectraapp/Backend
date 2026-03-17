/**
 * Vectra - Bookmark Controller
 */

const { supabaseAdmin } = require('../config/supabase');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Get all bookmarks for the current user
 */
async function getBookmarks(req, res, next) {
  try {
    const { data, error } = await supabaseAdmin
      .from('bookmarks')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

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
 * Add a bookmark
 */
async function addBookmark(req, res, next) {
  try {
    const { resource_type, resource_id, title, subtitle, note } = req.body;

    if (!resource_type || !resource_id) {
      throw new ApiError(400, 'resource_type and resource_id are required');
    }

    // Check for duplicate
    const { data: existing, error: checkError } = await supabaseAdmin
      .from('bookmarks')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('resource_id', resource_id)
      .maybeSingle();

    if (checkError) {
      throw new ApiError(400, checkError.message);
    }

    if (existing) {
      return res.json({
        success: true,
        data: existing,
        message: 'Already bookmarked'
      });
    }

    const { data, error } = await supabaseAdmin
      .from('bookmarks')
      .insert({
        user_id: req.user.id,
        resource_type,
        resource_id,
        title,
        subtitle,
        note
      })
      .select()
      .single();

    if (error) {
      throw new ApiError(400, error.message);
    }

    res.status(201).json({
      success: true,
      data: data
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Remove a bookmark
 */
async function removeBookmark(req, res, next) {
  try {
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from('bookmarks')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user.id);

    if (error) {
      throw new ApiError(400, error.message);
    }

    res.json({
      success: true,
      message: 'Bookmark removed'
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getBookmarks,
  addBookmark,
  removeBookmark
};
