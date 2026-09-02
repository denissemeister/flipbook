# Flipbook — Setup Guide

## 1. Install prerequisites

### Node.js 20
Download the installer for your OS from **https://nodejs.org** → choose **"LTS"**.  
After installing, verify in a terminal:
```
node -v   # should print v20.x.x
npm -v    # should print 10.x.x
```

### Docker Desktop
Download from **https://www.docker.com/products/docker-desktop** and install.  
After installing, start Docker Desktop and verify:
```
docker -v
docker compose version
```

---

## 2. Get the project

If you received this as a folder, just open a terminal inside the `flipbook/` directory.

---

## 3. Configure environment

A `.env` file is already included with development defaults. Open it and confirm the values look right — you don't need to change anything to get started.

---

## 4. Start the database

```bash
# From inside the flipbook/ folder:
docker compose up -d postgres
```

Wait a few seconds for Postgres to be ready, then run the database migrations:

```bash
cd backend
npm install
DATABASE_URL=postgres://flipbook:flipbook_dev@localhost:5432/flipbook node src/db/migrate.js
cd ..
```

You should see:
```
  → Applying 001_initial.sql…
  ✓ 001_initial.sql applied
All migrations complete.
```

---

## 5. Start the API server

```bash
cd backend
npm run dev
```

You should see:
```
🚀  Flipbook API running on http://localhost:3000
```

Test it's working:
```bash
curl http://localhost:3000/health
# → {"ok":true}
```

---

## 6. Create your first admin account

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"yourpassword"}'
```

Save the `accessToken` from the response — you'll use it as:
```
Authorization: Bearer <accessToken>
```

---

## 7. Try the API

```bash
# Create a book
curl -X POST http://localhost:3000/api/v1/books \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your_token>" \
  -d '{"title":"My First Book","orientation":"horizontal"}'

# List books
curl http://localhost:3000/api/v1/books \
  -H "Authorization: Bearer <your_token>"
```

---

## Running everything with Docker (optional, for production-like setup)

```bash
docker compose up --build
```

This starts both Postgres and the API together. Migrations run automatically on start.

---

## Project structure

```
flipbook/
├── docker-compose.yml        # Postgres + API containers
├── .env                      # Environment variables
├── SETUP.md                  # This file
└── backend/
    ├── Dockerfile
    ├── package.json
    └── src/
        ├── index.js           # Express app entry point
        ├── db/
        │   ├── index.js       # PostgreSQL connection pool
        │   ├── migrate.js     # Migration runner
        │   └── migrations/
        │       └── 001_initial.sql
        ├── middleware/
        │   ├── auth.js        # JWT verification
        │   └── upload.js      # Multer file upload config
        └── routes/
            ├── auth.js        # POST /auth/login, /refresh, /logout, /register
            ├── books.js       # CRUD + publish/archive/duplicate
            ├── pages.js       # CRUD + reorder
            ├── elements.js    # CRUD + batch upsert
            ├── media.js       # File upload, list, delete
            └── public.js      # Public viewer endpoint (no auth)
```

## API quick reference

All routes prefixed `/api/v1`. Protected routes require `Authorization: Bearer <token>`.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register` | Create admin account |
| POST | `/auth/login` | Get access token |
| POST | `/auth/refresh` | Rotate token via cookie |
| POST | `/auth/logout` | Clear refresh cookie |
| GET | `/books` | List all books |
| POST | `/books` | Create book |
| GET | `/books/:id` | Get book + page list |
| PATCH | `/books/:id` | Update book |
| DELETE | `/books/:id` | Delete draft book |
| POST | `/books/:id/publish` | Publish book |
| POST | `/books/:id/archive` | Archive book |
| POST | `/books/:id/duplicate` | Deep-copy book |
| GET | `/books/:id/pages` | List pages |
| POST | `/books/:id/pages` | Add page |
| DELETE | `/books/:bookId/pages/:pageId` | Delete page |
| PATCH | `/books/:bookId/pages/:pageId/reorder` | Move page |
| GET | `/pages/:pageId/elements` | List elements |
| POST | `/pages/:pageId/elements` | Add element |
| PATCH | `/elements/:id` | Update element |
| DELETE | `/elements/:id` | Delete element |
| POST | `/pages/:pageId/elements/batch` | Batch upsert elements |
| POST | `/media/upload` | Upload file |
| GET | `/media` | List assets |
| DELETE | `/media/:id` | Delete asset |
| GET | `/public/books/:slug` | Public viewer data (no auth) |
