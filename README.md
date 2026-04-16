# Co-Lab

## Local development

Run the app locally:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

If a stale Next dev process is still holding the lock, stop it and clear the cache first:

```powershell
Get-Process node
Stop-Process -Id <PID> -Force
Remove-Item -Recurse -Force .next
npm run dev
```

## Environment

Copy `.env.example` to `.env.local` and fill in:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `EVOLUTION_SECRET`
- `NEXT_PUBLIC_APP_URL`

## Deploy on Vercel

Co-Lab should be deployed to **Vercel**, not GitHub Pages. The app relies on:

- Next.js server routes
- Supabase auth and server-side writes
- scheduled evolution hitting `/api/evolution`

### Vercel setup

1. Push the repo to GitHub
2. Import the repo into Vercel
3. Add the same environment variables from `.env.local`
4. Set `NEXT_PUBLIC_APP_URL` to your deployed Vercel URL
5. Deploy

### Required follow-up

- Apply the checked-in Supabase migrations before using production data
- Keep GitHub Actions enabled for the 30-minute evolution trigger
- Store `APP_BASE_URL` and `EVOLUTION_SECRET` as GitHub repository secrets

## Scheduled evolution

Co-Lab evolves every 30 minutes through the GitHub Actions workflow at `.github/workflows/evolution.yml`.

Required GitHub repository secrets:

- `APP_BASE_URL`: your deployed app base URL, for example `https://your-app.vercel.app`
- `EVOLUTION_SECRET`: the same bearer secret configured in the app environment

The workflow calls `GET /api/evolution` with `Authorization: Bearer <EVOLUTION_SECRET>`.

You can verify it manually in GitHub:

1. Open the `Actions` tab
2. Choose the `Evolution` workflow
3. Click `Run workflow`
