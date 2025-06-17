import express from 'express';
import fs from 'fs';
import path from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import multer from 'multer';
import WorkerService from './worker.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// Use environment variables with fallbacks
const PORT = process.env.PORT || process.env.VERCEL_PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';
const VERCEL_URL = process.env.VERCEL_URL;

// In-memory config storage for Vercel (since filesystem is read-only)
let runtimeConfig = null;

// Helper function to get config path
function getConfigPath() {
  const isVercel = process.env.VERCEL || process.env.VERCEL_ENV;
  if (isVercel) {
    return '/tmp/config.json';
  }
  return path.join(__dirname, '../config.json');
}

// Helper function to load config (from file or memory)
async function loadConfig() {
  const isVercel = process.env.VERCEL || process.env.VERCEL_ENV;
  
  if (isVercel && runtimeConfig) {
    // Use in-memory config in Vercel (should already have Vercel overrides applied)
    return runtimeConfig;
  }
  
  // In Vercel, we need to start with the original config file and then apply overrides
  const originalConfigPath = path.join(__dirname, '../config.json');
  const configPath = getConfigPath();
  
  if (fs.existsSync(originalConfigPath)) {
    try {
      // For Vercel, use the original config file path but apply overrides
      const configPathToUse = isVercel ? originalConfigPath : configPath;
      
      // Use ConfigManager to load config with Vercel overrides
      const { default: ConfigManager } = await import('../src/core/ConfigManager.js');
      const configManager = new ConfigManager(configPathToUse);
      const config = configManager.loadConfig();
      
      if (isVercel) {
        runtimeConfig = config; // Cache the config with overrides applied
        // Also save to tmp for the CertificateGenerator to use
        try {
          fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        } catch (error) {
          console.warn('Could not write config to /tmp:', error.message);
        }
      }
      
      return config;
    } catch (error) {
      console.error('Error loading config via ConfigManager:', error.message);
      // Fallback to direct file reading (without overrides)
      const configData = fs.readFileSync(originalConfigPath, 'utf-8');
      const config = JSON.parse(configData);
      
      if (isVercel) {
        // Apply basic Vercel overrides manually
        if (config.template && config.template.outputDirectory) {
          config.template.outputDirectory = '/tmp/output/participants';
        }
        runtimeConfig = config;
      }
      
      return config;
    }
  }
  
  return {};
}

// Helper function to save config (to file and memory)
function saveConfig(config) {
  const isVercel = process.env.VERCEL || process.env.VERCEL_ENV;
  
  if (isVercel) {
    // Store in memory for Vercel
    runtimeConfig = config;
    
    // Also try to save to /tmp (may work for the current request)
    try {
      const configPath = getConfigPath();
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    } catch (error) {
      console.warn('Could not write config to /tmp, using memory only:', error.message);
    }
  } else {
    // Normal file write for local development
    const configPath = getConfigPath();
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));  }
}

// Initialize worker service
const workerService = new WorkerService();

// Middleware
app.use(cors({
  origin: NODE_ENV === 'production' && process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : true,
  credentials: true
}));

// Add security headers for Vercel deployment
app.use((req, res, next) => {
  // Set Content Security Policy to allow external resources and localhost for development
  res.setHeader('Content-Security-Policy', 
    "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: https: http: blob:; " +
    "style-src 'self' 'unsafe-inline' https: http:; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https: http: cdnjs.cloudflare.com; " +
    "script-src-elem 'self' 'unsafe-inline' https: http: cdnjs.cloudflare.com; " +
    "font-src 'self' https: http: data:; " +
    "img-src 'self' data: https: http: blob:; " +
    "connect-src 'self' https: http: ws: wss:; " +
    "frame-src 'self' https: http:; " +
    "worker-src 'self' blob:; " +
    "object-src 'none';"
  );
  
  // Add other security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  next();
});

app.use(express.json({ limit: process.env.MAX_FILE_SIZE || '50mb' }));
app.use(express.urlencoded({ 
  extended: true, 
  limit: process.env.MAX_FILE_SIZE || '50mb' 
}));

// Serve static files with environment-aware paths
const isVercel = process.env.VERCEL || process.env.VERCEL_ENV;

const assetsPath = process.env.ASSETS_PATH || path.join(__dirname, '../assets');
const toolsPath = process.env.TOOLS_PATH || path.join(__dirname, '../tools');
const uploadDir = isVercel ? '/tmp/uploads/' : (process.env.UPLOAD_DIR || '../uploads/');

app.use('/tools', express.static(toolsPath));
app.use('/assets', express.static(assetsPath));
app.use(express.static(path.join(__dirname, '..')));

// Setup multer for file uploads
const upload = multer({ 
  dest: uploadDir,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE?.replace('mb', '')) * 1024 * 1024 || 50 * 1024 * 1024
  }
});

// Health check endpoint for Vercel
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    environment: NODE_ENV,
    vercel: !!VERCEL_URL
  });
});

// Serve the unified dashboard at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'unified-dashboard.html'));
});

// Handle /api route (Vercel redirects here)
app.get('/api', (req, res) => {
  res.sendFile(path.join(__dirname, 'unified-dashboard.html'));
});

// Serve the line picker at /picker
app.get('/picker', (req, res) => {
  res.sendFile(path.join(__dirname, 'lineCoordinatePicker.html'));
});

app.get('/lineCoordinatePicker.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'lineCoordinatePicker.html'));
});

// Serve the unified dashboard
app.get('/unified', (req, res) => {
  res.sendFile(path.join(__dirname, 'unified-dashboard.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'unified-dashboard.html'));
});

app.get('/unified-dashboard.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'unified-dashboard.html'));
});

// API endpoint to get current configuration
app.get('/api/config', async (req, res) => {
  try {
    const config = await loadConfig();
    
    // Provide defaults if config is empty
    if (Object.keys(config).length === 0) {
      return res.json({ 
        textFields: {},
        execution: { mode: 'test' },
        template: { file: 'cert.pdf' }
      });
    }
    
    res.json(config);

  } catch (error) {
    console.error('Error reading config:', error);
    res.status(500).json({ error: 'Failed to read configuration: ' + error.message });
  }
});

// API endpoint to validate configuration
app.get('/api/validate', async (req, res) => {
  try {
    const config = await loadConfig();
    
    if (Object.keys(config).length === 0) {
      return res.json({ 
        valid: false, 
        message: 'Configuration file not found' 
      });
    }

    // Basic validation
    const errors = [];
    
    // Check template configuration
    if (!config.template?.pdfPath) {
      errors.push('Template file not specified');
    } else {
      const templatePath = path.resolve(__dirname, '..', config.template.pdfPath);
      if (!fs.existsSync(templatePath)) {
        errors.push(`Template file not found: ${config.template.pdfPath}`);
      }
    }
    
    if (!config.textFields || Object.keys(config.textFields).length === 0) {
      errors.push('No text fields configured');
    } else {
      // Check if fields have coordinates
      Object.entries(config.textFields).forEach(([fieldName, field]) => {
        if (!field.coordinates) {
          errors.push(`Field '${fieldName}' missing coordinates`);
        } else {
          // Check for different coordinate systems
          const coords = field.coordinates;
          if (coords.coordinateSystem === 'line') {
            // Line coordinate system needs lineStartX, lineEndX, yFromTop
            if (typeof coords.lineStartX !== 'number' || 
                typeof coords.lineEndX !== 'number' || 
                typeof coords.yFromTop !== 'number') {
              errors.push(`Field '${fieldName}' has incomplete line coordinates`);
            }
          } else if (coords.coordinateSystem === 'point') {
            // Point coordinate system needs x, y
            if (typeof coords.x !== 'number' || typeof coords.y !== 'number') {
              errors.push(`Field '${fieldName}' has incomplete point coordinates`);
            }
          } else {
            // Legacy or unknown coordinate system
            if (typeof coords.x !== 'number' && typeof coords.lineStartX !== 'number') {
              errors.push(`Field '${fieldName}' has unknown coordinate format`);
            }
          }
        }
      });
    }
    
    if (!config.execution?.mode) {
      errors.push('Execution mode not specified');
    }
    
    if (errors.length > 0) {
      return res.json({ 
        valid: false, 
        message: 'Configuration issues found: ' + errors.join(', ') 
      });
    }
    
    res.json({ 
      valid: true, 
      message: 'Configuration is valid' 
    });

  } catch (error) {
    console.error('Error validating config:', error);
    res.status(500).json({ 
      valid: false, 
      message: 'Error validating config: ' + error.message 
    });
  }
});

// Endpoint to save configuration
app.post('/api/save-config', async (req, res) => {
  try {
    const newConfig = req.body;
    
    if (!newConfig) {
      return res.status(400).json({ error: 'No configuration provided' });
    }

    // Read existing config using helper function
    let existingConfig = await loadConfig();

    // Merge configurations - prefer new config but keep existing values where not provided
    const mergedConfig = {
      ...existingConfig,
      ...newConfig
    };

    // If only textFields provided (from line picker), merge just those
    if (newConfig.textFields && Object.keys(newConfig).length === 1) {
      mergedConfig.textFields = {
        ...existingConfig.textFields,
        ...newConfig.textFields
      };
      
      mergedConfig.coordinateHelp = {
        instructions: "These coordinates were set using lineCoordinatePicker.html",
        coordinateSystem: "line means you set start and end points of lines"
      };
    }

    // Save updated config using helper function
    saveConfig(mergedConfig);
    
    res.json({ 
      success: true, 
      message: 'Configuration saved successfully',
      config: mergedConfig
    });
  } catch (error) {
    console.error('Error saving config:', error);
    res.status(500).json({ error: 'Failed to save configuration: ' + error.message });
  }
});

// Endpoint to upload and process CSV files
app.post('/api/upload-csv', upload.single('csvFile'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    
    // Parse CSV (simple implementation)
    const lines = fileContent.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const data = lines.slice(1).map(line => {
      return line.split(',').map(cell => cell.trim().replace(/"/g, ''));
    });

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    res.json({
      success: true,
      headers,
      data: data.slice(0, 10), // Return first 10 rows for preview
      totalRows: data.length
    });

  } catch (error) {
    console.error('Error processing CSV:', error);
    res.status(500).json({ error: 'Failed to process CSV: ' + error.message });
  }
});

// Endpoint to generate certificates from CSV data
app.post('/api/generate-from-csv', async (req, res) => {
  try {
    const { csvData, mappings } = req.body;
    
    if (!csvData || !mappings) {
      return res.status(400).json({ error: 'CSV data and mappings required' });    }

    // Get the current config (which includes Vercel overrides)
    const currentConfig = await loadConfig();
    
    // Create a temporary config file with the current configuration
    const tempConfigPath = getConfigPath();
    saveConfig(currentConfig);

    // Import and run certificate generator with the proper config
    const { default: CertificateGenerator } = await import('../src/core/CertificateGenerator.js');
    const generator = new CertificateGenerator(tempConfigPath);
    
    const result = await generator.generateFromCsvData(csvData, mappings);

    // Get list of generated files with participant info
    const generatedFiles = result.map((filePath, index) => {
      const participant = csvData[index];
      const fileName = path.basename(filePath);
      const relativePath = path.relative(path.join(__dirname, '..'), filePath);
      
      return {
        fileName,
        filePath: relativePath,
        participant: Object.keys(mappings).reduce((acc, fieldName) => {
          const columnIndex = mappings[fieldName];
          acc[fieldName] = participant[columnIndex] || '';
          return acc;
        }, {})
      };
    });

    res.json({
      success: true,
      count: csvData.length,
      message: `Generated ${csvData.length} certificates successfully`,
      outputPath: 'output/participants/',
      files: generatedFiles.slice(0, 10) // Return first 10 for preview
    });

  } catch (error) {
    console.error('Error generating certificates:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to generate certificates: ' + error.message 
    });
  }
});

// Endpoint to get current configuration
app.get('/api/get-config', async (req, res) => {
  try {
    const config = await loadConfig();
    
    res.json({ textFields: config.textFields || {} });

  } catch (error) {
    console.error('Error reading config:', error);
    res.status(500).json({ error: 'Failed to read configuration: ' + error.message });
  }
});

// Endpoint to test lines (generate test certificates)
app.post('/api/test-lines', async (req, res) => {
  try {
    const { textFields } = req.body;
      // Read current config and merge with new textFields
    let currentConfig = await loadConfig();
    
    // Update the config with new textFields
    const updatedConfig = {
      ...currentConfig,
      textFields: {
        ...currentConfig.textFields,
        ...textFields
      }
    };
    
    // Save the updated config temporarily
    const isVercel = process.env.VERCEL || process.env.VERCEL_ENV;
    const tempConfigPath = isVercel 
      ? '/tmp/temp-test-config.json'
      : path.join(__dirname, '../temp-test-config.json');
    
    try {
      fs.writeFileSync(tempConfigPath, JSON.stringify(updatedConfig, null, 2));
    } catch (error) {
      console.warn('Could not write temp config file, using runtime config:', error.message);
      // For Vercel, we'll pass the config directly to the generator
    }
    
    try {
      // Import and use the new certificate generator
      const { default: CertificateGenerator } = await import('../src/core/CertificateGenerator.js');
      const generator = new CertificateGenerator(tempConfigPath);
      
      // Generate a single test certificate for the selected field
      const testName = 'Test Name';
      const testPosition = 'Test Position';
      
      // Create test participant data based on the fields provided
      const testParticipant = {};
      Object.keys(textFields).forEach(fieldName => {
        if (fieldName === 'name') {
          testParticipant[fieldName] = testName;
        } else if (fieldName === 'position') {
          testParticipant[fieldName] = testPosition;
        } else {
          testParticipant[fieldName] = `Test ${fieldName}`;
        }
      });
      
      // Generate test certificate
      const result = await generator.pdfGenerator.generateCertificates([testParticipant]);
      
      res.json({ 
        success: true, 
        message: `Test certificate generated successfully for field(s): ${Object.keys(textFields).join(', ')}`,
        outputPath: 'output/participants/',
        generatedFiles: result.length
      });
      
    } catch (genError) {
      console.error('Certificate generation error:', genError);
      res.json({ 
        success: false, 
        message: 'Failed to generate test certificate: ' + genError.message,
        note: 'Check your configuration and coordinates'
      });
    }

    // Clean up temp file
    if (fs.existsSync(tempConfigPath)) {
      fs.unlinkSync(tempConfigPath);
    }

  } catch (error) {
    console.error('Error testing lines:', error);
    res.status(500).json({ error: 'Failed to test lines: ' + error.message });
  }
});

// Endpoint to generate test certificates
app.post('/api/generate-test', async (req, res) => {
  try {
    // Get the current config (which includes Vercel overrides)
    const currentConfig = await loadConfig();
    
    // Create a temporary config file with the current configuration
    const tempConfigPath = getConfigPath();
    saveConfig(currentConfig);

    // Import and run certificate generator with test data
    const { default: CertificateGenerator } = await import('../src/core/CertificateGenerator.js');
    const generator = new CertificateGenerator(tempConfigPath);
    
    // Generate a few test certificates using object format
    const testParticipants = [
      { name: 'John Doe', position: 'Senior Developer' },
      { name: 'Jane Smith', position: 'Project Manager' },
      { name: 'Bob Johnson', position: 'UI/UX Designer' }
    ];
    
    // Use generateCertificates method directly
    const result = await generator.pdfGenerator.generateCertificates(testParticipants);

    // Get list of generated files with participant info
    const generatedFiles = result.map((filePath, index) => {
      const participant = testParticipants[index];
      const fileName = path.basename(filePath);
      const relativePath = path.relative(path.join(__dirname, '..'), filePath);
      
      return {
        fileName,
        filePath: relativePath,
        participant
      };
    });

    res.json({
      success: true,
      count: testParticipants.length,
      message: `Generated ${testParticipants.length} test certificates successfully`,
      outputPath: 'output/participants/',
      files: generatedFiles
    });

  } catch (error) {
    console.error('Error generating test certificates:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to generate test certificates: ' + error.message 
    });
  }
});

// Endpoint to test assets serving
app.get('/api/test-assets', (req, res) => {
  try {
    const assetsPath = path.join(__dirname, '../assets');
    const templatesPath = path.join(assetsPath, 'templates');
    
    const assets = {
      assetsPath: assetsPath,
      assetsExists: fs.existsSync(assetsPath),
      templatesPath: templatesPath,
      templatesExists: fs.existsSync(templatesPath),
      templates: fs.existsSync(templatesPath) ? fs.readdirSync(templatesPath) : []
    };
    
    res.json(assets);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint to serve PDF files for preview
app.get('/api/preview/:fileName', (req, res) => {
  const fileName = req.params.fileName;
  workerService.handlePreview(fileName, res);
});

// Endpoint to download single PDF file
app.get('/api/download/:fileName', (req, res) => {
  const fileName = req.params.fileName;
  workerService.handleDownload(fileName, res);
});

// Endpoint to download all PDFs as ZIP
app.get('/api/download-all', (req, res) => {
  workerService.handleZipDownload(res);
});

// Endpoint to get file statistics
app.get('/api/files/stats', (req, res) => {
  try {
    const stats = workerService.getStatistics();
    res.json(stats);
  } catch (error) {
    console.error('Error getting file statistics:', error);
    res.status(500).json({ error: 'Failed to get statistics: ' + error.message });
  }
});

// Endpoint to get list of available files
app.get('/api/files/list', (req, res) => {
  try {
    const files = workerService.getAvailableFiles();
    res.json(files);
  } catch (error) {
    console.error('Error getting file list:', error);
    res.status(500).json({ error: 'Failed to get file list: ' + error.message });
  }
});

// Catch-all route for any unmatched routes - redirect to dashboard
app.use((req, res) => {
  // If it's an API request that wasn't matched, return 404
  if (req.path.startsWith('/api/') && req.path !== '/api' && req.path !== '/api/') {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  
  // Otherwise, serve the dashboard
  res.sendFile(path.join(__dirname, 'unified-dashboard.html'));
});

// Clean up old temp files on server start
workerService.cleanupTempFiles();

// Start server (for local development)
if (NODE_ENV !== 'production' || !VERCEL_URL) {
  app.listen(PORT, HOST, () => {
    console.log(`🚀 Certificate Generator Server running at http://${HOST}:${PORT}`);
    console.log(`🌍 Environment: ${NODE_ENV}`);
    console.log(`🎯 Main Dashboard: http://${HOST}:${PORT}/`);
    console.log(`📖 Line Coordinate Picker: http://${HOST}:${PORT}/picker`);    console.log(`⚙️ Configuration will be saved to ${getConfigPath()}`);
  });
} else {
  console.log(`🚀 Certificate Generator ready for Vercel deployment`);
  console.log(`🌍 Environment: ${NODE_ENV}`);
  console.log(`🎯 Vercel URL: ${VERCEL_URL}`);
  console.log(`⚙️ Configuration stored in memory (read-only filesystem)`);
}

export default app;
