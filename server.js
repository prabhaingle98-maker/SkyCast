require('dotenv').config();

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB Connection (optional - app works without it)
const MONGODB_URI = process.env.MONGODB_URI || '';
let useMongoDB = false;

if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 2000, connectTimeoutMS: 2000, socketTimeoutMS: 2000 })
    .then(() => { console.log('MongoDB connected'); useMongoDB = true; })
    .catch(err => { console.log('MongoDB not available, using in-memory storage'); useMongoDB = false; });
} else {
  console.log('No MongoDB URI provided, using in-memory storage');
}

// Set mongoose to not wait for connection
mongoose.set('bufferCommands', false);

// Mongoose Schemas
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const favoriteSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  city: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Favorite = mongoose.model('Favorite', favoriteSchema);

// In-memory storage fallback
const memoryUsers = [];
const memoryFavorites = [];
let nextUserId = 1;
let nextFavId = 1;

// Middleware
app.use(cors());
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'skycast-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

// Auth middleware
function requireAuth(req, res, next) {
  if (req.session.userId) return next();
  res.status(401).json({ error: 'Login required' });
}

// Auth routes
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    
    if (useMongoDB) {
      const exists = await User.findOne({ username });
      if (exists) return res.status(400).json({ error: 'Username already exists' });
      
      const hashed = await bcrypt.hash(password, 10);
      const user = new User({ username, password: hashed });
      await user.save();
      
      req.session.userId = user._id;
      res.json({ id: user._id, username });
    } else {
      // In-memory fallback
      const exists = memoryUsers.find(u => u.username === username);
      if (exists) return res.status(400).json({ error: 'Username already exists' });
      
      const hashed = await bcrypt.hash(password, 10);
      const user = { _id: nextUserId++, username, password: hashed };
      memoryUsers.push(user);
      
      req.session.userId = user._id;
      res.json({ id: user._id, username });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    
    if (useMongoDB) {
      const user = await User.findOne({ username });
      if (!user) return res.status(401).json({ error: 'Invalid credentials' });
      
      const match = await bcrypt.compare(password, user.password);
      if (!match) return res.status(401).json({ error: 'Invalid credentials' });
      
      req.session.userId = user._id;
      res.json({ id: user._id, username: user.username });
    } else {
      // In-memory fallback
      const user = memoryUsers.find(u => u.username === username);
      if (!user) return res.status(401).json({ error: 'Invalid credentials' });
      
      const match = await bcrypt.compare(password, user.password);
      if (!match) return res.status(401).json({ error: 'Invalid credentials' });
      
      req.session.userId = user._id;
      res.json({ id: user._id, username: user.username });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ message: 'Logged out' });
});

app.get('/api/me', async (req, res) => {
  if (!req.session.userId) return res.json(null);
  try {
    if (useMongoDB) {
      const user = await User.findById(req.session.userId).select('-password');
      res.json(user || null);
    } else {
      const user = memoryUsers.find(u => u._id === req.session.userId);
      if (user) {
        const { password, ...userWithoutPassword } = user;
        res.json(userWithoutPassword);
      } else {
        res.json(null);
      }
    }
  } catch (err) {
    res.json(null);
  }
});

// Favorites API (MongoDB)
app.get('/api/favorites', requireAuth, async (req, res) => {
  try {
    if (useMongoDB) {
      const favorites = await Favorite.find({ userId: req.session.userId }).sort({ createdAt: -1 });
      res.json(favorites);
    } else {
      const favorites = memoryFavorites.filter(f => f.userId === req.session.userId);
      res.json(favorites);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/favorites', requireAuth, async (req, res) => {
  try {
    const { city } = req.body;
    if (!city) return res.status(400).json({ error: 'City name required' });
    
    if (useMongoDB) {
      const exists = await Favorite.findOne({ userId: req.session.userId, city: city.toLowerCase() });
      if (exists) return res.status(409).json({ error: 'City already in favorites' });
      
      const favorite = new Favorite({ userId: req.session.userId, city: city.toLowerCase() });
      await favorite.save();
      res.json(favorite);
    } else {
      const exists = memoryFavorites.find(f => f.userId === req.session.userId && f.city === city.toLowerCase());
      if (exists) return res.status(409).json({ error: 'City already in favorites' });
      
      const favorite = { _id: nextFavId++, userId: req.session.userId, city: city.toLowerCase(), createdAt: new Date() };
      memoryFavorites.push(favorite);
      res.json(favorite);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/favorites/:id', requireAuth, async (req, res) => {
  try {
    if (useMongoDB) {
      const favorite = await Favorite.findOneAndDelete({ _id: req.params.id, userId: req.session.userId });
      if (!favorite) return res.status(404).json({ error: 'Favorite not found' });
      res.json({ message: 'Removed from favorites' });
    } else {
      const index = memoryFavorites.findIndex(f => f._id == req.params.id && f.userId === req.session.userId);
      if (index === -1) return res.status(404).json({ error: 'Favorite not found' });
      memoryFavorites.splice(index, 1);
      res.json({ message: 'Removed from favorites' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Hardcoded popular cities
const cityCoordinates = {
  'london': { latitude: 51.5085, longitude: -0.1257, name: 'London', country: 'United Kingdom' },
  'mumbai': { latitude: 19.0728, longitude: 72.8826, name: 'Mumbai', country: 'India' },
  'delhi': { latitude: 28.6139, longitude: 77.2090, name: 'Delhi', country: 'India' },
  'pune': { latitude: 18.5204, longitude: 73.8567, name: 'Pune', country: 'India' },
  'bangalore': { latitude: 12.9716, longitude: 77.5946, name: 'Bangalore', country: 'India' },
  'chennai': { latitude: 13.0827, longitude: 80.2707, name: 'Chennai', country: 'India' },
  'kolkata': { latitude: 22.5726, longitude: 88.3639, name: 'Kolkata', country: 'India' },
  'hyderabad': { latitude: 17.3850, longitude: 78.4867, name: 'Hyderabad', country: 'India' },
  'ahmedabad': { latitude: 23.0225, longitude: 72.5714, name: 'Ahmedabad', country: 'India' },
  'gujarat': { latitude: 22.2587, longitude: 71.1924, name: 'Gujarat', country: 'India' },
  'gujrat': { latitude: 22.2587, longitude: 71.1924, name: 'Gujarat', country: 'India' },
  'jaipur': { latitude: 26.9124, longitude: 75.7873, name: 'Jaipur', country: 'India' },
  'lucknow': { latitude: 26.8467, longitude: 80.9462, name: 'Lucknow', country: 'India' },
  'new york': { latitude: 40.7128, longitude: -74.0060, name: 'New York', country: 'United States' },
  'paris': { latitude: 48.8566, longitude: 2.3522, name: 'Paris', country: 'France' },
  'tokyo': { latitude: 35.6762, longitude: 139.6503, name: 'Tokyo', country: 'Japan' },
  'sydney': { latitude: -33.8688, longitude: 151.2093, name: 'Sydney', country: 'Australia' },
  'dubai': { latitude: 25.2048, longitude: 55.2708, name: 'Dubai', country: 'United Arab Emirates' },
  'singapore': { latitude: 1.3521, longitude: 103.8198, name: 'Singapore', country: 'Singapore' },
  'berlin': { latitude: 52.5200, longitude: 13.4050, name: 'Berlin', country: 'Germany' },
  'toronto': { latitude: 43.6532, longitude: -79.3832, name: 'Toronto', country: 'Canada' },
  'vancouver': { latitude: 49.2827, longitude: -123.1207, name: 'Vancouver', country: 'Canada' },
  'los angeles': { latitude: 34.0522, longitude: -118.2437, name: 'Los Angeles', country: 'United States' },
  'chicago': { latitude: 41.8781, longitude: -87.6298, name: 'Chicago', country: 'United States' },
  'san francisco': { latitude: 37.7749, longitude: -122.4194, name: 'San Francisco', country: 'United States' },
  'miami': { latitude: 25.7617, longitude: -80.1918, name: 'Miami', country: 'United States' },
  'boston': { latitude: 42.3601, longitude: -71.0589, name: 'Boston', country: 'United States' },
  'seattle': { latitude: 47.6062, longitude: -122.3321, name: 'Seattle', country: 'United States' },
  'las vegas': { latitude: 36.1699, longitude: -115.1398, name: 'Las Vegas', country: 'United States' },
  'barcelona': { latitude: 41.3851, longitude: 2.1734, name: 'Barcelona', country: 'Spain' },
  'madrid': { latitude: 40.4168, longitude: -3.7038, name: 'Madrid', country: 'Spain' },
  'rome': { latitude: 41.9028, longitude: 12.4964, name: 'Rome', country: 'Italy' },
  'milan': { latitude: 45.4642, longitude: 9.1900, name: 'Milan', country: 'Italy' },
  'amsterdam': { latitude: 52.3676, longitude: 4.9041, name: 'Amsterdam', country: 'Netherlands' },
  'zurich': { latitude: 47.3769, longitude: 8.5417, name: 'Zurich', country: 'Switzerland' },
  'vienna': { latitude: 48.2082, longitude: 16.3738, name: 'Vienna', country: 'Austria' },
  'prague': { latitude: 50.0755, longitude: 14.4378, name: 'Prague', country: 'Czech Republic' },
  'warsaw': { latitude: 52.2297, longitude: 21.0122, name: 'Warsaw', country: 'Poland' },
  'moscow': { latitude: 55.7558, longitude: 37.6173, name: 'Moscow', country: 'Russia' },
  'istanbul': { latitude: 41.0082, longitude: 28.9784, name: 'Istanbul', country: 'Turkey' },
  'cairo': { latitude: 30.0444, longitude: 31.2357, name: 'Cairo', country: 'Egypt' },
  'lagos': { latitude: 6.5244, longitude: 3.3792, name: 'Lagos', country: 'Nigeria' },
  'johannesburg': { latitude: -26.2041, longitude: 28.0473, name: 'Johannesburg', country: 'South Africa' },
  'nairobi': { latitude: -1.2921, longitude: 36.8219, name: 'Nairobi', country: 'Kenya' },
  'mexico city': { latitude: 19.4326, longitude: -99.1332, name: 'Mexico City', country: 'Mexico' },
  'buenos aires': { latitude: -34.6037, longitude: -58.3816, name: 'Buenos Aires', country: 'Argentina' },
  'rio de janeiro': { latitude: -22.9068, longitude: -43.1729, name: 'Rio de Janeiro', country: 'Brazil' },
  'sao paulo': { latitude: -23.5505, longitude: -46.6333, name: 'Sao Paulo', country: 'Brazil' },
  'lima': { latitude: -12.0464, longitude: -77.0428, name: 'Lima', country: 'Peru' },
  'santiago': { latitude: -33.4489, longitude: -70.6693, name: 'Santiago', country: 'Chile' },
  'bogota': { latitude: 4.7110, longitude: -74.0721, name: 'Bogota', country: 'Colombia' },
  'caracas': { latitude: 10.4806, longitude: -66.9036, name: 'Caracas', country: 'Venezuela' },
  'hong kong': { latitude: 22.3193, longitude: 114.1694, name: 'Hong Kong', country: 'Hong Kong' },
  'shanghai': { latitude: 31.2304, longitude: 121.4737, name: 'Shanghai', country: 'China' },
  'beijing': { latitude: 39.9042, longitude: 116.4074, name: 'Beijing', country: 'China' },
  'seoul': { latitude: 37.5665, longitude: 126.9780, name: 'Seoul', country: 'South Korea' },
  'bangkok': { latitude: 13.7563, longitude: 100.5018, name: 'Bangkok', country: 'Thailand' },
  'jakarta': { latitude: -6.2088, longitude: 106.8456, name: 'Jakarta', country: 'Indonesia' },
  'manila': { latitude: 14.5995, longitude: 120.9842, name: 'Manila', country: 'Philippines' },
  'kuala lumpur': { latitude: 3.1390, longitude: 101.6869, name: 'Kuala Lumpur', country: 'Malaysia' },
  'taipei': { latitude: 25.0330, longitude: 121.5654, name: 'Taipei', country: 'Taiwan' },
  'hanoi': { latitude: 21.0278, longitude: 105.8342, name: 'Hanoi', country: 'Vietnam' },
  'auckland': { latitude: -36.8485, longitude: 174.7633, name: 'Auckland', country: 'New Zealand' },
  'melbourne': { latitude: -37.8136, longitude: 144.9631, name: 'Melbourne', country: 'Australia' },
  'brisbane': { latitude: -27.4698, longitude: 153.0251, name: 'Brisbane', country: 'Australia' },
  'perth': { latitude: -31.9505, longitude: 115.8605, name: 'Perth', country: 'Australia' },
  'tel aviv': { latitude: 32.0853, longitude: 34.7818, name: 'Tel Aviv', country: 'Israel' },
  'doha': { latitude: 25.2854, longitude: 51.5310, name: 'Doha', country: 'Qatar' },
  'kuwait city': { latitude: 29.3759, longitude: 47.9774, name: 'Kuwait City', country: 'Kuwait' },
  'riyadh': { latitude: 24.7136, longitude: 46.6753, name: 'Riyadh', country: 'Saudi Arabia' },
  'tehran': { latitude: 35.6892, longitude: 51.3890, name: 'Tehran', country: 'Iran' },
  'karachi': { latitude: 24.8607, longitude: 67.0011, name: 'Karachi', country: 'Pakistan' },
  'lahore': { latitude: 31.5204, longitude: 74.3587, name: 'Lahore', country: 'Pakistan' },
  'dhaka': { latitude: 23.8103, longitude: 90.4125, name: 'Dhaka', country: 'Bangladesh' },
  'colombo': { latitude: 6.9271, longitude: 79.8612, name: 'Colombo', country: 'Sri Lanka' },
  'kathmandu': { latitude: 27.7172, longitude: 85.3240, name: 'Kathmandu', country: 'Nepal' },
  'thimphu': { latitude: 27.4728, longitude: 89.6390, name: 'Thimphu', country: 'Bhutan' },
  'male': { latitude: 4.1755, longitude: 73.5093, name: 'Male', country: 'Maldives' },
  'athens': { latitude: 37.9838, longitude: 23.7275, name: 'Athens', country: 'Greece' },
  'lisbon': { latitude: 38.7223, longitude: -9.1393, name: 'Lisbon', country: 'Portugal' },
  'dublin': { latitude: 53.3498, longitude: -6.2603, name: 'Dublin', country: 'Ireland' },
  'brussels': { latitude: 50.8503, longitude: 4.3517, name: 'Brussels', country: 'Belgium' },
  'stockholm': { latitude: 59.3293, longitude: 18.0686, name: 'Stockholm', country: 'Sweden' },
  'oslo': { latitude: 59.9139, longitude: 10.7522, name: 'Oslo', country: 'Norway' },
  'helsinki': { latitude: 60.1699, longitude: 24.9384, name: 'Helsinki', country: 'Finland' },
  'copenhagen': { latitude: 55.6761, longitude: 12.5683, name: 'Copenhagen', country: 'Denmark' },
  'reykjavik': { latitude: 64.1466, longitude: -21.9426, name: 'Reykjavik', country: 'Iceland' }
};

async function getCoordinates(city) {
  const cityLower = city.toLowerCase().trim();
  
  // Check hardcoded cities first
  if (cityCoordinates[cityLower]) return cityCoordinates[cityLower];
  
  // Handle "city, country" format (e.g., "gujarat, india")
  const parts = cityLower.split(',').map(p => p.trim());
  const searchName = parts[0];
  const countryHint = parts[1] || null;
  
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(searchName)}&count=5`;
    const response = await axios.get(url, { timeout: 5000 });
    
    if (!response.data.results || response.data.results.length === 0) {
      throw new Error('City not found');
    }
    
    // If country hint provided, filter by country
    if (countryHint) {
      const countryLower = countryHint.toLowerCase();
      const match = response.data.results.find(r => 
        (r.country && r.country.toLowerCase().includes(countryLower)) || 
        (r.country_code && r.country_code.toLowerCase() === countryLower) ||
        countryLower.includes(r.country ? r.country.toLowerCase() : '')
      );
      if (match) {
        // Ensure country field exists
        if (!match.country && match.country_code) {
          match.country = match.country_code.toUpperCase();
        }
        return match;
      }
    }
    
    // Return first result with country guaranteed
    const result = response.data.results[0];
    if (!result.country && result.country_code) {
      result.country = result.country_code.toUpperCase();
    }
    if (!result.country) result.country = 'Unknown';
    return result;
    
  } catch (error) {
    // Fallback to hardcoded cities
    for (const [key, value] of Object.entries(cityCoordinates)) {
      if (key.includes(searchName) || searchName.includes(key)) return value;
    }
    throw new Error('City not found. Try: London, Mumbai, Delhi, Pune, New York, Paris, Tokyo, Dubai, Toronto, Barcelona, Sydney, Singapore, Berlin, or "city, country" like "Paris, France"');
  }
}

app.get('/api/weather/:city', async (req, res) => {
  try {
    const { city } = req.params;
    const location = await getCoordinates(city);
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current=temperature,relative_humidity_2m,apparent_temperature,uv_index,is_day,wind_direction_10m,precipitation,pressure_msl,cloud_cover,visibility&daily=temperature_2m_max,temperature_2m_min,weathercode,sunrise,sunset&timezone=auto`;
    const response = await axios.get(url);
    const current = response.data.current;
    const daily = response.data.daily;
    
    // Fetch air quality
    let airQuality = null;
    try {
      const aqUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${location.latitude}&longitude=${location.longitude}&current=european_aqi,pm10,pm2_5,ozone`;
      const aqResponse = await axios.get(aqUrl);
      airQuality = aqResponse.data.current;
    } catch (e) {
      // Air quality not available for this location
    }
    res.json({
      name: location.name,
      country: location.country || location.country_code || 'Unknown',
      temp: current?.temperature || 0,
      wind: 0,
      condition: getWeatherCondition(daily?.weathercode?.[0] || 0),
      humidity: current?.relative_humidity_2m || null,
      feelsLike: current?.apparent_temperature || null,
      uvIndex: current?.uv_index || null,
      isDay: current?.is_day || 1,
      sunrise: daily?.sunrise?.[0] || null,
      sunset: daily?.sunset?.[0] || null,
      windDirection: current?.wind_direction_10m || null,
      precipitation: current?.precipitation || null,
      pressure: current?.pressure_msl || null,
      cloudCover: current?.cloud_cover || null,
      visibility: current?.visibility || null,
      aqi: airQuality?.european_aqi || null,
      pm10: airQuality?.pm10 || null,
      pm25: airQuality?.pm2_5 || null,
      ozone: airQuality?.ozone || null,
      daily: { time: daily.time, temperature_2m_max: daily.temperature_2m_max, temperature_2m_min: daily.temperature_2m_min, weathercode: daily.weathercode },
      lat: location.latitude,
      lon: location.longitude,
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

function getWeatherIcon(condition) {
  if (!condition) return '🌡️';
  if (condition.includes('Clear')) return '☀️';
  if (condition.includes('cloud') || condition.includes('Overcast')) return '☁️';
  if (condition.includes('rain') || condition.includes('drizzle')) return '🌧️';
  if (condition.includes('snow')) return '🌨️';
  if (condition.includes('Thunder')) return '⛈️';
  if (condition.includes('Fog')) return '🌫️';
  return '🌡️';
}

function getAQILevel(aqi) {
  if (aqi <= 20) return { text: 'Good', emoji: '🟢', advice: 'Air quality is satisfactory. Enjoy outdoor activities!' };
  if (aqi <= 40) return { text: 'Fair', emoji: '🟡', advice: 'Air quality is acceptable. Sensitive individuals should limit prolonged outdoor exertion.' };
  if (aqi <= 60) return { text: 'Moderate', emoji: '🟠', advice: 'Sensitive groups may experience health effects. Limit prolonged outdoor exertion.' };
  if (aqi <= 80) return { text: 'Poor', emoji: '🔴', advice: 'Health effects possible for everyone. Avoid prolonged outdoor exertion.' };
  if (aqi <= 100) return { text: 'Very Poor', emoji: '🟤', advice: 'Health alert! Everyone should avoid outdoor exertion.' };
  return { text: 'Extremely Poor', emoji: '⚫', advice: 'Emergency conditions! Stay indoors and avoid all outdoor activities.' };
}

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

// Telegram Bot Setup
// Telegram Bot Setup (optional)
let bot = null;

try {
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8924673496:AAGHEJ7MZwBBRNmWTnBExQ_x3QdrZhLVzNY';

if (TELEGRAM_BOT_TOKEN) {
    const TelegramBot = require('node-telegram-bot-api');
    bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { 
      polling: true,
      request: {
        agentClass: require('https').Agent,
        agentOptions: {
          keepAlive: true,
          rejectUnauthorized: false
        }
      }
    });
    
    bot.onText(/\/start/, (msg) => {
      const welcomeMsg = `Welcome to SkyCast Weather Bot! 🌤\n\nHere\'s what I can do:\n\n🌡️ Send me a city name for weather\n📍 Share your location for local weather\n📅 Use /forecast for 5-day forecast\n💨 Use /aqi for air quality\n⭐ Use /save to save favorites\n📋 Use /favorites to view saved cities\n⚖️ Use /compare to compare cities\n\nTry it now!`;
      
      bot.sendMessage(msg.chat.id, welcomeMsg, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🌡️ Get Weather', callback_data: 'get_weather' }],
            [{ text: '📅 Forecast', callback_data: 'get_forecast' }],
            [{ text: '💨 Air Quality', callback_data: 'get_aqi' }],
            [{ text: '⭐ Favorites', callback_data: 'get_favorites' }]
          ]
        }
      });
    });
    
    bot.onText(/\/help/, (msg) => {
      bot.sendMessage(msg.chat.id, `🤖 SkyCast Bot Commands:\n\n/start - Welcome message\n/help - Show this help\n/forecast \u003ccity\u003e - 5-day forecast\n/aqi \u003ccity\u003e - Air quality index\n/save \u003ccity\u003e - Save to favorites\n/favorites - View saved cities\n/remove \u003ccity\u003e - Remove from favorites\n/compare \u003ccity1\u003e \u003ccity2\u003e - Compare cities\n\nOr just send me any city name! 🌍`);
    });
    
    // User favorites storage (in-memory for now, can be moved to DB)
    const userFavorites = {};
    
    // /forecast command
    bot.onText(/\/forecast (.+)/, async (msg, match) => {
      const city = match[1];
      const chatId = msg.chat.id;
      
      try {
        const location = await getCoordinates(city);
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=auto`;
        const response = await axios.get(url);
        const daily = response.data.daily;
        
        let forecastText = `📅 5-Day Forecast for ${location.name}\n\n`;
        
        for (let i = 0; i < 5; i++) {
          const date = new Date(daily.time[i]);
          const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
          const maxTemp = Math.round(daily.temperature_2m_max[i]);
          const minTemp = Math.round(daily.temperature_2m_min[i]);
          const condition = getWeatherCondition(daily.weathercode[i]);
          const icon = getWeatherIcon(condition);
          
          forecastText += `${icon} ${dayName}: ${maxTemp}°C / ${minTemp}°C - ${condition}\n`;
        }
        
        bot.sendMessage(chatId, forecastText);
      } catch (err) {
        bot.sendMessage(chatId, `Sorry, could not get forecast for "${city}". Try another city!`);
      }
    });
    
    // /aqi command
    bot.onText(/\/aqi (.+)/, async (msg, match) => {
      const city = match[1];
      const chatId = msg.chat.id;
      
      try {
        const location = await getCoordinates(city);
        const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${location.latitude}&longitude=${location.longitude}&current=european_aqi,pm10,pm2_5,ozone`;
        const response = await axios.get(url);
        const current = response.data.current;
        
        const aqi = current.european_aqi;
        const aqiLevel = getAQILevel(aqi);
        
        const aqiText = `🌬️ Air Quality for ${location.name}\n\n` +
          `📊 AQI: ${aqi} - ${aqiLevel.text}\n` +
          `🎨 Level: ${aqiLevel.emoji}\n\n` +
          `🏭 PM10: ${current.pm10} μg/m³\n` +
          `😷 PM2.5: ${current.pm2_5} μg/m³\n` +
          `🌫️ Ozone: ${current.ozone} μg/m³\n\n` +
          `${aqiLevel.advice}`;
        
        bot.sendMessage(chatId, aqiText);
      } catch (err) {
        bot.sendMessage(chatId, `Sorry, could not get air quality for "${city}".`);
      }
    });
    
    // /save command
    bot.onText(/\/save (.+)/, (msg, match) => {
      const city = match[1];
      const chatId = msg.chat.id;
      const userId = msg.from.id;
      
      if (!userFavorites[userId]) {
        userFavorites[userId] = [];
      }
      
      if (!userFavorites[userId].includes(city)) {
        userFavorites[userId].push(city);
        bot.sendMessage(chatId, `⭐ Saved "${city}" to your favorites!\n\nView with /favorites`);
      } else {
        bot.sendMessage(chatId, `"${city}" is already in your favorites!`);
      }
    });
    
    // /favorites command
    bot.onText(/\/favorites/, (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from.id;
      const favorites = userFavorites[userId] || [];
      
      if (favorites.length === 0) {
        bot.sendMessage(chatId, '⭐ No favorites yet!\n\nUse /save \u003ccity\u003e to add cities.\nExample: /save London');
        return;
      }
      
      const keyboard = favorites.map(city => ([{
        text: `🌍 ${city}`,
        callback_data: `weather_${city}`
      }]));
      
      keyboard.push([{ text: '❌ Clear All', callback_data: 'clear_favorites' }]);
      
      bot.sendMessage(chatId, '⭐ Your Favorite Cities:', {
        reply_markup: {
          inline_keyboard: keyboard
        }
      });
    });
    
    // /remove command
    bot.onText(/\/remove (.+)/, (msg, match) => {
      const city = match[1];
      const chatId = msg.chat.id;
      const userId = msg.from.id;
      
      if (userFavorites[userId]) {
        const index = userFavorites[userId].indexOf(city);
        if (index > -1) {
          userFavorites[userId].splice(index, 1);
          bot.sendMessage(chatId, `❌ Removed "${city}" from favorites.`);
        } else {
          bot.sendMessage(chatId, `"${city}" is not in your favorites.`);
        }
      }
    });
    
    // /compare command
    bot.onText(/\/compare (.+) (.+)/, async (msg, match) => {
      const city1 = match[1];
      const city2 = match[2];
      const chatId = msg.chat.id;
      
      try {
        const [loc1, loc2] = await Promise.all([
          getCoordinates(city1),
          getCoordinates(city2)
        ]);
        
        const [res1, res2] = await Promise.all([
          axios.get(`https://api.open-meteo.com/v1/forecast?latitude=${loc1.latitude}&longitude=${loc1.longitude}&current_weather=true&timezone=auto`),
          axios.get(`https://api.open-meteo.com/v1/forecast?latitude=${loc2.latitude}&longitude=${loc2.longitude}&current_weather=true&timezone=auto`)
        ]);
        
        const weather1 = res1.data.current_weather;
        const weather2 = res2.data.current_weather;
        const cond1 = getWeatherCondition(weather1.weathercode);
        const cond2 = getWeatherCondition(weather2.weathercode);
        
        const winner = weather1.temperature > weather2.temperature ? city1 : city2;
        
        const compareText = `⚖️ Weather Comparison\n\n` +
          `📍 ${loc1.name}:\n` +
          `🌡 ${weather1.temperature}°C - ${cond1}\n` +
          `💨 ${weather1.windspeed} km/h\n\n` +
          `📍 ${loc2.name}:\n` +
          `🌡 ${weather2.temperature}°C - ${cond2}\n` +
          `💨 ${weather2.windspeed} km/h\n\n` +
          `🏆 Warmer: ${winner}`;
        
        bot.sendMessage(chatId, compareText);
      } catch (err) {
        bot.sendMessage(chatId, 'Sorry, could not compare cities. Make sure both city names are correct!');
      }
    });
    
    // Handle inline button callbacks
    bot.on('callback_query', async (query) => {
      const chatId = query.message.chat.id;
      const data = query.data;
      
      if (data === 'get_weather') {
        bot.sendMessage(chatId, 'Send me a city name to get weather! 🌍\n\nExample: London');
      } else if (data === 'get_forecast') {
        bot.sendMessage(chatId, 'Send /forecast followed by city name! 📅\n\nExample: /forecast London');
      } else if (data === 'get_aqi') {
        bot.sendMessage(chatId, 'Send /aqi followed by city name! 💨\n\nExample: /aqi London');
      } else if (data === 'get_favorites') {
        const userId = query.from.id;
        const favorites = userFavorites[userId] || [];
        
        if (favorites.length === 0) {
          bot.sendMessage(chatId, 'No favorites yet! Use /save <city> to add cities.');
        } else {
          const keyboard = favorites.map(city => ([{
            text: `🌍 ${city}`,
            callback_data: `weather_${city}`
          }]));
          
          bot.sendMessage(chatId, '⭐ Your Favorites:', {
            reply_markup: {
              inline_keyboard: keyboard
            }
          });
        }
      } else if (data.startsWith('weather_')) {
        const city = data.replace('weather_', '');
        try {
          const location = await getCoordinates(city);
          const url = `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current_weather=true&timezone=auto`;
          const response = await axios.get(url);
          const weather = response.data.current_weather;
          const condition = getWeatherCondition(weather.weathercode);
          
          const countryName = location.country || location.country_code || 'Unknown';
          bot.sendMessage(chatId, `🌍 ${location.name}, ${countryName}\n\n🌡 Temperature: ${weather.temperature}°C\n💨 Wind: ${weather.windspeed} km/h\n☁️ Condition: ${condition}\n\n📍 Location: ${location.latitude.toFixed(2)}, ${location.longitude.toFixed(2)}`);
        } catch (err) {
          bot.sendMessage(chatId, `Sorry, could not get weather for "${city}".`);
        }
      } else if (data.startsWith('forecast_')) {
        const city = data.replace('forecast_', '');
        try {
          const location = await getCoordinates(city);
          const url = `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=auto`;
          const response = await axios.get(url);
          const daily = response.data.daily;
          
          let forecastText = `📅 5-Day Forecast for ${location.name}\n\n`;
          
          for (let i = 0; i < 5; i++) {
            const date = new Date(daily.time[i]);
            const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
            const maxTemp = Math.round(daily.temperature_2m_max[i]);
            const minTemp = Math.round(daily.temperature_2m_min[i]);
            const condition = getWeatherCondition(daily.weathercode[i]);
            const icon = getWeatherIcon(condition);
            
            forecastText += `${icon} ${dayName}: ${maxTemp}°C / ${minTemp}°C - ${condition}\n`;
          }
          
          bot.sendMessage(chatId, forecastText);
        } catch (err) {
          bot.sendMessage(chatId, `Sorry, could not get forecast for "${city}".`);
        }
      } else if (data.startsWith('aqi_')) {
        const city = data.replace('aqi_', '');
        try {
          const location = await getCoordinates(city);
          const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${location.latitude}&longitude=${location.longitude}&current=european_aqi,pm10,pm2_5,ozone`;
          const response = await axios.get(url);
          const current = response.data.current;
          
          const aqi = current.european_aqi;
          const aqiLevel = getAQILevel(aqi);
          
          const aqiText = `🌬️ Air Quality for ${location.name}\n\n` +
            `📊 AQI: ${aqi} - ${aqiLevel.text}\n` +
            `🎨 Level: ${aqiLevel.emoji}\n\n` +
            `🏭 PM10: ${current.pm10} μg/m³\n` +
            `😷 PM2.5: ${current.pm2_5} μg/m³\n` +
            `🌫️ Ozone: ${current.ozone} μg/m³\n\n` +
            `${aqiLevel.advice}`;
          
          bot.sendMessage(chatId, aqiText);
        } catch (err) {
          bot.sendMessage(chatId, `Sorry, could not get air quality for "${city}".`);
        }
      } else if (data.startsWith('save_')) {
        const city = data.replace('save_', '');
        const userId = query.from.id;
        
        if (!userFavorites[userId]) {
          userFavorites[userId] = [];
        }
        
        if (!userFavorites[userId].includes(city)) {
          userFavorites[userId].push(city);
          bot.sendMessage(chatId, `⭐ Saved "${city}" to your favorites!\n\nView with /favorites`);
        } else {
          bot.sendMessage(chatId, `"${city}" is already in your favorites!`);
        }
      } else if (data === 'clear_favorites') {
        const userId = query.from.id;
        userFavorites[userId] = [];
        bot.sendMessage(chatId, '❌ All favorites cleared!');
      }
      
      bot.answerCallbackQuery(query.id);
    });
    
    // Handle regular messages (city names)
    bot.on('message', async (msg) => {
      if (msg.location) {
        // Handle location sharing
        try {
          const lat = msg.location.latitude;
          const lon = msg.location.longitude;
          
          const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&timezone=auto`;
          const response = await axios.get(url);
          const weather = response.data.current_weather;
          const condition = getWeatherCondition(weather.weathercode);
          
          bot.sendMessage(msg.chat.id, `📍 Your Location Weather:\n\n🌡 Temperature: ${weather.temperature}°C\n💨 Wind: ${weather.windspeed} km/h\n☁️ Condition: ${condition}`, {
            reply_markup: {
              inline_keyboard: [
                [{ text: '📅 Get Forecast', callback_data: 'get_forecast' }],
                [{ text: '💨 Air Quality', callback_data: 'get_aqi' }]
              ]
            }
          });
        } catch (err) {
          bot.sendMessage(msg.chat.id, 'Sorry, could not get weather for your location.');
        }
        return;
      }
      
      if (msg.text && !msg.text.startsWith('/')) {
        // Handle city name with inline buttons
        const city = msg.text;
        try {
          const location = await getCoordinates(city);
          const url = `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current_weather=true&timezone=auto`;
          const response = await axios.get(url);
          const weather = response.data.current_weather;
          const condition = getWeatherCondition(weather.weathercode);
          
          const countryName = location.country || location.country_code || 'Unknown';
          bot.sendMessage(msg.chat.id, `🌍 ${location.name}, ${countryName}\n\n🌡 Temperature: ${weather.temperature}°C\n💨 Wind: ${weather.windspeed} km/h\n☁️ Condition: ${condition}\n\n📍 Location: ${location.latitude.toFixed(2)}, ${location.longitude.toFixed(2)}`, {
            reply_markup: {
              inline_keyboard: [
                [{ text: '📅 Forecast', callback_data: `forecast_${city}` }, { text: '💨 AQI', callback_data: `aqi_${city}` }],
                [{ text: '⭐ Save', callback_data: `save_${city}` }]
              ]
            }
          });
        } catch (err) {
          bot.sendMessage(msg.chat.id, `Sorry, could not find weather for "${city}". Try another city name!`);
        }
      }
    });
    
    console.log('Telegram bot initialized');
  } else {
    console.log('No TELEGRAM_BOT_TOKEN set, bot not initialized');
  }
} catch (err) {
  console.log('Telegram bot not available:', err.message);
  bot = null;
}

app.use(express.static('public'));

// Search suggestions API
app.get('/api/suggestions', (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) {
    return res.json([]);
  }
  
  const query = q.toLowerCase().trim();
  const suggestions = [];
  
  // Search through cityCoordinates
  for (const [key, value] of Object.entries(cityCoordinates)) {
    if (key.includes(query) || value.name.toLowerCase().includes(query)) {
      suggestions.push({
        name: value.name,
        country: value.country,
        fullName: `${value.name}, ${value.country}`
      });
    }
  }
  
  // Remove duplicates and limit to 8 results
  const unique = suggestions.filter((v, i, a) => a.findIndex(t => t.name === v.name) === i);
  res.json(unique.slice(0, 8));
});

app.listen(PORT, () => {
  console.log(`SkyCast server running at http://localhost:${PORT}`);
});
