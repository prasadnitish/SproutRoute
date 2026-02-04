# StrollerScout 🧳

## Overview

**Problem Statement:**
Parents planning trips with young children face decision fatigue when packing - uncertain weather, activity-specific needs, and the constant worry of forgetting essential items.

**Solution:**
StrollerScout is an AI-powered trip planning tool that generates smart, weather-appropriate packing lists for parents. It combines real-time weather forecasts with AI-generated recommendations to create personalized checklists.

**Target Audience:**
Parents with young children (0-5 years) planning domestic trips within the United States.

## Key Features

- **Smart Trip Input** - Easy form to capture destination, dates, activities, and children's ages
- **Real-Time Weather** - 7-day forecast from Weather.gov API for accurate planning
- **AI-Powered Packing Lists** - Claude AI generates categorized, context-aware packing recommendations
- **Interactive Checklist** - Check off items as you pack, with progress tracking
- **Local Storage** - Your packing list persists across browser sessions
- **Print-Friendly** - Print your list for offline reference
- **Mobile-Responsive** - Works seamlessly on phones, tablets, and desktops

## Tech Stack

- **Frontend:** React 18 + Vite, Tailwind CSS
- **Backend:** Node.js + Express
- **AI:** Claude API (Anthropic)
- **Weather:** Weather.gov API (National Weather Service)
- **Storage:** Browser Local Storage
- **Hosting:** Vercel/Netlify (planned)

## Architecture

```
[React Frontend] → [Express API] → [Weather.gov API]
                      ↓
                  [Claude API]
                      ↓
              [Packing List Generator]
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed system design.

## Setup & Installation

### Prerequisites

- **Node.js 18+** - [Download here](https://nodejs.org/)
- **Claude API Key** - [Get one from Anthropic](https://console.anthropic.com/)

### Installation Steps

1. **Clone the repository**

```bash
git clone https://github.com/prasadnitish/tpm-portfolio.git
cd tpm-portfolio/strollerscout
```

2. **Install dependencies**

```bash
npm install
cd src/frontend && npm install
cd ../backend && npm install
cd ../..
```

3. **Set up environment variables**

```bash
cp src/backend/.env.example src/backend/.env
```

Edit `src/backend/.env` and add your Claude API key:

```env
ANTHROPIC_API_KEY=sk-ant-your-actual-key-here
PORT=3000
NODE_ENV=development
```

4. **Run the application**

```bash
./start.sh
```

Or run manually:

```bash
npm run dev
```

The app will start:

- **Frontend:** http://localhost:5173
- **Backend:** http://localhost:3000

## Usage

### Step 1: Enter Trip Details

- Enter your destination (e.g., "Seattle, WA")
- Select start and end dates (max 14 days)
- Choose planned activities (beach, hiking, city, indoor)
- Add number of children and their ages

### Step 2: Generate Packing List

Click "Generate Packing List" and wait 5-10 seconds while:

- Location is geocoded to coordinates
- Weather forecast is fetched from Weather.gov
- AI generates personalized packing recommendations

### Step 3: Use Your Checklist

- View weather forecast for your trip
- Check off items as you pack them
- Watch your progress bar fill up
- Collapse/expand categories as needed
- Print the list for offline use

## Demo

![StrollerScout Interface](docs/screenshot.png)

_Screenshot will be added after deployment_

## Project Learnings

### Technical Skills Demonstrated

- **API Integration** - Successfully integrated multiple external APIs (Weather.gov, Claude)
- **Full-Stack Development** - Built both React frontend and Express backend
- **AI/LLM Integration** - Implemented Claude API for structured JSON output
- **State Management** - Managed complex application state with React hooks
- **Data Persistence** - Implemented browser local storage for user data
- **Responsive Design** - Mobile-first UI with Tailwind CSS

### Product/TPM Skills Demonstrated

- **User Story Definition** - Created detailed PRD with acceptance criteria
- **System Design** - Documented architecture with clear trade-off analysis
- **Scope Management** - Made deliberate MVP vs V2 decisions (web vs mobile)
- **Technical Documentation** - Comprehensive README, PRD, and architecture docs
- **Risk Mitigation** - Identified and planned for API failures and edge cases

### Challenges & Solutions

**Challenge 1:** Weather.gov API requires lat/lon coordinates, not city names
**Solution:** Integrated OpenStreetMap's Nominatim geocoding API to convert "Seattle, WA" to coordinates

**Challenge 2:** Claude API responses can be slow (3-5 seconds)
**Solution:** Added loading states, progress indicators, and clear user feedback

**Challenge 3:** Weather.gov only supports US locations
**Solution:** Clear error messaging and documented limitation in PRD as accepted technical debt for MVP

**Challenge 4:** Local storage has size limits
**Solution:** Limited to storing one trip at a time, with clear "Start Over" functionality

## Future Enhancements

- [ ] Mobile app (React Native)
- [ ] User authentication and cloud sync
- [ ] International weather support (OpenWeatherMap API)
- [ ] Amazon product recommendations
- [ ] Trip templates and history
- [ ] Share packing lists with family
- [ ] Offline mode with cached data
- [ ] Push notifications for packing reminders

## Metrics

- **API Response Time:** ~5-6 seconds for complete packing list generation
- **Weather Cache:** 1-hour TTL to reduce API calls
- **Bundle Size:** <200KB (frontend)
- **Browser Support:** Chrome, Safari, Firefox (latest versions)

## Security

- ✅ API keys stored in environment variables
- ✅ No secrets in git history
- ✅ Input validation on frontend and backend
- ✅ CORS configured for production
- ✅ No XSS vulnerabilities (React auto-escaping)

See [SECURITY_GUIDELINES.md](../SECURITY_GUIDELINES.md) for full security review.

## License

MIT License

## Contact

**Nitish Prasad** - [GitHub](https://github.com/prasadnitish)

Questions or feedback? Open an issue in the [portfolio repository](https://github.com/prasadnitish/tpm-portfolio/issues).

---

**Built with:**

- 🤖 Claude Sonnet 4.5 AI assistance
- ⚛️ React + Vite
- 🎨 Tailwind CSS
- 🌦️ Weather.gov API
- 🧠 Claude API (Anthropic)

_Last updated: January 2026_
