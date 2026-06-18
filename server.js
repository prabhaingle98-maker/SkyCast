const express = require('express');
const axios = require('axios');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(session({
  secret: 'skycast-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

// In-memory storage (no database needed)
let users = [];
let userNextId = 1;
let favorites = [];
let favNextId = 1;

// Auth middleware
function requireAuth(req, res, next) {
  if (req.session.userId) return next();
  res.status(401).json({ error: 'Login required' });
}

// Auth routes
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  
  const exists = users.find(u => u.username === username);
  if (exists) return res.status(400).json({ error: 'Username already exists' });
  
  const hashed = await bcrypt.hash(password, 10);
  const user = { id: userNextId++, username, password: hashed };
  users.push(user);
  req.session.userId = user.id;
  res.json({ id: user.id, username });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  
  const user = users.find(u => u.username === username);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  
  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ error: 'Invalid credentials' });
  
  req.session.userId = user.id;
  res.json({ id: user.id, username: user.username });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ message: 'Logged out' });
});

app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.json(null);
  const user = users.find(u => u.id === req.session.userId);
  res.json(user ? { id: user.id, username: user.username } : null);
});

// Favorites API (user-specific)
app.get('/api/favorites', requireAuth, (req, res) => {
  const userFavs = favorites.filter(f => f.user_id === req.session.userId);
  res.json(userFavs);
});

app.post('/api/favorites', requireAuth, (req, res) => {
  const { city } = req.body;
  if (!city) return res.status(400).json({ error: 'City name required' });
  
  const exists = favorites.find(f => f.user_id === req.session.userId && f.city.toLowerCase() === city.toLowerCase());
  if (exists) return res.status(409).json({ error: 'City already in favorites' });
  
  const fav = { id: favNextId++, user_id: req.session.userId, city };
  favorites.push(fav);
  res.json(fav);
});

app.delete('/api/favorites/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id);
  const index = favorites.findIndex(f => f.id === id && f.user_id === req.session.userId);
  if (index === -1) return res.status(404).json({ error: 'Favorite not found' });
  
  favorites.splice(index, 1);
  res.json({ message: 'Removed from favorites' });
});

// Hardcoded popular cities
const cityCoordinates = {
  'london': { latitude: 51.5085, longitude: -0.1257, name: 'London', country: 'United Kingdom' },
  'mumbai': { latitude: 19.0728, longitude: 72.8826, name: 'Mumbai', country: 'India' },
  'delhi': { latitude: 28.6139, longitude: 77.2090, name: 'Delhi', country: 'India' },
  'new york': { latitude: 40.7128, longitude: -74.0060, name: 'New York', country: 'United States' },
  'paris': { latitude: 48.8566, longitude: 2.3522, name: 'Paris', country: 'France' },
  'tokyo': { latitude: 35.6762, longitude: 139.6503, name: 'Tokyo', country: 'Japan' },
  'sydney': { latitude: -33.8688, longitude: 151.2093, name: 'Sydney', country: 'Australia' },
  'dubai': { latitude: 25.2048, longitude: 55.2708, name: 'Dubai', country: 'United Arab Emirates' },
  'singapore': { latitude: 1.3521, longitude: 103.8198, name: 'Singapore', country: 'Singapore' },
  'berlin': { latitude: 52.5200, longitude: 13.4050, name: 'Berlin', country: 'Germany' }
};

async function getCoordinates(city) {
  const cityLower = city.toLowerCase().trim();
  if (cityCoordinates[cityLower]) return cityCoordinates[cityLower];
  
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`;
    const response = await axios.get(url, { timeout: 5000 });
    if (!response.data.results || response.data.results.length === 0) throw new Error('City not found');
    return response.data.results[0];
  } catch (error) {
    for (const [key, value] of Object.entries(cityCoordinates)) {
      if (key.includes(cityLower) || cityLower.includes(key)) return value;
    }
    throw new Error('City not found. Try: London, Mumbai, Delhi, New York, Paris, Tokyo, Sydney, Dubai, Singapore, Berlin');
  }
}

app.get('/api/weather/:city', async (req, res) => {
  try {
    const { city } = req.params;
    const location = await getCoordinates(city);
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current_weather=true&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=auto`;
    const response = await axios.get(url);
    res.json({
      name: location.name,
      country: location.country,
      temp: response.data.current_weather.temperature,
      wind: response.data.current_weather.windspeed,
      condition: getWeatherCondition(response.data.current_weather.weathercode),
      daily: response.data.daily,
      fetchedAt: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to fetch weather' });
  }
});

app.get('/api/forecast/:city', async (req, res) => {
  try {
    const { city } = req.params;
    const location = await getCoordinates(city);
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=auto`;
    const response = await axios.get(url);
    const daily = response.data.daily;
    const forecast = daily.time.map((date, i) => ({
      date,
      temp_max: daily.temperature_2m_max[i],
      temp_min: daily.temperature_2m_min[i],
      condition: getWeatherCondition(daily.weathercode[i])
    }));
    res.json({ forecast });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to fetch forecast' });
  }
});

app.get('/api/airquality/:city', async (req, res) => {
  try {
    const { city } = req.params;
    const location = await getCoordinates(city);
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${location.latitude}&longitude=${location.longitude}&current=us_aqi,pm10,pm2_5`;
    const response = await axios.get(url);
    const current = response.data.current;
    res.json({ aqi: current.us_aqi, pm10: current.pm10, pm2_5: current.pm2_5 });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to fetch air quality' });
  }
});

function getWeatherCondition(code) {
  const conditions = {
    0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Fog', 48: 'Depositing rime fog',
    51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
    61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
    71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow',
    80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
    95: 'Thunderstorm', 96: 'Thunderstorm with hail'
  };
  return conditions[code] || 'Unknown';
}

app.use(express.static('public'));

app.listen(PORT, () => {
  console.log(`SkyCast server running at http://localhost:${PORT}`);
});
