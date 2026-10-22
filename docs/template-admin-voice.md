# Template Admin voice appointments

This experiment records Chinese appointment instructions in Template Admin. Audio is sent through the local Template server to a dedicated Cloudflare Worker. The browser never receives the Worker bearer token.

The Worker uses `@cf/openai/whisper-large-v3-turbo` for transcription and the active `@cf/meta/llama-3.1-8b-instruct-fast` variant for structured appointment extraction.

## Deploy the Worker

1. Generate a long random token and save it as the Worker secret:

   ```powershell
   npx wrangler secret put VOICE_API_TOKEN --config workers/admin-voice/wrangler.jsonc
   ```

2. Deploy the Worker:

   ```powershell
   npm run voice:deploy
   ```

3. Copy the deployed Worker URL. Keep the same token for the local proxy and the Worker secret.

## Run Template locally

Set the two environment variables in the same PowerShell window that starts the server:

```powershell
$env:OPENSLOT_VOICE_WORKER_URL = "https://openslot-admin-voice.<account>.workers.dev"
$env:OPENSLOT_VOICE_WORKER_TOKEN = "the-same-secret-used-by-the-worker"
npm run template
```

Open `http://127.0.0.1:4180/template/admin.html`, sign in, then press and hold the microphone button. Recordings shorter than 700 ms are discarded. Recordings stop automatically after 60 seconds.

The first phase writes only to Template localStorage. The Worker cannot write to Supabase.

## Demo rollout

Demo Admin reuses the recorder and parsing contract, but authenticates with the current Supabase session. The Worker validates that session against the configured Supabase project and accepts only `salonSlug: "demo"`. Final writes still use the existing Admin RPC and RLS checks.

1. Redeploy `openslot-admin-voice` after changing the Worker.
2. Add the deployed URL as `OPENSLOT_VOICE_WORKER_URL` in the Cloudflare Pages production build environment.
3. Trigger a new Pages build.

Only `demo/admin` contains the microphone control. `lisa/admin` has no voice entry during this test phase.
