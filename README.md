# ProjectCostKit

Free home project calculators and cost guides at https://projectcostkit.com.

The site is plain HTML, CSS and JavaScript. There is no server, no database and no WordPress. Articles live as JSON files in `content/posts/`, and a small builder turns them into every page of the site. GitHub Pages hosts it for free, and a daily GitHub Action publishes scheduled articles on their date.

## Folder map

| Path | What it is |
| --- | --- |
| `content/site.json` | Site settings: name, address, topics, home page text, tracking code |
| `content/posts/*.json` | Articles. The text inside is Markdown |
| `content/pages/*.json` | About, contact, privacy, disclaimer, terms, websites for contractors |
| `admin/` | The local admin dashboard and the site builder (`builder.js`) |
| `assets/css/style.css` | All styles. Inlined into every page when you build |
| `assets/js/main.js` | Menu, search and dark mode |
| `assets/js/calc.js` | All 26 calculators and the estimate builder |
| `assets/img/` | Covers, social images and icons |
| `build.js` | Builds the site from the terminal |
| `.github/workflows/scheduled-publish.yml` | Rebuilds the site every morning |
| Everything else at the top level | Generated pages. Do not edit them by hand |

## First-time setup

1. **Create a GitHub repository** (public, so Pages is free) and push this folder to it, or upload the files on github.com.
2. **Turn on GitHub Pages:** repository Settings → Pages → Build and deployment → "Deploy from a branch" → branch `main`, folder `/ (root)` → Save.
3. **Custom domain:** in the same Pages screen, enter `projectcostkit.com` and save. The `CNAME` file in this folder already contains it.
4. **DNS at your domain registrar:**
   - Four `A` records for `@`: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - One `CNAME` record for `www` pointing to `YOUR-GITHUB-USERNAME.github.io`
   - Delete any old `A` or `CNAME` records that conflict
5. When GitHub shows the certificate is ready, tick **Enforce HTTPS**.
6. **Let the workflow push:** Settings → Actions → General → Workflow permissions → "Read and write permissions" → Save.
7. **Run the workflow once by hand:** Actions tab → "Scheduled publish" → Run workflow. It should finish green.
8. **Set up an email address** for `hello@projectcostkit.com` (most registrars offer free email forwarding), or change the email in Settings in the admin.

## Writing and editing with the admin

1. Open `admin/index.html` in **Chrome or Edge on a computer**. The easiest way is VS Code with the Live Server extension, then go to `/admin/`. Opening the file directly also works.
2. Click **Choose site folder** and pick this folder. Allow the browser to edit files.
3. **Articles:** click one to edit, or **New article**. The preview updates as you type.
   - A **future date** schedules the article. It stays hidden until that day, and the daily workflow publishes it.
   - **Draft** status keeps it off the site entirely.
   - **Featured order** puts it in the home page "Start here" section (1 is the big card).
   - **Calculator:** pick one to show it at the top of the article.
   - **Upload cover photo** saves a 1200 x 675 and a 600 x 338 WebP and a social image for you. Write real alt text.
   - **Generate social image** makes a 1200 x 630 sharing image from the title when there is no photo.
4. **Pages** and **Settings** work the same way. Paste Google Analytics, AdSense and Search Console code into the head code box in Settings.
5. Click **Save**, then **Rebuild site**.
6. Commit and push with GitHub Desktop, VS Code or the terminal. GitHub Pages updates within a minute or two.

The admin only changes files on your computer, so `/admin/` on the live site is harmless. It is blocked from search engines in `robots.txt`.

## Building from the terminal

```
node build.js              # build with today's date
node build.js 2026-11-03   # build as if it were that date (to check scheduled posts)
```

Node 18 or newer. No `npm install` needed.

## Linking between articles

Link with root-relative paths like `/blog/paint-calculator/`. The builder turns them into relative links. A link to an article that is not live yet is shown as plain text until that article goes live, so you can schedule articles that link to each other in any order.

## Images

- Covers: 16:9 WebP, `cover-<slug>-1200x675.webp` and `cover-<slug>-600x338.webp`, in `assets/img/posts/`.
- Images in an article: put the size at the end of the file name, like `deck-plan-1200x800.webp`, and the builder adds width and height.
- The current covers are generated illustrations. You can replace any of them with a photo through the admin.

## Things to remember

- Everything that matters is in `content/`. Back it up.
- Pull before you edit, because the daily workflow also commits.
- Renew the domain every year.
- Never publish two articles on the same topic. Improve the old one instead.
- GitHub turns off scheduled workflows in repositories with no commits for 60 days. Publishing regularly prevents it; if it happens, turn it back on in the Actions tab.

---

## Jaldi shuru (Roman Urdu)

1. GitHub par nayi **public** repository banayein aur yeh poora folder us mein upload/push kar dein.
2. Settings → Pages: "Deploy from a branch", branch `main`, folder `/ (root)`. Custom domain mein `projectcostkit.com` likhein.
3. Domain wali site (registrar) par 4 `A` records (`185.199.108.153`, `.109.153`, `.110.153`, `.111.153`) aur `www` ke liye `CNAME` → `aapka-username.github.io`.
4. Settings → Actions → General → "Read and write permissions" on karein, phir Actions tab se "Scheduled publish" ek dafa khud chala kar dekhein.
5. Naya article: `admin/index.html` Chrome mein kholein → folder chunein → New article → Save → Rebuild site → GitHub par push.
6. Agle din ki date dein to article usi din khud live ho jayega.
