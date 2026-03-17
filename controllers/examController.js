/**
 * Vectra - Exam Countdown Controller
 */

const { supabaseAdmin } = require('../config/supabase');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Get all exam countdowns for the current user
 */
async function getCountdowns(req, res, next) {
  try {
    const { data, error } = await supabaseAdmin
      .from('exam_countdowns')
      .select('*')
      .eq('user_id', req.user.id)
      .order('exam_date', { ascending: true });

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
 * Add an exam countdown
 */
async function addCountdown(req, res, next) {
  try {
    const { course_code, course_name, exam_type, exam_date, venue, color } = req.body;

    if (!course_code || !exam_date) {
      throw new ApiError(400, 'course_code and exam_date are required');
    }

    const { data, error } = await supabaseAdmin
      .from('exam_countdowns')
      .insert({
        user_id: req.user.id,
        course_code,
        course_name,
        exam_type: exam_type || 'Final',
        exam_date,
        venue,
        color: color || 'primary'
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
 * Delete an exam countdown
 */
async function deleteCountdown(req, res, next) {
  try {
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from('exam_countdowns')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user.id);

    if (error) {
      throw new ApiError(400, error.message);
    }

    res.json({
      success: true,
      message: 'Countdown deleted'
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getCountdowns,
  addCountdown,
  deleteCountdown
};
