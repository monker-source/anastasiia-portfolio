# Admin (Decap CMS)

The public site reads content from:

- [`content/site.json`](content/site.json) — name, bio, email, phone, CV link
- [`content/projects.json`](content/projects.json) — all projects (previews + optional detail pages)

Editors use **Decap** at `/admin/`.

## Local editing (you)

1. From the project root, start a static server (any one is fine):

```bash
npx --yes serve -p 5173
```

2. In a second terminal, start Decap’s local Git backend:

```bash
npx --yes decap-server
```

3. Open [http://localhost:5173/admin/](http://localhost:5173/admin/)  
   Prefer `localhost` (not only `127.0.0.1`). Click **Login** — with `decap-server` running there is no Netlify password; Decap uses the local Git proxy.

4. Edit **Site settings** or **Projects** → **Save**. Files under `content/` and `archive/uploads/` update on disk.

5. View the site at [http://localhost:5173/](http://localhost:5173/).

## Production (employer)

Host on **Netlify** (static site + Identity):

1. Deploy this repo to Netlify.
2. Enable **Identity** → registration invite-only → invite Anastasiia.
3. Enable **Git Gateway** under Identity → Services.
4. She opens `https://YOUR-SITE.netlify.app/admin/`, logs in, edits, and publishes.  
   Saves become Git commits; Netlify rebuilds/redeploys.

Without Netlify Identity, `/admin` on the live site will not accept logins. Local workflow above still works for you.

## What she can change

| Screen | Fields |
|--------|--------|
| Site settings | Artist name, bio, email, phone, CV URL |
| Projects | Add / reorder / delete; preview image; publish on/off; optional detail (text, hero, slideshows) |

Homepage canvas positions live under **Canvas position** (collapsed). Leave them alone unless you intend to move tiles.

A project opens from the homepage only when **Detail page** has both a **hero** image and a **body** text.

## New images

Uploads go to `archive/uploads/`. Existing archive files under `archive/previews/` and `archive/project 1/` stay as-is until replaced in the admin.
