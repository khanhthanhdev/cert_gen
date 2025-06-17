/**
 * File System Utilities
 * Helper functions for file operations and path handling
 */

import fs from 'fs';
import path from 'path';

/**
 * Check if file exists
 * @param {string} filePath - Path to check
 * @returns {boolean} True if file exists
 */
export function fileExists(filePath) {
  return fs.existsSync(filePath);
}

/**
 * Ensure directory exists, create if it doesn't
 * @param {string} dirPath - Directory path
 */
export function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Get file extension
 * @param {string} filePath - File path
 * @returns {string} File extension (without dot)
 */
export function getFileExtension(filePath) {
  return path.extname(filePath).toLowerCase().slice(1);
}

/**
 * Create safe filename by removing invalid characters
 * @param {string} filename - Original filename
 * @param {string} replacement - Character to replace invalid chars with
 * @returns {string} Safe filename
 */
export function createSafeFilename(filename, replacement = '-') {
  const invalidCharsRegex = /[/\\?%*:|"<>]/g;
  return filename.replace(invalidCharsRegex, replacement);
}

/**
 * Get file size in bytes
 * @param {string} filePath - Path to file
 * @returns {number} File size in bytes
 */
export function getFileSize(filePath) {
  if (!fileExists(filePath)) {
    return 0;
  }
  return fs.statSync(filePath).size;
}

/**
 * Format file size in human readable format
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size (e.g., "1.2 MB")
 */
export function formatFileSize(bytes) {
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 Bytes';
  
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}

export default {
  fileExists,
  ensureDirectoryExists,
  getFileExtension,
  createSafeFilename,
  getFileSize,
  formatFileSize
};
