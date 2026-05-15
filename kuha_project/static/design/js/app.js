/**
 * KUHA Application JavaScript
 * Frontend logic with API integration
 * Uses shared utilities from utils.js
 */

// === HTML ESCAPE TO PREVENT XSS ===
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

// === REAL-TIME SOCKET CONNECTION ===
let socket;
function initSocketIO() {
    if (typeof io === 'undefined') {
        console.log('SocketIO not loaded, skipping real-time sync');
        return;
    }
    
    socket = io();
    
    socket.on('job_updated', async function(data) {
        console.log('Real-time job update:', data.action, data.job || data.job_id);
        
        try {
            const jobs = await apiCall('/api/jobs');
            const users = await apiCall('/api/users');
            
            saveJobs(jobs);
            saveUsers(users);
            
            const currentSection = document.querySelector('.app-section.active');
            const sectionId = currentSection ? currentSection.id : '';
            
            if (sectionId === 'driver') {
                await loadDriverData();
            }
            
            if (sectionId === 'admin-dashboard') {
                await renderAdminJobs();
                await loadAdminData();
            }
            
            if (sectionId === 'farmer') {
                await loadJobs();
            }
            
            if (sectionId === 'map') {
                if (typeof onJobsUpdated === 'function') {
                    onJobsUpdated(jobs);
                }
            }
            
            const isAdminLoggedIn = localStorage.getItem('adminUser') || localStorage.getItem('currentUser');
            if (isAdminLoggedIn) {
                const adminDash = document.getElementById('admin-dashboard');
                if (adminDash && adminDash.classList.contains('active')) {
                    await loadAdminData();
                    await renderAdminJobs();
                }
            }
            
            console.log('All views updated with fresh data');
        } catch (error) {
            console.error('Error refreshing data:', error);
        }
        
        showToast(`Job ${data.action}: ${data.job?.crop || '#' + data.job_id}`, 'info');
    });
    
    socket.on('connect', function() {
        console.log('SocketIO connected');
    });
    
    socket.on('disconnect', function() {
        console.log('SocketIO disconnected - attempting reconnect');
    });
    
    socket.on('connect_error', function(error) {
        console.error('SocketIO connection error:', error);
    });
    
    console.log('SocketIO connected for real-time sync');
}

// === NAVIGATION LOGIC ===
function showSection(id) {
    const marketingView = document.getElementById('marketing-view');
    if (marketingView) marketingView.style.display = 'none';
    
    document.querySelectorAll('.app-section').forEach(s => s.classList.remove('active'));
    
    const navLinks = document.querySelector('.nav-links');
    if (navLinks) {
        navLinks.classList.remove('active');
        const mobileIcon = document.querySelector('.mobile-toggle i');
        if(mobileIcon) {
            mobileIcon.classList.remove('fa-times');
            mobileIcon.classList.add('fa-bars');
        }
    }

    if (id === 'home') {
        if (marketingView) marketingView.style.display = 'block';
        window.scrollTo(0,0);
    } else {
        const section = document.getElementById(id);
        if (section) {
            section.classList.add('active');
            window.scrollTo(0,0);
            if(id === 'driver') loadDriverData();
            if(id === 'farmer') loadJobs();
            if(id === 'admin-dashboard') loadAdminData();
        }
    }
}

// === AUTH LOGIC ===
async function handleRegister(e) {
    e.preventDefault();
    const name = document.getElementById('registerName').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const phone = document.getElementById('registerPhone').value;
    const role = document.getElementById('registerRole').value;
    
    try {
        const result = await apiCall('/api/register', 'POST', {
            name, email, password, role, phone
        });
        
        localStorage.setItem('currentUser', JSON.stringify(result.user));
        if (result.token) {
            setToken(result.token);
        }
        showToast('Account created successfully!', 'success');
        showSection('login');
    } catch (error) {
        showToast(error.message || 'Registration failed', 'error');
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        const result = await apiCall('/api/login', 'POST', {
            email: email,
            password: password
        });
        
        localStorage.setItem('currentUser', JSON.stringify(result.user));
        localStorage.setItem('token', result.token);
        if (result.user && result.user.role === 'driver') {
            localStorage.setItem('driverUser', 'true');
            localStorage.setItem('driverName', result.user.name);
        }
        if (result.user && result.user.role === 'admin') {
            localStorage.setItem('adminUser', 'true');
        }
        if (result.token) {
            setToken(result.token);
        }
        showToast(`Welcome back, ${escapeHtml(result.user.name)}!`, 'success');
        
        // Route to correct dashboard based on detected role
        if (result.user.role === 'admin') {
            window.location.href = '/admin';
        } else if (result.user.role === 'driver') {
            showSection('driver');
        } else if (result.user.role === 'farmer') {
            showSection('farmer');
        }
    } catch (error) {
        showToast(error.message || 'Invalid credentials!', 'error');
    }
}

async function handleAdminLogin(e) {
    e.preventDefault();
    const username = document.getElementById('adminUsername').value;
    const password = document.getElementById('adminPassword').value;
    
    console.log('Attempting admin login with:', username);
    
    try {
        const result = await apiCall('/api/login', 'POST', {
            email: username.indexOf('@') > 0 ? username : username + '@gmail.com',
            password: password
        });
        
        console.log('Login result:', result);
        
        if (result.user && result.user.role === 'admin') {
            localStorage.setItem('adminUser', 'true');
            localStorage.setItem('currentUser', JSON.stringify(result.user));
            setToken(result.token);
            showSection('admin-dashboard');
            showToast('Welcome, Admin!', 'success');
        }
    } catch (error) {
        console.error('Login error:', error);
        showToast('Login failed: ' + error.message, 'error');
    }
}

// ============ DRIVER DASHBOARD FUNCTIONS ============
let currentDriverName = null;

function handleDriverLogout() {
    localStorage.removeItem('driverUser');
    localStorage.removeItem('currentUser');
    currentDriverName = null;
    showSection('home');
    showToast('Logged out successfully', 'success');
}

function showDriverTab(tab) {
    // Hide all sections
    document.getElementById('driverAvailableSection').style.display = 'none';
    document.getElementById('driverMyJobsSection').style.display = 'none';
    document.getElementById('driverHistorySection').style.display = 'none';
    
    // Remove active class from all tabs
    document.getElementById('driverTabAvailable').classList.remove('active');
    document.getElementById('driverTabMyJobs').classList.remove('active');
    document.getElementById('driverTabHistory').classList.remove('active');
    
    // Show selected section using direct mapping
    if (tab === 'available') {
        document.getElementById('driverAvailableSection').style.display = 'block';
        document.getElementById('driverTabAvailable').classList.add('active');
    } else if (tab === 'myjobs') {
        document.getElementById('driverMyJobsSection').style.display = 'block';
        document.getElementById('driverTabMyJobs').classList.add('active');
    } else if (tab === 'history') {
        document.getElementById('driverHistorySection').style.display = 'block';
        document.getElementById('driverTabHistory').classList.add('active');
    }
}

function getCurrentUser() {
    const userStr = localStorage.getItem('currentUser');
    if (!userStr) return null;
    try {
        return JSON.parse(userStr);
    } catch {
        return null;
    }
}

async function loadDriverData() {
    console.log('Loading driver data...');
    
    const currentUser = getCurrentUser();
    console.log('Current user:', currentUser);
    
    if (!currentUser) {
        console.error('No current user found!');
        showToast('Please login first', 'error');
        return;
    }
    
    currentDriverName = currentUser.name;
    console.log('Driver name:', currentDriverName);
    
    try {
        console.log('Fetching jobs from API...');
        const jobs = await apiCall('/api/jobs');
        console.log('Jobs received:', jobs ? jobs.length : 0);
        
        if (!jobs || jobs.length === 0) {
            console.log('No jobs in database');
            renderDriverAvailableJobs([]);
            renderDriverMyJobs([]);
            renderDriverHistory([]);
            return;
        }
        
        // Available jobs (Pending)
        const availableJobs = jobs.filter(j => j.status === 'Pending');
        console.log('Available jobs (Pending):', availableJobs.length);
        renderDriverAvailableJobs(availableJobs);
        
        // My jobs (Accepted, Picked Up, In Transit)
        const myJobs = jobs.filter(j => j.driver_name && j.driver_name.toLowerCase() === currentDriverName.toLowerCase() && 
                            j.status !== 'Delivered');
        console.log('My jobs:', myJobs.length);
        renderDriverMyJobs(myJobs);
        
        // History (Delivered)
        const historyJobs = jobs.filter(j => j.driver_name && j.driver_name.toLowerCase() === currentDriverName.toLowerCase() && 
                                   j.status === 'Delivered');
        console.log('History jobs:', historyJobs.length);
        renderDriverHistory(historyJobs);
        
    } catch (error) {
        console.error('Load driver data error:', error);
        showToast('Failed to load jobs: ' + error.message, 'error');
    }
}

function renderDriverAvailableJobs(jobs) {
    const container = document.getElementById('driverAvailableList');
    if (!container) return;
    
    if (!jobs || jobs.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:var(--text-muted);">No available jobs</p>';
        return;
    }
    
    const totalAmount = jobs.reduce((sum, job) => sum + (parseFloat(job.fare) || 0), 0);
    const formattedTotal = '₱' + totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    
    container.innerHTML = `
        <div class="driver-job-card" style="background: linear-gradient(135deg, var(--success) 0%, #2d8a4e 100%); color: white; margin-bottom: 1rem;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-weight:bold;"><i class="fas fa-wallet"></i> Total Available</span>
                <span style="font-size:1.3rem; font-weight:bold;">${formattedTotal}</span>
            </div>
        </div>
    ` + jobs.map(job => `
        <div class="driver-job-card">
            <div class="job-header">
                <span class="job-title">${escapeHtml(job.crop)}</span>
                <span class="job-status ${job.status}">${job.status}</span>
            </div>
            <div class="job-details">
                <span><i class="fas fa-weight-hanging"></i> ${job.weight}kg</span>
                <span><i class="fas fa-map-marker"></i> ${escapeHtml(job.location)}</span>
                <span><i class="fas fa-flag"></i> ${escapeHtml(job.destination)}</span>
                <span style="color:var(--success); font-weight:bold;">₱${parseFloat(job.fare || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <button class="btn btn-primary" onclick="acceptJobDriver(${job.id})" style="width:100%;">
                <i class="fas fa-check"></i> Accept Job
            </button>
        </div>
    `).join('');
}

function renderDriverMyJobs(jobs) {
    const container = document.getElementById('driverMyJobsList');
    if (!container) return;
    
    if (!jobs || jobs.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:var(--text-muted);">No active jobs</p>';
        return;
    }
    
    const totalAmount = jobs.reduce((sum, job) => sum + (parseFloat(job.fare) || 0), 0);
    const formattedTotal = '₱' + totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    
    container.innerHTML = `
        <div class="driver-job-card" style="background: linear-gradient(135deg, var(--primary) 0%, #1a5c8a 100%); color: white; margin-bottom: 1rem;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-weight:bold;"><i class="fas fa-briefcase"></i> Total Active Earnings</span>
                <span style="font-size:1.3rem; font-weight:bold;">${formattedTotal}</span>
            </div>
        </div>
    ` + jobs.map(job => `
        <div class="driver-job-card">
            <div class="job-header">
                <span class="job-title">${escapeHtml(job.crop)} - #${job.id}</span>
                <span class="job-status ${job.status === 'Picked Up' ? 'Picked' : job.status === 'In Transit' ? 'In' : 'Accepted'}">${job.status}</span>
            </div>
            <div class="job-details">
                <span><i class="fas fa-weight-hanging"></i> ${job.weight}kg</span>
                <span><i class="fas fa-map-marker"></i> ${escapeHtml(job.location)}</span>
                <span><i class="fas fa-flag"></i> ${escapeHtml(job.destination)}</span>
                <span style="color:var(--success); font-weight:bold;">₱${parseFloat(job.fare || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div class="driver-status-buttons">
                ${job.status === 'Accepted' ? `
                    <button class="btn btn-picked" onclick="updateDriverJobStatus(${job.id}, 'Picked Up')">
                        <i class="fas fa-box"></i> Picked Up
                    </button>
                ` : ''}
                ${job.status === 'Picked Up' ? `
                    <button class="btn btn-transit" onclick="updateDriverJobStatus(${job.id}, 'In Transit')">
                        <i class="fas fa-truck"></i> In Transit
                    </button>
                ` : ''}
                ${job.status === 'In Transit' ? `
                    <button class="btn btn-delivered" onclick="updateDriverJobStatus(${job.id}, 'Delivered')">
                        <i class="fas fa-check-circle"></i> Delivered
                    </button>
                ` : ''}
            </div>
        </div>
    `).join('');
}

function renderDriverHistory(jobs) {
    const container = document.getElementById('driverHistoryList');
    if (!container) return;
    
    if (!jobs || jobs.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:var(--text-muted);">No completed jobs</p>';
        return;
    }
    
    const totalAmount = jobs.reduce((sum, job) => sum + (parseFloat(job.fare) || 0), 0);
    const formattedTotal = '₱' + totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    
    container.innerHTML = `
        <div class="driver-job-card" style="background: linear-gradient(135deg, var(--warning) 0%, #b87d00 100%); color: white; margin-bottom: 1rem;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-weight:bold;"><i class="fas fa-history"></i> Total Completed Earnings</span>
                <span style="font-size:1.3rem; font-weight:bold;">${formattedTotal}</span>
            </div>
        </div>
    ` + jobs.map(job => `
        <div class="driver-job-card" style="opacity:0.7;">
            <div class="job-header">
                <span class="job-title">${escapeHtml(job.crop)} - #${job.id}</span>
                <span class="job-status Delivered">Delivered</span>
            </div>
            <div class="job-details">
                <span><i class="fas fa-weight-hanging"></i> ${job.weight}kg</span>
                <span><i class="fas fa-route"></i> ${escapeHtml(job.location)} → ${escapeHtml(job.destination)}</span>
                <span style="color:var(--success); font-weight:bold;">₱${parseFloat(job.fare || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
        </div>
    `).join('');
}

async function acceptJobDriver(jobId) {
    const currentUser = getCurrentUser();
    if (!currentUser) {
        showToast('Please login first', 'error');
        showSection('login');
        return;
    }
    
    try {
        const result = await apiCall(`/api/jobs/${jobId}/accept`, 'PUT', {
            driver_name: currentUser.name
        });
        
        showToast('Job accepted!', 'success');
        loadDriverData();
    } catch (error) {
        showToast(error.message || 'Failed to accept job', 'error');
    }
}

async function updateDriverJobStatus(jobId, newStatus) {
    try {
        const result = await apiCall(`/api/jobs/${jobId}/status`, 'PUT', {
            status: newStatus
        });
        
        showToast('Job status: ' + newStatus, 'success');
        loadDriverData();
    } catch (error) {
        showToast(error.message || 'Failed to update status', 'error');
    }
}

// === MOBILE MENU ===
document.addEventListener('DOMContentLoaded', () => {
    const mobileToggle = document.querySelector('.mobile-toggle');
    if (mobileToggle) {
        mobileToggle.addEventListener('click', () => {
            const navLinks = document.querySelector('.nav-links');
            if (navLinks) {
                navLinks.classList.toggle('active');
                const icon = document.querySelector('.mobile-toggle i');
                if(navLinks.classList.contains('active')) {
                    if (icon) {
                        icon.classList.remove('fa-bars');
                        icon.classList.add('fa-times');
                    }
                } else {
                    if (icon) {
                        icon.classList.remove('fa-times');
                        icon.classList.add('fa-bars');
                    }
                }
            }
        });
    }
    
    // Initial load
    loadJobs();
    initSocketIO();
});

// === ADMIN PANEL NAVIGATION ===
async function showAdminPanel(panel) {
    document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.admin-nav .btn').forEach(b => b.classList.remove('active'));
    
    const panelEl = document.getElementById('panel-' + panel);
    const btnEl = document.getElementById('btn-' + panel);
    
    if (panelEl) panelEl.classList.add('active');
    if (btnEl) btnEl.classList.add('active');
    
    if(panel === 'jobs') await renderAdminJobs();
    if(panel === 'users') renderAdminUsers();
    if(panel === 'analytics') renderAnalytics();
    if(panel === 'activity') renderActivityLog();
}

// === ACTIVITY LOG ===
async function addActivity(description) {
    try {
        await apiCall('/api/activity', 'POST', { description });
    } catch (error) {
        console.error('Activity log error:', error);
    }
}

async function renderActivityLog() {
    try {
        const activity = await apiCall('/api/activity');
        const container = document.getElementById('activityLog');
        
        if(!container) return;
        
        if(activity.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:var(--text-muted);">No activity recorded</p>';
            return;
        }
        
        container.innerHTML = activity.map(item => `
            <div class="activity-item">
                <div class="activity-time">${escapeHtml(item.timestamp)}</div>
                <div class="activity-desc">${escapeHtml(item.description)}</div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Load activity error:', error);
    }
}

async function clearActivityLog() {
    if(confirm('Clear all activity logs?')) {
        try {
            await apiCall('/api/activity', 'DELETE');
            renderActivityLog();
            showToast('Activity log cleared', 'success');
        } catch (error) {
            showToast(error.message || 'Failed to clear activity', 'error');
        }
    }
}

// === NOTIFICATIONS ===
function addNotification(message, type = 'info') {
    const notifications = getNotifications();
    notifications.unshift({
        id: Date.now(),
        message: message,
        type: type,
        time: new Date().toLocaleString(),
        unread: true
    });
    if(notifications.length > 20) notifications.pop();
    saveNotifications(notifications);
    updateNotificationBadge();
}

function updateNotificationBadge() {
    const notifications = getNotifications();
    const unreadCount = notifications.filter(n => n.unread).length;
    const badge = document.getElementById('notifBadge');
    if (badge) {
        badge.textContent = unreadCount;
        badge.style.display = unreadCount > 0 ? 'block' : 'none';
    }
}

function toggleNotifications() {
    const panel = document.getElementById('notificationsPanel');
    if (panel) {
        panel.classList.toggle('active');
        renderNotifications();
    }
}

function renderNotifications() {
    const notifications = getNotifications();
    const container = document.getElementById('notificationsList');
    
    if(!container) return;
    
    if(notifications.length === 0) {
        container.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--text-muted);">No notifications</div>';
        return;
    }
    
    container.innerHTML = notifications.map(notif => `
        <div class="notification-item ${notif.unread ? 'unread' : ''}" onclick="markNotificationRead(${notif.id})">
            <div class="notification-icon ${escapeHtml(notif.type)}">
                <i class="fas fa-${notif.type === 'success' ? 'check' : notif.type === 'warning' ? 'exclamation' : notif.type === 'danger' ? 'times' : 'info'}"></i>
            </div>
            <div class="notification-content">
                <h5>${escapeHtml(notif.message)}</h5>
                <div class="notification-time">${escapeHtml(notif.time)}</div>
            </div>
        </div>
    `).join('');
}

function markNotificationRead(id) {
    const notifications = getNotifications();
    const notif = notifications.find(n => n.id === id);
    if(notif) {
        notif.unread = false;
        saveNotifications(notifications);
        updateNotificationBadge();
        renderNotifications();
    }
}

function clearNotifications() {
    saveNotifications([]);
    updateNotificationBadge();
    renderNotifications();
    showToast('Notifications cleared', 'success');
}

// === APP LOGIC ===
async function loadJobs() {
    try {
        const jobs = await apiCall('/api/jobs');
        renderJobs(jobs);
        saveJobs(jobs);
    } catch (error) {
        console.error('Load jobs error:', error);
        const cachedJobs = getJobs();
        renderJobs(cachedJobs);
        if (cachedJobs && cachedJobs.length > 0) {
            showToast('Showing cached data (offline mode)', 'warning');
        }
    }
}

function renderJobs(jobs) {
    const farmerList = document.getElementById('farmerList');
    const driverList = document.getElementById('driverList');
    
    if(farmerList) farmerList.innerHTML = '';
    if(driverList) driverList.innerHTML = '';

    if (jobs.length === 0) {
        if(farmerList) farmerList.innerHTML = '<p style="color:var(--text-muted); grid-column: 1/-1; text-align:center;">No requests posted yet.</p>';
        if(driverList) driverList.innerHTML = '<p style="color:var(--text-muted); grid-column: 1/-1; text-align:center;">No jobs available.</p>';
        return;
    }

    jobs.forEach(job => {
        if(farmerList) {
            const farmerCard = `
                <div class="job-card">
                    <div style="display:flex; justify-content:space-between;">
                        <span class="tag ${job.status.toLowerCase()}">${escapeHtml(job.status)}</span>
                        <small>${escapeHtml(job.timestamp)}</small>
                    </div>
                    <p><strong>${escapeHtml(job.crop)}</strong> (${escapeHtml(job.weight)}kg)</p>
                    <p>To: ${escapeHtml(job.destination)}</p>
                    ${job.driver_name ? `<p style="color:var(--primary); font-weight:bold;"><i class="fas fa-check"></i> Driver: ${escapeHtml(job.driver_name)}</p>` : '<p style="color:orange">Waiting for driver...</p>'}
                </div>
            `;
            farmerList.innerHTML += farmerCard;
        }

        if(driverList && job.status === 'Pending') {
            const driverCard = `
                <div class="job-card">
                    <div style="display:flex; justify-content:space-between;">
                        <span class="tag">New Job</span>
                        <small>${escapeHtml(job.timestamp)}</small>
                    </div>
                    <p><strong>From:</strong> ${escapeHtml(job.location)}</p>
                    <p><strong>Crop:</strong> ${escapeHtml(job.crop)} (${escapeHtml(job.weight)}kg)</p>
                    <p><strong>To:</strong> ${escapeHtml(job.destination)}</p>
                    <button class="btn-accept" onclick="acceptJob(${job.id})">Accept Job</button>
                </div>
            `;
            driverList.innerHTML += driverCard;
        }
    });
}

// ============ FARE CALCULATOR ============
async function geocodeAddress(address) {
    // Try multiple address formats
    const searchTerms = [
        address,
        address + ', Philippines',
        address + ', Iloilo, Philippines',
        address + ', Panay, Philippines'
    ];
    
    for (const term of searchTerms) {
        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(term)}&limit=1`,
                {
                    headers: { 
                        'User-Agent': 'KUHA/1.0 (Farm-to-Market Delivery App)'
                    }
                }
            );
            
            if (!response.ok) continue;
            
            const data = await response.json();
            
            if (data && data.length > 0) {
                return {
                    lat: parseFloat(data[0].lat),
                    lng: parseFloat(data[0].lon),
                    display_name: data[0].display_name
                };
            }
        } catch (e) {
            console.log('Geocode attempt failed:', term);
            continue;
        }
        
        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 500));
    }
    
    return null;
}

async function calculateDeliveryFare() {
    const location = document.getElementById('location').value.trim();
    const destination = document.getElementById('destination').value.trim();
    const weight = parseFloat(document.getElementById('weight').value);
    
    if (!location || !destination || !weight) {
        showToast('Please fill in location, destination, and weight', 'warning');
        return;
    }
    
    try {
        showToast('Finding locations...', 'info');
        
        // Geocode both locations with retry logic
        const pickupLocation = await geocodeAddress(location);
        
        if (!pickupLocation) {
            showToast('Could not find pickup location. Try a more specific address.', 'error');
            return;
        }
        
        showToast('Finding destination...', 'info');
        
        const deliveryLocation = await geocodeAddress(destination);
        
        if (!deliveryLocation) {
            showToast('Could not find destination. Try a more specific address.', 'error');
            return;
        }
        
        showToast(`Found: ${pickupLocation.display_name.split(',')[0]} → ${deliveryLocation.display_name.split(',')[0]}`, 'success');
        
        // Calculate distance using our API
        const distRes = await fetch('/api/calculate-distance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pickup_lat: pickupLocation.lat,
                pickup_lng: pickupLocation.lng,
                delivery_lat: deliveryLocation.lat,
                delivery_lng: deliveryLocation.lng
            })
        });
        
        const distData = await distRes.json();
        
        if (!distRes.ok) {
            showToast(distData.error || 'Failed to calculate distance', 'error');
            return;
        }
        
        // Calculate fare
        const fareRes = await fetch('/api/calculate-fare', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                distance_km: distData.distance_km,
                weight_kg: weight
            })
        });
        
        const fareData = await fareRes.json();
        
        if (!fareRes.ok) {
            showToast(fareData.error || 'Failed to calculate fare', 'error');
            return;
        }
        
        // Display fare
        const fareCalculator = document.getElementById('fareCalculator');
        const fareDetails = document.getElementById('fareDetails');
        const fareTotal = document.getElementById('fareTotal');
        const postBtn = document.getElementById('postBtn');
        
        if (fareCalculator && fareDetails && fareTotal) {
            fareCalculator.style.display = 'block';
            
            fareDetails.innerHTML = `
                <div><span>Distance:</span> <span>${fareData.input.effective_distance_km} km</span></div>
                <div><span>Base Flagdown:</span> <span>₱${fareData.breakdown.base_flagdown || 500}</span></div>
                <div><span>Fuel (${fareData.breakdown.fuel_rate}):</span> <span>₱${fareData.breakdown.fuel_cost}</span></div>
                <div><span>Transport (2x):</span> <span>₱${fareData.breakdown.transport_cost}</span></div>
                <div><span>Weight (${fareData.breakdown.loading_category}):</span> <span>₱${fareData.breakdown.weight_surcharge}</span></div>
                ${fareData.breakdown.loading_fee > 0 ? `<div><span>Loading Fee:</span> <span>₱${fareData.breakdown.loading_fee}</span></div>` : ''}
                <div><span>Subtotal:</span> <span>₱${fareData.breakdown.subtotal}</span></div>
                <div><span>System Fee (${fareData.breakdown.system_fee_rate}):</span> <span>₱${fareData.breakdown.system_fee}</span></div>
            `;
            
            fareTotal.innerHTML = `Total: ₱${fareData.total}`;
            
            // Enable post button
            if (postBtn) {
                postBtn.disabled = false;
            }
            
            showToast('Fare calculated!', 'success');
        }
        
    } catch (error) {
        console.error('Fare calculation error:', error);
        showToast('Failed to calculate fare. Please try again.', 'error');
    }
}

// Make sure DOM is ready before attaching event listener
document.addEventListener('DOMContentLoaded', function() {
    console.log('Fare calculator loaded');
});

async function handlePostJob(e) {
    e.preventDefault();
    
    const jobData = {
        location: document.getElementById('location').value,
        crop: document.getElementById('crop').value,
        weight: document.getElementById('weight').value,
        destination: document.getElementById('destination').value
    };

    try {
        const result = await apiCall('/api/jobs', 'POST', jobData);
        
        document.getElementById('farmerForm').reset();
        const fareDisplay = result.job.fare ? result.job.fare.toFixed(2) : '0.00';
        loadJobs();
        showToast('Job posted! Fare: ₱' + fareDisplay, 'success');
    } catch (error) {
        showToast(error.message || 'Failed to post job', 'error');
    }
}

async function acceptJob(id) {
    const driverName = prompt("Enter your name to accept this job:");
    if (!driverName) return;

    try {
        const result = await apiCall(`/api/jobs/${id}/accept`, 'PUT', { driver_name: driverName });
        
        loadJobs();
        showToast('Job accepted!', 'success');
    } catch (error) {
        showToast(error.message || 'Failed to accept job', 'error');
    }
}

async function resetSystem() {
    if(confirm("⚠️ WARNING: This will delete ALL jobs and users. Are you sure?")) {
        try {
            await apiCall('/api/reset', 'POST');
            
            localStorage.removeItem('kuha_jobs_v4');
            localStorage.removeItem('kuha_users_v4');
            localStorage.removeItem('kuha_activity_v4');
            localStorage.removeItem('kuha_notifications_v4');
            localStorage.removeItem('kuha_stats_history_v4');
            
            loadAdminData();
            showToast('System reset successfully', 'success');
        } catch (error) {
            showToast(error.message || 'Reset failed', 'error');
        }
    }
}

async function recalculateFares() {
    if(confirm('Recalculate fares for all jobs with no fare?')) {
        try {
            const result = await apiCall('/api/jobs/recalculate-fare', 'POST');
            loadAdminData();
            showToast(result.message || 'Fares recalculated', 'success');
        } catch (error) {
            showToast(error.message || 'Failed to recalculate fares', 'error');
        }
    }
}

// === ADMIN DASHBOARD LOGIC ===
async function loadAdminData() {
    try {
        const [jobs, users, trends] = await Promise.all([
            apiCall('/api/jobs'),
            apiCall('/api/users'),
            apiCall('/api/stats/trends')
        ]);
        
        const previousStats = getPreviousStats();
        
        const totalJobs = jobs.length;
        const pendingJobs = jobs.filter(j => j.status === 'Pending').length;
        const completedJobs = jobs.filter(j => j.status === 'Accepted').length;
        const totalUsers = users.length;
        const farmers = users.filter(u => u.role === 'farmer').length;
        const drivers = users.filter(u => u.role === 'driver').length;
        
        const completionRate = totalJobs > 0 ? Math.round((completedJobs / totalJobs) * 100) : 0;
        
        // Update UI
        const updates = {
            'stat-total-jobs': totalJobs,
            'stat-pending-jobs': pendingJobs,
            'stat-completed-jobs': completedJobs,
            'stat-total-users': totalUsers,
            'stat-farmers': farmers,
            'stat-drivers': drivers,
            'stat-completion-rate': completionRate + '%'
        };
        
        for (const [id, value] of Object.entries(updates)) {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        }
        
        updateStatTrends(totalJobs, pendingJobs, completedJobs, totalUsers, previousStats);
        renderStatusChart(pendingJobs, completedJobs);
        renderRecentJobs(jobs.slice(0, 5));
        renderAdminJobs();
        renderAnalytics();
        updateNotificationBadge();
        
        // Cache to localStorage
        saveJobs(jobs);
        saveUsers(users);
        
        // Sync with other tabs
        if (window.KUHA && window.KUHA.notifyDataChanged) {
            window.KUHA.notifyDataChanged('jobs');
        }
    } catch (error) {
        console.error('Load admin data error:', error);
        showToast('Failed to load dashboard data', 'error');
    }
}

// === REAL DATA-DRIVEN TRENDS ===
function updateStatTrends(totalJobs, pendingJobs, completedJobs, totalUsers, previousStats) {
    if(!previousStats) {
        setTrend('change-jobs', 0);
        setTrend('change-pending', 0);
        setTrend('change-completed', 0);
        setTrend('change-users', 0);
        return;
    }
    
    setTrend('change-jobs', calculateTrend(totalJobs, previousStats.totalJobs));
    setTrend('change-pending', calculateTrend(pendingJobs, previousStats.pendingJobs));
    setTrend('change-completed', calculateTrend(completedJobs, previousStats.completedJobs));
    setTrend('change-users', calculateTrend(totalUsers, previousStats.totalUsers));
}

function setTrend(elementId, percent) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const isPositive = percent >= 0;
    
    element.className = `stat-change ${isPositive ? 'positive' : 'negative'}`;
    element.innerHTML = `
        <i class="fas fa-arrow-${isPositive ? 'up' : 'down'}"></i> 
        ${isPositive ? '+' : ''}${escapeHtml(percent)}% from last update
    `;
}

function renderStatusChart(pending, completed) {
    const chart = document.getElementById('statusChart');
    if (!chart) return;
    
    const max = Math.max(pending, completed, 1);
    
    chart.innerHTML = `
        <div class="chart-bar accent" style="height: ${(pending / max) * 100}%;">
            <span class="value">${pending}</span>
            <span class="label">Pending</span>
        </div>
        <div class="chart-bar success" style="height: ${(completed / max) * 100}%;">
            <span class="value">${completed}</span>
            <span class="label">Completed</span>
        </div>
    `;
}

function renderRecentJobs(jobs) {
    const container = document.getElementById('recentJobsList');
    if(!container) return;
    
    if(jobs.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted); text-align:center;">No jobs yet</p>';
        return;
    }
    
    container.innerHTML = jobs.map(job => `
        <div style="padding: 0.8rem; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
            <div>
                <strong>${escapeHtml(job.crop)}</strong> - ${escapeHtml(job.destination)}
                <div style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(job.timestamp)}</div>
            </div>
            <span class="tag ${job.status.toLowerCase()}">${escapeHtml(job.status)}</span>
        </div>
    `).join('');
}

async function renderAdminJobs() {
    const filter = document.getElementById('jobFilter')?.value || 'all';
    const search = (document.getElementById('jobSearch')?.value || '').toLowerCase();
    const dateFilter = document.getElementById('jobDateFilter')?.value || '';
    
    let jobs;
    try {
        jobs = await apiCall('/api/jobs');
        console.log('renderAdminJobs - Jobs:', jobs);
    } catch (error) {
        console.error('Failed to fetch jobs:', error);
        showToast('Failed to load jobs data', 'error');
        const tbody = document.getElementById('adminJobsTable');
        if(tbody) tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:var(--text-muted);">Failed to load data</td></tr>';
        return;
    }
    
    if(filter !== 'all') {
        jobs = jobs.filter(j => j.status === filter);
    }
    
    if(search) {
        jobs = jobs.filter(j => 
            j.location.toLowerCase().includes(search) ||
            j.crop.toLowerCase().includes(search) ||
            j.destination.toLowerCase().includes(search) ||
            (j.driver_name && j.driver_name.toLowerCase().includes(search))
        );
    }
    
    if(dateFilter) {
        jobs = jobs.filter(j => j.timestamp.includes(dateFilter));
    }
    
    const tbody = document.getElementById('adminJobsTable');
    if(!tbody) return;
    
    if(jobs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:var(--text-muted);">No jobs found</td></tr>';
        return;
    }
    
    tbody.innerHTML = jobs.map(job => `
        <tr>
            <td>#${job.id}</td>
            <td>${escapeHtml(job.location)}</td>
            <td>${escapeHtml(job.crop)}</td>
            <td>${escapeHtml(job.weight)}kg</td>
            <td>${escapeHtml(job.destination)}</td>
            <td>₱${job.fare ? job.fare.toFixed(2) : '0.00'}</td>
            <td><span class="tag ${job.status.toLowerCase()}">${escapeHtml(job.status)}</span></td>
            <td>${escapeHtml(job.driver_name) || '-'}</td>
            <td>${escapeHtml(job.timestamp)}</td>
            <td class="actions">
                ${job.status === 'Pending' ? `<button class="btn btn-success btn-sm" onclick="adminAcceptJob(${job.id})"><i class="fas fa-check"></i></button>` : ''}
                <button class="btn btn-danger btn-sm" onclick="adminDeleteJob(${job.id})"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
}

function renderAdminUsers() {
    const filter = document.getElementById('userFilter').value;
    const search = document.getElementById('userSearch').value.toLowerCase();
    
    let users = getUsers();
    
    if(filter !== 'all') {
        users = users.filter(u => u.role === filter);
    }
    
    if(search) {
        users = users.filter(u => 
            u.name.toLowerCase().includes(search) ||
            u.email.toLowerCase().includes(search)
        );
    }
    
    const tbody = document.getElementById('adminUsersTable');
    if(!tbody) return;
    
    if(users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--text-muted);">No users found</td></tr>';
        return;
    }
    
    tbody.innerHTML = users.map(user => `
        <tr>
            <td>#${user.id}</td>
            <td>${escapeHtml(user.name)}</td>
            <td>${escapeHtml(user.email)}</td>
            <td><span class="tag">${escapeHtml(user.role)}</span></td>
            <td>${escapeHtml(user.phone) || '-'}</td>
            <td><span class="tag ${user.status}">${escapeHtml(user.status)}</span></td>
            <td>${escapeHtml(user.joined)}</td>
            <td class="actions">
                <button class="btn btn-warning btn-sm" onclick="adminToggleUser(${user.id})"><i class="fas fa-${user.status === 'active' ? 'ban' : 'check'}"></i></button>
                <button class="btn btn-danger btn-sm" onclick="adminDeleteUser(${user.id})"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
}

function renderAnalytics() {
    const jobs = getJobs();
    
    const cropCount = {};
    jobs.forEach(j => {
        cropCount[j.crop] = (cropCount[j.crop] || 0) + 1;
    });
    
    const cropChart = document.getElementById('cropChart');
    if (cropChart) {
        const maxCrop = Math.max(...Object.values(cropCount), 1);
        cropChart.innerHTML = Object.entries(cropCount).map(([crop, count]) => `
            <div class="chart-bar" style="height: ${(count / maxCrop) * 100}%;">
                <span class="value">${count}</span>
                <span class="label">${escapeHtml(crop)}</span>
            </div>
        `).join('');
    }
    
    const destCount = {};
    jobs.forEach(j => {
        destCount[j.destination] = (destCount[j.destination] || 0) + 1;
    });
    
    const topDest = Object.entries(destCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
    
    const topDestEl = document.getElementById('topDestinations');
    if (topDestEl) {
        topDestEl.innerHTML = topDest.map(([dest, count], i) => `
            <div style="display: flex; justify-content: space-between; padding: 0.8rem 0; border-bottom: 1px solid #eee;">
                <span><strong>${i + 1}.</strong> ${escapeHtml(dest)}</span>
                <span class="tag">${count} jobs</span>
            </div>
        `).join('');
    }
    
    const totalWeight = jobs.reduce((sum, j) => sum + (parseInt(j.weight) || 0), 0);
    const avgWeight = jobs.length > 0 ? Math.round(totalWeight / jobs.length) : 0;
    const avgWeightEl = document.getElementById('avgWeight');
    if (avgWeightEl) {
        avgWeightEl.textContent = avgWeight + ' kg';
    }
    
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayCount = {};
    days.forEach(d => dayCount[d] = 0);
    
    jobs.forEach(j => {
        try {
            const date = new Date(j.timestamp);
            const day = days[date.getDay()];
            dayCount[day]++;
        } catch (e) {}
    });
    
    const timeChart = document.getElementById('timeChart');
    if (timeChart) {
        const maxDay = Math.max(...Object.values(dayCount), 1);
        timeChart.innerHTML = days.map(day => `
            <div class="chart-bar" style="height: ${(dayCount[day] / maxDay) * 100}%;">
                <span class="value">${dayCount[day]}</span>
                <span class="label">${escapeHtml(day)}</span>
            </div>
        `).join('');
    }
}

async function adminAcceptJob(id) {
    const driverName = prompt("Enter driver name:");
    if(!driverName) return;
    
    try {
        await apiCall(`/api/jobs/${id}/accept`, 'PUT', { driver_name: driverName });
        
        await renderAdminJobs();
        await loadAdminData();
        showToast('Job assigned!', 'success');
    } catch (error) {
        showToast(error.message || 'Failed to assign job', 'error');
    }
}

async function adminDeleteJob(id) {
    if(confirm('Delete this job?')) {
        try {
            await apiCall(`/api/jobs/${id}`, 'DELETE');
            
            await renderAdminJobs();
            await loadAdminData();
            showToast('Job deleted', 'success');
        } catch (error) {
            showToast(error.message || 'Failed to delete job', 'error');
        }
    }
}

async function adminToggleUser(id) {
    try {
        const result = await apiCall(`/api/users/${id}/toggle`, 'PUT');
        
        renderAdminUsers();
        loadAdminData();
        showToast(`User ${result.user.status}`, 'success');
    } catch (error) {
        showToast(error.message || 'Failed to toggle user', 'error');
    }
}

async function adminDeleteUser(id) {
    if(confirm('Delete this user?')) {
        try {
            await apiCall(`/api/users/${id}`, 'DELETE');
            
            renderAdminUsers();
            loadAdminData();
            showToast('User deleted', 'success');
        } catch (error) {
            showToast(error.message || 'Failed to delete user', 'error');
        }
    }
}

// === EXPORT TO CSV ===
function exportToCSV(type) {
    let data = [];
    let filename = '';
    let headers = [];
    
    if(type === 'jobs') {
        data = getJobs();
        filename = 'kuha_jobs.csv';
        headers = ['ID', 'Location', 'Crop', 'Weight', 'Destination', 'Status', 'Driver', 'Timestamp'];
    } else if(type === 'users') {
        data = getUsers();
        filename = 'kuha_users.csv';
        headers = ['ID', 'Name', 'Email', 'Role', 'Phone', 'Status', 'Joined'];
    } else if(type === 'activity') {
        data = getActivity();
        filename = 'kuha_activity.csv';
        headers = ['Time', 'Description'];
    } else if(type === 'analytics') {
        const jobs = getJobs();
        const users = getUsers();
        data = [{
            metric: 'Total Jobs',
            value: jobs.length
        }, {
            metric: 'Pending Jobs',
            value: jobs.filter(j => j.status === 'Pending').length
        }, {
            metric: 'Completed Jobs',
            value: jobs.filter(j => j.status === 'Accepted').length
        }, {
            metric: 'Total Users',
            value: users.length
        }];
        filename = 'kuha_analytics.csv';
        headers = ['Metric', 'Value'];
    }
    
    let csv = headers.join(',') + '\n';
    data.forEach(row => {
        if(Array.isArray(row)) {
            csv += row.join(',') + '\n';
        } else if(typeof row === 'object') {
            const values = headers.map(h => row[h] || row[h.toLowerCase()] || '');
            csv += values.join(',') + '\n';
        }
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
    
    showToast('CSV exported successfully!', 'success');
}

// === EMAIL MODAL ===
function sendBulkEmail() {
    const emailModal = document.getElementById('emailModal');
    if (emailModal) emailModal.classList.add('active');
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('active');
}

function sendEmail(e) {
    e.preventDefault();
    const subject = document.getElementById('emailSubject').value;
    const message = document.getElementById('emailMessage').value;
    const recipients = document.getElementById('emailRecipients').value;
    
    addActivity(`Bulk email sent: ${subject} to ${recipients}`);
    addNotification(`Email sent: ${subject}`, 'success');
    
    closeModal('emailModal');
    showToast(`Email sent to ${recipients}!`, 'success');
    
    e.target.reset();
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if(e.target === modal) {
                modal.classList.remove('active');
            }
        });
    });
    
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.addEventListener('click', () => {
            const navLinks = document.querySelector('.nav-links');
            if (navLinks) {
                navLinks.classList.remove('active');
                const icon = document.querySelector('.mobile-toggle i');
                if(icon) {
                    icon.classList.remove('fa-times');
                    icon.classList.add('fa-bars');
                }
            }
        });
    });
});

// === ADMIN AUTO-SYNC ===
let adminSyncInterval;
function startAdminSync() {
    if (adminSyncInterval) clearInterval(adminSyncInterval);
    
    adminSyncInterval = setInterval(async () => {
        const currentSection = document.querySelector('.app-section.active');
        if (currentSection && currentSection.id === 'admin-dashboard') {
            console.log('Syncing admin data...');
            const oldJobs = getJobs();
            
            try {
                const [jobs, users] = await Promise.all([
                    apiCall('/api/jobs'),
                    apiCall('/api/users')
                ]);
                
                const jobIds = new Set(jobs.map(j => j.id));
                const hasChanges = oldJobs.length !== jobs.length ||
                    oldJobs.some(old => !jobIds.has(old.id) ||
                        old.status !== jobs.find(j => j.id === old.id)?.status);
                
                if (hasChanges) {
                    console.log('Admin data changed, refreshing...');
                    saveJobs(jobs);
                    saveUsers(users);
                    loadAdminData();
                    showToast('Data updated!', 'info');
                    
                    // Notify other tabs
                    if (window.KUHA && window.KUHA.notifyDataChanged) {
                        window.KUHA.notifyDataChanged('jobs');
                    }
                }
            } catch (error) {
                console.error('Admin sync error:', error);
            }
        }
    }, 30000);
}

// Listen for cross-tab updates via storage event
window.addEventListener('storage', (e) => {
    if (e.key === 'kuha_data_version') {
        try {
            if (!e.newValue) return;
            const data = JSON.parse(e.newValue);
            if (data && data.jobs && Array.isArray(data.jobs)) {
                console.log('Jobs updated from another tab');
                saveJobs(data.jobs);
                saveUsers(data.users || []);
                
                const currentSection = document.querySelector('.app-section.active');
                if (currentSection && currentSection.id === 'admin-dashboard') {
                    loadAdminData();
                }
            }
        } catch (err) {
            console.error('Error parsing cross-tab update:', err);
        }
    }
});

// Start sync when admin dashboard is shown
const originalShowSection = window.showSection;
window.showSection = function(id) {
    originalShowSection(id);
    if (id === 'admin-dashboard') {
        setTimeout(startAdminSync, 1000);
    }
};

// Export functions to window.KUHA for use in admin.html
// apiCall already exported by utils.js - don't re-export
if (!window.KUHA) window.KUHA = {};
Object.assign(window.KUHA, {
	setTrend,
	escapeHtml,
	showToast,
	setToken,
	getToken,
	removeToken,
	isAuthenticated,
	calculateDistance,
	calculateETA,
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
	getSharedStats,
	syncAcrossTabs,
	notifyDataChanged
});
