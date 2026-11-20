# Deploy to Vercel

Import this repository in Vercel. The checked-in configuration uses:

- Build command: `npm run build`
- Output directory: `public`
- Framework preset: Other
- Node.js version: 24.x

No environment variables, database, or serverless functions are required. PDF templates, fonts, and libraries are included in the build. Participant data and generated certificates remain in each visitor's browser.

To check the production files locally, run `npm run build`, then `npm start` and open http://localhost:3000.

For another static host, publish the contents of `public/` at the domain root after building.
