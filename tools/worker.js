/**
 * Worker Service for Certificate Generator
 * Handles preview, download, and zip operations
 */

import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class WorkerService {
  constructor() {
    this.outputDir = path.join(__dirname, '../output/participants');
    this.tempDir = path.join(__dirname, '../temp');
    this.ensureDirectories();
  }

  /**
   * Ensure required directories exist
   */
  ensureDirectories() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }
  /**
   * Get sanitized filename for HTTP headers
   * @param {string} filename - Original filename
   * @returns {string} Sanitized filename
   */
  sanitizeFilename(filename) {
    // Remove non-ASCII characters and replace with underscores
    return filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '\\"');
  }

  /**
   * Get safe filename for ZIP archives (preserves UTF-8)
   * @param {string} filename - Original filename
   * @returns {string} Safe filename for ZIP
   */
  getSafeZipFilename(filename) {
    // Only replace characters that are problematic for file systems
    // Keep UTF-8 characters but replace file system reserved characters
    return filename.replace(/[<>:"/\\|?*]/g, '-').replace(/\s+/g, ' ').trim();
  }

  /**
   * Handle PDF preview request
   * @param {string} fileName - PDF filename
   * @param {Object} res - Express response object
   */
  async handlePreview(fileName, res) {
    try {
      const filePath = path.join(this.outputDir, fileName);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
      }

      // Check if file is actually a PDF
      const fileExtension = path.extname(fileName).toLowerCase();
      if (fileExtension !== '.pdf') {
        return res.status(400).json({ error: 'File is not a PDF' });
      }

      // Sanitize filename for HTTP header
      const sanitizedFileName = this.sanitizeFilename(fileName);
      
      // Set headers for PDF display
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${sanitizedFileName}"`);
      res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
      
      // Stream the PDF file
      const fileStream = fs.createReadStream(filePath);
      
      fileStream.on('error', (error) => {
        console.error('Error streaming PDF:', error);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Error reading PDF file' });
        }
      });

      fileStream.pipe(res);
      
    } catch (error) {
      console.error('Error in handlePreview:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to serve PDF: ' + error.message });
      }
    }
  }

  /**
   * Handle single file download
   * @param {string} fileName - PDF filename
   * @param {Object} res - Express response object
   */
  async handleDownload(fileName, res) {
    try {
      const filePath = path.join(this.outputDir, fileName);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
      }

      // Sanitize filename for download
      const sanitizedFileName = this.sanitizeFilename(fileName);
      
      // Set headers for download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFileName}"`);
      res.setHeader('Content-Length', fs.statSync(filePath).size);
      
      // Stream the file
      const fileStream = fs.createReadStream(filePath);
      
      fileStream.on('error', (error) => {
        console.error('Error streaming download:', error);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Error reading file' });
        }
      });

      fileStream.pipe(res);
      
    } catch (error) {
      console.error('Error in handleDownload:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to download file: ' + error.message });
      }
    }
  }  /**
   * Create ZIP archive of all PDF files with better UTF-8 support
   * @returns {Promise<string>} Path to created ZIP file
   */
  async createZipArchive() {
    return new Promise((resolve, reject) => {
      try {
        // Get all PDF files in output directory
        const files = fs.readdirSync(this.outputDir)
          .filter(file => path.extname(file).toLowerCase() === '.pdf')
          .sort();

        if (files.length === 0) {
          throw new Error('No PDF files found to zip');
        }

        // Create unique zip filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const zipFileName = `certificates_${timestamp}.zip`;
        const zipPath = path.join(this.tempDir, zipFileName);

        // Create write stream for ZIP file
        const output = fs.createWriteStream(zipPath);
        
        // Configure archiver with UTF-8 support
        const archive = archiver('zip', {
          zlib: { level: 9 }, // Maximum compression
          forceLocalTime: true,
          comment: 'Certificates generated by Certificate Generator'
        });

        // Handle archive errors
        archive.on('error', (err) => {
          console.error('Archive error:', err);
          reject(err);
        });

        // Handle warnings (non-blocking)
        archive.on('warning', (err) => {
          if (err.code === 'ENOENT') {
            console.warn('Archive warning:', err);
          } else {
            console.error('Archive error:', err);
            reject(err);
          }
        });

        // Handle output stream errors
        output.on('error', (err) => {
          console.error('Output stream error:', err);
          reject(err);
        });

        // Resolve when archive is finalized
        output.on('close', () => {
          const sizeInMB = (archive.pointer() / 1024 / 1024).toFixed(2);
          console.log(`📦 ZIP created: ${zipFileName} (${sizeInMB} MB, ${files.length} files)`);
          resolve(zipPath);
        });

        // Pipe archive to output
        archive.pipe(output);

        // Add files to archive with UTF-8 preservation
        files.forEach((file, index) => {
          const filePath = path.join(this.outputDir, file);
          
          // Create a safe filename that preserves UTF-8 but removes problematic characters
          let safeFileName = file;
          
          // Only replace characters that are truly problematic for ZIP/file systems
          // Keep Vietnamese characters but replace reserved file system characters
          safeFileName = safeFileName
            .replace(/[<>:"/\\|?*]/g, '-') // Replace file system reserved chars
            .replace(/\s{2,}/g, ' ') // Replace multiple spaces with single space
            .trim();
          
          console.log(`📄 Adding file ${index + 1}/${files.length}: "${file}"`);
          if (file !== safeFileName) {
            console.log(`   → Safe name: "${safeFileName}"`);
          }
          
          // Add file to archive with proper options
          archive.file(filePath, { 
            name: Buffer.from(safeFileName, 'utf8').toString('utf8'), // Ensure UTF-8 encoding
            date: fs.statSync(filePath).mtime, // Use file's modification time
            mode: 0o644 // Standard file permissions
          });
        });

        console.log(`🗜️ Finalizing ZIP archive with ${files.length} files...`);
        
        // Finalize the archive
        archive.finalize();

      } catch (error) {
        console.error('Error creating ZIP archive:', error);
        reject(error);
      }
    });
  }

  /**
   * Alternative ZIP creation method with explicit UTF-8 handling
   * @returns {Promise<string>} Path to created ZIP file
   */
  async createZipArchiveAlternative() {
    const { execSync } = await import('child_process');
    
    try {
      // Get all PDF files in output directory
      const files = fs.readdirSync(this.outputDir)
        .filter(file => path.extname(file).toLowerCase() === '.pdf')
        .sort();

      if (files.length === 0) {
        throw new Error('No PDF files found to zip');
      }

      // Create unique zip filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const zipFileName = `certificates_${timestamp}.zip`;
      const zipPath = path.join(this.tempDir, zipFileName);

      // Use system zip command if available (better UTF-8 support)
      try {
        // Change to output directory and create zip
        const fileList = files.map(f => `"${f}"`).join(' ');
        const command = `cd "${this.outputDir}" && zip -r "${zipPath}" ${fileList}`;
        
        execSync(command, { encoding: 'utf8' });
        
        console.log(`📦 ZIP created using system zip: ${zipFileName}`);
        return zipPath;
        
      } catch (systemZipError) {
        console.log('System zip not available, falling back to archiver method');
        throw systemZipError;
      }

    } catch (error) {
      console.error('Error in alternative ZIP creation:', error);
      // Fall back to the main method
      return this.createZipArchive();
    }
  }
  /**
   * Handle ZIP download request
   * @param {Object} res - Express response object
   */
  async handleZipDownload(res) {
    try {
      console.log('🗜️ Creating ZIP archive of all certificates...');
      
      // Try alternative method first for better UTF-8 support, fall back if needed
      let zipPath;
      try {
        zipPath = await this.createZipArchiveAlternative();
      } catch (altError) {
        console.log('Alternative ZIP method failed, using archiver method');
        zipPath = await this.createZipArchive();
      }
      
      const zipFileName = path.basename(zipPath);
      
      // Set headers for ZIP download
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);
      res.setHeader('Content-Length', fs.statSync(zipPath).size);
      
      // Stream the ZIP file
      const fileStream = fs.createReadStream(zipPath);
      
      fileStream.on('error', (error) => {
        console.error('Error streaming ZIP:', error);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Error reading ZIP file' });
        }
      });

      fileStream.on('end', () => {
        // Clean up temporary ZIP file after a delay
        setTimeout(() => {
          try {
            if (fs.existsSync(zipPath)) {
              fs.unlinkSync(zipPath);
              console.log(`🗑️ Cleaned up temporary ZIP: ${zipFileName}`);
            }
          } catch (cleanupError) {
            console.warn('Warning: Failed to clean up temporary ZIP:', cleanupError.message);
          }
        }, 5000); // 5 seconds delay to ensure download completes
      });

      fileStream.pipe(res);
      
    } catch (error) {
      console.error('Error in handleZipDownload:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to create ZIP: ' + error.message });
      }
    }
  }

  /**
   * Get list of available PDF files with metadata
   * @returns {Array} List of file objects
   */
  getAvailableFiles() {
    try {
      const files = fs.readdirSync(this.outputDir)
        .filter(file => path.extname(file).toLowerCase() === '.pdf')
        .map(fileName => {
          const filePath = path.join(this.outputDir, fileName);
          const stats = fs.statSync(filePath);
          
          return {
            fileName,
            size: stats.size,
            sizeFormatted: this.formatFileSize(stats.size),
            created: stats.birthtime,
            modified: stats.mtime
          };
        })
        .sort((a, b) => b.modified - a.modified); // Sort by newest first

      return files;
    } catch (error) {
      console.error('Error getting available files:', error);
      return [];
    }
  }

  /**
   * Format file size in human readable format
   * @param {number} bytes - File size in bytes
   * @returns {string} Formatted size string
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Clean up old temporary files
   * @param {number} maxAgeHours - Maximum age in hours (default: 24)
   */
  cleanupTempFiles(maxAgeHours = 24) {
    try {
      const files = fs.readdirSync(this.tempDir);
      const cutoffTime = Date.now() - (maxAgeHours * 60 * 60 * 1000);
      
      files.forEach(file => {
        const filePath = path.join(this.tempDir, file);
        const stats = fs.statSync(filePath);
        
        if (stats.mtime.getTime() < cutoffTime) {
          fs.unlinkSync(filePath);
          console.log(`🗑️ Cleaned up old temp file: ${file}`);
        }
      });
    } catch (error) {
      console.warn('Warning: Failed to cleanup temp files:', error.message);
    }
  }

  /**
   * Get statistics about certificates
   * @returns {Object} Statistics object
   */
  getStatistics() {
    try {
      const files = this.getAvailableFiles();
      const totalSize = files.reduce((sum, file) => sum + file.size, 0);
      
      return {
        totalFiles: files.length,
        totalSize: totalSize,
        totalSizeFormatted: this.formatFileSize(totalSize),
        latestFile: files.length > 0 ? files[0] : null,
        oldestFile: files.length > 0 ? files[files.length - 1] : null
      };
    } catch (error) {
      console.error('Error getting statistics:', error);
      return {
        totalFiles: 0,
        totalSize: 0,
        totalSizeFormatted: '0 Bytes',
        latestFile: null,
        oldestFile: null
      };
    }
  }
}

export default WorkerService;
