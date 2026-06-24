# SkyCast Project Documentation

## Project Overview
**Name:** SkyCast Weather App
**Type:** Full-stack Weather Application
**Tech Stack:** Node.js, Express, HTML/CSS/JS, Open-Meteo API
**Features:** 15+ features including weather search, maps, alerts, Telegram bot

---

## Development Steps

### Phase 1: Basic Setup
1. **Initialize project**
   ```bash
   mkdir skycast
   cd skycast
   npm init -y
   ```

2. **Install dependencies**
   ```bash
   npm install express cors axios bcryptjs express-session
   npm install node-telegram-bot-api
   ```

3. **Create basic server**
   - Create `server.js`
   - Setup Express with basic routes
   - Add static file serving

4. **Create HTML structure**
   - Create `public/index.html`
   - Add search box, weather display area
   - Link CSS and JS files

### Phase 2: Core Weather Features
5. **Integrate Open-Meteo API**
   - Add `/api/weather/:city` endpoint
   - Fetch current weather data
   - Parse and return JSON response

6. **Display weather data**
   - Show temperature, condition, wind
   - Add weather icons
   - Format data nicely

7. **Add 5-day forecast**
   - Fetch daily forecast data
   - Display max/min temperatures
   - Show weather conditions for each day

8. **Add temperature toggle**
   - Celsius/Fahrenheit switch
   - Store preference in localStorage
   - Update all displays

### Phase 3: UI/UX Improvements
9. **Add dark/light theme**
   - CSS variables for colors
   - Theme toggle button
   - Save preference

10. **Improve search bar**
    - Glassmorphism design
    - Better styling
    - Responsive layout

11. **Add weather backgrounds**
    - Change background based on weather
    - Different colors for clear, rain, snow, etc.

12. **Add clothing recommendations**
    - Suggest clothes based on temperature
    - Show appropriate icons

### Phase 4: Advanced Features
13. **Add weather alerts**
    - Detect severe conditions
    - Show warning messages
    - Color-coded alerts

14. **Add air quality index**
    - Integrate Air Quality API
    - Show AQI, PM10, PM2.5, ozone
    - Color-coded levels

15. **Add interactive maps**
    - Integrate Leaflet.js
    - Show city location
    - Dark/light theme tiles
    - Weather popups

16. **Add search suggestions**
    - Auto-complete city names
    - Keyboard navigation
    - Click to select

### Phase 5: User Features
17. **Add user authentication**
    - Register/Login pages
    - Session management
    - Password hashing

18. **Add favorites system**
    - Save favorite cities
    - Display in sidebar
    - Quick access

19. **Add search history**
    - Track recent searches
    - Store in localStorage
    - Show in sidebar

20. **Add location detection**
    - GPS-based weather
    - Geocoding APIs
    - Fallback handling

### Phase 6: Telegram Bot
21. **Create Telegram bot**
    - Message @BotFather
    - Get bot token
    - Setup bot username

22. **Integrate bot with server**
    - Add bot commands (/start, /help)
    - Handle city name messages
    - Handle location sharing
    - Send weather data

### Phase 7: Polish & Deploy
23. **Add "More Details" button**
    - Wind direction, precipitation
    - Pressure, cloud cover, visibility
    - Expandable section

24. **Fix bugs and improve**
    - Fix Gujarat/Pakistan issue
    - Improve error handling
    - Add loading states

25. **Create documentation**
    - Write README.md
    - Add screenshots
    - Document API endpoints

26. **Push to GitHub**
    - Initialize git repo
    - Add .gitignore
    - Commit and push

27. **Deploy to Render**
    - Create Render account
    - Connect GitHub repo
    - Set environment variables
    - Deploy!

---

## Feature List

### Completed Features
- [x] Real-time weather search
- [x] 5-day forecast
- [x] Temperature unit toggle (C/F)
- [x] Dark/Light theme
- [x] Weather icons
- [x] Search suggestions
- [x] Weather alerts
- [x] Air quality index
- [x] Interactive maps
- [x] User authentication
- [x] Favorites system
- [x] Search history
- [x] Location detection
- [x] Telegram bot
- [x] More details section
- [x] Clothing recommendations
- [x] Weather-based backgrounds
- [x] Responsive design

### Planned Features
- [ ] Hourly forecast chart
- [ ] Weather comparison
- [ ] Push notifications
- [ ] Offline mode
- [ ] Multi-language support
- [ ] Voice search
- [ ] Weather widgets

---

## API Integration

### Open-Meteo Weather API
**Base URL:** `https://api.open-meteo.com/v1/forecast`
**Parameters:**
- `latitude` - City latitude
- `longitude` - City longitude
- `current_weather` - Current conditions
- `daily` - Daily forecast data
- `timezone` - Auto timezone

### Open-Meteo Air Quality API
**Base URL:** `https://air-quality-api.open-meteo.com/v1/air-quality`
**Parameters:**
- `latitude` - City latitude
- `longitude` - City longitude
- `current` - Current AQI data

### Telegram Bot API
**Base URL:** `https://api.telegram.org/bot<TOKEN>/`
**Methods:**
- `sendMessage` - Send text messages
- `getUpdates` - Receive messages

---

## File Structure

```
SkyCast/
├── server.js                 # Main server (500+ lines)
│   ├── Express setup
│   ├── API routes
│   ├── Telegram bot
│   └── MongoDB connection
│
├── public/
│   ├── index.html             # Main page
│   ├── style.css              # Styles (1000+ lines)
│   ├── app.js                 # Frontend logic (800+ lines)
│   ├── login.html             # Login page
│   └── register.html          # Register page
│
├── .env                       # Environment variables
├── package.json               # Dependencies
└── README.md                  # Documentation
```

---

## Environment Variables

Create `.env` file:

```env
# Required
SESSION_SECRET=your_secret_key_here

# Optional
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
MONGODB_URI=your_mongodb_connection_string
PORT=3000
```

---

## Commands

### Development
```bash
# Start server
node server.js

# Check syntax
node --check server.js

# Install dependencies
npm install
```

### Git
```bash
# Initialize
git init

# Add files
git add .

# Commit
git commit -m "Initial commit"

# Add remote
git remote add origin https://github.com/username/SkyCast.git

# Push
git push -u origin main
```

---

## Troubleshooting

### Common Issues

1. **Server won't start**
   - Check if port 3000 is in use
   - Kill existing processes: `pkill -f "node server.js"`
   - Check for syntax errors: `node --check server.js`

2. **MongoDB connection fails**
   - Make sure MongoDB URI is correct
   - App works without MongoDB (in-memory fallback)
   - Check network connectivity

3. **Telegram bot not responding**
   - Verify bot token is correct
   - Check if bot is started with BotFather
   - Ensure server is running

4. **CSS not updating**
   - Hard refresh browser: Ctrl + Shift + R
   - Clear browser cache
   - Check file path in HTML

5. **Location button not working**
   - Allow location permissions in browser
   - Use HTTPS for production
   - Check if geolocation is supported

---

## Performance Tips

- Use `gzip` compression for responses
- Cache weather data for 10 minutes
- Lazy load map when needed
- Minify CSS and JS for production
- Use CDN for libraries (Leaflet, fonts)

---

## Security Notes

- Never commit `.env` file to GitHub
- Use strong session secrets
- Hash passwords with bcrypt
- Validate all user inputs
- Use HTTPS in production
- Rate limit API endpoints

---

## Resources

- **Open-Meteo Docs:** https://open-meteo.com/en/docs
- **Leaflet Docs:** https://leafletjs.com/reference.html
- **Telegram Bot API:** https://core.telegram.org/bots/api
- **Express Docs:** https://expressjs.com/en/4x/api.html

---

## Team

- **Developer:** Prabha
- **Role:** Full-stack Developer
- **GitHub:** @prabhaingle98-maker

---

## Timeline

| Phase | Duration | Status |
|-------|----------|--------|
| Basic Setup | 1 day | ✅ Complete |
| Core Features | 2 days | ✅ Complete |
| UI/UX | 2 days | ✅ Complete |
| Advanced Features | 3 days | ✅ Complete |
| User Features | 2 days | ✅ Complete |
| Telegram Bot | 1 day | ✅ Complete |
| Polish & Deploy | 1 day | 🔄 In Progress |

---

**Total Development Time:** ~12 days
**Lines of Code:** 2000+
**Features:** 15+

---

*Last Updated: June 23, 2026*
