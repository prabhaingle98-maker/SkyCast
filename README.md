# SkyCast - Weather App

A modern, feature-rich weather application built with Node.js and Express. Get real-time weather data, forecasts, air quality, and more for any city worldwide.

![SkyCast Banner](https://via.placeholder.com/800x200/3b82f6/ffffff?text=SkyCast+Weather+App)

## Features

### Core Features
- Real-time weather search for any city
- 5-day weather forecast
- Current weather conditions with icons
- Temperature display (Celsius/Fahrenheit toggle)
- Wind speed and direction
- Humidity, pressure, visibility
- UV index and cloud cover
- Sunrise and sunset times
- Feels like temperature

### Advanced Features
- **Weather Alerts** - Automatic alerts for severe conditions (rain, storm, heat, cold, snow, fog, high UV, strong winds)
- **Air Quality Index** - Real-time AQI with PM10, PM2.5, and ozone levels
- **Interactive Maps** - Leaflet.js integration with dark/light theme tiles
- **Search Suggestions** - Auto-complete city names as you type
- **Favorites** - Save and manage favorite cities
- **Search History** - Track recent searches
- **Location Detection** - Auto-detect weather using GPS
- **Telegram Bot** - Get weather updates via Telegram chat

### UI Features
- Dark/Light theme toggle
- Glassmorphism design
- Responsive layout (mobile-friendly)
- Weather-based background changes
- Clothing recommendations based on weather

## Tech Stack

| Technology | Purpose |
|------------|---------|
| Node.js | Backend runtime |
| Express.js | Web framework |
| Open-Meteo API | Weather data (free, no API key) |
| Leaflet.js | Interactive maps |
| Telegram Bot API | Bot integration |
| HTML/CSS/JS | Frontend |

## Installation

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn

### Steps

1. **Clone the repository**
   ```bash
   git clone https://github.com/prabhaingle98-maker/SkyCast.git
   cd SkyCast
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env` file in the root directory:
   ```env
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
   MONGODB_URI=your_mongodb_uri_here (optional)
   SESSION_SECRET=your_session_secret_here
   ```

4. **Start the server**
   ```bash
   node server.js
   ```

5. **Open in browser**
   Navigate to `http://localhost:3000`

## Usage

### Web Interface
1. Enter a city name in the search box
2. Click "Search" or press Enter
3. View current weather, forecast, and alerts
4. Click "More Details" for additional information
5. Use the 📍 button for GPS-based weather

### Telegram Bot
1. Find your bot on Telegram (e.g., `@skycast_weather_bot`)
2. Send `/start` to begin
3. Send any city name for weather
4. Share your location for local weather

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/weather/:city` | GET | Get weather for a city |
| `/api/suggestions?q=query` | GET | Get city search suggestions |
| `/api/register` | POST | Register new user |
| `/api/login` | POST | Login user |
| `/api/me` | GET | Get current user |
| `/api/favorites` | GET | Get user's favorites |
| `/api/favorites` | POST | Add favorite city |
| `/api/favorites/:id` | DELETE | Remove favorite city |

## Project Structure

```
SkyCast/
├── server.js              # Main server file
├── package.json           # Dependencies
├── .env                   # Environment variables
├── public/                # Frontend files
│   ├── index.html        # Main HTML
│   ├── style.css         # Styles
│   ├── app.js            # Frontend logic
│   ├── login.html        # Login page
│   └── register.html     # Register page
└── README.md             # This file
```

## Features Breakdown

### Weather Data
- Current temperature
- Feels like temperature
- Wind speed and direction
- Humidity percentage
- Pressure (hPa)
- Visibility (km/m)
- Cloud cover (%)
- Precipitation (mm)
- UV index
- Sunrise/sunset times

### Weather Alerts
| Condition | Alert Icon | Message |
|-----------|-----------|---------|
| Temp > 35°C | 🔥 | Heat wave warning |
| Temp < 0°C | ❄️ | Freezing warning |
| Rain | 🌧️ | Carry umbrella |
| Thunderstorm | ⛈️ | Stay indoors |
| UV > 7 | ☀️ | Wear sunscreen |
| Wind > 50km/h | 💨 | Secure loose objects |
| Snow | 🌨️ | Drive carefully |
| Fog | 🌫️ | Drive with caution |

### Air Quality Levels
| AQI | Level | Color | Description |
|-----|-------|-------|-------------|
| 0-20 | Good | 🟢 | Air quality is satisfactory |
| 21-40 | Fair | 🟡 | Acceptable quality |
| 41-60 | Moderate | 🟠 | Sensitive groups may experience effects |
| 61-80 | Poor | 🔴 | Health effects possible |
| 81-100 | Very Poor | 🟤 | Health alert |
| 100+ | Extremely Poor | ⚫ | Emergency conditions |

## Supported Cities

The app includes 100+ pre-configured cities worldwide:
- **India**: Mumbai, Delhi, Bangalore, Chennai, Kolkata, Pune, Hyderabad, Ahmedabad, Jaipur, Lucknow
- **USA**: New York, Los Angeles, Chicago, San Francisco, Miami, Boston, Seattle, Las Vegas
- **Europe**: London, Paris, Berlin, Rome, Barcelona, Madrid, Amsterdam, Zurich, Vienna, Prague
- **Asia**: Tokyo, Beijing, Shanghai, Seoul, Bangkok, Singapore, Hong Kong, Dubai
- **Australia**: Sydney, Melbourne, Brisbane, Perth, Auckland
- **And more...**

## Deployment

### Deploy to Render
1. Push code to GitHub
2. Create new Web Service on Render
3. Connect GitHub repository
4. Set environment variables
5. Deploy!

### Environment Variables
| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | No | For Telegram bot functionality |
| `MONGODB_URI` | No | For database (optional) |
| `SESSION_SECRET` | Yes | For session encryption |
| `PORT` | No | Server port (default: 3000) |

## Screenshots

### Main Interface
![Main](https://via.placeholder.com/600x400/1e293b/ffffff?text=Main+Interface)

### Weather Details
![Details](https://via.placeholder.com/600x400/1e293b/ffffff?text=Weather+Details)

### Maps
![Maps](https://via.placeholder.com/600x400/1e293b/ffffff?text=Interactive+Map)

## Future Enhancements

- [ ] Hourly forecast chart
- [ ] Weather comparison between cities
- [ ] Push notifications for alerts
- [ ] Weather widgets for websites
- [ ] Voice search
- [ ] Offline mode
- [ ] Weather history/stats
- [ ] Multi-language support

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is open source and available under the [MIT License](LICENSE).

## Acknowledgments

- [Open-Meteo](https://open-meteo.com/) for free weather API
- [Leaflet](https://leafletjs.com/) for interactive maps
- [Telegram Bot API](https://core.telegram.org/bots/api) for bot integration

## Contact

- GitHub: [@prabhaingle98-maker](https://github.com/prabhaingle98-maker)
- Project Link: [https://github.com/prabhaingle98-maker/SkyCast](https://github.com/prabhaingle98-maker/SkyCast)

---

**Made with ❤️ by Prabha**
