/**
 * PastQuest - Question Controller
 */

const { supabaseAdmin } = require('../config/supabase');
const { ApiError } = require('../middleware/errorHandler');
const cloudinary = require('../utils/cloudinary');
const { sendQuestionApproved, sendQuestionRejected } = require('../utils/email');

/**
 * Get past questions (public)
 */
async function getQuestions(req, res, next) {
  try {
    const {
      page = 1,
      limit = 20,
      departmentId,
      level,
      courseId,
      courseCode,
      academicSession,
      questionType,
      semester
    } = req.query;

    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('past_questions')
      .select('*', { count: 'exact' })
      .eq('status', 'approved');

    if (departmentId) query = query.eq('department_id', departmentId);
    if (level) query = query.eq('level', level);
    if (courseId) query = query.eq('course_id', courseId);
    if (courseCode) query = query.eq('course_code', courseCode);
    if (academicSession) query = query.eq('academic_session', academicSession);
    if (questionType) query = query.eq('question_type', questionType);
    if (semester) query = query.eq('semester', semester);

    const { data, error, count } = await query
      .order('academic_session', { ascending: false })
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
 * Get single question
 */
async function getQuestion(req, res, next) {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('past_questions')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new ApiError(404, 'Question not found');
    }

    // Check if user has access (if authenticated)
    let hasAccess = false;
    if (req.user) {
      const { data: access } = await supabaseAdmin.rpc('check_user_access', {
        p_user_id: req.user.id,
        p_department_id: data.department_id,
        p_level: data.level,
        p_course_id: data.course_id
      });
      hasAccess = access;
    }

    // Log access
    if (req.user) {
      await supabaseAdmin.from('access_logs').insert({
        user_id: req.user.id,
        resource_type: 'past_question',
        resource_id: id,
        action: 'view',
        is_valid_access: hasAccess
      });
    }

    res.json({
      success: true,
      data: {
        ...data,
        hasAccess
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Upload question (contributor)
 */
async function uploadQuestion(req, res, next) {
  try {
    const userId = req.user.id;
    const userEmail = req.user.email;

    const {
      courseId,
      courseCode,
      courseTitle,
      universityId,
      facultyId,
      departmentId,
      level,
      semester,
      academicSession,
      questionType
    } = req.body;

    // Validate required fields
    if (!courseId || !courseCode || !departmentId || !level || !academicSession || !questionType) {
      throw new ApiError(400, 'Missing required fields');
    }

    // Handle file upload
    if (!req.file && !req.body.imageUrl) {
      throw new ApiError(400, 'Image file is required');
    }

    let imageUrl = req.body.imageUrl;
    let imagePublicId = req.body.imagePublicId;

    // Upload to Cloudinary if file is provided
    if (req.file) {
      const uploadResult = await cloudinary.uploadBuffer(req.file.buffer, {
        folder: `pastquest/questions/${universityId}/${departmentId}`,
        public_id: `${courseCode.replace(/\s/g, '_')}_${academicSession.replace('/', '-')}_${questionType}_${Date.now()}`
      });

      if (!uploadResult.success) {
        throw new ApiError(500, 'Failed to upload image');
      }

      imageUrl = uploadResult.data.url;
      imagePublicId = uploadResult.data.publicId;
    }

    // Create question record
    const { data, error } = await supabaseAdmin
      .from('past_questions')
      .insert({
        course_id: courseId,
        course_code: courseCode,
        course_title: courseTitle,
        university_id: universityId,
        faculty_id: facultyId,
        department_id: departmentId,
        level,
        semester,
        academic_session: academicSession,
        question_type: questionType,
        image_url: imageUrl,
        image_public_id: imagePublicId,
        uploaded_by: userId,
        uploader_email: userEmail,
        status: 'pending'
      })
      .select()
      .single();

    if (error) {
      // Cleanup uploaded image if database insert fails
      if (imagePublicId) {
        await cloudinary.deleteFile(imagePublicId);
      }
      throw new ApiError(400, error.message);
    }

    res.status(201).json({
      success: true,
      message: 'Question uploaded successfully. Pending review.',
      data: data
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get contributor's uploads
 */
async function getMyUploads(req, res, next) {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, status } = req.query;
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('past_questions')
      .select('*', { count: 'exact' })
      .eq('uploaded_by', userId);

    if (status) {
      query = query.eq('status', status);
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
 * Get contributor stats
 */
async function getContributorStats(req, res, next) {
  try {
    const userId = req.user.id;

    const { data, error } = await supabaseAdmin.rpc('get_contributor_stats', {
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

// ============================================
// ADMIN FUNCTIONS
// ============================================

/**
 * Get pending questions (admin)
 */
async function getPendingQuestions(req, res, next) {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const { data, error, count } = await supabaseAdmin
      .from('past_questions')
      .select('*, uploader:users!uploaded_by(email, display_name)', { count: 'exact' })
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
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
 * Approve question (admin)
 */
async function approveQuestion(req, res, next) {
  try {
    const { id } = req.params;
    const adminId = req.user.id;

    const { data, error } = await supabaseAdmin.rpc('approve_question', {
      p_question_id: id,
      p_admin_id: adminId
    });

    if (error) {
      throw new ApiError(400, error.message);
    }

    if (!data.success) {
      throw new ApiError(400, data.message);
    }

    // Get question details for notification
    const { data: question } = await supabaseAdmin
      .from('past_questions')
      .select('course_code, uploader_email')
      .eq('id', id)
      .single();

    // Send notification email
    if (question?.uploader_email) {
      sendQuestionApproved(question.uploader_email, {
        courseCode: question.course_code,
        points: data.points_awarded,
        earnings: data.earnings
      }).catch(console.error);
    }

    res.json({
      success: true,
      message: 'Question approved',
      data: data
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Reject question (admin)
 */
async function rejectQuestion(req, res, next) {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminId = req.user.id;

    if (!reason) {
      throw new ApiError(400, 'Rejection reason is required');
    }

    // Get question details before rejection
    const { data: question } = await supabaseAdmin
      .from('past_questions')
      .select('course_code, uploader_email')
      .eq('id', id)
      .single();

    const { data, error } = await supabaseAdmin.rpc('reject_question', {
      p_question_id: id,
      p_admin_id: adminId,
      p_reason: reason
    });

    if (error) {
      throw new ApiError(400, error.message);
    }

    if (!data.success) {
      throw new ApiError(400, data.message);
    }

    // Send notification email
    if (question?.uploader_email) {
      sendQuestionRejected(question.uploader_email, {
        courseCode: question.course_code,
        reason
      }).catch(console.error);
    }

    res.json({
      success: true,
      message: 'Question rejected',
      data: data
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Delete question (admin)
 */
async function deleteQuestion(req, res, next) {
  try {
    const { id } = req.params;

    // Get image public ID for cleanup
    const { data: question } = await supabaseAdmin
      .from('past_questions')
      .select('image_public_id')
      .eq('id', id)
      .single();

    // Delete from database
    const { error } = await supabaseAdmin
      .from('past_questions')
      .delete()
      .eq('id', id);

    if (error) {
      throw new ApiError(400, error.message);
    }

    // Delete from Cloudinary
    if (question?.image_public_id) {
      await cloudinary.deleteFile(question.image_public_id);
    }

    res.json({
      success: true,
      message: 'Question deleted'
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get all questions (admin)
 */
async function getAllQuestions(req, res, next) {
  try {
    const { page = 1, limit = 20, status, departmentId } = req.query;
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('past_questions')
      .select('*, uploader:users!uploaded_by(email, display_name)', { count: 'exact' });

    if (status) {
      query = query.eq('status', status);
    }

    if (departmentId) {
      query = query.eq('department_id', departmentId);
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
 * Get repeated questions analysis for a course
 */
async function getRepeatedQuestions(req, res, next) {
  try {
    const { courseCode } = req.params;

    if (!courseCode) {
      throw new ApiError(400, 'courseCode is required');
    }

    const { data, error } = await supabaseAdmin
      .from('past_questions')
      .select('academic_session, question_type')
      .eq('course_code', courseCode)
      .eq('status', 'approved');

    if (error) {
      throw new ApiError(400, error.message);
    }

    const questions = data || [];
    const total = questions.length;

    // Group by session
    const sessionMap = {};
    questions.forEach(q => {
      const session = q.academic_session || 'Unknown';
      sessionMap[session] = (sessionMap[session] || 0) + 1;
    });

    const by_session = Object.entries(sessionMap)
      .map(([session, count]) => ({ session, count }))
      .sort((a, b) => b.session.localeCompare(a.session));

    // Group by type
    const typeMap = {};
    questions.forEach(q => {
      const type = q.question_type || 'Unknown';
      typeMap[type] = (typeMap[type] || 0) + 1;
    });

    const by_type = Object.entries(typeMap)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);

    const years_available = by_session.map(s => s.session);

    res.json({
      success: true,
      data: {
        course_code: courseCode,
        total_questions: total,
        by_session,
        by_type,
        years_available
      }
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getQuestions,
  getQuestion,
  uploadQuestion,
  getMyUploads,
  getContributorStats,
  getPendingQuestions,
  approveQuestion,
  rejectQuestion,
  deleteQuestion,
  getAllQuestions,
  getRepeatedQuestions
};
