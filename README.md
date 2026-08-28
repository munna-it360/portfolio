# Portfolio — Md Munna

Personal portfolio site. Static, no build step, no dependencies. Every piece of content
lives in one file — `data/content.json` — and is edited through the admin panel at `/admin/`.

## Structure

```
├── index.html              page shell (rendered from content.json)
├── 404.html
├── data/content.json       all site content — the only file you edit
├── admin/index.html        content manager
├── assets/
│   ├── css/style.css       site styles
│   ├── css/admin.css       admin styles
│   └── js/
│       ├── icons.js        icon registry (brand marks + UI icons)
│       ├── app.js          renders the site from content.json
│       └── admin.js        the content manager
├── certs/                  certificate images
├── img/                    favicon, OG card, photos
├── robots.txt              blocks /admin/ from search engines
└── sitemap.xml
```

## Running it locally

`fetch()` is blocked on `file://` URLs, so open the folder through a web server —
double-clicking `index.html` will show a loading spinner forever.

```bash
python3 -m http.server 8080
# site  → http://localhost:8080
# admin → http://localhost:8080/admin/
```

## Deploying to GitHub Pages

1. Push this folder to the repository root on the `main` branch.
2. Settings → Pages → Source: **Deploy from a branch** → `main` / `/ (root)`.
3. `.nojekyll` is already included so Jekyll doesn't strip anything.

Update the URLs in `sitemap.xml`, `robots.txt` and `data/content.json → site.url`
if your repository name is not `portfolio`.

## The admin panel

Open `/admin/`. On first use you set a passcode, which is stored in this browser
as a SHA-256 hash.

You can edit:

| Tab | Controls |
|---|---|
| Profile | Name, photo, contact details, CV link, rotating job titles, availability badge, SEO |
| Hero | Headline, intro, buttons, the four status-panel figures |
| Social links | Add, remove, reorder, hide. Icons follow the platform you pick |
| Works | Projects and the filter categories, with tech chips and repo links |
| Services | Service cards and their icons |
| Resume | Experience, certifications, education |
| Skills | Ring gauges, skill bars grouped into columns, knowledge list |
| Contact | Form heading, note, optional Formspree delivery |
| Publish | Commit to GitHub |

Every list supports add, delete, reorder (↑ ↓) and a **Show on the site**
checkbox so you can hide an entry without losing it.

Changes are held as a draft in your browser until you publish, so closing the tab
won't lose work. **Preview site** opens the portfolio with your unsaved draft applied.

### Publishing

Two ways to get changes live:

**Direct to GitHub (recommended).** On the Publish tab, enter a fine-grained personal
access token and press *Publish*. It commits `data/content.json` and Pages rebuilds
in about a minute.

Create the token at GitHub → Settings → Developer settings → Fine-grained tokens:

- Repository access: **only** this repository
- Permissions: **Contents → Read and write** (nothing else)
- Set a short expiry

**Download instead.** Press *Download JSON* and commit the file yourself.

### About security

`/admin/` is served publicly by GitHub Pages — anyone can open it. The passcode only
stops casual poking; it is not access control, because everything runs in the browser.
What actually protects the site is the GitHub token, which is stored only in your
browser's local storage and never sent anywhere except api.github.com.

So: use a fine-grained token scoped to this one repository, give it a short expiry,
and revoke it if you use a shared computer. If you want real authentication on the
admin panel, it has to move to a server — that means hosting somewhere other than
GitHub Pages.

## Contact form

By default the form opens the visitor's email app with the message pre-filled.
To receive messages in your inbox instead, create a form at
[formspree.io](https://formspree.io), then paste the form ID into
Admin → Contact → *Formspree form ID*.

## Adding images

- **Certificates** — drop the file in `certs/`, then set the path in
  Admin → Resume → the certification → *Certificate image*, e.g. `certs/ccna.jpg`.
- **Profile photo** — any URL, or a file in `img/` referenced as `img/me.jpg`.
- **CV** — put the PDF in the repository root and set the filename in Admin → Profile.

## Notes

- Colours are unchanged from the previous version and are defined once as CSS custom
  properties at the top of `assets/css/style.css`.
- In headline and heading fields, text wrapped in `{curly braces}` renders in the
  accent colour.
- `{year}` in the footer is replaced with the current year.
- The site respects `prefers-reduced-motion` and is keyboard navigable throughout.
