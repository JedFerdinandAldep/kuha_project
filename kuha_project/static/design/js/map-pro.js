// === KUHA MAP PROFESSIONAL - ADVANCED FEATURES ===
// Modular JavaScript components for enhanced functionality

// ============================================
// ROUTING SERVICE
// ============================================
class RoutingService {
    constructor() {
        this.osrmServer = 'https://router.project-osrm.org/route/v1/driving/';
        this.cache = new Map();
    }

    async getRoute(start, end, alternatives = false) {
        const cacheKey = `${start.lat},${start.lng}-${end.lat},${end.lng}-${alternatives}`;
        
        if (this.cache.has(cacheKey)) {
            console.log('Route from cache');
            return this.cache.get(cacheKey);
        }

        try {
            const url = `${this.osrmServer}${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson&alternatives=${alternatives}&steps=true`;
            
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.code !== 'Ok' || !data.routes.length) {
                throw new Error('No route found');
            }
            
            const result = {
                routes: data.routes.map(route => ({
                    geometry: route.geometry,
                    distance: route.distance,
                    duration: route.duration,
                    legs: route.legs,
                    instructions: this.extractInstructions(route),
                    bbox: this.calculateBbox(route.geometry.coordinates)
                })),
                waypoints: data.waypoints
            };
            
            this.cache.set(cacheKey, result);
            return result;
        } catch (error) {
            console.error('Routing error:', error);
            throw error;
        }
    }

    extractInstructions(route) {
        const instructions = [];
        route.legs.forEach(leg => {
            leg.steps.forEach(step => {
                instructions.push({
                    text: step.maneuver.instruction,
                    distance: step.distance,
                    duration: step.duration,
                    type: step.maneuver.type,
                    modifier: step.maneuver.modifier,
                    name: step.name,
                    coordinates: step.geometry ? step.geometry.coordinates[0] : null
                });
            });
        });
        return instructions;
    }

    calculateBbox(coordinates) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        coordinates.forEach(([lng, lat]) => {
            minX = Math.min(minX, lng);
            minY = Math.min(minY, lat);
            maxX = Math.max(maxX, lng);
            maxY = Math.max(maxY, lat);
        });
        return [[minX, minY], [maxX, maxY]];
    }

    async calculateMultiStopRoute(waypoints) {
        if (waypoints.length < 2) {
            throw new Error('At least 2 waypoints required');
        }

        const coords = waypoints.map(wp => `${wp.lng},${wp.lat}`).join(';');
        const url = `${this.osrmServer}${coords}?overview=full&geometries=geojson&steps=true`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.code !== 'Ok') {
            throw new Error('Route calculation failed');
        }

        return {
            routes: data.routes.map(route => ({
                geometry: route.geometry,
                distance: route.distance,
                duration: route.duration,
                waypoints: waypoints
            }))
        };
    }
}

// ============================================
// SEARCH SERVICE
// ============================================
class SearchService {
    constructor() {
        this.debounceTimer = null;
        this.nominatimUrl = 'https://nominatim.openstreetmap.org/search';
        this.recentSearches = JSON.parse(localStorage.getItem('kuha_recent_searches') || '[]');
        this.favorites = JSON.parse(localStorage.getItem('kuha_favorites') || '[]');
    }

    async search(query, limit = 5) {
        try {
            const params = new URLSearchParams({
                format: 'json',
                q: query + ', Philippines',
                limit: limit
            });

            const response = await fetch(`${this.nominatimUrl}?${params}`, {
                headers: {
                    'User-Agent': 'KUHA/1.0',
                    'Accept-Language': 'en'
                }
            });

            return await response.json();
        } catch (error) {
            console.error('Search error:', error);
            return [];
        }
    }

    debounce(func, delay) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(func, delay);
    }

    async searchWithDebounce(query, callback) {
        if (query.length < 3) {
            callback([]);
            return;
        }

        this.debounce(async () => {
            const results = await this.search(query);
            callback(results);
        }, 300);
    }

    addToRecent(location) {
        const existing = this.recentSearches.findIndex(r => 
            r.lat === location.lat && r.lng === location.lng
        );

        if (existing > -1) {
            this.recentSearches.splice(existing, 1);
        }

        this.recentSearches.unshift({
            name: location.name,
            lat: location.lat,
            lng: location.lng,
            timestamp: Date.now(),
            type: 'recent'
        });

        if (this.recentSearches.length > 10) {
            this.recentSearches.pop();
        }

        localStorage.setItem('kuha_recent_searches', JSON.stringify(this.recentSearches));
    }

    toggleFavorite(location) {
        const existing = this.favorites.findIndex(f => 
            f.lat === location.lat && f.lng === location.lng
        );

        if (existing > -1) {
            this.favorites.splice(existing, 1);
            localStorage.setItem('kuha_favorites', JSON.stringify(this.favorites));
            return false;
        } else {
            this.favorites.unshift({
                ...location,
                timestamp: Date.now(),
                type: 'favorite'
            });
            localStorage.setItem('kuha_favorites', JSON.stringify(this.favorites));
            return true;
        }
    }

    getRecentSearches() {
        return this.recentSearches;
    }

    getFavorites() {
        return this.favorites;
    }

    async reverseGeocode(lat, lng) {
        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
            );
            return await response.json();
        } catch (error) {
            console.error('Reverse geocode error:', error);
            return null;
        }
    }
}

// ============================================
// MARKER FACTORY
// ============================================
class MarkerFactory {
    static createCustomIcon(type, options = {}) {
        const config = {
            farmer: { color: '#34a853', icon: 'fa-tractor' },
            driver: { color: '#1a73e8', icon: 'fa-truck' },
            pickup: { color: '#f9ab00', icon: 'fa-box' },
            delivery: { color: '#ea4335', icon: 'fa-flag-checkered' },
            user: { color: 'linear-gradient(135deg, #1a73e8, #34a853)', icon: 'fa-star' }
        };

        const { color, icon } = config[type] || config.pickup;

        return L.divIcon({
            className: `custom-marker marker-${type}`,
            html: `
                <div class="marker-pin" style="background: ${color}">
                    <i class="fas ${icon}"></i>
                </div>
                <div class="marker-shadow"></div>
            `,
            iconSize: [40, 50],
            iconAnchor: [20, 50],
            popupAnchor: [0, -45]
        });
    }

    static createAnimatedMarker(latlng, type) {
        const icon = this.createCustomIcon(type);
        const marker = L.marker(latlng, { icon: icon });

        marker.on('add', () => {
            if (marker._icon) {
                marker._icon.style.animation = 'bounce 0.5s ease';
            }
        });

        return marker;
    }

    static createPulsingMarker(latlng, type) {
        const icon = L.divIcon({
            className: 'pulsing-marker',
            html: `
                <div class="marker-pin" style="background: #ea4335">
                    <i class="fas fa-circle"></i>
                </div>
            `,
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        });

        return L.marker(latlng, { icon: icon });
    }

    static createClusterIcon(cluster) {
        const count = cluster.getChildCount();
        const size = count < 10 ? 'small' : count < 100 ? 'medium' : 'large';

        return L.divIcon({
            html: `<div><span>${count}</span></div>`,
            className: `marker-cluster ${size}`,
            iconSize: { x: 40, y: 40 },
            iconAnchor: { x: 20, y: 20 }
        });
    }
}

// ============================================
// HEATMAP MANAGER
// ============================================
class HeatmapManager {
    constructor(map) {
        this.map = map;
        this.heatLayer = null;
        this.data = [];
    }

    setData(points) {
        this.data = points.map(p => [p.lat, p.lng, p.intensity || 0.8]);
        return this;
    }

    render(options = {}) {
        const config = {
            radius: options.radius || 25,
            blur: options.blur || 15,
            maxZoom: options.maxZoom || 15,
            gradient: options.gradient || {
                0.4: '#1a73e8',
                0.6: '#34a853',
                0.8: '#f9ab00',
                1.0: '#ea4335'
            },
            minOpacity: options.minOpacity || 0.4
        };

        if (this.heatLayer) {
            this.map.removeLayer(this.heatLayer);
        }

        this.heatLayer = L.heatLayer(this.data, config);
        return this;
    }

    addToMap() {
        if (this.heatLayer) {
            this.heatLayer.addTo(this.map);
        }
        return this;
    }

    removeFromMap() {
        if (this.heatLayer && this.map.hasLayer(this.heatLayer)) {
            this.map.removeLayer(this.heatLayer);
        }
        return this;
    }

    toggle() {
        if (this.map.hasLayer(this.heatLayer)) {
            this.removeFromMap();
            return false;
        } else {
            this.addToMap();
            return true;
        }
    }

    updateIntensity(lat, lng, intensity) {
        const index = this.data.findIndex(p => p[0] === lat && p[1] === lng);
        if (index > -1) {
            this.data[index][2] = intensity;
            this.render().addToMap();
        }
    }
}

// ============================================
// ANALYTICS SERVICE
// ============================================
class AnalyticsService {
    constructor() {
        this.cache = new Map();
        this.cacheTimeout = 300000;
    }

    async fetchAnalytics() {
        if (this.cache.has('analytics')) {
            const { data, timestamp } = this.cache.get('analytics');
            if (Date.now() - timestamp < this.cacheTimeout) {
                return data;
            }
        }

        try {
            const response = await fetch('/api/analytics');
            const data = await response.json();
            
            this.cache.set('analytics', {
                data,
                timestamp: Date.now()
            });

            return data;
        } catch (error) {
            console.error('Analytics error:', error);
            return null;
        }
    }

    async fetchTrends() {
        try {
            const response = await fetch('/api/stats/trends');
            return await response.json();
        } catch (error) {
            console.error('Trends error:', error);
            return null;
        }
    }

    createChartConfig(type, data, options = {}) {
        const baseConfig = {
            type: type,
            data: data,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: options.showLegend !== false
                    },
                    tooltip: {
                        enabled: options.showTooltips !== false
                    }
                },
                scales: {
                    x: {
                        display: options.showXAxis !== false,
                        grid: {
                            display: false
                        }
                    },
                    y: {
                        display: options.showYAxis !== false,
                        beginAtZero: true
                    }
                }
            }
        };

        return baseConfig;
    }

    async renderChart(canvasId, type, data) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return null;

        const ctx = canvas.getContext('2d');
        
        if (window[canvasId + 'Chart']) {
            window[canvasId + 'Chart'].destroy();
        }

        const chart = new Chart(ctx, {
            type: type,
            data: data,
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });

        window[canvasId + 'Chart'] = chart;
        return chart;
    }
}

// ============================================
// NOTIFICATION SERVICE
// ============================================
class NotificationService {
    constructor() {
        this.container = null;
        this.toasts = [];
    }

    init(containerId = 'toastContainer') {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.id = 'toastContainer';
            this.container.className = 'toast-container';
            document.body.appendChild(this.container);
        }
    }

    show(message, type = 'info', duration = 3000) {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icons = {
            success: 'check-circle',
            error: 'exclamation-circle',
            warning: 'exclamation-triangle',
            info: 'info-circle'
        };

        toast.innerHTML = `
            <i class="fas fa-${icons[type] || icons.info}"></i>
            <span>${message}</span>
        `;

        this.container.appendChild(toast);
        this.toasts.push(toast);

        setTimeout(() => {
            this.dismiss(toast);
        }, duration);
    }

    dismiss(toast) {
        if (!toast) return;
        
        toast.style.animation = 'slideInRight 0.3s ease reverse';
        setTimeout(() => {
            toast.remove();
            this.toasts = this.toasts.filter(t => t !== toast);
        }, 300);
    }

    dismissAll() {
        this.toasts.forEach(toast => this.dismiss(toast));
    }

    success(message) {
        this.show(message, 'success');
    }

    error(message) {
        this.show(message, 'error');
    }

    warning(message) {
        this.show(message, 'warning');
    }

    info(message) {
        this.show(message, 'info');
    }
}

// ============================================
// STORAGE SERVICE
// ============================================
class StorageService {
    constructor(prefix = 'kuha_') {
        this.prefix = prefix;
    }

    getKey(key) {
        return `${this.prefix}${key}`;
    }

    get(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(this.getKey(key));
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            console.error('Storage get error:', error);
            return defaultValue;
        }
    }

    set(key, value) {
        try {
            localStorage.setItem(this.getKey(key), JSON.stringify(value));
            return true;
        } catch (error) {
            console.error('Storage set error:', error);
            return false;
        }
    }

    remove(key) {
        try {
            localStorage.removeItem(this.getKey(key));
            return true;
        } catch (error) {
            console.error('Storage remove error:', error);
            return false;
        }
    }

    clear() {
        try {
            const keys = Object.keys(localStorage).filter(k => k.startsWith(this.prefix));
            keys.forEach(k => localStorage.removeItem(k));
            return true;
        } catch (error) {
            console.error('Storage clear error:', error);
            return false;
        }
    }

    getAll() {
        try {
            const result = {};
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith(this.prefix)) {
                    result[key.replace(this.prefix, '')] = JSON.parse(localStorage.getItem(key));
                }
            }
            return result;
        } catch (error) {
            console.error('Storage getAll error:', error);
            return {};
        }
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
const Utils = {
    formatDistance(meters) {
        if (meters >= 1000) {
            return `${(meters / 1000).toFixed(1)} km`;
        }
        return `${Math.round(meters)} m`;
    },

    formatDuration(seconds) {
        const minutes = Math.round(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;

        if (hours > 0) {
            return `${hours}h ${mins}m`;
        }
        return `${mins} min`;
    },

    formatNumber(num) {
        return new Intl.NumberFormat().format(num);
    },

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    calculateCenter(bounds) {
        const lat = (bounds[0][0] + bounds[1][0]) / 2;
        const lng = (bounds[0][1] + bounds[1][1]) / 2;
        return [lat, lng];
    },

    getColorByStatus(status) {
        const colors = {
            'Pending': '#f9ab00',
            'Accepted': '#34a853',
            'Active': '#1a73e8',
            'Completed': '#5f6368'
        };
        return colors[status] || colors['Pending'];
    },

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    isEmpty(obj) {
        return Object.keys(obj).length === 0;
    },

    deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }
};

// ============================================
// EXPORT GLOBAL INSTANCES
// ============================================
window.KUHA = window.KUHA || {};
Object.assign(window.KUHA, {
    RoutingService,
    SearchService,
    MarkerFactory,
    HeatmapManager,
    AnalyticsService,
    NotificationService,
    StorageService,
    Utils
});

// Initialize default instances
window.kuhaNotifications = new NotificationService();
window.kuhaStorage = new StorageService();
window.kuhaAnalytics = new AnalyticsService();

console.log('KUHA Map Pro modules loaded successfully!');
