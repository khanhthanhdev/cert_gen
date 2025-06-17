/**
 * Validation Utilities
 * Helper functions for data validation and error checking
 */

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid email format
 */
export function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate that a string is not empty or whitespace only
 * @param {string} str - String to validate
 * @returns {boolean} True if string has content
 */
export function isNonEmptyString(str) {
  return typeof str === 'string' && str.trim().length > 0;
}

/**
 * Validate RGB color values
 * @param {Object} color - Color object {r, g, b}
 * @returns {boolean} True if valid RGB values (0-1)
 */
export function isValidRgbColor(color) {
  if (!color || typeof color !== 'object') return false;
  
  const { r, g, b } = color;
  
  return typeof r === 'number' && r >= 0 && r <= 1 &&
         typeof g === 'number' && g >= 0 && g <= 1 &&
         typeof b === 'number' && b >= 0 && b <= 1;
}

/**
 * Validate coordinate object
 * @param {Object} coords - Coordinate object
 * @returns {boolean} True if valid coordinates
 */
export function isValidCoordinates(coords) {
  if (!coords || typeof coords !== 'object') return false;
  
  // Check for click coordinates
  if (coords.coordinateSystem === 'click') {
    return typeof coords.centerX === 'number' && typeof coords.centerY === 'number';
  }
  
  // Check for line coordinates
  if (coords.coordinateSystem === 'line' || coords.lineStartX !== undefined) {
    return typeof coords.lineStartX === 'number' &&
           typeof coords.lineEndX === 'number' &&
           typeof coords.yFromTop === 'number';
  }
  
  return false;
}

/**
 * Validate participant data
 * @param {Object} participant - Participant object {name, position}
 * @returns {Object} Validation result {isValid, errors}
 */
export function validateParticipant(participant) {
  const errors = [];
  
  if (!participant || typeof participant !== 'object') {
    errors.push('Participant must be an object');
    return { isValid: false, errors };
  }
  
  if (!isNonEmptyString(participant.name)) {
    errors.push('Name is required and must be a non-empty string');
  }
  
  // Position can be empty, but if provided should be string
  if (participant.position !== undefined && typeof participant.position !== 'string') {
    errors.push('Position must be a string if provided');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate font configuration
 * @param {Object} fontConfig - Font configuration object
 * @returns {Object} Validation result {isValid, errors}
 */
export function validateFontConfig(fontConfig) {
  const errors = [];
  
  if (!fontConfig || typeof fontConfig !== 'object') {
    errors.push('Font configuration must be an object');
    return { isValid: false, errors };
  }
  
  if (!isNonEmptyString(fontConfig.path)) {
    errors.push('Font path is required');
  }
  
  if (typeof fontConfig.size !== 'number' || fontConfig.size <= 0) {
    errors.push('Font size must be a positive number');
  }
  
  if (fontConfig.color && !isValidRgbColor(fontConfig.color)) {
    errors.push('Font color must be valid RGB object {r, g, b} with values 0-1');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Sanitize text for safe filename usage
 * @param {string} text - Text to sanitize
 * @returns {string} Sanitized text
 */
export function sanitizeForFilename(text) {
  return text
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '_')
    .replace(/[^\w\-_]/g, '')
    .substring(0, 100); // Limit length
}

/**
 * Validate numeric range
 * @param {number} value - Value to check
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {boolean} True if value is in range
 */
export function isInRange(value, min, max) {
  return typeof value === 'number' && value >= min && value <= max;
}

export default {
  isValidEmail,
  isNonEmptyString,
  isValidRgbColor,
  isValidCoordinates,
  validateParticipant,
  validateFontConfig,
  sanitizeForFilename,
  isInRange
};
