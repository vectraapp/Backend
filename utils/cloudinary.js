/**
 * PastQuest - Cloudinary Utility Functions
 */

const cloudinary = require('../config/cloudinary');

/**
 * Upload a file to Cloudinary
 */
async function uploadFile(filePath, options = {}) {
  try {
    const defaultOptions = {
      folder: 'pastquest/questions',
      resource_type: 'auto',
      ...options
    };

    const result = await cloudinary.uploader.upload(filePath, defaultOptions);

    return {
      success: true,
      data: {
        url: result.secure_url,
        publicId: result.public_id,
        format: result.format,
        width: result.width,
        height: result.height,
        bytes: result.bytes,
        resourceType: result.resource_type
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Upload a file from buffer
 */
async function uploadBuffer(buffer, options = {}) {
  try {
    const defaultOptions = {
      folder: 'pastquest/questions',
      resource_type: 'auto',
      ...options
    };

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        defaultOptions,
        (error, result) => {
          if (error) {
            resolve({
              success: false,
              error: error.message
            });
          } else {
            resolve({
              success: true,
              data: {
                url: result.secure_url,
                publicId: result.public_id,
                format: result.format,
                width: result.width,
                height: result.height,
                bytes: result.bytes,
                resourceType: result.resource_type
              }
            });
          }
        }
      );

      uploadStream.end(buffer);
    });
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Delete a file from Cloudinary
 */
async function deleteFile(publicId) {
  try {
    const result = await cloudinary.uploader.destroy(publicId);

    return {
      success: result.result === 'ok',
      data: result
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Generate a thumbnail URL
 */
function getThumbnailUrl(publicId, width = 200, height = 200) {
  return cloudinary.url(publicId, {
    width,
    height,
    crop: 'fill',
    quality: 'auto',
    format: 'auto'
  });
}

/**
 * Generate optimized image URL
 */
function getOptimizedUrl(publicId, options = {}) {
  const defaultOptions = {
    quality: 'auto',
    format: 'auto',
    ...options
  };

  return cloudinary.url(publicId, defaultOptions);
}

module.exports = {
  uploadFile,
  uploadBuffer,
  deleteFile,
  getThumbnailUrl,
  getOptimizedUrl
};
