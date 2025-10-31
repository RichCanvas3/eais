# Custom Domain Setup for Cloudflare Pages

## Your Custom Domain: www.8004-agent.com

## Step 1: Verify Deployment Status

Check if your Cloudflare Pages deployment is actually deployed:

1. Go to **Cloudflare Dashboard** → **Pages**
2. Select your `erc8004-web` project
3. Check **Deployments** tab
4. Is there a successful deployment?

If **NO deployment exists**:
- You need to deploy first (see QUICK_START.md)
- Deployment might have failed due to build errors

If **Deployment exists**:
- Check the status (Success/Failed)
- If failed, check the build logs

## Step 2: Configure Custom Domain

1. In Cloudflare Pages project, go to **Custom domains**
2. Click **Set up a custom domain**
3. Enter: `8004-agent.com` (without www)
4. Cloudflare will:
   - Create a CNAME record
   - Provision SSL certificate
   - Route traffic to your Pages deployment

## Step 3: Add www Subdomain (Optional)

If you want `www.8004-agent.com`:

1. In **Custom domains**, click **Add a custom domain**
2. Enter: `www.8004-agent.com`
3. Cloudflare will create another CNAME

## Step 4: DNS Configuration

### If Domain is in Cloudflare

**Automatic**: Cloudflare Pages auto-configures DNS when you add the custom domain.

**Manual** (if needed):
- Type: CNAME
- Name: `@` (for root domain) or `www` (for www subdomain)
- Target: `erc8004-web.pages.dev`
- Proxy: Proxied (orange cloud)

### If Domain is NOT in Cloudflare

1. Go to your DNS provider (e.g., GoDaddy, Namecheap)
2. Add DNS records:
   - Type: CNAME
   - Name: `@` or `www`
   - Value: `erc8004-web.pages.dev`
3. Wait for DNS propagation (can take up to 24 hours)

## Step 5: Verify Configuration

### Check Deployment URL First

Before worrying about custom domain, check:
```
https://erc8004-web.pages.dev
```

**Does this work?**
- ✅ YES → Custom domain issue
- ❌ NO → Deployment issue

### Check Custom Domain

```
https://8004-agent.com
https://www.8004-agent.com
```

## Troubleshooting 404 Errors

### Issue: "Page can't be found" on Custom Domain

**Possible Causes**:

1. **Deployment Failed**
   - Check build logs in Cloudflare Pages
   - Look for errors in the deployment

2. **No Deployment Exists**
   - Run deployment first:
     ```bash
     cd apps/web
     ./deploy-to-cloudflare.sh
     ```
   - Or deploy via dashboard

3. **DNS Not Propagated**
   - Use `dig www.8004-agent.com` to check DNS
   - Should show CNAME to `erc8004-web.pages.dev`
   - Wait up to 24 hours for propagation

4. **SSL Certificate Not Ready**
   - Cloudflare auto-provisions SSL
   - Check in **SSL/TLS** settings
   - May take a few minutes after adding domain

5. **Custom Domain Not Connected**
   - Go to **Pages** → **Custom domains**
   - Verify domain is listed
   - Status should be "Active" or "Pending"

6. **Routing Misconfiguration**
   - Check that custom domain points to correct deployment
   - In custom domain settings, verify target is `erc8004-web`

## Quick Diagnostic Steps

1. **Check Deployment**:
   - Does `https://erc8004-web.pages.dev` work?
   - If no, deploy first

2. **Check Custom Domain**:
   - Is it configured in Cloudflare Pages?
   - Status should be "Active"

3. **Check DNS**:
   ```bash
   dig www.8004-agent.com
   dig 8004-agent.com
   ```
   Both should resolve to Cloudflare IPs or the Pages domain

4. **Check SSL**:
   - In Cloudflare → SSL/TLS
   - Should show certificates for your domain

## Common DNS Records Needed

```
Type: CNAME
Name: @
Value: erc8004-web.pages.dev
Proxy: ON

Type: CNAME  
Name: www
Value: erc8004-web.pages.dev
Proxy: ON
```

## Testing Deployment

### 1. Test Default Domain

Visit: https://erc8004-web.pages.dev

**Expected**: 
- Site loads
- Login button visible
- Can log in with Web3Auth

**If it fails**: See deployment troubleshooting below

### 2. Test Custom Domain

Visit: https://8004-agent.com

**Expected**:
- Same site as above
- SSL certificate valid

**If it fails**: See DNS/domain troubleshooting above

## Deployment Troubleshooting

### Build Failed

Check Cloudflare Pages build logs for:
- Missing environment variables
- SDK build errors
- File size over 25MB
- Dependency errors

### Runtime Errors

Check browser console on the deployed site:
- Missing env vars
- GraphQL errors
- Web3Auth errors

### Empty/Loading Site

- Set `GRAPHQL_API_URL`
- Check all required env vars are set
- Verify build succeeded

## Next Steps

1. ✅ Verify deployment exists and succeeded
2. ✅ Configure custom domain in Cloudflare Pages
3. ✅ Wait for DNS propagation
4. ✅ Test both default and custom domains
5. ✅ Check SSL certificates

## Need More Help?

Check:
- `QUICK_START.md` - How to deploy
- `FINAL_DEPLOYMENT_GUIDE.md` - Complete guide
- Cloudflare Pages docs: https://developers.cloudflare.com/pages/

