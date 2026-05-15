/**
 * KUHA Shared Utilities
 * Common functions used across the application
 */

// === API CONFIGURATION ===
const API_BASE = '';
let JWT_TOKEN = localStorage.getItem('kuha_jwt_token');

// === JWT TOKEN MANAGEMENT ===
function setToken(token) {
    JWT_TOKEN = token;
    localStorage.setItem('kuha_jwt_token', token);
}

function getToken() {
    return JWT_TOKEN || localStorage.getItem('kuha_jwt_token');
}

function removeToken() {
    JWT_TOKEN = null;
    localStorage.removeItem('kuha_jwt_token');
}

function isAuthenticated() {
    return !!getToken();
}

// === API CALL WITH JWT AUTH ===
async function apiCall(endpoint, method = 'GET', data = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json'
        }
    };
    
    // Add JWT token if available
    const token = getToken();
    if (token && !endpoint.includes('/login') && !endpoint.includes('/register')) {
        options.headers['Authorization'] = `Bearer ${token}`;
    }
    
    if (data) {
        options.body = JSON.stringify(data);
    }
    
    try {
        const response = await fetch(API_BASE + endpoint, options);
        
        // Check if response is HTML (error page) instead of JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error('Non-JSON response:', text);
            throw new Error('Server error: ' + response.status);
        }
        
        const result = await response.json();
        
        if (!response.ok) {
            if (response.status === 401) {
                removeToken();
                showToast('Session expired. Please login again.', 'warning');
                setTimeout(() => showSection('login'), 1000);
            }
            throw new Error(result.error || 'API request failed');
        }
        
        // Store new token if returned
        if (result.token) {
            setToken(result.token);
        }
        
        return result;
    } catch (error) {
        console.error('API Error:', error);
        // Provide more helpful error message
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            throw new Error('Cannot connect to server. Is Flask running?');
        }
        throw error;
    }
}

// === DISTANCE CALCULATION ===
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function toRad(degrees) {
    return degrees * Math.PI / 180;
}

// === ETA CALCULATION ===
function calculateETA(lat1, lon1, lat2, lon2) {
    const distance = calculateDistance(lat1, lon1, lat2, lon2);
    const avgSpeed = 40; // km/h for delivery vehicles
    const hours = distance / avgSpeed;
    return Math.round(hours * 60); // minutes
}

// === TOAST NOTIFICATIONS ===
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) {
        console.log(`Toast [${type}]: ${message}`);
        return;
    }
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="fas fa-${getToastIcon(type)}"></i>
        <span>${message}</span>
    `;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function getToastIcon(type) {
    const icons = {
        success: 'check-circle',
        error: 'exclamation-circle',
        warning: 'exclamation-triangle',
        info: 'info-circle'
    };
    return icons[type] || icons.info;
}

// === STORAGE HELPERS ===
const StorageKeys = {
    JOBS: 'kuha_jobs_v4',
    USERS: 'kuha_users_v4',
    ACTIVITY: 'kuha_activity_v4',
    NOTIFICATIONS: 'kuha_notifications_v4',
    STATS_HISTORY: 'kuha_stats_history_v4',
    RECENT_SEARCHES: 'kuha_recent_searches',
    FAVORITES: 'kuha_favorites'
};

function getStorage(key, defaultValue = null) {
    try {
        const item = localStorage.getItem(StorageKeys[key] || key);
        return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
        console.error('Storage get error:', error);
        return defaultValue;
    }
}

function setStorage(key, value) {
    try {
        const storageKey = StorageKeys[key] || key;
        localStorage.setItem(storageKey, JSON.stringify(value));
        return true;
    } catch (error) {
        console.error('Storage set error:', error);
        return false;
    }
}

function removeStorage(key) {
    try {
        const storageKey = StorageKeys[key] || key;
        localStorage.removeItem(storageKey);
        return true;
    } catch (error) {
        console.error('Storage remove error:', error);
        return false;
    }
}

// === JOB DATA HELPERS ===
function getJobs() {
    return getStorage('JOBS', []);
}

function saveJobs(jobs) {
    setStorage('JOBS', jobs);
    saveStatsSnapshot(jobs, getUsers());
}

// === USER DATA HELPERS ===
function getUsers() {
    return getStorage('USERS', []);
}

function saveUsers(users) {
    setStorage('USERS', users);
    saveStatsSnapshot(getJobs(), users);
}

// === ACTIVITY LOG HELPERS ===
function getActivity() {
    return getStorage('ACTIVITY', []);
}

function saveActivity(activity) {
    setStorage('ACTIVITY', activity);
}

// === NOTIFICATION HELPERS ===
function getNotifications() {
    return getStorage('NOTIFICATIONS', []);
}

function saveNotifications(notifications) {
    setStorage('NOTIFICATIONS', notifications);
}

// === STATS HISTORY ===
function getStatsHistory() {
    return getStorage('STATS_HISTORY', []);
}

function saveStatsSnapshot(jobs, users) {
    try {
        const snapshot = {
            date: new Date().toISOString(),
            totalJobs: jobs.length,
            pendingJobs: jobs.filter(j => j.status === 'Pending').length,
            completedJobs: jobs.filter(j => j.status === 'Accepted').length,
            totalUsers: users.length
        };
        
        const history = getStatsHistory();
        history.push(snapshot);
        
        if (history.length > 30) history.shift();
        
        setStorage('STATS_HISTORY', history);
    } catch (error) {
        console.error('Stats snapshot error:', error);
    }
}

function calculateTrend(current, previous) {
    if (previous === 0 || previous === undefined) {
        return current > 0 ? 100 : 0;
    }
    return Math.round(((current - previous) / previous) * 100);
}

function getPreviousStats() {
    const history = getStatsHistory();
    if (history.length < 2) return null;
    return history[history.length - 2];
}

// === FORMAT HELPERS ===
function formatDistance(meters) {
    if (meters >= 1000) {
        return `${(meters / 1000).toFixed(1)} km`;
    }
    return `${Math.round(meters)} m`;
}

function formatDuration(seconds) {
    const minutes = Math.round(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    
    if (hours > 0) {
        return `${hours}h ${mins}m`;
    }
    return `${mins} min`;
}

function formatNumber(num) {
    return new Intl.NumberFormat().format(num);
}

// === DEBOUNCE ===
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// === THROTTLE ===
function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// === SYNC JOBS - Unified refresh for admin and map ===
let lastJobsUpdate = 0;
const POLL_INTERVAL = 30000; // 30 seconds

async function syncJobs(showLoadingIndicator = false) {
    try {
        const response = await fetch('/api/jobs');
        if (!response.ok) throw new Error('Failed to fetch jobs');
        
        const jobs = await response.json();
        
        const userResponse = await fetch('/api/users');
        const users = userResponse.ok ? await userResponse.json() : getUsers();
        
        const oldJobs = getJobs();
        const jobIds = new Set(jobs.map(j => j.id));
        const hasChanges = oldJobs.length !== jobs.length || 
            oldJobs.some(old => !jobIds.has(old.id) || 
                old.status !== jobs.find(j => j.id === old.id)?.status);
        
        saveJobs(jobs);
        saveUsers(users);
        
        lastJobsUpdate = Date.now();
        
        if (hasChanges && typeof onJobsUpdated === 'function') {
            onJobsUpdated(jobs);
        }
        
        return { jobs, users, hasChanged: hasChanges };
    } catch (error) {
        console.error('Sync error:', error);
        return { jobs: getJobs(), users: getUsers(), hasChanged: false, error };
    }
}

function onJobsUpdated(jobs) {
    console.log('Jobs updated:', jobs.length);
    window.dispatchEvent(new CustomEvent('kuha-jobs-updated', { detail: { jobs } }));
}

function startPeriodicSync(callback, interval = POLL_INTERVAL) {
    return setInterval(async () => {
        const result = await syncJobs();
        if (callback && result.hasChanged) {
            callback(result);
        }
    }, interval);
}

document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        syncJobs().then(result => {
            if (result.hasChanged) {
                showToast('Data updated!', 'info');
            }
        });
    }
});

window.addEventListener('storage', (e) => {
    if (e.key === 'kuha_jobs_v4' || e.key === 'kuha_users_v4') {
        if (typeof onJobsUpdated === 'function') {
            const jobs = getJobs();
            onJobsUpdated(jobs);
        }
    }
});

// === EXPORT FOR USE IN OTHER FILES ===
const utilsExports = {
    apiCall,
    setToken,
    getToken,
    removeToken,
    isAuthenticated,
    calculateDistance,
    calculateETA,
    showToast,
    getStorage,
    setStorage,
    removeStorage,
    getJobs,
    saveJobs,
    getUsers,
    saveUsers,
    getActivity,
    saveActivity,
    getNotifications,
    saveNotifications,
    getStatsHistory,
    calculateTrend,
    getPreviousStats,
    formatDistance,
    formatDuration,
    formatNumber,
    debounce,
    throttle,
    StorageKeys,
    syncJobs,
    startPeriodicSync,
    // FIXED: Added missing exports
    getSharedStats,
    syncAcrossTabs,
    notifyDataChanged
};

function getSharedStats(jobs, users) {
    jobs = jobs || [];
    users = users || [];
    
    return {
        totalJobs: jobs.length,
        pendingJobs: jobs.filter(j => j.status === 'Pending').length,
        activeJobs: jobs.filter(j => j.status === 'Accepted').length,
        completedJobs: jobs.filter(j => j.status === 'Completed').length,
        totalUsers: users.length,
        farmers: users.filter(u => u.role === 'farmer').length,
        drivers: users.filter(u => u.role === 'driver').length,
        completionRate: jobs.length > 0 
            ? Math.round((jobs.filter(j => j.status === 'Accepted').length / jobs.length) * 100) 
            : 0,
        totalWeight: jobs.reduce((sum, j) => sum + (j.weight || 0), 0)
    };
}

function syncAcrossTabs(callback) {
    window.addEventListener('storage', (event) => {
        if (event.key === 'kuha_data_version') {
            const data = event.newValue ? JSON.parse(event.newValue) : null;
            if (data && callback && typeof callback === 'function') {
                callback(data);
            }
        }
    });
}

function notifyDataChanged(dataType) {
    const version = Date.now();
    const jobs = getJobs() || [];
    const users = getUsers() || [];
    const payload = { type: dataType, version, jobs, users };
    localStorage.setItem('kuha_data_version', JSON.stringify(payload));
}

// CRITICAL: Always merge, never replace - preserves MarkerFactory, etc. from map-pro.js
if (!window.KUHA) window.KUHA = {};
Object.assign(window.KUHA, utilsExports);

console.log('KUHA Utilities loaded successfully!');
