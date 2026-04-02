/**
 * Vectra - Upload Controller
 * Handles user-submitted past questions and textbooks
 */

const { supabaseAdmin } = require('../config/supabase');
const { ApiError } = require('../middleware/errorHandler');
const cloudinary = require('../config/cloudinary');
const { scanDocument } = require('../utils/documentScanner');
const fs = require('fs');
const path = require('path');

/**
 * Upload a past question
 */
async function uploadVectraion(req, res, next) {
  try {
    const userId = req.user.id;
    const userEmail = req.user.email;
    const {
      course_code,
      course_name,
      university_id,
      faculty_id,
      department_id,
      academic_session,
      semester,
      exam_type,
      description,
      admin_approved,
    } = req.body;

    if (!course_code) {
      throw new ApiError(400, 'course_code is required');
    }

    if (!req.file) {
      throw new ApiError(400, 'No file provided');
    }

    // Detect file type from mimetype
    const isImage = req.file.mimetype && req.file.mimetype.startsWith('image/');
    const detectedFileType = isImage ? 'image' : 'pdf';

    // Admin auto-approval — admins never need approval
    const userRole = req.user.profile?.role || req.user.role || 'user';
    const isAdmin = userRole === 'admin' || userRole === 'super_admin';
    const autoApprove = isAdmin;

    let fileUrl = null;
    let filePublicId = null;

    // Scan/enhance image documents before uploading (PDFs pass through unchanged)
    let filePath = req.file.path;
    if (isImage) {
      try {
        const { outputPath } = await scanDocument(filePath);
        filePath = outputPath;
      } catch (scanError) {
        console.warn('[Scanner] Enhancement failed, using original:', scanError.message);
      }
    }

    try {
      // Upload to Cloudinary
      const result = await cloudinary.uploader.upload(filePath, {
        resource_type: isImage ? 'image' : 'raw',
        folder: `vectra/uploads/questions/${userId}`,
        public_id: `question_${Date.now()}`,
      });

      fileUrl = result.secure_url;
      filePublicId = result.public_id;
    } catch (cloudinaryError) {
      console.warn('[Upload] Cloudinary upload failed:', cloudinaryError.message);
      // Fallback: keep file locally
      const newPath = path.join(__dirname, '../temp', `question_${Date.now()}_${req.file.originalname}`);
      fs.renameSync(req.file.path, newPath);
      fileUrl = `/temp/${path.basename(newPath)}`;
    }

    // Clean up temp file if uploaded to Cloudinary
    if (filePublicId && filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Create upload record
    const { data, error } = await supabaseAdmin
      .from('user_uploads')
      .insert({
        user_id: userId,
        user_email: userEmail,
        upload_type: 'past_question',
        course_code,
        course_name: course_name || null,
        university_id: university_id || null,
        faculty_id: faculty_id || null,
        department_id: department_id || null,
        academic_session: academic_session || null,
        semester: semester || null,
        exam_type: exam_type || null,
        description: description || null,
        file_url: fileUrl,
        file_public_id: filePublicId,
        file_type: detectedFileType,
        file_size: req.file.size,
        status: autoApprove ? 'approved' : 'pending',
        visibility: autoApprove ? 'published' : 'private',
        ...(autoApprove && { published_by: userId, published_at: new Date().toISOString() }),
      })
      .select()
      .single();

    if (error) {
      throw new ApiError(400, error.message);
    }

    // Log upload activity
    try {
      await supabaseAdmin.from('admin_activity_logs').insert({
        admin_id: userId,
        action: 'user_upload',
        target_type: 'upload',
        target_id: data.id,
        details: { upload_type: 'past_question', course_code, user_email: userEmail, auto_approved: autoApprove },
      });
    } catch (_) {}

    res.status(201).json({
      success: true,
      message: 'Past question uploaded successfully. It will be reviewed and published by our team.',
      data,
    });
  } catch (error) {
    // Clean up temp file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    next(error);
  }
}

/**
 * Upload a textbook/study material
 */
async function uploadTextbook(req, res, next) {
  try {
    const userId = req.user.id;
    const userEmail = req.user.email;
    const {
      course_code,
      course_name,
      university_id,
      faculty_id,
      department_id,
      title,
      author,
      edition,
      material_type,
      description,
    } = req.body;

    if (!course_code || !title) {
      throw new ApiError(400, 'course_code and title are required');
    }

    if (!req.file) {
      throw new ApiError(400, 'No file provided');
    }

    const tbUserRole = req.user.profile?.role || req.user.role || 'user';
    const tbIsAdmin = tbUserRole === 'admin' || tbUserRole === 'super_admin';

    let fileUrl = null;
    let filePublicId = null;

    try {
      const isTextbookImage = req.file.mimetype && req.file.mimetype.startsWith('image/');
      const result = await cloudinary.uploader.upload(req.file.path, {
        resource_type: isTextbookImage ? 'image' : 'raw',
        folder: `vectra/uploads/textbooks/${userId}`,
        public_id: `textbook_${Date.now()}`,
      });

      fileUrl = result.secure_url;
      filePublicId = result.public_id;
    } catch (cloudinaryError) {
      console.warn('[Upload] Cloudinary upload failed:', cloudinaryError.message);
      const newPath = path.join(__dirname, '../temp', `textbook_${Date.now()}_${req.file.originalname}`);
      fs.renameSync(req.file.path, newPath);
      fileUrl = `/temp/${path.basename(newPath)}`;
    }

    if (filePublicId && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    const { data, error } = await supabaseAdmin
      .from('user_uploads')
      .insert({
        user_id: userId,
        user_email: userEmail,
        upload_type: 'textbook',
        course_code,
        course_name: course_name || null,
        university_id: university_id || null,
        faculty_id: faculty_id || null,
        department_id: department_id || null,
        title,
        author: author || null,
        edition: edition || null,
        material_type: material_type || 'Textbook',
        description: description || null,
        file_url: fileUrl,
        file_public_id: filePublicId,
        file_type: req.file.mimetype && req.file.mimetype.startsWith('image/') ? 'image' : 'pdf',
        file_size: req.file.size,
        status: tbIsAdmin ? 'approved' : 'pending',
        visibility: tbIsAdmin ? 'published' : 'private',
        ...(tbIsAdmin && { published_by: userId, published_at: new Date().toISOString() }),
      })
      .select()
      .single();

    if (error) {
      throw new ApiError(400, error.message);
    }

    res.status(201).json({
      success: true,
      message: tbIsAdmin ? 'Textbook uploaded and published.' : 'Textbook uploaded successfully.',
      data,
    });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    next(error);
  }
}

/**
 * Get user's uploads
 */
async function getMyUploads(req, res, next) {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 100, upload_type, status, course_code } = req.query;

    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('user_uploads')
      .select('*', { count: 'exact' })
      .eq('user_id', userId);

    if (upload_type) query = query.eq('upload_type', upload_type);
    if (status) query = query.eq('status', status);
    if (course_code) query = query.eq('course_code', course_code);

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (error) {
      throw new ApiError(400, error.message);
    }

    res.json({
      success: true,
      data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get single upload
 */
async function getUpload(req, res, next) {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('user_uploads')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      throw new ApiError(404, 'Upload not found');
    }

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

// ================================
// ADMIN REVIEW FUNCTIONS
// ================================

/**
 * Get all pending uploads (Admin only)
 */
async function getPendingUploads(req, res, next) {
  try {
    const { page = 1, limit = 20, upload_type } = req.query;
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('user_uploads')
      .select('*', { count: 'exact' })
      .eq('status', 'pending');

    if (upload_type) query = query.eq('upload_type', upload_type);

    const { data, error, count } = await query
      .order('created_at', { ascending: true })
      .range(offset, offset + parseInt(limit) - 1);

    if (error) {
      throw new ApiError(400, error.message);
    }

    res.json({
      success: true,
      data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Approve an upload (Admin only)
 */
async function approveUpload(req, res, next) {
  try {
    const adminId = req.user.id;
    const { id } = req.params;
    const { admin_notes } = req.body;

    // Get the upload
    const { data: upload, error: fetchError } = await supabaseAdmin
      .from('user_uploads')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !upload) {
      throw new ApiError(404, 'Upload not found');
    }

    if (upload.status !== 'pending') {
      throw new ApiError(400, 'Upload has already been reviewed');
    }

    // Update upload status and publish
    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('user_uploads')
      .update({
        status: 'approved',
        visibility: 'published',
        reviewed_by: adminId,
        reviewed_at: now,
        published_by: adminId,
        published_at: now,
        admin_notes: admin_notes || null,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new ApiError(400, error.message);
    }

    // Log admin activity
    try {
      await supabaseAdmin.from('admin_activity_logs').insert({
        admin_id: adminId,
        action: 'approve_upload',
        target_type: 'upload',
        target_id: upload.id,
        details: { upload_type: upload.upload_type, course_code: upload.course_code, user_email: upload.user_email },
      });
    } catch (_) {}

    // Create notification for uploader
    try {
      await supabaseAdmin.from('notifications').insert({
        user_id: upload.user_id,
        type: 'upload_approved',
        title: 'Upload Approved',
        body: `Your ${upload.upload_type === 'past_question' ? 'past question' : 'textbook'} for ${upload.course_code} has been approved!`,
        data: {
          upload_id: upload.id,
          upload_type: upload.upload_type,
          course_code: upload.course_code,
        },
      });
    } catch (_) {}

    res.json({
      success: true,
      message: 'Upload approved successfully',
      data,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Reject an upload (Admin only)
 */
async function rejectUpload(req, res, next) {
  try {
    const adminId = req.user.id;
    const { id } = req.params;
    const { rejection_reason, admin_notes } = req.body;

    if (!rejection_reason) {
      throw new ApiError(400, 'rejection_reason is required');
    }

    // Get the upload
    const { data: upload, error: fetchError } = await supabaseAdmin
      .from('user_uploads')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !upload) {
      throw new ApiError(404, 'Upload not found');
    }

    if (upload.status !== 'pending') {
      throw new ApiError(400, 'Upload has already been reviewed');
    }

    // Update upload status
    const { data, error } = await supabaseAdmin
      .from('user_uploads')
      .update({
        status: 'rejected',
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
        rejection_reason,
        admin_notes: admin_notes || null,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new ApiError(400, error.message);
    }

    // Log admin activity
    try {
      await supabaseAdmin.from('admin_activity_logs').insert({
        admin_id: adminId,
        action: 'reject_upload',
        target_type: 'upload',
        target_id: upload.id,
        details: { upload_type: upload.upload_type, course_code: upload.course_code, user_email: upload.user_email, rejection_reason },
      });
    } catch (_) {}

    // Create notification for uploader
    try {
      await supabaseAdmin.from('notifications').insert({
        user_id: upload.user_id,
        type: 'upload_rejected',
        title: 'Upload Rejected',
        body: `Your ${upload.upload_type === 'past_question' ? 'past question' : 'textbook'} for ${upload.course_code} was not approved.`,
        data: {
          upload_id: upload.id,
          upload_type: upload.upload_type,
          course_code: upload.course_code,
          rejection_reason,
        },
      });
    } catch (_) {}

    res.json({
      success: true,
      message: 'Upload rejected',
      data,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get upload statistics (Admin only)
 */
async function getUploadStats(req, res, next) {
  try {
    // Get counts by status
    const { data: pending } = await supabaseAdmin
      .from('user_uploads')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');

    const { data: approved } = await supabaseAdmin
      .from('user_uploads')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'approved');

    const { data: rejected } = await supabaseAdmin
      .from('user_uploads')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'rejected');

    // Get today's uploads
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { count: todayCount } = await supabaseAdmin
      .from('user_uploads')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', today.toISOString());

    res.json({
      success: true,
      data: {
        pending: pending?.length || 0,
        approved: approved?.length || 0,
        rejected: rejected?.length || 0,
        today: todayCount || 0,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get published uploads (visible to all authenticated users)
 * Filters by visibility='published' (admin-approved content)
 */
async function getPublishedUploads(req, res, next) {
  try {
    const { page = 1, limit = 20, upload_type, course_code, department_id } = req.query;
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('user_uploads')
      .select('*', { count: 'exact' })
      .eq('visibility', 'published')
      .eq('status', 'approved');

    if (upload_type) query = query.eq('upload_type', upload_type);
    if (course_code) query = query.eq('course_code', course_code);
    if (department_id) query = query.eq('department_id', department_id);

    const { data, error, count } = await query
      .order('published_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (error) throw new ApiError(400, error.message);

    res.json({
      success: true,
      data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get all uploads (Admin only) — all statuses, optional upload_type filter
 */
async function getAllUploads(req, res, next) {
  try {
    const { page = 1, limit = 50, upload_type, status } = req.query;
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('user_uploads')
      .select('*', { count: 'exact' });

    if (upload_type) query = query.eq('upload_type', upload_type);
    if (status) query = query.eq('status', status);

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (error) throw new ApiError(400, error.message);

    res.json({
      success: true,
      data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Delete an upload (Admin only)
 */
async function deleteUpload(req, res, next) {
  try {
    const { id } = req.params;

    const { data: upload, error: fetchError } = await supabaseAdmin
      .from('user_uploads')
      .select('file_public_id, file_type')
      .eq('id', id)
      .single();

    if (fetchError || !upload) {
      throw new ApiError(404, 'Upload not found');
    }

    // Delete from Cloudinary if we have a public_id
    if (upload.file_public_id) {
      try {
        await cloudinary.uploader.destroy(upload.file_public_id, {
          resource_type: upload.file_type === 'image' ? 'image' : 'raw',
        });
      } catch (_) {}
    }

    const { error } = await supabaseAdmin
      .from('user_uploads')
      .delete()
      .eq('id', id);

    if (error) throw new ApiError(400, error.message);

    res.json({ success: true, message: 'Upload deleted' });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  uploadVectraion,
  uploadTextbook,
  getMyUploads,
  getUpload,
  getPublishedUploads,
  getPendingUploads,
  approveUpload,
  rejectUpload,
  getUploadStats,
  getAllUploads,
  deleteUpload,
};
