# Vercel Deployment Guide

## 🚀 Quick Deploy to Vercel

### 1. **Prepare Your Repository**
Make sure all files are committed to your Git repository:
```bash
git add .
git commit -m "Prepare for Vercel deployment"
git push origin main
```

### 2. **Deploy to Vercel**

#### Option A: Deploy via Vercel CLI
```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy
vercel --prod
```

#### Option B: Deploy via Vercel Dashboard
1. Go to [vercel.com](https://vercel.com)
2. Sign in with GitHub/GitLab/Bitbucket
3. Click "New Project"
4. Import your repository
5. Configure settings (optional)
6. Click "Deploy"

### 3. **Environment Variables Setup**

In your Vercel dashboard, go to your project settings and add these environment variables:

```
NODE_ENV=production
HOST=0.0.0.0
TEMPLATE_PATH=./assets/templates/ttt_tnv.pdf
OUTPUT_DIR=./output/participants
PRIMARY_FONT_PATH=./assets/fonts/MonteCarlo/MonteCarlo-Regular.ttf
SECONDARY_FONT_PATH=./assets/fonts/Quicksand/static/Quicksand-Bold.ttf
ASSETS_PATH=./assets
TOOLS_PATH=./tools
MAX_FILE_SIZE=50mb
UPLOAD_DIR=./uploads
TEMP_DIR=./temp
ALLOWED_ORIGINS=https://your-app-name.vercel.app
CSV_DELIMITER=,
CSV_ENCODING=utf8
PDF_MAX_CONCURRENT=5
PDF_TIMEOUT=30000
LOG_LEVEL=info
```

### 4. **Custom Domain (Optional)**
1. In Vercel dashboard, go to your project
2. Click "Domains" tab
3. Add your custom domain
4. Update DNS records as instructed
5. Update `ALLOWED_ORIGINS` environment variable

### 5. **Verify Deployment**
After deployment, test these endpoints:
- `https://your-app.vercel.app/` - Main dashboard
- `https://your-app.vercel.app/health` - Health check
- `https://your-app.vercel.app/picker` - Coordinate picker

### 6. **Important Notes for Vercel**

#### File Storage Limitations
- Vercel has read-only file system
- Generated files are temporary and cleared between requests
- Consider using external storage (AWS S3, Cloudinary) for permanent file storage

#### Function Timeout
- Hobby plan: 10 seconds
- Pro plan: 60 seconds (configured in vercel.json)
- Upgrade if you need longer processing times

#### Memory Limits
- Hobby plan: 1024 MB
- Pro plan: 3008 MB

### 7. **Troubleshooting**

#### Common Issues:
1. **File not found errors**: Check file paths in environment variables
2. **Font loading issues**: Ensure font files are in the correct relative paths
3. **CORS errors**: Update `ALLOWED_ORIGINS` with your Vercel domain

#### Debug Mode:
Set `LOG_LEVEL=debug` in environment variables for verbose logging.

### 8. **Local Development**
```bash
# Use .env.local for local development
cp .env.local .env

# Start development server
npm run dev
```

### 9. **Production Monitoring**
Monitor your app at:
- Vercel Dashboard: Deployments, Functions, Analytics
- Health endpoint: `https://your-app.vercel.app/health`
