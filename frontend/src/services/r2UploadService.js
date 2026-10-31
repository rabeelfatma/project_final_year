/**
 * Backend-authorized direct-to-R2 uploads.
 * Large durable files (up to 200 MB) PUT straight to R2 using a short-lived
 * URL from POST /api/files/presign — credentials never reach the browser beyond
 * that URL, and Mongo metadata is committed only after the API verifies the object.
 */
import api from '../utils/api';

const VIDEO_EXTENSIONS = new Set([
  'mp4', 'mkv', 'webm', 'mov', 'avi', 'wmv', 'mpeg', 'mpg', 'm4v',
]);

export const ACADEMIC_EXTENSIONS = [
  'pdf','doc','docx','txt','md','rtf','csv','tsv','json','xml','yaml','yml','xlsx','xls','ods','pptx','ppt','odp','zip','rar','7z','tar','gz',
  'py','ipynb','js','jsx','ts','tsx','cpp','c','h','hpp','java','php','cs','swift','go','rs','kt','kts','sql','html','htm','css','scss','sass','less','vue','svelte','sh','bat','ps1','rb','r','m','mm','dart','lua','pl',
  'jpg','jpeg','png','gif','webp','bmp','svg','heic','heif','tif','tiff',
  'mp3','wav','ogg','aac','flac','m4a',
];

export const ACADEMIC_ACCEPT = ACADEMIC_EXTENSIONS.map((e) => `.${e}`).join(',');

export const MAX_DURABLE_FILE_BYTES = 200 * 1024 * 1024;

export function extensionOf(filename) {
  const parts = String(filename || '').split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

export function isAllowedAcademicFile(file) {
  if (!file?.name) return false;
  const ext = extensionOf(file.name);
  if (VIDEO_EXTENSIONS.has(ext)) return false;
  return ACADEMIC_EXTENSIONS.includes(ext);
}

export function assertAcademicFile(file) {
  if (!file) throw new Error('No file selected.');
  if (!isAllowedAcademicFile(file)) {
    const ext = extensionOf(file.name);
    if (VIDEO_EXTENSIONS.has(ext)) {
      throw new Error(`Video .${ext} files are not supported for Teacher/Student uploads.`);
    }
    throw new Error(`File extension .${ext || 'unknown'} is not allowed.`);
  }
  if (file.size > MAX_DURABLE_FILE_BYTES) {
    throw new Error('File too large (max 200 MB).');
  }
}

/**
 * Presign → PUT to R2 → return fields to append when creating assignment / submitting.
 * Falls back to returning null so callers can use classic multipart for tiny files
 * only when presign is unavailable (503). Prefer presign whenever R2 is configured.
 */
export async function uploadDurableFile(file, category) {
  assertAcademicFile(file);

  const { data } = await api.post('/files/presign', {
    category,
    originalFileName: file.name,
    contentType: file.type || 'application/octet-stream',
    size: file.size,
  });

  const uploadUrl = data?.uploadUrl;
  const objectKey = data?.objectKey;
  const headers = data?.requiredHeaders || {
    'Content-Type': file.type || 'application/octet-stream',
  };

  if (!uploadUrl || !objectKey) {
    throw new Error('Upload authorization failed.');
  }

  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers,
    body: file,
  });

  if (!putRes.ok) {
    throw new Error(`Direct upload failed (${putRes.status}).`);
  }

  // Optional server-side verify before Mongo commit (defense in depth).
  await api.post('/files/verify-upload', {
    objectKey,
    category,
    originalFileName: file.name,
    expectedSize: file.size,
  });

  return {
    storedFileKey: objectKey,
    originalFileName: file.name,
    fileMimeType: file.type || 'application/octet-stream',
    fileSize: file.size,
  };
}

export function appendDurableFields(formData, durable) {
  if (!durable?.storedFileKey) return formData;
  formData.append('storedFileKey', durable.storedFileKey);
  formData.append('originalFileName', durable.originalFileName || '');
  formData.append('fileMimeType', durable.fileMimeType || '');
  formData.append('fileSize', String(durable.fileSize || ''));
  return formData;
}
