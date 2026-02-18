# QVIZIO — The Ultimate 1v1 AI-Powered Trivia Duel

**QVIZIO** is a high-stakes, real-time 1v1 trivia platform where intellect meets speed. Players challenge each other in dynamic trivia battles, climb a competitive ranking system, and leverage AI to master various subjects.

---

## 🛠️ Technology Stack

Our project utilizes a cutting-edge tech stack designed for high performance and scalability:

### **Frontend**
- **Core:** React.js
- **Styling:** HTML5 & CSS3
- **Hosting:** [Railway](https://railway.app/)

### **Backend**
- **Environment:** Node.js
- **Frameworks:** Express / Python (Django/Flask)
- **Real-time:** Socket.io (მულტიპლეიერისთვის / for multiplayer synchronization)

### **AI & Data**
- **Intelligence:** OpenAI API (GPT-4o / GPT-3.5)
- **Orchestration:** LangChain
- **Storage:** MongoDB / PostgreSQL / Firebase

---

## 🌟 Features

- **⚡ Real-time Duels:** Experience zero-latency multiplayer trivia powered by Socket.io.
- **🤖 AI Question Engine:** Every game is unique. Our AI generates context-aware questions on any topic.
- **🏆 Competitive Ranks:** Progress from **Bronze** to **Grandmaster**. Your ELO speaks for your knowledge.
- **💬 Social Hub:** Integrated chat system and friend management for easy matchmaking.
- **🔥 Personalized AI Bios:** Dynamically generated bios that roast or boast about your trivia performance.
- **📚 Smart Review Log:** Review your mistakes with AI-generated explanations to ensure you never miss the same question twice.

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** (v18+)
- **npm** or **yarn**

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
   GROQ_API_KEY=your_api_key_here
   PORT=3000
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
