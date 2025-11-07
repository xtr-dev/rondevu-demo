# Deploying Rondevu Demo to Cloudflare Pages

This guide covers deploying the Rondevu demo to Cloudflare Pages.

## Prerequisites

- Cloudflare account (free tier works)
- Node.js 18+ installed locally
- Git repository (for automatic deployments)

## Option 1: Deploy via Git Integration (Recommended)

This is the easiest method with automatic deployments on every push.

### Step 1: Push to Git

If you haven't already, initialize a git repository:

```bash
cd demo
git init
git add .
git commit -m "Initial commit: Rondevu demo"
git remote add origin https://github.com/YOUR_USERNAME/rondevu-demo.git
git push -u origin main
```

### Step 2: Connect to Cloudflare Pages

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **Pages** in the sidebar
3. Click **Create a project**
4. Click **Connect to Git**
5. Authorize Cloudflare to access your GitHub/GitLab account
6. Select your `rondevu-demo` repository

### Step 3: Configure Build Settings

Use these settings:

- **Project name**: `rondevu-demo` (or your preferred name)
- **Production branch**: `main`
- **Framework preset**: `Vite`
- **Build command**: `npm run build`
- **Build output directory**: `dist`
- **Root directory**: `/` (or leave empty)
- **Node version**: `18` (or higher)

### Step 4: Deploy

1. Click **Save and Deploy**
2. Cloudflare will build and deploy your site
3. You'll get a URL like: `https://rondevu-demo.pages.dev`

### Automatic Deployments

Every push to `main` will trigger a new deployment automatically!

---

## Option 2: Deploy via Wrangler CLI

Deploy directly from your local machine using Wrangler.

### Step 1: Install Wrangler

```bash
npm install -g wrangler
```

Or use without installing:

```bash
npx wrangler
```

### Step 2: Login to Cloudflare

```bash
wrangler login
```

This will open your browser to authenticate.

### Step 3: Build Your Project

```bash
npm run build
```

This creates the `dist/` directory with your static files.

### Step 4: Deploy to Cloudflare Pages

```bash
wrangler pages deploy dist --project-name=rondevu-demo
```

Or if you prefer, use the simpler command:

```bash
npx wrangler pages deploy dist
```

Wrangler will:
- Create the Pages project if it doesn't exist
- Upload all files from `dist/`
- Deploy to production

### Step 5: Access Your Site

After deployment, you'll see output like:

```
✨ Deployment complete! Take a peek over at https://rondevu-demo.pages.dev
```

---

## Option 3: Deploy via Dashboard Upload

For quick testing without Git or CLI.

### Step 1: Build Locally

```bash
npm run build
```

### Step 2: Create a ZIP

```bash
cd dist
zip -r ../demo.zip .
cd ..
```

### Step 3: Upload to Cloudflare

1. Go to [Cloudflare Pages](https://dash.cloudflare.com/?to=/:account/pages)
2. Click **Create a project**
3. Click **Direct Upload**
4. Drag and drop your `demo.zip` file
5. Wait for deployment

---

## Custom Domain (Optional)

### Add a Custom Domain

1. Go to your Pages project in the Cloudflare dashboard
2. Click **Custom domains**
3. Click **Set up a custom domain**
4. Enter your domain (e.g., `demo.rondevu.dev`)
5. Follow the DNS instructions
6. Cloudflare will automatically provision an SSL certificate

---

## Environment Variables

The demo doesn't require any environment variables since the server URL is hardcoded. However, if you want to make it configurable:

### Step 1: Update vite.config.js

```javascript
import { defineConfig } from 'vite';

export default defineConfig({
  define: {
    'import.meta.env.VITE_RONDEVU_URL': JSON.stringify(
      process.env.VITE_RONDEVU_URL || 'https://rondevu.xtrdev.workers.dev'
    )
  },
  // ... rest of config
});
```

### Step 2: Update src/main.js

```javascript
const client = new RondevuClient({
  baseUrl: import.meta.env.VITE_RONDEVU_URL || 'https://rondevu.xtrdev.workers.dev'
});
```

### Step 3: Set Environment Variables in Cloudflare

In your Pages project settings:
1. Go to **Settings** → **Environment variables**
2. Add: `VITE_RONDEVU_URL` = `https://your-server.workers.dev`
3. Redeploy

---

## Troubleshooting

### Build Fails

**Issue**: Build command fails with module errors

**Solution**: Ensure `package.json` and `package-lock.json` are committed to your repository.

### Wrong Node Version

**Issue**: Build uses wrong Node.js version

**Solution**: Add `.node-version` file (already created) or set in Pages settings.

### 404 Errors

**Issue**: Page shows 404 when deployed

**Solution**: Ensure `build output directory` is set to `dist` in Pages settings.

### CORS Errors

**Issue**: API requests fail with CORS errors

**Solution**: Ensure your Rondevu server has CORS properly configured (already fixed in latest version).

---

## Updating Your Deployment

### Git Integration Method

```bash
git add .
git commit -m "Update demo"
git push
```

Cloudflare Pages will automatically deploy the update.

### Wrangler CLI Method

```bash
npm run build
wrangler pages deploy dist --project-name=rondevu-demo
```

---

## Monitoring and Analytics

Cloudflare Pages provides:
- **Analytics**: View page views and requests
- **Real-time logs**: Monitor deployments
- **Build history**: View all deployments and rollback if needed

Access these in your Pages project dashboard.

---

## Cost

Cloudflare Pages is **free** for:
- Unlimited static requests
- Unlimited bandwidth
- 500 builds per month
- 1 concurrent build

Perfect for this demo! 🎉

---

## Advanced: Branch Previews

Cloudflare automatically creates preview deployments for all branches:

1. Create a new branch: `git checkout -b new-feature`
2. Make changes and push: `git push origin new-feature`
3. Cloudflare creates a preview URL: `https://new-feature.rondevu-demo.pages.dev`
4. Test your changes before merging to main

---

## Next Steps

After deploying:

1. **Test the demo** at your Pages URL
2. **Share the link** with others to test P2P connections
3. **Add a custom domain** for a professional look
4. **Monitor usage** in the Cloudflare dashboard

Happy deploying! 🚀
