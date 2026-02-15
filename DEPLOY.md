# How to Deploy QVIZIO

Since this app uses a **Node.js server** with **Socket.io** (for real-time multiplayer), you cannot deploy it on static hosting like Netlify or Vercel alone. You need a host that supports backend servers.

Here are the best free/low-cost options:

## Option 1: Railway (Recommended & Easiest)

Railway is extremely easy to use and automatically detects your configuration. It offers a trial period.

1.  **Push your code to GitHub**
    - Create a new repository on GitHub.
    - Push your project code there.

2.  **Deploy**
    - Go to [railway.app](https://railway.app/) and sign up/login.
    - Click **"New Project"** -> **"Deploy from GitHub repo"**.
    - Select your `qvizio` repository.
    - Click **"Deploy Now"**.

3.  **Done!**
    - Railway will build your app and give you a public URL (e.g., `qvizio-production.up.railway.app`).
    - Share this link with your friends to play!

**(Optional) Environment Variables**:
- If you want to use a different Groq API key, go to your project settings in Railway -> "Variables" and add `GROQ_API_KEY`.

---

## Option 2: Render (Free Tier Available)

Render offers a free tier for web services that puts your app to sleep after inactivity, but it's completely free.

1.  **Push your code to GitHub** (same as above).

2.  **Deploy**
    - Go to [render.com](https://render.com/) and sign up.
    - Click **"New +"** -> **"Web Service"**.
    - Connect your GitHub account and select your repo.
    - Give it a name (e.g., `qvizio-game`).
    - **Runtime**: Select `Node`.
    - **Build Command**: `npm install`
    - **Start Command**: `node server.js`
    - **Instance Type**: Select "Free".
    - Click **"Create Web Service"**.

3.  **Wait for Build**
    - It might take a few minutes. Once done, you'll see a green "Live" badge.
    - Use the URL provided (e.g., `qvizio.onrender.com`).

---

## Important Note on "Netlify"
Netlify is primarily for **static sites** (HTML/CSS/JS only). Since your game has a backend server (`server.js`) handling the game logic and sockets, Netlify **cannot host the server part**.

You *could* host the `public` folder on Netlify and point it to a Railway backend, but it's much easier to host the **entire app** on Railway or Render as a single unit. The steps above do exactly that.
