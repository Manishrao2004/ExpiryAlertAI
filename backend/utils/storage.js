/**
 * storage.js — Pluggable image storage adapter
 *
 * STORAGE=local      → saves to local uploads/ folder
 * STORAGE=cloudinary → uploads to Cloudinary, returns secure_url
 *
 * Exports:
 *   saveImage(buffer, originalName, mimetype) → { url, publicId? }
 *   deleteImage(urlOrPublicId)                → void
 */

const fs = require('fs');
const path = require('path');

const STORAGE = (process.env.STORAGE || 'local').toLowerCase();

// 
let cloudinaryInstance = null;

function getCloudinary() {
  if (cloudinaryInstance) return cloudinaryInstance;
  const { v2: cloudinary } = require('cloudinary');

  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new Error(
      'Cloudinary credentials missing. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET in .env'
    );
  }

  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key:    CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
  });

  cloudinaryInstance = cloudinary;
  return cloudinary;
}

// 
async function saveLocal(buffer, originalName) {
  const ext = path.extname(originalName).toLowerCase() || '.jpg';
  const filename = `upload_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
  const uploadsDir = path.join(__dirname, '../uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  const filePath = path.join(uploadsDir, filename);
  fs.writeFileSync(filePath, buffer);
  return { url: `uploads/${filename}`, publicId: null };
}

// 
async function saveCloudinary(buffer, originalName) {
  const cloudinary = getCloudinary();
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'expiry-alert',
        resource_type: 'image',
        use_filename: false,
        unique_filename: true,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    uploadStream.end(buffer);
  });
}

// 
async function deleteLocal(urlOrPath) {
  // urlOrPath is like "uploads/upload_xxx.jpg"
  const filePath = path.join(__dirname, '..', urlOrPath);
  if (fs.existsSync(filePath)) {
    try { fs.unlinkSync(filePath); } catch (_) {}
  }
}

// 
async function deleteCloudinary(publicId) {
  if (!publicId) return;
  try {
    const cloudinary = getCloudinary();
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.error('Cloudinary delete error:', err.message);
  }
}

// 

/**
 * Save image buffer to the configured storage.
 * @param {Buffer} buffer - Raw image bytes
 * @param {string} originalName - Original filename (used for extension)
 * @param {string} _mimetype - MIME type (reserved for future use)
 * @returns {{ url: string, publicId: string|null }}
 */
async function saveImage(buffer, originalName, _mimetype) {
  if (STORAGE === 'cloudinary') {
    return saveCloudinary(buffer, originalName);
  }
  return saveLocal(buffer, originalName);
}

/**
 * Delete image from the configured storage.
 * @param {string} url - The URL/path returned by saveImage
 * @param {string|null} publicId - Cloudinary public ID (if cloudinary storage)
 */
async function deleteImage(url, publicId) {
  if (!url) return;
  if (STORAGE === 'cloudinary') {
    await deleteCloudinary(publicId || url);
  } else {
    await deleteLocal(url);
  }
}

module.exports = { saveImage, deleteImage, STORAGE };
