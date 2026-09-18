# Admin (Decap CMS)

Editors use **Decap** at `/admin/`.

## Content model

| Admin | Files | What it does |
|-------|--------|----------------|
| **Info → Intro text** | [`content/info/intro.json`](content/info/intro.json) | Homepage bio text |
| **Info → Contacts** | [`content/info/contacts.json`](content/info/contacts.json) | Name, email, phone, CV |
| **Projects** | [`content/projects/*.json`](content/projects/) | One file per project — the public site auto-collects them |

There is **no** editable project list. Add / open / delete a project entry; after deploy, tiles update from how many project files exist.

Homepage canvas scatter uses each project’s **Canvas position** (collapsed). **Order** only sorts the ALL PROJECTS list.

A tile links to a detail page only when that project’s **Detail page** has both a **hero** and a **body**.

Build step: `npm run build` writes [`data/projects-index.json`](data/projects-index.json) from the projects folder. Netlify runs this on every deploy (including after Decap publish).

## Local editing (you)

```bash
npm run build          # refresh projects index
npx --yes serve -p 5173
# other terminal:
npx --yes decap-server
```

Open [http://localhost:5173/admin/](http://localhost:5173/admin/) → **Login** (local proxy, no Netlify password).

## Production (employer)

1. Deploy this repo to Netlify from **`main`** (Git-connected so Decap commits trigger builds).
2. **Identity** → enable → invite-only → invite editors.
3. **Identity → Services → Git Gateway** → enable.
4. She opens `https://YOUR-SITE.netlify.app/admin/`, logs in, edits **Info** or a **Project**, publishes.
5. Wait for the Netlify deploy, then refresh the site.

Invite / confirm email links land on the homepage. Public pages load the Netlify Identity widget so the set-password modal opens; after login she goes to `/admin/`.

## New images

Uploads go to `archive/uploads/`. Existing files under `archive/previews/` and `archive/project 1/` stay until replaced in the admin.
