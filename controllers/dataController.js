/**
 * PastQuest - Data Controller
 * Handles universities, faculties, departments, courses
 */

const { supabaseAdmin } = require('../config/supabase');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Get all universities
 */
async function getUniversities(req, res, next) {
  try {
    const { data, error } = await supabaseAdmin
      .from('universities')
      .select('*, level_format')
      .eq('status', 'active')
      .eq('is_published', true)
      .order('name');

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

/**
 * Get single university with faculties
 */
async function getUniversity(req, res, next) {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('universities')
      .select(`
        *,
        faculties:faculties(*)
      `)
      .eq('id', id)
      .eq('faculties.status', 'active')
      .single();

    if (error || !data) {
      throw new ApiError(404, 'University not found');
    }

    res.json({
      success: true,
      data: data
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get faculties for a university
 */
async function getFaculties(req, res, next) {
  try {
    const { universityId } = req.params;

    const { data, error } = await supabaseAdmin
      .from('faculties')
      .select('*')
      .eq('university_id', universityId)
      .eq('status', 'active')
      .order('name');

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

/**
 * Get single faculty with departments
 */
async function getFaculty(req, res, next) {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('faculties')
      .select(`
        *,
        departments:departments(*)
      `)
      .eq('id', id)
      .eq('departments.status', 'active')
      .single();

    if (error || !data) {
      throw new ApiError(404, 'Faculty not found');
    }

    res.json({
      success: true,
      data: data
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get departments for a faculty
 */
async function getDepartments(req, res, next) {
  try {
    const { facultyId } = req.params;

    const { data, error } = await supabaseAdmin
      .from('departments')
      .select('*')
      .eq('faculty_id', facultyId)
      .eq('status', 'active')
      .order('name');

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

/**
 * Get single department with courses
 */
async function getDepartment(req, res, next) {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('departments')
      .select(`
        *,
        courses:courses(*)
      `)
      .eq('id', id)
      .eq('courses.status', 'active')
      .single();

    if (error || !data) {
      throw new ApiError(404, 'Department not found');
    }

    res.json({
      success: true,
      data: data
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get courses for a department
 */
async function getCourses(req, res, next) {
  try {
    const { departmentId } = req.params;
    const { level, semester } = req.query;

    let query = supabaseAdmin
      .from('courses')
      .select('*')
      .eq('department_id', departmentId)
      .eq('status', 'active');

    if (level) {
      query = query.eq('level', level);
    }

    if (semester) {
      query = query.eq('semester', semester);
    }

    const { data, error } = await query.order('code');

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

/**
 * Get single course with textbooks
 */
async function getCourse(req, res, next) {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('courses')
      .select(`
        *,
        textbooks:textbooks(*),
        department:departments(
          name,
          faculty:faculties(
            name,
            university:universities(name, short_name)
          )
        )
      `)
      .eq('id', id)
      .eq('textbooks.status', 'active')
      .single();

    if (error || !data) {
      throw new ApiError(404, 'Course not found');
    }

    // Get question count
    const { count } = await supabaseAdmin
      .from('past_questions')
      .select('*', { count: 'exact', head: true })
      .eq('course_id', id)
      .eq('status', 'approved');

    res.json({
      success: true,
      data: {
        ...data,
        questionCount: count || 0
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get textbooks for a course
 */
async function getTextbooks(req, res, next) {
  try {
    const { courseId } = req.params;

    const { data, error } = await supabaseAdmin
      .from('textbooks')
      .select('*')
      .eq('course_id', courseId)
      .eq('status', 'active')
      .order('type');

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

/**
 * Get available sessions
 */
async function getSessions(req, res, next) {
  try {
    const { data, error } = await supabaseAdmin
      .from('universities')
      .select('available_sessions, current_session')
      .limit(1)
      .single();

    if (error) {
      throw new ApiError(400, error.message);
    }

    res.json({
      success: true,
      data: {
        sessions: data.available_sessions || [],
        currentSession: data.current_session
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get platform settings
 */
async function getSettings(req, res, next) {
  try {
    const { data, error } = await supabaseAdmin
      .from('platform_settings')
      .select('*')
      .single();

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

/**
 * Search courses
 */
async function searchCourses(req, res, next) {
  try {
    const { q, universityId, departmentId, level, limit = 20 } = req.query;

    if (!q) {
      throw new ApiError(400, 'Search query is required');
    }

    let query = supabaseAdmin
      .from('courses')
      .select(`
        *,
        department:departments(
          name,
          faculty:faculties(
            name,
            university_id
          )
        )
      `)
      .eq('status', 'active')
      .or(`code.ilike.%${q}%,title.ilike.%${q}%`);

    if (departmentId) {
      query = query.eq('department_id', departmentId);
    }

    if (level) {
      query = query.eq('level', level);
    }

    const { data, error } = await query.limit(parseInt(limit));

    if (error) {
      throw new ApiError(400, error.message);
    }

    // Filter by university if specified
    let filteredData = data;
    if (universityId) {
      filteredData = data.filter(
        course => course.department?.faculty?.university_id === universityId
      );
    }

    res.json({
      success: true,
      data: filteredData
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get levels for a university
 */
async function getLevels(req, res, next) {
  try {
    const { universityId } = req.params;

    const { data: uni, error } = await supabaseAdmin
      .from('universities')
      .select('level_format, short_name')
      .eq('id', universityId)
      .single();

    if (error) {
      throw new ApiError(400, error.message);
    }

    const levels = uni?.level_format === 'part'
      ? ['Part 1', 'Part 2', 'Part 3', 'Part 4', 'Part 5']
      : ['100L', '200L', '300L', '400L', '500L'];

    res.json({
      success: true,
      data: levels,
      format: uni?.level_format || 'level'
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getUniversities,
  getUniversity,
  getFaculties,
  getFaculty,
  getDepartments,
  getDepartment,
  getCourses,
  getCourse,
  getTextbooks,
  getSessions,
  getSettings,
  searchCourses,
  getLevels
};
