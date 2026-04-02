/**
 * Vectra/Vectra - Lecture Controller
 */

const { supabaseAdmin } = require('../config/supabase');
const { ApiError } = require('../middleware/errorHandler');
const cloudinary = require('../config/cloudinary');
const { transcribeAudio } = require('../services/whisper');
const { structureLectureNotes } = require('../services/claude');
const { generateLecturePDF } = require('../services/lecturePdf');
const fs = require('fs');
const path = require('path');

/**
 * Create a new lecture record
 */
async function createLecture(req, res, next) {
  try {
    const userId = req.user.id;
    const { course_code, course_name, topic, lecturer, date, duration } = req.body;

    if (!course_code || !topic) {
      throw new ApiError(400, 'course_code and topic are required');
    }

    const { data, error } = await supabaseAdmin
      .from('lectures')
      .insert({
        user_id: userId,
        course_code,
        course_name: course_name || null,
        topic,
        lecturer: lecturer || null,
        date: date || new Date().toISOString().split('T')[0],
        duration: duration || 0,
        status: 'draft',
      })
      .select()
      .single();

    if (error) {
      throw new ApiError(400, error.message);
    }

    res.status(201).json({
      success: true,
      message: 'Lecture created successfully',
      data,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Upload audio file for a lecture
 */
async function uploadAudio(req, res, next) {
  try {
    const userId = req.user.id;
    const { lectureId } = req.body;

    if (!lectureId) {
      throw new ApiError(400, 'lectureId is required');
    }

    if (!req.file) {
      throw new ApiError(400, 'No audio file provided');
    }

    // Verify lecture belongs to user
    const { data: lecture, error: fetchError } = await supabaseAdmin
      .from('lectures')
      .select('id, user_id')
      .eq('id', lectureId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !lecture) {
      throw new ApiError(404, 'Lecture not found');
    }

    let audioUrl = null;
    let audioPublicId = null;

    try {
      // Upload to Cloudinary
      const result = await cloudinary.uploader.upload(req.file.path, {
        resource_type: 'video', // Cloudinary uses 'video' for audio
        folder: `vectra/lectures/${userId}`,
        public_id: `lecture_${lectureId}_audio`,
      });

      audioUrl = result.secure_url;
      audioPublicId = result.public_id;
    } catch (cloudinaryError) {
      console.warn('[Upload] Cloudinary upload failed, storing locally:', cloudinaryError.message);
      // Fallback: keep file locally
      audioUrl = `/temp/${path.basename(req.file.path)}`;
    }

    // Clean up temp file if uploaded to Cloudinary
    if (audioPublicId && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    // Update lecture record
    const { data, error } = await supabaseAdmin
      .from('lectures')
      .update({
        audio_url: audioUrl,
        audio_public_id: audioPublicId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', lectureId)
      .select()
      .single();

    if (error) {
      throw new ApiError(400, error.message);
    }

    res.json({
      success: true,
      message: 'Audio uploaded successfully',
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
 * Upload photos for a lecture
 */
async function uploadPhotos(req, res, next) {
  try {
    const userId = req.user.id;
    const { lectureId } = req.body;

    if (!lectureId) {
      throw new ApiError(400, 'lectureId is required');
    }

    if (!req.files || req.files.length === 0) {
      throw new ApiError(400, 'No photos provided');
    }

    // Verify lecture belongs to user
    const { data: lecture, error: fetchError } = await supabaseAdmin
      .from('lectures')
      .select('id, user_id')
      .eq('id', lectureId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !lecture) {
      throw new ApiError(404, 'Lecture not found');
    }

    const uploadedImages = [];

    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      let imageUrl = null;
      let imagePublicId = null;

      try {
        const result = await cloudinary.uploader.upload(file.path, {
          folder: `vectra/lectures/${userId}/images`,
          public_id: `lecture_${lectureId}_img_${i}`,
        });
        imageUrl = result.secure_url;
        imagePublicId = result.public_id;
      } catch (cloudinaryError) {
        console.warn('[Upload] Cloudinary photo upload failed, storing locally:', cloudinaryError.message);
        imageUrl = `/temp/${path.basename(file.path)}`;
      }

      // Clean up temp file if uploaded to Cloudinary
      if (imagePublicId && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }

      uploadedImages.push({
        lecture_id: lectureId,
        image_url: imageUrl,
        image_public_id: imagePublicId,
        order_index: i,
      });
    }

    // Insert image records
    const { data, error } = await supabaseAdmin
      .from('lecture_images')
      .insert(uploadedImages)
      .select();

    if (error) {
      throw new ApiError(400, error.message);
    }

    res.json({
      success: true,
      message: `${uploadedImages.length} photo(s) uploaded successfully`,
      data,
    });
  } catch (error) {
    // Clean up temp files on error
    if (req.files) {
      for (const file of req.files) {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      }
    }
    next(error);
  }
}

/**
 * Start async AI processing for a lecture
 */
async function processLecture(req, res, next) {
  try {
    const userId = req.user.id;
    const { lectureId } = req.body;

    if (!lectureId) {
      throw new ApiError(400, 'lectureId is required');
    }

    // Verify lecture belongs to user and has audio
    const { data: lecture, error: fetchError } = await supabaseAdmin
      .from('lectures')
      .select('*')
      .eq('id', lectureId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !lecture) {
      throw new ApiError(404, 'Lecture not found');
    }

    if (!lecture.audio_url) {
      throw new ApiError(400, 'Lecture has no audio file. Upload audio first.');
    }

    if (lecture.status === 'processing') {
      throw new ApiError(400, 'Lecture is already being processed');
    }

    // Update status to processing
    await supabaseAdmin
      .from('lectures')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', lectureId);

    // Start async processing (don't await)
    processLectureAsync(lectureId, lecture.audio_url, userId).catch((err) => {
      console.error(`[ProcessLecture] Async processing failed for lecture ${lectureId}:`, err.message);
    });

    res.json({
      success: true,
      message: 'Lecture processing started. You will be notified when complete.',
      data: { lectureId, status: 'processing' },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Background processing function - transcribe, structure, generate PDF
 */
async function processLectureAsync(lectureId, audioUrl, userId) {
  try {
    console.log(`[ProcessLecture] Starting processing for lecture ${lectureId}`);

    // Step 1: Transcribe audio
    console.log(`[ProcessLecture] Step 1: Transcribing audio...`);
    const transcript = await transcribeAudio(audioUrl);

    await supabaseAdmin
      .from('lectures')
      .update({
        transcript,
        transcription_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', lectureId);

    // Step 2: Get lecture metadata for structuring
    const { data: lecture } = await supabaseAdmin
      .from('lectures')
      .select('*')
      .eq('id', lectureId)
      .single();

    // Step 3: Structure notes with Claude
    console.log(`[ProcessLecture] Step 2: Structuring notes with AI...`);
    const structuredNotes = await structureLectureNotes(transcript, {
      course_code: lecture.course_code,
      course_name: lecture.course_name || '',
      topic: lecture.topic,
    });

    await supabaseAdmin
      .from('lectures')
      .update({
        structured_markdown: structuredNotes.markdown,
        latex_equations: structuredNotes.latex_equations,
        key_concepts: structuredNotes.key_concepts,
        updated_at: new Date().toISOString(),
      })
      .eq('id', lectureId);

    // Step 4: Fetch images for PDF
    const { data: lectureImages } = await supabaseAdmin
      .from('lecture_images')
      .select('*')
      .eq('lecture_id', lectureId)
      .order('order_index', { ascending: true });

    // Step 5: Generate PDF and upload to Cloudinary
    console.log(`[ProcessLecture] Step 3: Generating PDF...`);
    let pdfUrl = null;
    try {
      pdfUrl = await generateLecturePDF({
        ...lecture,
        structured_markdown: structuredNotes.markdown,
        transcript,
        images: lectureImages || [],
      });
      console.log(`[ProcessLecture] PDF generated and uploaded: ${pdfUrl}`);
    } catch (pdfError) {
      console.warn('[ProcessLecture] PDF generation failed:', pdfError.message);
    }

    // Step 6: Mark as completed
    await supabaseAdmin
      .from('lectures')
      .update({
        pdf_url: pdfUrl,
        status: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', lectureId);

    console.log(`[ProcessLecture] Lecture ${lectureId} processing completed successfully`);
  } catch (error) {
    console.error(`[ProcessLecture] Error processing lecture ${lectureId}:`, error.message);

    await supabaseAdmin
      .from('lectures')
      .update({
        status: 'error',
        error_message: error.message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', lectureId);
  }
}

/**
 * Get a single lecture with its images
 */
async function getLecture(req, res, next) {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const { data: lecture, error } = await supabaseAdmin
      .from('lectures')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !lecture) {
      throw new ApiError(404, 'Lecture not found');
    }

    // Get associated images
    const { data: images } = await supabaseAdmin
      .from('lecture_images')
      .select('*')
      .eq('lecture_id', id)
      .order('order_index', { ascending: true });

    res.json({
      success: true,
      data: {
        ...lecture,
        images: images || [],
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get user's lectures with pagination and optional filters
 */
async function getUserLectures(req, res, next) {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, course_code, status, is_favorite } = req.query;

    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('lectures')
      .select('*', { count: 'exact' })
      .eq('user_id', userId);

    if (course_code) query = query.eq('course_code', course_code);
    if (status) query = query.eq('status', status);
    if (is_favorite === 'true') query = query.eq('is_favorite', true);

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
 * Update lecture metadata
 */
async function updateLecture(req, res, next) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { course_code, course_name, topic, lecturer, date, duration } = req.body;

    // Verify lecture belongs to user
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('lectures')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError || !existing) {
      throw new ApiError(404, 'Lecture not found');
    }

    const updates = {};
    if (course_code !== undefined) updates.course_code = course_code;
    if (course_name !== undefined) updates.course_name = course_name;
    if (topic !== undefined) updates.topic = topic;
    if (lecturer !== undefined) updates.lecturer = lecturer;
    if (date !== undefined) updates.date = date;
    if (duration !== undefined) updates.duration = duration;
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('lectures')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new ApiError(400, error.message);
    }

    res.json({
      success: true,
      message: 'Lecture updated successfully',
      data,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Delete a lecture and its associated Cloudinary assets
 */
async function deleteLecture(req, res, next) {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    // Verify lecture belongs to user and get Cloudinary IDs
    const { data: lecture, error: fetchError } = await supabaseAdmin
      .from('lectures')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError || !lecture) {
      throw new ApiError(404, 'Lecture not found');
    }

    // Get associated images for cleanup
    const { data: images } = await supabaseAdmin
      .from('lecture_images')
      .select('image_public_id')
      .eq('lecture_id', id);

    // Delete Cloudinary assets (best effort)
    try {
      if (lecture.audio_public_id) {
        await cloudinary.uploader.destroy(lecture.audio_public_id, { resource_type: 'video' });
      }
      if (images) {
        for (const img of images) {
          if (img.image_public_id) {
            await cloudinary.uploader.destroy(img.image_public_id);
          }
        }
      }
    } catch (cloudinaryError) {
      console.warn('[DeleteLecture] Cloudinary cleanup error:', cloudinaryError.message);
    }

    // Delete lecture (cascade will handle images, chat history, recaps)
    const { error } = await supabaseAdmin
      .from('lectures')
      .delete()
      .eq('id', id);

    if (error) {
      throw new ApiError(400, error.message);
    }

    res.json({
      success: true,
      message: 'Lecture deleted successfully',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Toggle favorite status for a lecture
 */
async function toggleFavorite(req, res, next) {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    // Get current favorite status
    const { data: lecture, error: fetchError } = await supabaseAdmin
      .from('lectures')
      .select('id, is_favorite')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError || !lecture) {
      throw new ApiError(404, 'Lecture not found');
    }

    const { data, error } = await supabaseAdmin
      .from('lectures')
      .update({
        is_favorite: !lecture.is_favorite,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new ApiError(400, error.message);
    }

    res.json({
      success: true,
      message: data.is_favorite ? 'Lecture added to favorites' : 'Lecture removed from favorites',
      data,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createLecture,
  uploadAudio,
  uploadPhotos,
  processLecture,
  getLecture,
  getUserLectures,
  updateLecture,
  deleteLecture,
  toggleFavorite,
};
