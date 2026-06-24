const API = window.location.origin + '/api';

let currentCity = '';
let favorites = [];
let sidebarOpen = true;
let isCelsius = true;
let isDark = true;
let searchHistory = JSON.parse(localStorage.getItem('skycast_history') || '[]');
let currentUser = null;
let map = null;
let mapMarker = null;

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
  
  // Update map tiles if map exists
  if (map) {
    const darkTiles = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    const lightTiles = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
    const tileUrl = isDark ? darkTiles : lightTiles;
    
    map.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) {
        layer.setUrl(tileUrl);
      }
    });
  }
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

// Store favorite markers
let favoriteMarkers = [];

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
    showFavoritesOnMap();
  } catch (err) {
    console.error('Failed to load favorites', err);
  }
}

// Show favorite cities on map
async function showFavoritesOnMap() {
  if (!map || favorites.length === 0) return;
  
  // Clear existing favorite markers
  favoriteMarkers.forEach(marker => map.removeLayer(marker));
  favoriteMarkers = [];
  
  // Add marker for each favorite
  for (const fav of favorites) {
    try {
      const res = await fetch(`${API}/weather/${fav.city}`);
      const data = await res.json();
      if (data.lat && data.lon) {
        const marker = L.marker([data.lat, data.lon])
          .addTo(map)
          .bindPopup(`<b>${data.name}</b><br>${data.country}<br>${data.temp}°C`);
        favoriteMarkers.push(marker);
      }
    } catch (err) {
      console.error('Failed to show favorite on map:', fav.city);
    }
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

// Store search history markers
let historyMarkers = [];

function addToHistory(city) {
  searchHistory = searchHistory.filter(c => c.toLowerCase() !== city.toLowerCase());
  searchHistory.unshift(city);
  if (searchHistory.length > 10) searchHistory.pop();
  localStorage.setItem('skycast_history', JSON.stringify(searchHistory));
  renderHistory();
  showHistoryOnMap();
}

// Show search history on map
async function showHistoryOnMap() {
  if (!map || searchHistory.length === 0) return;
  
  // Clear existing history markers
  historyMarkers.forEach(marker => map.removeLayer(marker));
  historyMarkers = [];
  
  // Add marker for each history item (last 5)
  for (const city of searchHistory.slice(0, 5)) {
    try {
      const res = await fetch(`${API}/weather/${city}`);
      const data = await res.json();
      if (data.lat && data.lon) {
        const marker = L.circleMarker([data.lat, data.lon], {
          radius: 6,
          fillColor: '#8b5cf6',
          color: '#fff',
          weight: 2,
          opacity: 0.8,
          fillOpacity: 0.6
        }).addTo(map)
          .bindPopup(`<b>${data.name}</b><br>${data.country}`);
        historyMarkers.push(marker);
      }
    } catch (err) {
      console.error('Failed to show history on map:', city);
    }
  }
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

function openComparePage() {
  window.location.href = 'compare.html';
}

// Notification toggles
function toggleDailyNotify() {
  const checkbox = document.getElementById('dailyNotify');
  const enabled = checkbox.checked;
  const timeSection = document.getElementById('dailyTimeSection');
  
  localStorage.setItem('skycast_daily_notify', enabled);
  
  if (enabled) {
    timeSection.style.display = 'block';
    const time = getCustomTimeString();
    localStorage.setItem('skycast_daily_time', time);
    alert(`Daily weather updates enabled! You will receive updates at ${formatTimeDisplay(time)}.`);
  } else {
    timeSection.style.display = 'none';
    alert('Daily weather updates disabled.');
  }
}

function updateCustomTime() {
  const time = getCustomTimeString();
  localStorage.setItem('skycast_daily_time', time);
  updateTimeDisplay();
}

function setAMPM(period) {
  const amBtn = document.getElementById('amBtn');
  const pmBtn = document.getElementById('pmBtn');
  
  if (period === 'AM') {
    amBtn.classList.add('active');
    pmBtn.classList.remove('active');
  } else {
    pmBtn.classList.add('active');
    amBtn.classList.remove('active');
  }
  
  updateCustomTime();
}

function getCustomTimeString() {
  const hour = document.getElementById('hourInput').value.padStart(2, '0');
  const minute = document.getElementById('minuteInput').value.padStart(2, '0');
  const ampm = document.getElementById('amBtn').classList.contains('active') ? 'AM' : 'PM';
  return `${hour}:${minute} ${ampm}`;
}

function updateTimeDisplay() {
  const display = document.getElementById('timeDisplay');
  if (display) {
    display.textContent = formatTimeDisplay(getCustomTimeString());
  }
}

function formatTimeDisplay(timeStr) {
  return timeStr; // Already formatted as "HH:MM AM/PM"
}

function toggleAlertNotify() {
  const checkbox = document.getElementById('alertNotify');
  const enabled = checkbox.checked;
  localStorage.setItem('skycast_alert_notify', enabled);
  
  if (enabled) {
    alert('Weather alerts enabled! You will receive alerts for severe weather conditions.');
  } else {
    alert('Weather alerts disabled.');
  }
}

// Check notification preferences on load
function checkNotificationPrefs() {
  const dailyNotify = localStorage.getItem('skycast_daily_notify') === 'true';
  const alertNotify = localStorage.getItem('skycast_alert_notify') === 'true';
  const dailyTime = localStorage.getItem('skycast_daily_time') || '08:00 AM';
  
  const dailyCheckbox = document.getElementById('dailyNotify');
  const alertCheckbox = document.getElementById('alertNotify');
  const timeSection = document.getElementById('dailyTimeSection');
  
  if (dailyCheckbox) {
    dailyCheckbox.checked = dailyNotify;
  }
  if (alertCheckbox) {
    alertCheckbox.checked = alertNotify;
  }
  if (timeSection) {
    timeSection.style.display = dailyNotify ? 'block' : 'none';
  }
  
  // Parse saved time and set inputs
  if (dailyTime) {
    const [timePart, ampm] = dailyTime.split(' ');
    const [hour, minute] = timePart.split(':');
    
    const hourInput = document.getElementById('hourInput');
    const minuteInput = document.getElementById('minuteInput');
    const amBtn = document.getElementById('amBtn');
    const pmBtn = document.getElementById('pmBtn');
    
    if (hourInput) hourInput.value = parseInt(hour);
    if (minuteInput) minuteInput.value = minute.padStart(2, '0');
    
    if (amBtn && pmBtn) {
      if (ampm === 'AM') {
        amBtn.classList.add('active');
        pmBtn.classList.remove('active');
      } else {
        pmBtn.classList.add('active');
        amBtn.classList.remove('active');
      }
    }
    
    updateTimeDisplay();
  }
}

// Call on load
document.addEventListener('DOMContentLoaded', checkNotificationPrefs);

// Search suggestions
let suggestionTimeout = null;
let selectedSuggestionIndex = -1;

function handleSearchInput(value) {
  clearTimeout(suggestionTimeout);
  selectedSuggestionIndex = -1;

  if (value.length < 2) {
    document.getElementById('searchSuggestions').innerHTML = '';
    return;
  }

  suggestionTimeout = setTimeout(() => fetchSuggestions(value), 300);
}

async function fetchSuggestions(query) {
  try {
    const response = await fetch(`${API}/suggestions?q=${encodeURIComponent(query)}`);
    const suggestions = await response.json();
    renderSuggestions(suggestions);
  } catch (e) {
    console.error('Failed to fetch suggestions:', e);
  }
}

function renderSuggestions(suggestions) {
  const container = document.getElementById('searchSuggestions');
  if (!container) return;

  if (suggestions.length === 0) {
    container.innerHTML = '';
    return;
  }

  const html = suggestions.map((s, i) => `
    <div class="suggestion-item" data-index="${i}" onclick="selectSuggestion('${s.name}')">
      <span class="suggestion-name">${s.name}</span>
      <span class="suggestion-country">${s.country}</span>
    </div>
  `).join('');

  container.innerHTML = html;
}

function selectSuggestion(city) {
  document.getElementById('cityInput').value = city;
  document.getElementById('searchSuggestions').innerHTML = '';
  getWeather();
}

function handleKeyDown(event) {
  const container = document.getElementById('searchSuggestions');
  const items = container.querySelectorAll('.suggestion-item');

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    selectedSuggestionIndex = Math.min(selectedSuggestionIndex + 1, items.length - 1);
    highlightSuggestion(items);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    selectedSuggestionIndex = Math.max(selectedSuggestionIndex - 1, -1);
    highlightSuggestion(items);
  } else if (event.key === 'Enter') {
    if (selectedSuggestionIndex >= 0 && items[selectedSuggestionIndex]) {
      items[selectedSuggestionIndex].click();
    } else {
      getWeather();
    }
  } else if (event.key === 'Escape') {
    container.innerHTML = '';
    selectedSuggestionIndex = -1;
  }
}

function highlightSuggestion(items) {
  items.forEach((item, i) => {
    item.classList.toggle('selected', i === selectedSuggestionIndex);
  });
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
  
  const countryDisplay = data.country && data.country !== 'Unknown' ? data.country : '';
  const locationDisplay = countryDisplay ? `${data.name}, ${countryDisplay}` : data.name;
  
  // Build extra details
  let extraDetails = '';
  if (data.humidity !== null) {
    extraDetails += `<span>💧 Humidity: ${data.humidity}%</span>`;
  }
  if (data.feelsLike !== null) {
    extraDetails += `<span>🌡️ Feels like: ${convertTemp(data.feelsLike)}${getUnit()}</span>`;
  }
  if (data.uvIndex !== null) {
    const uvColor = data.uvIndex > 7 ? '#ef4444' : data.uvIndex > 3 ? '#f59e0b' : '#10b981';
    extraDetails += `<span style="color: ${uvColor}">☀️ UV Index: ${data.uvIndex.toFixed(1)}</span>`;
  }
  if (data.sunrise) {
    const sunriseTime = new Date(data.sunrise).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    extraDetails += `<span>🌅 Sunrise: ${sunriseTime}</span>`;
  }
  if (data.sunset) {
    const sunsetTime = new Date(data.sunset).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    extraDetails += `<span>🌇 Sunset: ${sunsetTime}</span>`;
  }
  
  const html = `
    <div class="current-weather">
      <div class="weather-icon">${icon}</div>
      <h2>${locationDisplay}</h2>
      <div class="temp">${convertTemp(data.temp)}${getUnit()}</div>
      <div class="condition">${data.condition}</div>
      <div class="details">
        <span>💨 Wind: ${data.wind} km/h</span>
        ${extraDetails}
      </div>
      <div class="last-updated">Last updated: ${fetchedAt}</div>
      <button id="addFavBtn" class="add-favorite-btn" onclick="addFavorite()" ${isFavorite ? 'disabled' : ''}>
        ${isFavorite ? '★ Saved' : '☆ Add to Favorites'}
      </button>
    </div>
  `;
  document.getElementById('weatherResult').innerHTML = html;
  
  // Show alerts
  displayAlerts(data);
  
  // Show more button and store data
  showMoreButton(data);
  
  // Show map
  showMap(data.lat, data.lon, data.name, data.temp, data.condition);
}

let currentMoreData = null;
let moreDetailsVisible = false;

function showMoreButton(data) {
  currentMoreData = data;
  moreDetailsVisible = false;
  const moreBtn = document.getElementById('moreBtn');
  const moreDetails = document.getElementById('moreDetails');
  if (moreBtn) {
    moreBtn.style.display = 'block';
    moreBtn.textContent = 'More Details ▼';
  }
  if (moreDetails) {
    moreDetails.style.display = 'none';
  }
}

function toggleMoreDetails() {
  const moreBtn = document.getElementById('moreBtn');
  const moreDetails = document.getElementById('moreDetails');
  
  if (!moreDetails || !currentMoreData) return;
  
  moreDetailsVisible = !moreDetailsVisible;
  
  if (moreDetailsVisible) {
    moreDetails.style.display = 'block';
    moreBtn.textContent = 'Less Details ▲';
    renderMoreDetails(currentMoreData);
  } else {
    moreDetails.style.display = 'none';
    moreBtn.textContent = 'More Details ▼';
  }
}

function getAQILevel(aqi) {
  if (aqi <= 20) return { text: 'Good', color: '#10b981' };
  if (aqi <= 40) return { text: 'Fair', color: '#84cc16' };
  if (aqi <= 60) return { text: 'Moderate', color: '#f59e0b' };
  if (aqi <= 80) return { text: 'Poor', color: '#f97316' };
  if (aqi <= 100) return { text: 'Very Poor', color: '#ef4444' };
  return { text: 'Extremely Poor', color: '#7f1d1d' };
}

function renderMoreDetails(data) {
  const container = document.getElementById('moreDetails');
  if (!container) return;
  
  // Convert wind direction degrees to compass direction
  function getWindDirection(degrees) {
    if (degrees === null || degrees === undefined) return 'N/A';
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(degrees / 22.5) % 16;
    return directions[index];
  }
  
  // Format visibility
  function formatVisibility(meters) {
    if (meters === null || meters === undefined) return 'N/A';
    if (meters >= 1000) {
      return (meters / 1000).toFixed(1) + ' km';
    }
    return Math.round(meters) + ' m';
  }
  
  const details = [];
  
  if (data.windDirection !== null && data.windDirection !== undefined) {
    details.push({ icon: '🧭', label: 'Wind Direction', value: getWindDirection(data.windDirection) + ' (' + Math.round(data.windDirection) + '°)' });
  }
  
  if (data.precipitation !== null && data.precipitation !== undefined) {
    details.push({ icon: '🌧️', label: 'Precipitation', value: data.precipitation + ' mm' });
  }
  
  if (data.pressure !== null && data.pressure !== undefined) {
    details.push({ icon: '📊', label: 'Pressure', value: Math.round(data.pressure) + ' hPa' });
  }
  
  if (data.cloudCover !== null && data.cloudCover !== undefined) {
    details.push({ icon: '☁️', label: 'Cloud Cover', value: Math.round(data.cloudCover) + '%' });
  }
  
  if (data.visibility !== null && data.visibility !== undefined) {
    details.push({ icon: '👁️', label: 'Visibility', value: formatVisibility(data.visibility) });
  }
  
  // Air Quality
  if (data.aqi !== null && data.aqi !== undefined) {
    const aqiLevel = getAQILevel(data.aqi);
    details.push({ icon: '🌬️', label: 'Air Quality', value: `${data.aqi} - ${aqiLevel.text}`, color: aqiLevel.color });
  }
  
  if (data.pm10 !== null && data.pm10 !== undefined) {
    details.push({ icon: '🏭', label: 'PM10', value: Math.round(data.pm10) + ' μg/m³' });
  }
  
  if (data.pm25 !== null && data.pm25 !== undefined) {
    details.push({ icon: '😷', label: 'PM2.5', value: Math.round(data.pm25) + ' μg/m³' });
  }
  
  if (data.ozone !== null && data.ozone !== undefined) {
    details.push({ icon: '🌫️', label: 'Ozone', value: Math.round(data.ozone) + ' μg/m³' });
  }
  
  const html = `
    <div class="more-details-grid">
      ${details.map(d => `
        <div class="more-detail-card" style="${d.color ? 'border-left: 4px solid ' + d.color : ''}">
          <span class="detail-icon">${d.icon}</span>
          <span class="detail-label">${d.label}</span>
          <span class="detail-value" style="${d.color ? 'color: ' + d.color : ''}">${d.value}</span>
        </div>
      `).join('')}
    </div>
  `;
  
  container.innerHTML = html;
}

function displayAlerts(data) {
  const alerts = [];
  
  // Temperature alerts
  if (data.temp > 35) {
    alerts.push({ type: 'heat', icon: '🔥', message: 'Heat wave! Stay hydrated and avoid direct sun.', color: '#ef4444' });
  } else if (data.temp < 0) {
    alerts.push({ type: 'cold', icon: '❄️', message: 'Freezing temperatures! Wear warm clothing.', color: '#3b82f6' });
  }
  
  // Rain alert
  if (data.condition && (data.condition.includes('rain') || data.condition.includes('drizzle') || data.condition.includes('showers'))) {
    alerts.push({ type: 'rain', icon: '🌧️', message: 'Rain expected. Carry an umbrella!', color: '#3b82f6' });
  }
  
  // Storm alert
  if (data.condition && data.condition.includes('Thunder')) {
    alerts.push({ type: 'storm', icon: '⛈️', message: 'Thunderstorm! Stay indoors if possible.', color: '#7c3aed' });
  }
  
  // UV alert
  if (data.uvIndex && data.uvIndex > 7) {
    alerts.push({ type: 'uv', icon: '☀️', message: 'High UV index! Wear sunscreen and sunglasses.', color: '#f59e0b' });
  }
  
  // Wind alert
  if (data.wind && data.wind > 50) {
    alerts.push({ type: 'wind', icon: '💨', message: 'Strong winds! Secure loose objects.', color: '#64748b' });
  }
  
  // Snow alert
  if (data.condition && data.condition.includes('snow')) {
    alerts.push({ type: 'snow', icon: '🌨️', message: 'Snow expected! Drive carefully.', color: '#60a5fa' });
  }
  
  // Fog alert
  if (data.condition && data.condition.includes('Fog')) {
    alerts.push({ type: 'fog', icon: '🌫️', message: 'Foggy conditions! Drive with caution.', color: '#9ca3af' });
  }
  
  const container = document.getElementById('weatherAlerts');
  if (!container) return;
  
  if (alerts.length === 0) {
    container.innerHTML = '';
    return;
  }
  
  const html = `
    <div class="alerts-container">
      <h3>⚠️ Weather Alerts</h3>
      ${alerts.map(alert => `
        <div class="alert-card" style="border-left: 4px solid ${alert.color}">
          <span class="alert-icon">${alert.icon}</span>
          <span class="alert-message">${alert.message}</span>
        </div>
      `).join('')}
    </div>
  `;
  
  container.innerHTML = html;
}

function showMap(lat, lon, cityName, temp, condition) {
  if (!lat || !lon) return;
  
  // Use dark themed tiles
  const darkTiles = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  const lightTiles = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
  const tileUrl = isDark ? darkTiles : lightTiles;
  
  if (!map) {
    map = L.map('map').setView([lat, lon], 10);
    L.tileLayer(tileUrl, {
      attribution: '©OpenStreetMap, ©CartoDB',
      maxZoom: 19
    }).addTo(map);
  } else {
    map.setView([lat, lon], 10);
    // Update tile layer if theme changed
    map.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) {
        layer.setUrl(tileUrl);
      }
    });
  }
  
  if (mapMarker) {
    map.removeLayer(mapMarker);
  }
  
  // Create custom popup with weather info
  const popupContent = document.createElement('div');
  popupContent.className = 'map-popup';
  popupContent.innerHTML = `
    <div style="text-align: center; min-width: 150px;">
      <div style="font-size: 16px; font-weight: bold; margin-bottom: 8px;">${cityName}</div>
      <div style="font-size: 24px; font-weight: 800; background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">${temp !== undefined ? convertTemp(temp) + getUnit() : ''}</div>
      <div style="font-size: 14px; color: #94a3b8; margin-top: 4px;">${condition || ''}</div>
    </div>
  `;
  
  mapMarker = L.marker([lat, lon])
    .addTo(map)
    .bindPopup(popupContent)
    .openPopup();
  
  // Add circle showing approximate area
  L.circle([lat, lon], {
    color: '#3b82f6',
    fillColor: '#3b82f6',
    fillOpacity: 0.1,
    radius: 5000
  }).addTo(map);
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