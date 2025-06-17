// Vercel serverless function entry point
// This file imports and runs the Express app from tools/coordinateServer.js

import app from '../tools/coordinateServer.js';

// Export the Express app directly for Vercel
export default app;
