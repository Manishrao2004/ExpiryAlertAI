<div align="center">



# 🟢 ExpiryAlert AI

### AI-Powered Expiry Date Tracker with OCR & Push Notifications

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://reactjs.org)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas%20%7C%20Local-47A248?logo=mongodb&logoColor=white)](https://mongodb.com)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
[![TailwindCSS](https://img.shields.io/badge/Tailwind-3-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![PWA](https://img.shields.io/badge/PWA-Ready-5A0FC8?logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)


**Never let food, medicine, or household products expire again.**  
Snap a photo → OCR reads the date → AI confirms it → You get notified. Done.

</div>

---

## 📱 Screenshots

<div align="center">

| 🏠 Home — Inventory | ➕ Add Product (OCR / Manual) | 🔔 Alerts & Push Notifications |
|:---:|:---:|:---:|
| ![Home screen showing 4 tracked products with Safe status, search bar, and stats bar](docs/screenshots/Screenshot%202026-05-26%20172519.png) | ![Add Product panel with Scan Image and Manual Entry tabs, camera and upload options](docs/screenshots/Screenshot%202026-05-26%20172555.png) | ![Alerts tab showing push notification toggle and 4-stage alert schedule](docs/screenshots/Screenshot%202026-05-26%20172616.png) |
| Track all your products with days-left countdown and expiry status badges | Scan a label with the camera **or** upload a photo — AI reads the expiry date automatically | Configure push alerts at 2 days, 1 day, day-of, and after expiry |

</div>

> 📲 Screenshots taken on **Android Chrome** via an ngrok HTTPS tunnel. The app is a full **PWA** — installable directly from the browser with no app store required.

---

## ✨ Key Features

| Feature | Detail |
|---|---|
| 📸 **OCR Scanning** | Camera or gallery upload → Tesseract.js extracts text from labels |
| 🤖 **AI Date Detection** | Heuristic + OpenRouter LLM pipeline finds the expiry date with confidence score |
| 🔔 **Web Push Notifications** | VAPID-signed push alerts: 2 days, 1 day, day-of, and post-expiry |
| ⏰ **Scheduled Cron Jobs** | Daily 8 AM check + hourly sweep, all tracked per-item to prevent spam |
| 🗃️ **Product Inventory** | Add, edit, delete items with name, date, image, OCR text, and status |
| 📊 **Smart Status Bar** | Live count of Safe / Expiring Soon / Expired items |
| 🔍 **Search & Filter** | Real-time search + filter by status across the full inventory |
| 📲 **PWA Installable** | Add to Home Screen on Android/iOS; works offline for UI |
| 🌐 **ngrok-ready** | Vite config pre-wired for `.ngrok-free.dev` tunnels for mobile testing |

---

## 🏗️ Architecture

```
ExpiryAlertAI/
├── backend/                  # Node.js + Express REST API
│   ├── server.js             # App entry, CORS, cron, VAPID, push logic
│   ├── routes/
│   │   ├── items.js          # CRUD for tracked products
│   │   ├── upload.js         # Image upload → OCR → AI date extraction
│   │   └── notifications.js  # Web push subscribe/unsubscribe/test
│   ├── models/
│   │   ├── Item.js           # Mongoose schema with auto-status computation
│   │   └── Subscription.js   # Push subscription store
│   └── utils/
│       ├── ocrProcessor.js   # Tesseract.js multi-strategy OCR pipeline
│       ├── expiryDetector.js # Heuristic date pattern matching (30+ formats)
│       └── aiParser.js       # OpenRouter LLM fallback + result merging
│
└── frontend/                 # React 18 + Vite + TailwindCSS PWA
    ├── src/
    │   ├── App.jsx           # Root component, state, routing
    │   ├── components/
    │   │   ├── AddItemPanel.jsx   # Scan / manual entry modal
    │   │   ├── ItemCard.jsx       # Individual product card with edit
    │   │   ├── ItemList.jsx       # Filtered item list
    │   │   ├── StatsBar.jsx       # Safe/Soon/Expired counters
    │   │   ├── Header.jsx         # Top app bar
    │   │   ├── BottomNav.jsx      # Tab navigation
    │   │   ├── NotificationBanner.jsx  # Push opt-in prompt
    │   │   ├── InstallBanner.jsx  # PWA install prompt
    │   │   └── Dashboard.jsx      # Search + filter controls
    │   └── utils/
    │       ├── api.js            # Axios API client
    │       ├── useNotifications.js  # Push subscription hook
    │       └── dateUtils.js      # Expiry sorting helpers
    └── public/               # Icons, manifest.json, service worker
```

---

## 🛠️ Tech Stack

### Backend
| Technology | Role |
|---|---|
| **Node.js + Express** | REST API server |
| **MongoDB + Mongoose** | Product & subscription persistence |
| **Tesseract.js** | Client-side OCR for expiry label text extraction |
| **Sharp** | Image pre-processing before OCR |
| **OpenRouter API (LLM)** | AI fallback date parser & confidence scorer |
| **web-push + VAPID** | Web Push Notification delivery |
| **node-cron** | Scheduled daily 8 AM + hourly expiry checks |
| **Multer** | Multipart image uploads (up to 15 MB) |

### Frontend
| Technology | Role |
|---|---|
| **React 18** | Component-based UI |
| **Vite 5** | Dev server with HTTPS + proxy + ngrok support |
| **TailwindCSS 3** | Utility-first styling |
| **Lucide React** | Icon set |
| **react-hot-toast** | Toast notifications |
| **Axios** | HTTP client |
| **Service Worker + Web Push** | Background push notification subscription |
| **PWA Manifest** | Installable on Android & iOS |

---

## 🚀 Local Setup & Development

### Prerequisites

- **Node.js** v18+ — [Download](https://nodejs.org/)
- **MongoDB** — either local install or [MongoDB Atlas](https://www.mongodb.com/atlas) free tier
- **ngrok** (optional, for mobile testing) — [Download](https://ngrok.com/download)

---

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/ExpiryAlertAI.git
cd ExpiryAlertAI
```

---

### 2. Backend Setup

```bash
cd backend
npm install
```

Create a `.env` file in `backend/`:

```env
# ─── Server ──────────────────────────────────────────────────
PORT=5000

# ─── MongoDB ──────────────────────────────────────────────────
# Option A – Local MongoDB
MONGODB_URI=mongodb://127.0.0.1:27017/expiryalert

# Option B – MongoDB Atlas (replace with your connection string)
# MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/expiryalert

# ─── Frontend Origin (for reference / future CORS scoping) ────
FRONTEND_URL=http://localhost:5173

# ─── VAPID Email (used in Web Push headers) ───────────────────
VAPID_EMAIL=admin@expiryalert.app

# ─── AI / LLM (Optional – for OCR AI fallback) ───────────────
# Get a free key at https://openrouter.ai
OPENROUTER_API_KEY=your_openrouter_api_key_here

# ─── LLM Model (leave blank for default; e.g. mistralai/mistral-7b-instruct) ─
LLM_MODEL=
```

> ⚠️ **VAPID keys** are auto-generated on first boot and saved to `backend/vapid.json`. Do **not** delete this file between runs — push subscriptions will break if keys change.

Start the backend:

```bash
npm run dev        # Development (nodemon, auto-restarts)
# or
npm start          # Production
```

Backend will be available at: **`http://localhost:5000`**

---

### 3. Frontend Setup

```bash
cd ../frontend
npm install
npm run dev
```

Frontend will be available at: **`http://localhost:5173`**

> The Vite proxy is pre-configured: all `/api/*` and `/uploads/*` requests are forwarded to `http://localhost:5000` automatically — no CORS issues in dev.

---

## 📱 Testing on a Real Phone (via ngrok)

Push notifications and camera access require **HTTPS**. Use ngrok to get a public HTTPS tunnel to your local machine so you can test on your phone.

### Step 1 — Install ngrok

```bash
# Windows (winget)
winget install ngrok

# or download from https://ngrok.com/download
```

### Step 2 — Expose the Frontend

```bash
# In a new terminal (keep backend & frontend running)
ngrok http 5173
```

You will see output like:

```
Forwarding   https://abcd-1234-xxxx.ngrok-free.app -> http://localhost:5173
```

### Step 3 — Open on Your Phone

1. Copy the `https://xxxx.ngrok-free.app` URL
2. Open it in **Chrome** on your Android phone
3. Tap the browser menu → **"Add to Home Screen"** to install as a PWA

### Step 4 — Enable Push Notifications

1. Open the app on your phone
2. Tap **"Enable"** in the notification banner at the top
3. Grant notification permission
4. You'll receive a test notification to confirm it works

### Notes
- The `allowedHosts: ['.ngrok-free.dev']` is already set in `vite.config.js` — ngrok URLs work out of the box.
- The backend runs on port `5000` and is proxied through Vite — only one ngrok tunnel is needed.
- If ngrok free tier shows an interstitial page, click "Visit Site" or add `ngrok-skip-browser-warning: true` header via a browser extension.

---

## 🔌 API Reference

### Items

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/items` | List all items (sorted by expiry) |
| `POST` | `/api/items` | Add a new item |
| `PUT` | `/api/items/:id` | Update item name/date |
| `DELETE` | `/api/items/:id` | Delete an item |
| `GET` | `/api/items/stats` | Get Safe / Soon / Expired counts |

### Upload & OCR

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/upload` | Upload image → OCR → AI date detection |

**Response:**
```json
{
  "success": true,
  "imagePath": "uploads/upload_xxx.jpg",
  "ocrText": "BEST BY 23 OCT 2026",
  "exp": "2026-10-23",
  "mfd": null,
  "confidence": 94.5,
  "source": "ai",
  "detected": true
}
```

### Push Notifications

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/notifications/vapid-public-key` | Get VAPID public key for subscription |
| `POST` | `/api/notifications/subscribe` | Register a push subscription |
| `POST` | `/api/notifications/unsubscribe` | Remove a push subscription |
| `POST` | `/api/notifications/test` | Send a test push to a subscription |
| `GET` | `/api/notifications/count` | Count active subscriptions |

### Admin

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/admin/check-notify` | Manually trigger expiry notification check |
| `GET` | `/api/health` | Health check |

---

## 🧠 How the AI Pipeline Works

```
User uploads photo
       │
       ▼
  Sharp pre-processing
  (resize, grayscale, contrast)
       │
       ▼
  Tesseract.js OCR
  (multi-PSM strategy: 6, 11, 4)
       │
       ▼
  Heuristic Date Detector
  (30+ regex patterns: DD/MM/YY, MON-YYYY, etc.)
       │
       ├──── found with high confidence? ──► use heuristic result
       │
       ▼
  OpenRouter LLM (AI fallback)
  (sends raw OCR text, returns structured date + reasoning)
       │
       ▼
  mergeResults()
  (picks highest-confidence result, returns exp + mfd + source)
       │
       ▼
  Return to frontend
  (pre-fills the Add Item form)
```

---

## 📲 PWA Features

- ✅ **Installable** — Add to Home Screen on Android & iOS
- ✅ **App-like UI** — Fullscreen, no browser chrome, bottom nav
- ✅ **Push Notifications** — Background alerts even when app is closed
- ✅ **Offline UI** — Service worker caches static assets
- ✅ **Responsive** — Optimized for 375px–430px mobile viewports

---

## 🔒 Environment Variables Summary

### `backend/.env`

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `5000` | Express server port |
| `MONGODB_URI` | **Yes** | `mongodb://127.0.0.1:27017/expiryalert` | MongoDB connection string |
| `FRONTEND_URL` | No | `http://localhost:5173` | Frontend origin (for reference) |
| `VAPID_EMAIL` | No | `admin@expiryalert.app` | Email in VAPID push headers |
| `OPENROUTER_API_KEY` | No | — | API key for LLM date parsing (optional but recommended) |
| `LLM_MODEL` | No | `mistralai/mistral-7b-instruct` | OpenRouter model to use |

> No frontend `.env` is required. The Vite proxy handles API routing transparently.

---

## 🗂️ Database Schema

### `items` collection

```js
{
  name:             String,   // Product name (required)
  expiryDate:       Date,     // Expiry date (required)
  status:           String,   // Auto-computed: 'Safe' | 'Expiring Soon' | 'Expired'
  imagePath:        String,   // Relative path to uploaded image
  ocrText:          String,   // Raw OCR output from label scan
  detectedByOCR:    Boolean,  // Was date found via OCR/AI?
  notifiedExpired:  Boolean,  // Push sent for expired?
  notifiedToday:    Boolean,  // Push sent for today?
  notifiedTomorrow: Boolean,  // Push sent for tomorrow?
  notified2Days:    Boolean,  // Push sent for 2 days?
  createdAt:        Date,     // Mongoose timestamp
  updatedAt:        Date
}
```

### `subscriptions` collection

```js
{
  endpoint: String,           // Push service endpoint URL
  keys: {
    p256dh: String,           // ECDH public key
    auth:   String            // Auth secret
  },
  userAgent: String           // Browser/device info
}
```

---

## 🤝 Contributing

Pull requests are welcome! For major changes, please open an issue first.

```bash
# Fork → clone → branch
git checkout -b feature/your-feature-name

# Make changes, then
git commit -m "feat: describe your change"
git push origin feature/your-feature-name
# Open a PR
```

---

<div align="center">

**⭐ If this project helped you, give it a star!**

</div>
