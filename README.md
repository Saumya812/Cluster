# Cluster

A 3D educational world where learning feels like exploring a city.

**Live demo:** https://cluster-pljj.onrender.com

## What is Cluster?

Cluster turns computer science education into an immersive 3D experience. 
Instead of watching lectures or reading docs, you fly through a living city 
where every building is a topic, every street is a subject, and every level 
you complete makes your Growth Tower taller.

## How it works

1. Start at the globe and pick Computer Science
2. Choose a city: Machine Learning, AI, Programming, or Web Development
3. Enter the floating island roadmap -- 10 islands connected by rope bridges
4. Islands unlock progressively, just like a game
5. Fly into a level on your airplane and explore a dense 3D city
6. Click a building to open a learning panel with 5 tabs:
   - Reading -- real search results from Google and Wikipedia
   - Videos -- YouTube playlists for that topic
   - Research Papers -- live OpenAlex and Arxiv results
   - Visualization -- YouTube videos showing concepts visually
   - Quiz -- 600 hand-written questions, one set per topic
7. Complete the quiz to grow your Growth Tower and unlock the next island
8. After every quiz, see real career outcomes from the UMBC DoIT dataset
9. Progress saved persistently via TigerData and Backboard memory

## Tech Stack

| Layer | Technology |
|---|---|
| 3D Engine | Three.js 0.185 |
| Frontend | Vanilla JS, Vite, Web Audio API, Canvas 2D |
| Backend | FastAPI, Python 3.12, Uvicorn |
| Primary Database | TigerData (Timescale Cloud Postgres) |
| Fallback Database | SQLite |
| AI Memory | Backboard |
| Quiz Generation | Google Gemini API |
| Voice Narration | ElevenLabs |
| Videos | YouTube Data API v3 |
| Reading | Google Custom Search + Wikipedia |
| Research Papers | OpenAlex + Arxiv |
| Career Data | DoIT Synthetic UMBC Dataset |
| 3D Assets | Sketchfab (CC BY/BY-NC), Kenney (CC0) |
| Domain | GoDaddy (pathwayisle.com) |
| Deployment | Docker + Render |

## Hackathon Tracks

### HackUMBC 2026
- Main Track (Education / AI)
- Game Jamathon (Game Dev Club)
- Best Entrepreneurial Idea (Entrepreneurs Club)
- Most Engaging Demo
- Navigating the Future: Career Pathways and Degree ROI (DoIT)

### MLH Prize Categories
- Best Use of Gemini API
- Best Use of ElevenLabs
- Best Use of Tiger Data
- Best Use of Backboard
- Best Domain Name from GoDaddy Registry (pathwayisle.com)

## AI Usage Disclosure

As required by Game Jamathon rules:
- Google Gemini API: generates quiz questions per topic
- ElevenLabs: generates voice narration at key moments
- Backboard: persistent AI memory for cross-session progress
- Cursor: AI coding assistant used throughout development
- No AI was used for asset creation. All 3D models are from Kenney.nl 
  (CC0) and Sketchfab (CC BY / CC BY-NC 4.0)

## How to run locally

### Backend
```bash
cd Cluster
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn live_server:app --reload --port 8002
```

### Frontend
```bash
cd frontend
npm install
npm run dev -- --port 5180
```

### Environment variables
Create a `.env` file in the root folder:



## Credits

Fantasy Mystical Island by NJ; Floating Island Temple by Selin Berg; 
Stylized 3D Floating Island and Mine House by Skylar Muffin -- Sketchfab, 
CC BY / CC BY-NC 4.0. Nature Kit and City Kit by Kenney (CC0).
DoIT dataset by jasonpaluck, CC0.

## Built at HackUMBC 2026
