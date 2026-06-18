const API = window.location.origin + '/api';

let currentCity = '';
let favorites = [];
let sidebarOpen = true;
let isCelsius = true;
let isDark = true;
let searchHistory = JSON.parse(localStorage.getItem('skycast_history') || '[]');
let currentUser = null;

// Check auth on load
async function checkAuth() {
  try {
    const res = await fetch(`${API}/me`);
    currentUser = await res.json();
    updateAuthUI();
    if (currentUser) loadFavorites();
  } catch (err) {
    console.error('Auth check failed', err);
  }
}

function updateAuthUI() {
  const authSection = document.getElementById('authSection');
  const userSection = document.getElementById('userSection');
  const userName = document.getElementById('userName');
  
  if (currentUser) {
    authSection.style.display = 'none';
    userSection.style.display = 'flex';
    userName.textContent = currentUser.username;
  } else {
    authSection.style.display = 'flex';
    userSection.style.display = 'none';
    renderFavorites();
  }
}

async function logout() {
  try {
    await fetch(`${API}/logout`, { method: 'POST' });
    currentUser = null;
    favorites = [];
    updateAuthUI();
    renderFavorites();
  } catch (err) {
    console.error('Logout failed', err);
  }
}

// Toggle sidebar
function toggleSidebar() {
  sidebarOpen = !sidebarOpen;
  document.getElementById('sidebar').classList.toggle('collapsed', !sidebarOpen);
}

// Toggle temperature unit
function toggleUnit() {
  isCelsius = !isCelsius;
  document.getElementById('unitBtn').textContent = isCelsius ? '°C' : '°F';
  if (currentCity) getWeather();
}

// Toggle theme
function toggleTheme() {
  isDark = !isDark;
  document.body.classList.toggle('light', !isDark);
  document.getElementById('themeBtn').textContent = isDark ? '🌙' : '☀️';
}

// Convert temperature
function convertTemp(celsius) {
  if (isCelsius) return Math.round(celsius);
  return Math.round((celsius * 9/5) + 32);
}

function getUnit() {
  return isCelsius ? '°C' : '°F';
}

// Auto-detect location
function detectLocation() {
  if (!navigator.geolocation) {
    alert('Geolocation not supported by your browser');
    return;
  }
  
  navigator.geolocation.getCurrentPosition(async (position) => {
    try {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;
      
      // Try multiple geocoding APIs
      let city = null;
      
      // Try BigDataCloud
      try {
        const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`, { timeout: 5000 });
        const data = await res.json();
        city = data.city || data.locality || data.principalSubdivision;
      } catch (e) {
        console.log('BigDataCloud failed, trying fallback');
      }
      
      // Fallback: use coordinates directly with weather API
      if (!city || city === 'Unknown') {
        // Call weather API directly with lat/lon
        const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=auto`);
        const weatherData = await weatherRes.json();
        
        // Try to get city name from another API
        try {
          const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`, { 
            headers: { 'User-Agent': 'SkyCast/1.0' }
          });
          const geoData = await geoRes.json();
          city = geoData.address?.city || geoData.address?.town || geoData.address?.village || 'Unknown';
        } catch (e) {
          city = 'Your Location';
        }
        
        // Display weather directly
        const condition = getWeatherCondition(weatherData.current_weather.weathercode);
        const weather = {
          name: city,
          country: '',
          temp: weatherData.current_weather.temperature,
          wind: weatherData.current_weather.windspeed,
          condition: condition,
          daily: weatherData.daily,
          fetchedAt: new Date().toISOString()
        };
        
        currentCity = city;
        addToHistory(city);
        displayWeather(weather);
        updateBackground(condition);
        
        // Get forecast
        const forecast = weatherData.daily.time.map((date, i) => ({
          date,
          temp_max: weatherData.daily.temperature_2m_max[i],
          temp_min: weatherData.daily.temperature_2m_min[i],
          condition: getWeatherCondition(weatherData.daily.weathercode[i])
        }));
        displayForecast({ forecast });
        
        // Get air quality
        try {
          const aqiRes = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,pm10,pm2_5`);
          const aqiData = await aqiRes.json();
          displayAirQuality({ aqi: aqiData.current.us_aqi, pm10: aqiData.current.pm10, pm2_5: aqiData.current.pm2_5 });
        } catch (e) {
          document.getElementById('airQualityResult').innerHTML = '';
        }
        
        displayClothingAdvice(weatherData.current_weather.temperature, condition);
        
        document.getElementById('cityInput').value = city;
        return;
      }
      
      document.getElementById('cityInput').value = city;
      getWeather();
      
    } catch (err) {
      console.error('Location error:', err);
      alert('Could not detect your location. Please search manually.');
    }
  }, (error) => {
    if (error.code === 1) {
      alert('Location permission denied. Please allow location access in your browser settings.');
    } else if (error.code === 2) {
      alert('Location unavailable. Please check your GPS or search manually.');
    } else {
      alert('Could not detect location. Please search manually.');
    }
  }, {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 0
  });
}

// Load favorites
async function loadFavorites() {
  if (!currentUser) {
    favorites = [];
    renderFavorites();
    return;
  }
  try {
    const res = await fetch(`${API}/favorites`);
    favorites = await res.json();
    renderFavorites();
  } catch (err) {
    console.error('Failed to load favorites', err);
  }
}

function renderFavorites() {
  const container = document.getElementById('favoritesList');
  if (!currentUser) {
    container.innerHTML = '<p class="empty-msg">Login to save favorites</p>';
    return;
  }
  if (!favorites.length) {
    container.innerHTML = '<p class="empty-msg">No favorites yet</p>';
    return;
  }
  container.innerHTML = favorites.map(f => `
    <div class="favorite-item" onclick="searchCity('${f.city}')">
      <span class="fav-city">${f.city}</span>
      <button class="fav-remove" onclick="event.stopPropagation(); removeFavorite(${f.id})" title="Remove">×</button>
    </div>
  `).join('');
}

function renderHistory() {
  const container = document.getElementById('historyList');
  if (!searchHistory.length) {
    container.innerHTML = '<p class="empty-msg">No recent searches</p>';
    return;
  }
  container.innerHTML = searchHistory.slice(0, 5).map(city => `
    <div class="favorite-item" onclick="searchCity('${city}')">
      <span class="fav-city">${city}</span>
    </div>
  `).join('');
}

function addToHistory(city) {
  searchHistory = searchHistory.filter(c => c.toLowerCase() !== city.toLowerCase());
  searchHistory.unshift(city);
  if (searchHistory.length > 10) searchHistory.pop();
  localStorage.setItem('skycast_history', JSON.stringify(searchHistory));
  renderHistory();
}

async function addFavorite() {
  if (!currentUser) {
    alert('Please login to save favorites');
    window.location.href = '/login.html';
    return;
  }
  if (!currentCity) {
    alert('Search a city first!');
    return;
  }
  
  try {
    const res = await fetch(`${API}/favorites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ city: currentCity })
    });
    
    if (res.ok) {
      loadFavorites();
      const btn = document.getElementById('addFavBtn');
      if (btn) { btn.textContent = '★ Saved'; btn.disabled = true; }
    } else {
      const data = await res.json();
      alert(data.error || 'Failed to add favorite');
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function removeFavorite(id) {
  try {
    await fetch(`${API}/favorites/${id}`, { method: 'DELETE' });
    loadFavorites();
    const btn = document.getElementById('addFavBtn');
    if (btn) { btn.textContent = '☆ Add to Favorites'; btn.disabled = false; }
  } catch (err) {
    console.error('Failed to remove favorite', err);
  }
}

function searchCity(city) {
  document.getElementById('cityInput').value = city;
  getWeather();
}

// Update background based on weather
function updateBackground(condition) {
  document.body.className = document.body.className.replace(/weather-\w+/g, '');
  
  if (condition.includes('Clear') || condition.includes('Mainly clear')) {
    document.body.classList.add('weather-clear');
  } else if (condition.includes('cloud') || condition.includes('Overcast') || condition.includes('Fog')) {
    document.body.classList.add('weather-cloudy');
  } else if (condition.includes('rain') || condition.includes('drizzle') || condition.includes('showers')) {
    document.body.classList.add('weather-rain');
  } else if (condition.includes('snow')) {
    document.body.classList.add('weather-snow');
  } else if (condition.includes('Thunder')) {
    document.body.classList.add('weather-storm');
  }
}

async function getWeather() {
  const city = document.getElementById('cityInput').value.trim();
  if (!city) return alert('Enter a city name');

  try {
    const weatherRes = await fetch(`${API}/weather/${city}`);
    const weather = await weatherRes.json();

    if (weather.error) {
      document.getElementById('weatherResult').innerHTML = `<p class="error">${weather.error}</p>`;
      return;
    }

    currentCity = weather.name;
    addToHistory(weather.name);
    displayWeather(weather);
    updateBackground(weather.condition);

    const forecastRes = await fetch(`${API}/forecast/${city}`);
    const forecast = await forecastRes.json();
    displayForecast(forecast);

    const aqiRes = await fetch(`${API}/airquality/${city}`);
    const aqi = await aqiRes.json();
    displayAirQuality(aqi);

    displayClothingAdvice(weather.temp, weather.condition);

  } catch (err) {
    document.getElementById('weatherResult').innerHTML = '<p class="error">Failed to load weather</p>';
  }
}

function getWeatherIcon(condition) {
  const icons = {
    'Clear sky': '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
    'Mainly clear': '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
    'Partly cloudy': '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>',
    'Overcast': '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>',
    'Fog': '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15h16"/><path d="M4 18h16"/><path d="M4 12h16"/><path d="M4 9h16"/></svg>',
    'Depositing rime fog': '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15h16"/><path d="M4 18h16"/><path d="M4 12h16"/><path d="M4 9h16"/></svg>',
    'Light drizzle': '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 16.2A4.5 4.5 0 0 0 17.5 8h-1.8A7 7 0 1 0 4 14.9"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/></svg>',
    'Moderate drizzle': '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 16.2A4.5 4.5 0 0 0 17.5 8h-1.8A7 7 0 1 0 4 14.9"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/></svg>',
    'Dense drizzle': '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 16.2A4.5 4.5 0 0 0 17.5 8h-1.8A7 7 0 1 0 4 14.9"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/></svg>',
    'Slight rain': '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 16.2A4.5 4.5 0 0 0 17.5 8h-1.8A7 7 0 1 0 4 14.9"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/></svg>',
    'Moderate rain': '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 16.2A4.5 4.5 0 0 0 17.5 8h-1.8A7 7 0 1 0 4 14.9"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/></svg>',
    'Heavy rain': '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 16.2A4.5 4.5 0 0 0 17.5 8h-1.8A7 7 0 1 0 4 14.9"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/></svg>',
    'Slight snow': '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25"/><line x1="8" y1="16" x2="8.01" y2="16"/><line x1="8" y1="20" x2="8.01" y2="20"/><line x1="12" y1="18" x2="12.01" y2="18"/><line x1="12" y1="22" x2="12.01" y2="22"/><line x1="16" y1="16" x2="16.01" y2="16"/><line x1="16" y1="20" x2="16.01" y2="20"/></svg>',
    'Moderate snow': '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25"/><line x1="8" y1="16" x2="8.01" y2="16"/><line x1="8" y1="20" x2="8.01" y2="20"/><line x1="12" y1="18" x2="12.01" y2="18"/><line x1="12" y1="22" x2="12.01" y2="22"/><line x1="16" y1="16" x2="16.01" y2="16"/><line x1="16" y1="20" x2="16.01" y2="20"/></svg>',
    'Heavy snow': '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25"/><line x1="8" y1="16" x2="8.01" y2="16"/><line x1="8" y1="20" x2="8.01" y2="20"/><line x1="12" y1="18" x2="12.01" y2="18"/><line x1="12" y1="22" x2="12.01" y2="22"/><line x1="16" y1="16" x2="16.01" y2="16"/><line x1="16" y1="20" x2="16.01" y2="20"/></svg>',
    'Slight rain showers': '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 16.2A4.5 4.5 0 0 0 17.5 8h-1.8A7 7 0 1 0 4 14.9"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/></svg>',
    'Moderate rain showers': '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 16.2A4.5 4.5 0 0 0 17.5 8h-1.8A7 7 0 1 0 4 14.9"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/></svg>',
    'Violent rain showers': '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 16.2A4.5 4.5 0 0 0 17.5 8h-1.8A7 7 0 1 0 4 14.9"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/></svg>',
    'Thunderstorm': '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9"/><polyline points="13 11 9 17 15 17 11 23"/></svg>',
    'Thunderstorm with hail': '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9"/><polyline points="13 11 9 17 15 17 11 23"/></svg>'
  };
  return icons[condition] || icons['Clear sky'];
}

function displayWeather(data) {
  currentCity = data.name;
  const isFavorite = favorites.some(f => f.city.toLowerCase() === currentCity.toLowerCase());
  const icon = getWeatherIcon(data.condition);
  const fetchedAt = data.fetchedAt ? new Date(data.fetchedAt).toLocaleString() : 'Just now';
  
  const html = `
    <div class="current-weather">
      <div class="weather-icon">${icon}</div>
      <h2>${data.name}, ${data.country}</h2>
      <div class="temp">${convertTemp(data.temp)}${getUnit()}</div>
      <div class="condition">${data.condition}</div>
      <div class="details">
        <span>Wind: ${data.wind} km/h</span>
      </div>
      <div class="last-updated">Last updated: ${fetchedAt}</div>
      <button id="addFavBtn" class="add-favorite-btn" onclick="addFavorite()" ${isFavorite ? 'disabled' : ''}>
        ${isFavorite ? '★ Saved' : '☆ Add to Favorites'}
      </button>
    </div>
  `;
  document.getElementById('weatherResult').innerHTML = html;
}

function displayForecast(data) {
  const days = data.forecast.slice(0, 5);
  const html = `
    <h3>5-Day Forecast</h3>
    <div class="forecast-grid">
      ${days.map(day => `
        <div class="forecast-card">
          <div class="date">${new Date(day.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
          <div class="temp">${convertTemp(day.temp_max)}${getUnit()}</div>
          <div class="temp-min">Low: ${convertTemp(day.temp_min)}${getUnit()}</div>
          <div class="condition">${day.condition}</div>
        </div>
      `).join('')}
    </div>
  `;
  document.getElementById('forecastResult').innerHTML = html;
}

function displayAirQuality(data) {
  if (data.error) return;
  const aqi = data.aqi;
  let quality = 'Good';
  let color = '#10b981';
  if (aqi > 50) { quality = 'Moderate'; color = '#f59e0b'; }
  if (aqi > 100) { quality = 'Unhealthy'; color = '#ef4444'; }
  if (aqi > 150) { quality = 'Very Unhealthy'; color = '#7c3aed'; }
  
  const html = `
    <div class="aqi-card">
      <h3>Air Quality</h3>
      <div class="aqi-value" style="color: ${color}">${aqi}</div>
      <div class="aqi-label" style="color: ${color}">${quality}</div>
      <div class="aqi-details">
        <span>PM2.5: ${data.pm2_5} µg/m³</span>
        <span>PM10: ${data.pm10} µg/m³</span>
      </div>
    </div>
  `;
  document.getElementById('airQualityResult').innerHTML = html;
}

function displayClothingAdvice(temp, condition) {
  let advice = '';
  if (temp < 0) advice = 'Wear heavy winter coat, gloves, scarf, and warm boots. Freezing temperatures!';
  else if (temp < 10) advice = 'Wear a warm jacket, sweater, and long pants. Don\'t forget a scarf!';
  else if (temp < 20) advice = 'A light jacket or hoodie should be enough. Comfortable weather!';
  else if (temp < 30) advice = 'T-shirt and shorts weather! Stay hydrated and wear sunscreen.';
  else advice = 'Very hot! Wear light, breathable clothing and drink plenty of water.';
  
  if (condition.includes('rain')) advice += ' Bring an umbrella or raincoat!';
  if (condition.includes('snow')) advice += ' Wear waterproof boots and warm layers!';
  
  const html = `
    <div class="clothing-card">
      <h3>👕 What to Wear</h3>
      <p>${advice}</p>
    </div>
  `;
  document.getElementById('clothingResult').innerHTML = html;
}

// Search on Enter key
document.getElementById('cityInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') getWeather();
});

// Load on page load
checkAuth();
renderHistory();