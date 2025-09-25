Here you go — a clean, copy-paste **README.md** you can drop straight into your repo.

---

# InForm – GAS project

Google Apps Script (GAS) web app for the InForm staff portal. This repo keeps all source files versioned on GitHub and syncs with Apps Script using **clasp**.

> Key pages we maintain carefully for navigation + context:
> **Code.gs**, **Home.html**, **Incidents.html**, **Login.html** (plus **Helpers.gs**, **Styles.html**).
> We always preserve `ctx.scriptUrl` and the `school` query key in links.

---

## Raw file index (always current)

Use these **GitHub Raw** links when sharing with LLMs or reviewing the latest source:

### .gs files

* **Code.gs**
  [https://raw.githubusercontent.com/melk810/InForm/main/Code.gs](https://raw.githubusercontent.com/melk810/InForm/main/Code.gs)
* **Helpers.gs**
  [https://raw.githubusercontent.com/melk810/InForm/main/Helpers.gs](https://raw.githubusercontent.com/melk810/InForm/main/Helpers.gs)
* **Tests.gs**
  [https://raw.githubusercontent.com/melk810/InForm/main/Tests.gs](https://raw.githubusercontent.com/melk810/InForm/main/Tests.gs)

### HTML templates

* **Home.html**
  [https://raw.githubusercontent.com/melk810/InForm/main/Home.html](https://raw.githubusercontent.com/melk810/InForm/main/Home.html)
* **Incidents.html**
  [https://raw.githubusercontent.com/melk810/InForm/main/Incidents.html](https://raw.githubusercontent.com/melk810/InForm/main/Incidents.html)
* **Login.html**
  [https://raw.githubusercontent.com/melk810/InForm/main/Login.html](https://raw.githubusercontent.com/melk810/InForm/main/Login.html)
* **Logout.html**
  [https://raw.githubusercontent.com/melk810/InForm/main/Logout.html](https://raw.githubusercontent.com/melk810/InForm/main/Logout.html)
* **Parents.html**
  [https://raw.githubusercontent.com/melk810/InForm/main/Parents.html](https://raw.githubusercontent.com/melk810/InForm/main/Parents.html)
* **Styles.html**
  [https://raw.githubusercontent.com/melk810/InForm/main/Styles.html](https://raw.githubusercontent.com/melk810/InForm/main/Styles.html)
* **Footer.html**
  [https://raw.githubusercontent.com/melk810/InForm/main/Footer.html](https://raw.githubusercontent.com/melk810/InForm/main/Footer.html)

---

## Project structure

```
InForm/
├─ Code.gs
├─ Helpers.gs
├─ Tests.gs
├─ Home.html
├─ Incidents.html
├─ Login.html
├─ Logout.html
├─ Parents.html
├─ Styles.html          # CSS-only include (no <base> or <link> tags)
├─ Footer.html
└─ README.md
```

---

## Conventions we follow

* **Context object**: server injects `ctx` with `scriptUrl`, `selectedSchoolKey`, `schoolLogo`, `schoolColor`, etc.
* **Links keep school context**:

  * Clear on Incidents:
    `href="<?= ctx.scriptUrl ?>?page=incidents&school=<?= encodeURIComponent(ctx.selectedSchoolKey||'') ?>"`
  * Back to Home:
    `href="<?= ctx.scriptUrl ?>?page=home&school=<?= encodeURIComponent(ctx.selectedSchoolKey||'') ?>"`
* **Head tags (per page)**: put document-level tags in each page’s `<head>`, not in Styles.html:

  ```html
  <base target="_top">
  <link rel="icon"
        href="<?= (ctx && ctx.schoolLogo) ? ctx.schoolLogo
             : 'https://drive.google.com/thumbnail?authuser=0&sz=w64&id=1djm8Sj95JkgxTh6fgGjjqnBD9q-bNdnc' ?>"
        type="image/png">
  <?!= include('Styles'); ?> <!-- Styles.html is CSS-only -->
  ```
* **Styles.html** is **CSS-only** (inside a single `<style>…</style>` block).

---

## Quick start (local + clasp + GitHub)

### 1) Install Node.js (one-time)

* Download **Node.js LTS** → install → open Terminal/PowerShell:

  ```
  node -v
  npm -v
  ```

### 2) Install clasp (one-time)

```bash
npm i -g @google/clasp
clasp --version
clasp login
```

### 3) Clone this GitHub repo (first time)

```bash
git clone https://github.com/melk810/InForm.git
cd InForm
```

> If you want to connect this folder to an existing Apps Script project:
>
> * Find your **Script ID** in Apps Script (Project Settings).
> * Add a `.clasp.json` pointing to that ID and (optionally) a `rootDir` if you use one.
>   Minimal:
>
>   ```json
>   { "scriptId": "YOUR_SCRIPT_ID" }
>   ```

### 4) Daily workflow

**A) Pull latest from Apps Script (if edited online):**

```bash
clasp pull
```

**B) Edit files locally** (Code.gs, Home.html, Incidents.html, Login.html, Styles.html, etc.)

**C) Commit to GitHub:**

```bash
git add .
git commit -m "fix: keep school key on Clear/Home; move base+favicon to head"
git push
```

**D) Push changes back to Apps Script:**

```bash
clasp push
```

**E) Deploy (make live):**

```bash
clasp version -m "prod release"
clasp deploy -d "prod release"
```

---

## Deployment notes

* Use **Execute as: User accessing** (unless you have a special reason).
* Access level: choose what your school needs (often “Anyone with link” inside domain settings or restricted).
* Updating an existing deployment:

  ```bash
  clasp deployments
  clasp version -m "update"
  clasp deploy -i <DEPLOYMENT_ID>
  ```

---

## Troubleshooting

* **Links open inside iframes** → ensure `<base target="_top">` is in the page’s `<head>`.
* **School key lost on navigation** → make sure links include `&school=<?= encodeURIComponent(ctx.selectedSchoolKey||'') ?>`.
* **Raw file looks “empty”** → confirm you’re viewing the **main** branch, changes are pushed, and use the **GitHub Raw** links above (not a deleted gist). Add `?v=2` to bypass caching if needed.
* **clasp not found** → reopen terminal after install, or reinstall Node.js LTS.
* **Wrong Google account** → `clasp logout && clasp login`.

---

## License

Private / internal school project unless stated otherwise.

---

