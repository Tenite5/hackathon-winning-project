# QVIZIO — The Ultimate 1v1 AI-Powered Trivia Duel

**QVIZIO** is a high-stakes, real-time 1v1 trivia platform where intellect meets speed. Players challenge each other in dynamic trivia battles, climb a competitive ranking system, and leverage AI to master various subjects.

---

## 🛠️ Technology Stack

### **Frontend**
- **Core:** Vanilla JavaScript (ES6+)
- **Styling:** HTML5 & CSS3
- **Real-time:** Socket.io Client
- **Authentication:** Firebase Auth (Google + Email/Password)

### **Backend**
- **Runtime:** Node.js (v18+)
- **Framework:** Express.js
- **Real-time:** Socket.io (multiplayer synchronization)
- **Security:** Helmet.js, rate limiting, input validation

### **AI & Data**
- **AI Engine:** Groq API (Llama 3.3 70B)
- **Database:** MongoDB (via Mongoose ODM)
- **Auth Provider:** Firebase Authentication

### **Deployment**
- **Hosting:** [Railway](https://railway.app/)

---

## 🌟 Features

- **⚡ Real-time Duels:** Experience zero-latency multiplayer trivia powered by Socket.io.
- **🤖 AI Question Engine:** Every game is unique. Our AI generates context-aware questions on any topic.
- **🏆 Competitive Ranks:** Progress from **Bronze** to **Grandmaster**. Your ELO speaks for your knowledge.
- **🎮 Multiple Game Modes:** Quick 1v1, Custom Lobbies, Preset Quizzes, Solo Practice, and Tournaments.
- **💬 Social Hub:** Integrated chat system and friend management for easy matchmaking.
- **🔥 Personalized AI Bios:** Dynamically generated bios that roast or boast about your trivia performance.
- **📚 Smart Review Log:** Review your mistakes with AI-generated explanations to ensure you never miss the same question twice.

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** (v18+)
- **npm** or **yarn**
- **MongoDB** (local or Atlas)
- **Firebase** project (for authentication)
- **Groq API** key (for AI question generation)

### Installation
1. **Clone the repository:**
   ```bash
   git clone [repository-url]
   ```
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Configure Environment:**
   Create a `.env` file in the root directory:
   ```env
   PORT=3000
   CORS_ORIGIN=http://localhost:3000
   MONGODB_URI=your_mongodb_connection_string
   GROQ_API_KEY=your_groq_api_key
   FIREBASE_PROJECT_ID=your_project_id
   FIREBASE_API_KEY=your_api_key
   FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   FIREBASE_STORAGE_BUCKET=your_project.appspot.com
   FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   FIREBASE_APP_ID=your_app_id
   ```
4. **Launch Application:**
   ```bash
   npm run dev
   ```

---

## 🌍 Deployment
The project is optimized for deployment on **Railway**. See [DEPLOY.md](./DEPLOY.md) for a step-by-step guide.

---

## 📜 License
This project is licensed under the **ISC License**.
