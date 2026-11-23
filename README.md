# VidLoad

Free public-video-link downloader, built for Cloudflare Workers and Android.

Features: resolve publicly accessible X posts to video formats; direct HTTPS MP4/WebM/MOV/M4V links; save video files to Downloads; no login, bypasses, tracking or stored download history.

## Development

`npm test` to run Workers unit tests. `npm install` then `npm run dev` for local Cloudflare development. `npm run deploy` for Cloudflare (requires credentials).

## Builds

The Android debug APK is built on pushes to main in GitHub Actions under **Build and test VidLoad**. Download it from the workflow's artifacts.

The Cloudflare workflow deploys the PWA when `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are configured as repository secrets.

## Rights and limitations

Download only public media that you own or have permission to save. VidLoad cannot access private media or DRM, and relies on the publicly operated FxTwitter/FxEmbed metadata service for X videos. Direct URLs require HTTPS and may be limited by the provider.

Licensed MIT.
