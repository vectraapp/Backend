/**
 * Vectra - Course Controller
 * Full university structure CRUD (universities, faculties, departments, courses)
 * + student enrollment
 *
 * NOTE: All IDs in universities, faculties, departments, courses are TEXT (not UUID).
 *       Seeded data uses slugs like 'oau', 'oau-fac_sci', 'oau-dept_phy', 'oau-phy101'.
 *       Admin-created items get auto-generated slug IDs from their name/code.
 */

const { supabaseAdmin } = require('../config/supabase');
const { ApiError } = require('../middleware/errorHandler');

// Helper: generate a slug-style TEXT id from a string
function slugify(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

// ─────────────────────────────────────────────────────────────
//  UNIVERSITY CRUD (admin only)
// ─────────────────────────────────────────────────────────────

/**
 * List ALL universities (including unpublished) — admin view
 */
async function listUniversities(req, res, next) {
  try {
    const { data, error } = await supabaseAdmin
      .from('universities')
      .select('*')
      .order('name');

    if (error) throw new ApiError(400, error.message);

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

/**
 * Create university
 */
async function createUniversity(req, res, next) {
  try {
    const { name, short_name, country, state, level_format } = req.body;

    if (!name || !short_name) {
      throw new ApiError(400, 'name and short_name are required');
    }

    const id = slugify(short_name);
    const code = short_name.toUpperCase().trim();

    const { data, error } = await supabaseAdmin
      .from('universities')
      .insert({
        id,
        name: name.trim(),
        short_name: code,
        code,
        country: country || 'Nigeria',
        state: state || null,
        level_format: level_format || 'level',
        is_published: false,
        status: 'active',
      })
      .select()
      .single();

    if (error) {
      if (error.message.includes('duplicate') || error.code === '23505') {
        throw new ApiError(409, 'A university with this name or code already exists');
      }
      throw new ApiError(400, error.message);
    }

    res.status(201).json({ success: true, message: 'University created', data });
  } catch (error) {
    next(error);
  }
}

/**
 * Update university
 */
async function updateUniversity(req, res, next) {
  try {
    const { id } = req.params;
    const { name, short_name, country, state, level_format } = req.body;

    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (short_name !== undefined) {
      updates.short_name = short_name.toUpperCase().trim();
      updates.code = short_name.toUpperCase().trim();
    }
    if (country !== undefined) updates.country = country;
    if (state !== undefined) updates.state = state;
    if (level_format !== undefined) updates.level_format = level_format;

    if (Object.keys(updates).length === 0) {
      throw new ApiError(400, 'No fields to update');
    }

    const { data, error } = await supabaseAdmin
      .from('universities')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error || !data) throw new ApiError(404, 'University not found');

    res.json({ success: true, message: 'University updated', data });
  } catch (error) {
    next(error);
  }
}

/**
 * Publish university (set is_published = true)
 */
async function publishUniversity(req, res, next) {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('universities')
      .update({ is_published: true })
      .eq('id', id)
      .select()
      .single();

    if (error || !data) throw new ApiError(404, 'University not found');

    res.json({ success: true, message: 'University published', data });
  } catch (error) {
    next(error);
  }
}

/**
 * Unpublish university (set is_published = false)
 */
async function unpublishUniversity(req, res, next) {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('universities')
      .update({ is_published: false })
      .eq('id', id)
      .select()
      .single();

    if (error || !data) throw new ApiError(404, 'University not found');

    res.json({ success: true, message: 'University unpublished', data });
  } catch (error) {
    next(error);
  }
}

// ─────────────────────────────────────────────────────────────
//  FACULTY CRUD (admin only)
// ─────────────────────────────────────────────────────────────

/**
 * Create faculty
 */
async function createFaculty(req, res, next) {
  try {
    const { name, university_id } = req.body;

    if (!name || !university_id) {
      throw new ApiError(400, 'name and university_id are required');
    }

    // Generate a code from the name (e.g. "Faculty of Science" → "SCI")
    const nameParts = name.replace(/Faculty of |College of |School of /i, '').trim();
    const code = nameParts.substring(0, 4).toUpperCase();
    const id = `${university_id}-fac_${slugify(nameParts)}`;

    const { data, error } = await supabaseAdmin
      .from('faculties')
      .insert({
        id,
        name: name.trim(),
        code,
        university_id,
        status: 'active',
      })
      .select()
      .single();

    if (error) {
      if (error.message.includes('duplicate') || error.code === '23505') {
        throw new ApiError(409, 'A faculty with this name already exists in the university');
      }
      throw new ApiError(400, error.message);
    }

    res.status(201).json({ success: true, message: 'Faculty created', data });
  } catch (error) {
    next(error);
  }
}

/**
 * Update faculty
 */
async function updateFaculty(req, res, next) {
  try {
    const { id } = req.params;
    const { name, university_id } = req.body;

    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (university_id !== undefined) updates.university_id = university_id;

    if (Object.keys(updates).length === 0) {
      throw new ApiError(400, 'No fields to update');
    }

    const { data, error } = await supabaseAdmin
      .from('faculties')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error || !data) throw new ApiError(404, 'Faculty not found');

    res.json({ success: true, message: 'Faculty updated', data });
  } catch (error) {
    next(error);
  }
}

// ─────────────────────────────────────────────────────────────
//  DEPARTMENT CRUD (admin only)
// ─────────────────────────────────────────────────────────────

/**
 * Create department
 */
async function createDepartment(req, res, next) {
  try {
    const { name, faculty_id, degree_type } = req.body;

    if (!name || !faculty_id) {
      throw new ApiError(400, 'name and faculty_id are required');
    }

    // Look up the faculty to get university_id for the ID prefix
    const { data: fac } = await supabaseAdmin
      .from('faculties')
      .select('university_id')
      .eq('id', faculty_id)
      .single();

    const uniPrefix = fac?.university_id || faculty_id.split('-')[0];
    const code = slugify(name).substring(0, 6).toUpperCase();
    const id = `${uniPrefix}-dept_${slugify(name)}`;

    const { data, error } = await supabaseAdmin
      .from('departments')
      .insert({
        id,
        name: name.trim(),
        code,
        faculty_id,
        degree_type: degree_type || 'B.Sc',
        status: 'active',
      })
      .select()
      .single();

    if (error) {
      if (error.message.includes('duplicate') || error.code === '23505') {
        throw new ApiError(409, 'A department with this name already exists in the faculty');
      }
      throw new ApiError(400, error.message);
    }

    res.status(201).json({ success: true, message: 'Department created', data });
  } catch (error) {
    next(error);
  }
}

/**
 * Update department
 */
async function updateDepartment(req, res, next) {
  try {
    const { id } = req.params;
    const { name, faculty_id, degree_type } = req.body;

    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (faculty_id !== undefined) updates.faculty_id = faculty_id;
    if (degree_type !== undefined) updates.degree_type = degree_type;

    if (Object.keys(updates).length === 0) {
      throw new ApiError(400, 'No fields to update');
    }

    const { data, error } = await supabaseAdmin
      .from('departments')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error || !data) throw new ApiError(404, 'Department not found');

    res.json({ success: true, message: 'Department updated', data });
  } catch (error) {
    next(error);
  }
}

// ─────────────────────────────────────────────────────────────
//  COURSE CRUD
// ─────────────────────────────────────────────────────────────

/**
 * List courses (with optional filters)
 * Authenticated — filters status = 'active'
 */
async function listCourses(req, res, next) {
  try {
    const { department_id, level, semester, search, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('courses')
      .select('*, department:departments(name, faculty:faculties(name, university:universities(name, short_name)))', { count: 'exact' })
      .eq('status', 'active');

    if (department_id) query = query.eq('department_id', department_id);
    if (level) query = query.eq('level', level);
    if (semester) query = query.eq('semester', semester);
    if (search) query = query.or(`code.ilike.%${search}%,title.ilike.%${search}%`);

    const { data, error, count } = await query
      .order('code')
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
 * Get single course with department/faculty/university join
 */
async function getCourse(req, res, next) {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('courses')
      .select('*, department:departments(name, faculty:faculties(name, university:universities(name, short_name)))')
      .eq('id', id)
      .single();

    if (error || !data) throw new ApiError(404, 'Course not found');

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

/**
 * Create course (admin only)
 */
async function createCourse(req, res, next) {
  try {
    const { course_code, title, department_id, level, semester, credit_units, description } = req.body;

    if (!course_code || !title || !department_id || !level || !semester) {
      throw new ApiError(400, 'course_code, title, department_id, level, and semester are required');
    }

    const codeValue = course_code.toUpperCase().trim();

    // Look up department to get university prefix for the ID
    const { data: dept } = await supabaseAdmin
      .from('departments')
      .select('faculty:faculties(university_id)')
      .eq('id', department_id)
      .single();

    const uniPrefix = dept?.faculty?.university_id || department_id.split('-')[0];
    const id = `${uniPrefix}-${codeValue.toLowerCase().replace(/\s+/g, '')}`;

    // Map semester number to full name if needed
    let semesterValue = semester;
    if (semester === '1' || semester === 1) semesterValue = 'First Semester';
    if (semester === '2' || semester === 2) semesterValue = 'Second Semester';

    const { data, error } = await supabaseAdmin
      .from('courses')
      .insert({
        id,
        code: codeValue,
        course_code: codeValue,
        title: title.trim(),
        department_id,
        level: level.toString(),
        semester: semesterValue,
        credit_units: credit_units || 3,
        description: description || null,
        status: 'active',
      })
      .select()
      .single();

    if (error) {
      if (error.message.includes('duplicate') || error.code === '23505') {
        throw new ApiError(409, 'A course with this code already exists');
      }
      throw new ApiError(400, error.message);
    }

    // Log admin action
    await supabaseAdmin.from('admin_content_actions').insert({
      admin_id: req.user.id,
      action_type: 'approve',
      target_type: 'course',
      target_id: data.id,
      metadata: { action: 'created', course_code: data.code },
    }).catch(() => {});

    res.status(201).json({ success: true, message: 'Course created', data });
  } catch (error) {
    next(error);
  }
}

/**
 * Update course (admin only)
 */
async function updateCourse(req, res, next) {
  try {
    const { id } = req.params;
    const { course_code, code, title, department_id, level, semester, credit_units, description } = req.body;

    const updates = {};
    if (course_code !== undefined) {
      const codeValue = course_code.toUpperCase().trim();
      updates.course_code = codeValue;
      updates.code = codeValue;
    }
    if (code !== undefined && course_code === undefined) {
      updates.code = code.toUpperCase().trim();
      updates.course_code = code.toUpperCase().trim();
    }
    if (title !== undefined) updates.title = title.trim();
    if (department_id !== undefined) updates.department_id = department_id;
    if (level !== undefined) updates.level = level.toString();
    if (semester !== undefined) {
      let semesterValue = semester;
      if (semester === '1' || semester === 1) semesterValue = 'First Semester';
      if (semester === '2' || semester === 2) semesterValue = 'Second Semester';
      updates.semester = semesterValue;
    }
    if (credit_units !== undefined) updates.credit_units = credit_units;
    if (description !== undefined) updates.description = description;

    if (Object.keys(updates).length === 0) {
      throw new ApiError(400, 'No fields to update');
    }

    const { data, error } = await supabaseAdmin
      .from('courses')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error || !data) throw new ApiError(404, 'Course not found');

    res.json({ success: true, message: 'Course updated', data });
  } catch (error) {
    next(error);
  }
}

/**
 * Soft delete course (admin only — sets status: 'inactive')
 */
async function deleteCourse(req, res, next) {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('courses')
      .update({ status: 'inactive' })
      .eq('id', id)
      .select()
      .single();

    if (error || !data) throw new ApiError(404, 'Course not found');

    // Log admin action
    await supabaseAdmin.from('admin_content_actions').insert({
      admin_id: req.user.id,
      action_type: 'delete',
      target_type: 'course',
      target_id: id,
      metadata: { course_code: data.code },
    }).catch(() => {});

    res.json({ success: true, message: 'Course deactivated' });
  } catch (error) {
    next(error);
  }
}

// ─────────────────────────────────────────────────────────────
//  ENROLLMENT
// ─────────────────────────────────────────────────────────────

/**
 * Enroll student in courses
 * Body: { course_ids: [...] }   (array of TEXT course ids)
 * First deactivates all existing enrollments for this user,
 * then upserts new active enrollments.
 */
async function enrollCourses(req, res, next) {
  try {
    const userId = req.user.id;
    const { course_ids } = req.body;

    if (!course_ids || !Array.isArray(course_ids) || course_ids.length === 0) {
      throw new ApiError(400, 'course_ids must be a non-empty array');
    }

    // Step 1: Deactivate all existing enrollments for this user
    const { error: deactivateError } = await supabaseAdmin
      .from('user_courses')
      .update({ is_active: false })
      .eq('user_id', userId);

    if (deactivateError) throw new ApiError(400, deactivateError.message);

    // Step 2: Upsert new enrollments as active
    const enrollments = course_ids.map((course_id) => ({
      user_id: userId,
      course_id,
      is_active: true,
    }));

    const { data, error } = await supabaseAdmin
      .from('user_courses')
      .upsert(enrollments, { onConflict: 'user_id,course_id' })
      .select();

    if (error) throw new ApiError(400, error.message);

    res.json({ success: true, message: `Enrolled in ${data.length} course(s)`, data });
  } catch (error) {
    next(error);
  }
}

/**
 * Get student's enrolled courses with full join details
 */
async function getMyCourses(req, res, next) {
  try {
    const userId = req.user.id;

    const { data, error } = await supabaseAdmin
      .from('user_courses')
      .select('*, course:courses(*, department:departments(name, faculty:faculties(name, university:universities(name, short_name))))')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (error) throw new ApiError(400, error.message);

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

// ─────────────────────────────────────────────────────────────
//  EXPORTS
// ─────────────────────────────────────────────────────────────

module.exports = {
  // Universities
  listUniversities,
  createUniversity,
  updateUniversity,
  publishUniversity,
  unpublishUniversity,
  // Faculties
  createFaculty,
  updateFaculty,
  // Departments
  createDepartment,
  updateDepartment,
  // Courses
  listCourses,
  getCourse,
  createCourse,
  updateCourse,
  deleteCourse,
  // Enrollment
  enrollCourses,
  getMyCourses,
};
