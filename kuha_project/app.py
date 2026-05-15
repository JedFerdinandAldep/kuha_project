"""
KUHA - Farm-to-Route Platform Backend
Flask application with SQLite database for agricultural logistics coordination
"""

from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room
import datetime
import requests
import math
from functools import wraps
from database import (
    init_db, create_user, get_user_by_email, verify_password, get_all_users,
    toggle_user_status, delete_user, create_job, get_all_jobs, get_job_by_id,
    accept_job, update_job_status, delete_job, get_nearby_jobs, add_activity, get_activity_logs,
    clear_activity_logs, add_notification, get_notifications, mark_notification_read,
    clear_notifications, get_analytics, get_stats_trends, generate_token, verify_token,
    reset_all_data, get_connection
)

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# Enhanced CORS configuration for production
# TODO: Replace "*" with specific origins in production
CORS(app, resources={
    r"/api/*": {
        "origins": "*",
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"],
        "expose_headers": ["Content-Type"],
        "supports_credentials": False,
        "max_age": 600
    },
    r"/map-pro": {
        "origins": "*"
    }
})

# Initialize database on startup
try:
    init_db()
except Exception as e:
    print(f"Database initialization error: {e}")
    raise

# ============ WEBSOCKET HANDLERS ============

@socketio.on('connect')
def handle_connect():
    print(f'Client connected: {request.sid}')
    join_room('map')
    emit('connected', {'status': 'connected'})

@socketio.on('disconnect')
def handle_disconnect():
    print(f'Client disconnected: {request.sid}')

@socketio.on('driver_location')
def handle_driver_location(data):
    """Receive driver location updates"""
    driver_id = data.get('driver_id')
    lat = data.get('lat')
    lng = data.get('lng')
    job_id = data.get('job_id')
    
    if driver_id and lat and lng:
        emit('driver_position', {
            'driver_id': driver_id,
            'lat': lat,
            'lng': lng,
            'job_id': job_id,
            'timestamp': datetime.now().isoformat()
        }, room='map')

@socketio.on('join_map')
def handle_join_map(data=None):
    join_room('map')
    emit('joined_map', {'status': 'joined'})

# ============ AUTHENTICATION DECORATOR ============

def require_auth(f):
    """Decorator to require JWT authentication for routes"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get('Authorization')
        
        if not auth_header:
            return jsonify({"error": "Authorization header required"}), 401
        
        # Support "Bearer <token>" format
        parts = auth_header.split()
        if len(parts) != 2 or parts[0].lower() != 'bearer':
            return jsonify({"error": "Invalid authorization header format"}), 401
        
        token = parts[1]
        payload = verify_token(token)
        
        if not payload:
            return jsonify({"error": "Invalid or expired token"}), 401
        
        # Add user info to request context
        request.current_user = payload
        return f(*args, **kwargs)
    
    return decorated_function

# ============ PAGE ROUTES ============

@app.route('/')
def home():
    """Render main landing page"""
    return render_template('index.html')

@app.route('/map')
def map_page():
    """Render map page"""
    return render_template('map.html')

@app.route('/admin')
def admin_page():
    """Render admin dashboard page"""
    return render_template('admin.html')

@app.route('/combined')
def combined_page():
    """Render combined page"""
    return render_template('index.html')

# ============ AUTHENTICATION ENDPOINTS ============

@app.route('/api/register', methods=['POST'])
def register():
    """Register a new user"""
    try:
        if not request.is_json:
            return jsonify({"error": "Content-Type must be application/json"}), 400
        data = request.get_json()
        if data is None:
            return jsonify({"error": "Invalid JSON"}), 400
        name = data.get('name')
        email = data.get('email')
        password = data.get('password')
        role = data.get('role')
        phone = data.get('phone', '')

        if not name or not email or not password or not role:
            return jsonify({"error": "All fields are required"}), 400

        if role not in ['farmer', 'driver', 'admin']:
            return jsonify({"error": "Invalid role. Must be 'farmer', 'driver', or 'admin'"}), 400

        if len(password) < 6:
            return jsonify({"error": "Password must be at least 6 characters"}), 400

        existing_user = get_user_by_email(email)
        if existing_user:
            return jsonify({"error": "Email already registered"}), 400

        new_user = create_user(name, email, password, role, phone)

        if new_user:
            token = generate_token(new_user['id'], new_user['email'], new_user['role'])
            add_activity(f"New {role} registered: {name}")
            add_notification(f"{name} joined as {role}", 'success')
            return jsonify({
                "message": "Registration successful",
                "user": new_user,
                "token": token
            }), 201
        else:
            return jsonify({"error": "Registration failed"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/login', methods=['POST'])
def login():
    """Authenticate user and AUTO-DETECT role from database"""
    if not request.is_json:
        return jsonify({"error": "Content-Type must be application/json"}), 400
    data = request.get_json()
    if data is None:
        return jsonify({"error": "Invalid JSON"}), 400
    email = data.get('email')
    password = data.get('password')

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    # 1. Check admin hardcoded
    from config.security_config import ADMIN_EMAIL, ADMIN_PASSWORD
    if email == ADMIN_EMAIL and password == ADMIN_PASSWORD:
        token = generate_token(0, email, 'admin')
        add_activity("Admin logged in")
        return jsonify({
            "message": "Admin login successful",
            "user": {"id": 0, "name": "Admin", "email": email, "role": "admin"},
            "token": token
        }), 200

    # 2. Auto-detect: Find user by email (any role)
    user = get_user_by_email(email)
    if not user:
        return jsonify({"error": "Invalid credentials"}), 401
    
    # 3. Verify password for user's actual role from database
    verified = verify_password(email, password, user['role'])
    if not verified:
        return jsonify({"error": "Invalid credentials"}), 401
    
    if user['status'] != 'active':
        return jsonify({"error": "Account suspended by admin"}), 403
    
    # 4. Return user WITH their actual role from database
    token = generate_token(user['id'], user['email'], user['role'])
    add_activity(f"User {user['name']} logged in")
    return jsonify({
        "message": "Login successful",
        "user": user,
        "token": token
    }), 200

# ============ JOB ENDPOINTS ============

@app.route('/api/jobs', methods=['GET'])
def get_jobs():
    """Get all jobs"""
    try:
        jobs = get_all_jobs()
        return jsonify(jobs)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/jobs', methods=['POST'])
def create_job_endpoint():
    """Create a new job"""
    try:
        data = request.json
        
        # Validate required fields
        if not data.get('crop') or not data.get('weight') or not data.get('location') or not data.get('destination'):
            return jsonify({"error": "Missing required fields"}), 400

        lat = data.get('lat')
        lng = data.get('lng')
        delivery_lat = data.get('deliveryLat')
        delivery_lng = data.get('deliveryLng')

        if lat is not None and (lat < -90 or lat > 90):
            return jsonify({"error": "Latitude must be between -90 and 90"}), 400
        if lng is not None and (lng < -180 or lng > 180):
            return jsonify({"error": "Longitude must be between -180 and 180"}), 400
        if delivery_lat is not None and (delivery_lat < -90 or delivery_lat > 90):
            return jsonify({"error": "Delivery latitude must be between -90 and 90"}), 400
        if delivery_lng is not None and (delivery_lng < -180 or delivery_lng > 180):
            return jsonify({"error": "Delivery longitude must be between -180 and 180"}), 400

        try:
            weight = int(data.get('weight'))
            if weight <= 0:
                return jsonify({"error": "Weight must be positive"}), 400
        except (TypeError, ValueError):
            return jsonify({"error": "Invalid weight value"}), 400

        # Calculate fare if not provided
        fare = data.get('fare')
        if fare is None or fare <= 0:
            # Default minimum distance for local delivery: 15km
            default_distance = 15
            fare_result = calculate_fare(default_distance, weight)
            fare = fare_result['total']

        new_job = create_job(
            location=data.get('location'),
            crop=data.get('crop'),
            weight=weight,
            destination=data.get('destination'),
            lat=lat,
            lng=lng,
            delivery_lat=delivery_lat,
            delivery_lng=delivery_lng,
            fare=fare
        )
        
        add_activity(f"New job posted: {new_job['crop']} to {new_job['destination']} - Fare: ₱{fare}")
        add_notification(f"New job: {new_job['crop']} ({new_job['weight']}kg) - ₱{fare}", 'info')
        
        socketio.emit('job_updated', {
            'action': 'created',
            'job': new_job
        })
        
        return jsonify({"message": "Job created successfully", "job": new_job}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/jobs/<int:job_id>/accept', methods=['PUT'])
@require_auth
def accept_job_endpoint(job_id):
    """Accept a job"""
    try:
        data = request.json
        driver_name = data.get('driver_name', 'Anonymous Driver')
        
        job = accept_job(job_id, driver_name)
        
        if job:
            add_activity(f"Job #{job_id} accepted by {driver_name}")
            add_notification(f"Job accepted by {driver_name}", 'success')
            
            socketio.emit('job_updated', {
                'action': 'accepted',
                'job': job
            })
            
            return jsonify({"message": "Job accepted!", "job": job}), 200
        else:
            return jsonify({"error": "Job not found or already accepted"}), 404
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/api/jobs/<int:job_id>/status', methods=['PUT'])
def update_job_status_endpoint(job_id):
    """Update job status"""
    try:
        data = request.get_json()
        new_status = data.get('status')
        
        if new_status not in ['Pending', 'Accepted', 'Picked Up', 'In Transit', 'Delivered']:
            return jsonify({"error": "Invalid status"}), 400
        
        job = update_job_status(job_id, new_status)
        
        if job:
            add_activity(f"Job #{job_id} status: {new_status}")
            add_notification(f"Job #{job_id}: {new_status}", 'info')
            
            socketio.emit('job_updated', {
                'action': 'status_changed',
                'job': job
            })
            
            return jsonify({"message": "Status updated!", "job": job}), 200
        else:
            return jsonify({"error": "Job not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/jobs/<int:job_id>', methods=['DELETE'])
@require_auth
def delete_job_endpoint(job_id):
    """Delete a job"""
    try:
        if delete_job(job_id):
            add_activity(f"Job #{job_id} deleted by admin")
            socketio.emit('job_updated', {
                'action': 'deleted',
                'job_id': job_id
            })
            return jsonify({"message": "Job deleted"}), 200
        else:
            return jsonify({"error": "Job not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/jobs/recalculate-fare', methods=['POST'])
@require_auth
def recalculate_all_fares():
    """Recalculate fare for all jobs with fare = 0"""
    try:
        jobs = get_all_jobs()
        updated_count = 0
        
        for job in jobs:
            if not job.get('fare') or job['fare'] == 0:
                weight = job.get('weight', 0)
                if weight > 0:
                    fare_result = calculate_fare(15, weight)
                    new_fare = fare_result['total']
                    
                    conn = get_connection()
                    cursor = conn.cursor()
                    cursor.execute('UPDATE jobs SET fare = ? WHERE id = ?', (new_fare, job['id']))
                    conn.commit()
                    conn.close()
                    
                    updated_count += 1
        
        add_activity(f"Recalculated fares for {updated_count} jobs")
        
        jobs = get_all_jobs()
        socketio.emit('job_updated', {'action': 'fare_updated'})
        
        return jsonify({
            "message": f"Updated fares for {updated_count} jobs",
            "updated": updated_count
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/jobs/nearby', methods=['GET'])
def get_nearby_jobs_endpoint():
    """Get jobs within radius"""
    try:
        lat = float(request.args.get('lat', 0))
        lng = float(request.args.get('lng', 0))
        radius = float(request.args.get('radius', 10))
        
        if (lat == 0 and lng == 0) or (lat is None or lng is None):
            return jsonify({"error": "Valid coordinates required"}), 400
        
        if lat < -90 or lat > 90 or lng < -180 or lng > 180:
            return jsonify({"error": "Invalid coordinate range"}), 400
        
        nearby = get_nearby_jobs(lat, lng, radius)
        return jsonify(nearby)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ============ USER ENDPOINTS ============

@app.route('/api/users', methods=['GET'])
def get_users():
    """Get all users"""
    try:
        users = get_all_users()
        return jsonify(users)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/users/<int:user_id>/toggle', methods=['PUT'])
@require_auth
def toggle_user_endpoint(user_id):
    """Toggle user status"""
    try:
        user = toggle_user_status(user_id)
        
        if user:
            add_activity(f"User {user['name']} {user['status']} by admin")
            return jsonify({"message": "User toggled", "user": user}), 200
        else:
            return jsonify({"error": "User not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/users/<int:user_id>', methods=['DELETE'])
@require_auth
def delete_user_endpoint(user_id):
    """Delete a user"""
    try:
        if delete_user(user_id):
            add_activity(f"User deleted by admin")
            return jsonify({"message": "User deleted"}), 200
        else:
            return jsonify({"error": "User not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ============ ACTIVITY LOG ENDPOINTS ============

@app.route('/api/activity', methods=['GET'])
def get_activity():
    """Get activity logs"""
    try:
        limit = int(request.args.get('limit', 100))
        logs = get_activity_logs(limit)
        return jsonify(logs)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/activity', methods=['POST'])
def log_activity():
    """Log an activity"""
    try:
        data = request.json
        description = data.get('description')
        
        if not description:
            return jsonify({"error": "Description required"}), 400
        
        add_activity(description)
        return jsonify({"message": "Activity logged"}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/activity', methods=['DELETE'])
def clear_activity():
    """Clear activity logs"""
    try:
        clear_activity_logs()
        add_activity('Activity log cleared by admin')
        return jsonify({"message": "Activity log cleared"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ============ NOTIFICATION ENDPOINTS ============

@app.route('/api/notifications', methods=['GET'])
def get_notifications_endpoint():
    """Get notifications"""
    try:
        unread_only = request.args.get('unread', 'false').lower() == 'true'
        notifications = get_notifications(unread_only)
        return jsonify(notifications)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/notifications/<int:notif_id>', methods=['PUT'])
def mark_read_endpoint(notif_id):
    """Mark notification as read"""
    try:
        mark_notification_read(notif_id)
        return jsonify({"message": "Notification marked as read"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/notifications', methods=['DELETE'])
def clear_notifications_endpoint():
    """Clear all notifications"""
    try:
        clear_notifications()
        return jsonify({"message": "Notifications cleared"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ============ ANALYTICS ENDPOINTS ============

@app.route('/api/analytics', methods=['GET'])
def get_analytics_endpoint():
    """Get analytics data"""
    try:
        analytics = get_analytics()
        return jsonify(analytics)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/stats/trends', methods=['GET'])
def get_stats_trends_endpoint():
    """Get daily stats trends"""
    try:
        trends = get_stats_trends()
        return jsonify(trends)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ============ ROUTING & GEOCODING ENDPOINTS ============

@app.route('/api/routing', methods=['GET'])
def get_routing():
    """Get route from OSRM"""
    try:
        start_lat = request.args.get('start_lat')
        start_lng = request.args.get('start_lng')
        end_lat = request.args.get('end_lat')
        end_lng = request.args.get('end_lng')
        alternatives = request.args.get('alternatives', 'false').lower() == 'true'
        
        if not all([start_lat, start_lng, end_lat, end_lng]):
            return jsonify({"error": "Missing coordinates"}), 400
        
        osrm_url = f'https://router.project-osrm.org/route/v1/driving/{start_lng},{start_lat};{end_lng},{end_lat}?overview=full&geometries=geojson&alternatives={str(alternatives).lower()}&steps=true'
        
        response = requests.get(osrm_url, timeout=10)
        return jsonify(response.json()), response.status_code
    except requests.Timeout:
        return jsonify({"error": "Routing service timeout"}), 504
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/geocode', methods=['GET'])
def geocode():
    """Geocode address using Nominatim"""
    try:
        query = request.args.get('q')
        limit = request.args.get('limit', 5)
        
        if not query:
            return jsonify({"error": "Query required"}), 400
        
        nominatim_url = f'https://nominatim.openstreetmap.org/search?format=json&q={query}&limit={limit}'
        
        response = requests.get(nominatim_url, headers={'User-Agent': 'KUHA/1.0'}, timeout=10)
        return jsonify(response.json()), response.status_code
    except requests.Timeout:
        return jsonify({"error": "Geocoding service timeout"}), 504
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ============ FARE CALCULATION ============

def calculate_distance_haversine(lat1, lon1, lat2, lon2):
    """Calculate distance between two points using Haversine formula"""
    import math
    R = 6371  # Earth's radius in km
    
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)
    
    a = math.sin(delta_lat/2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    
    return R * c

def calculate_fare(distance_km, weight_kg):
    """
    Calculate truck delivery fare using the farm-to-market formula
    
    Formula:
    1. Base Flagdown: 500 pesos (fixed)
    2. Minimum distance: max(distance, 10)
    3. Fuel cost: (distance / 7) * 80
    4. Transport: fuel_cost * 2.0
    5. Weight surcharge:
       - < 500kg: 300 pesos
       - 500-1000kg: weight * 2
       - > 1000kg: weight * 2 + 500
    6. System fee: 10%
    """
    BASE_FLAGDOWN = 500

    # Step 1: Minimum distance (10km minimum)
    min_distance = max(distance_km, 10)
    
    # Step 2: Fuel cost
    fuel_price_per_liter = 80
    km_per_liter = 7
    fuel_cost = (min_distance / km_per_liter) * fuel_price_per_liter
    
    # Step 3: Transport cost (fuel cost * 2)
    transport_multiplier = 2.0
    transport_cost = fuel_cost * transport_multiplier
    
    # Step 4: Weight surcharge
    if weight_kg < 500:
        weight_surcharge = 300
        loading_fee = 0
        loading_category = "Under 500kg - Flat rate"
    elif weight_kg <= 1000:
        weight_surcharge = weight_kg * 2
        loading_fee = 0
        loading_category = "500-1000kg - Per kg"
    else:
        weight_surcharge = weight_kg * 2
        loading_fee = 500
        loading_category = "Over 1000kg - Extended loading"
    
    # Step 5: Base flagdown
    base_flagdown = BASE_FLAGDOWN

    # Step 6: System fee (10%)
    subtotal = fuel_cost + transport_cost + weight_surcharge + loading_fee + base_flagdown
    system_fee_rate = 0.10
    system_fee = subtotal * system_fee_rate
    
    # Total
    total = subtotal + system_fee
    
    return {
        "input": {
            "distance_km": distance_km,
            "weight_kg": weight_kg,
            "effective_distance_km": min_distance
        },
        "breakdown": {
            "base_flagdown": base_flagdown,
            "fuel_cost": round(fuel_cost, 2),
            "fuel_rate": f"{fuel_price_per_liter} pesos/liter",
            "km_per_liter": km_per_liter,
            "transport_cost": round(transport_cost, 2),
            "transport_multiplier": transport_multiplier,
            "weight_surcharge": round(weight_surcharge, 2),
            "loading_fee": round(loading_fee, 2),
            "loading_category": loading_category,
            "subtotal": round(subtotal, 2),
            "system_fee": round(system_fee, 2),
            "system_fee_rate": f"{int(system_fee_rate * 100)}%"
        },
        "total": round(total, 2),
        "currency": "PHP",
        "currency_symbol": "₱"
    }

@app.route('/api/calculate-fare', methods=['POST'])
def calculate_fare_endpoint():
    """Calculate delivery fare based on distance and weight"""
    try:
        data = request.get_json()
        
        distance_km = data.get('distance_km')
        weight_kg = data.get('weight_kg')
        
        if distance_km is None or weight_kg is None:
            return jsonify({"error": "distance_km and weight_kg are required"}), 400
        
        try:
            distance_km = float(distance_km)
            weight_kg = float(weight_kg)
        except (TypeError, ValueError):
            return jsonify({"error": "distance_km and weight_kg must be numbers"}), 400
        
        if distance_km < 0:
            return jsonify({"error": "distance_km must be positive"}), 400
        if weight_kg < 0:
            return jsonify({"error": "weight_kg must be positive"}), 400
        
        result = calculate_fare(distance_km, weight_kg)
        return jsonify(result), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/calculate-distance', methods=['POST'])
def calculate_distance_endpoint():
    """Calculate distance between two locations"""
    try:
        data = request.get_json()
        
        pickup_lat = data.get('pickup_lat')
        pickup_lng = data.get('pickup_lng')
        delivery_lat = data.get('delivery_lat')
        delivery_lng = data.get('delivery_lng')
        
        pickup_address = data.get('pickup_address')
        delivery_address = data.get('delivery_address')
        
        # If coordinates not provided, try geocoding
        if pickup_lat is None or pickup_lng is None and pickup_address:
            try:
                response = requests.get(
                    f"https://nominatim.openstreetmap.org/search",
                    params={"format": "json", "q": pickup_address, "limit": 1},
                    headers={"User-Agent": "KUHA/1.0"},
                    timeout=5
                )
                results = response.json()
                if results:
                    pickup_lat = float(results[0]["lat"])
                    pickup_lng = float(results[0]["lon"])
            except:
                pass
        
        if delivery_lat is None or delivery_lng is None and delivery_address:
            try:
                response = requests.get(
                    f"https://nominatim.openstreetmap.org/search",
                    params={"format": "json", "q": delivery_address, "limit": 1},
                    headers={"User-Agent": "KUHA/1.0"},
                    timeout=5
                )
                results = response.json()
                if results:
                    delivery_lat = float(results[0]["lat"])
                    delivery_lng = float(results[0]["lon"])
            except:
                pass
        
        if pickup_lat is None or pickup_lng is None:
            return jsonify({"error": "Pickup coordinates required"}), 400
        if delivery_lat is None or delivery_lng is None:
            return jsonify({"error": "Delivery coordinates required"}), 400
        
        distance_km = calculate_distance_haversine(pickup_lat, pickup_lng, delivery_lat, delivery_lng)
        
        return jsonify({
            "distance_km": round(distance_km, 2),
            "pickup": {"lat": pickup_lat, "lng": pickup_lng},
            "delivery": {"lat": delivery_lat, "lng": delivery_lng}
        }), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ============ ADMIN HELPER ENDPOINTS ============

@app.route('/api/reset', methods=['POST'])
def reset_system():
    """Reset entire system (admin only)"""
    try:
        # Use safe reset function that doesn't use string interpolation
        if reset_all_data():
            add_activity('System reset by admin')
            return jsonify({"message": "System reset successfully"}), 200
        else:
            return jsonify({"error": "Reset failed"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    from config.security_config import JWT_SECRET_KEY
    app.secret_key = JWT_SECRET_KEY
    socketio.run(app, debug=True, port=5000)
