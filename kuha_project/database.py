"""
KUHA Database Module
SQLite database management for users, jobs, activity logs, and notifications
"""

import sqlite3
import hashlib
import jwt
import json
import math
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Optional, Any
from functools import wraps

DATABASE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'kuha.db')

try:
    from config.security_config import JWT_SECRET_KEY, JWT_EXPIRATION_HOURS, JWT_ALGORITHM
except ImportError:
    JWT_SECRET_KEY = os.environ.get('KUHA_JWT_SECRET', secrets.token_hex(32))
    JWT_EXPIRATION_HOURS = int(os.environ.get('KUHA_JWT_EXPIRATION', 24))
    JWT_ALGORITHM = os.environ.get('KUHA_JWT_ALGORITHM', 'HS256')

def generate_token(user_id: int, email: str, role: str) -> str:
    """Generate JWT token for authenticated user"""
    now = datetime.now(timezone.utc)
    payload = {
        'user_id': user_id,
        'email': email,
        'role': role,
        'exp': now + timedelta(hours=JWT_EXPIRATION_HOURS),
        'iat': now
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)

def verify_token(token: str) -> Optional[Dict]:
    """Verify JWT token and return payload"""
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

def get_connection():
    """Get database connection with row factory"""
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initialize database tables"""
    conn = get_connection()
    cursor = conn.cursor()
    
    # Users table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('farmer', 'driver', 'admin')),
            phone TEXT,
            status TEXT DEFAULT 'active' CHECK(status IN ('active', 'suspended')),
            joined_date TEXT NOT NULL,
            lat REAL,
            lng REAL
        )
    ''')
    
    # Jobs table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            location TEXT NOT NULL,
            crop TEXT NOT NULL,
            weight INTEGER NOT NULL,
            destination TEXT NOT NULL,
            status TEXT DEFAULT 'Pending' CHECK(status IN ('Pending', 'Accepted', 'Picked Up', 'In Transit', 'Delivered')),
            driver_name TEXT,
            timestamp TEXT NOT NULL,
            lat REAL,
            lng REAL,
            delivery_lat REAL,
            delivery_lng REAL,
            status_updated_at TEXT,
            status_history TEXT DEFAULT '[]',
            fare REAL DEFAULT 0
        )
    ''')
    
    # Activity logs table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS activity_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            description TEXT NOT NULL
        )
    ''')
    
    # Notifications table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message TEXT NOT NULL,
            type TEXT DEFAULT 'info',
            timestamp TEXT NOT NULL,
            unread INTEGER DEFAULT 1
        )
    ''')
    
    conn.commit()
    conn.close()
    print("Database initialized successfully")
    seed_sample_data()

def seed_sample_data():
    """Seed sample data for demo purposes"""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute('SELECT COUNT(*) FROM jobs')
    job_count = cursor.fetchone()[0]

    if job_count == 0:
        # Calculate fares for sample jobs using the fare calculation formula
        # Distance calculations using Haversine formula
        def calculate_distance(lat1, lon1, lat2, lon2):
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
            import math
            min_distance = max(distance_km, 10)
            fuel_price_per_liter = 80
            km_per_liter = 7
            fuel_cost = (min_distance / km_per_liter) * fuel_price_per_liter
            transport_multiplier = 2.0
            transport_cost = fuel_cost * transport_multiplier

            if weight_kg < 500:
                weight_surcharge = 300
                loading_fee = 0
            elif weight_kg <= 1000:
                weight_surcharge = weight_kg * 2
                loading_fee = 0
            else:
                weight_surcharge = weight_kg * 2
                loading_fee = 500

            subtotal = fuel_cost + transport_cost + weight_surcharge + loading_fee
            system_fee_rate = 0.10
            system_fee = subtotal * system_fee_rate
            total = subtotal + system_fee
            return round(total, 2)

        # Calculate distances and fares for each sample job
        job1_dist = calculate_distance(10.8177, 122.7114, 10.7202, 122.5621)
        job1_fare = calculate_fare(job1_dist, 100)

        job2_dist = calculate_distance(11.3347, 122.7521, 10.7428, 122.5436)
        job2_fare = calculate_fare(job2_dist, 500)

        job3_dist = calculate_distance(10.8856, 122.5690, 10.7264, 122.5487)
        job3_fare = calculate_fare(job3_dist, 200)

        job4_dist = calculate_distance(11.1125, 122.6411, 10.8177, 122.7114)
        job4_fare = calculate_fare(job4_dist, 150)

        job5_dist = calculate_distance(11.4298, 122.8313, 10.7202, 122.5621)
        job5_fare = calculate_fare(job5_dist, 80)

        cursor.execute('''
            INSERT INTO jobs (location, crop, weight, destination, status, timestamp, lat, lng, delivery_lat, delivery_lng, fare)
            VALUES
            ('Dumangas Market', 'Vegetables', 100, 'Iloilo City Central Market', 'Pending', ?, 10.8177, 122.7114, 10.7202, 122.5621, ?),
            ('Banate', 'Fruits', 500, 'Lapaz Market', 'Accepted', ?, 11.3347, 122.7521, 10.7428, 122.5436, ?),
            ('Barotac Viejo', 'Rice', 200, 'Jaro Market', 'Pending', ?, 10.8856, 122.5690, 10.7264, 122.5487, ?),
            ('Passi City', 'Coconuts', 150, 'Dumangas Public Market', 'Pending', ?, 11.1125, 122.6411, 10.8177, 122.7114, ?),
            ('Culasi', 'Peppers', 80, 'Iloilo City', 'Pending', ?, 11.4298, 122.8313, 10.7202, 122.5621, ?)
        ''', (datetime.now().strftime("%Y-%m-%d %H:%M:%S"), job1_fare,
              datetime.now().strftime("%Y-%m-%d %H:%M:%S"), job2_fare,
              datetime.now().strftime("%Y-%m-%d %H:%M:%S"), job3_fare,
              datetime.now().strftime("%Y-%m-%d %H:%M:%S"), job4_fare,
              datetime.now().strftime("%Y-%m-%d %H:%M:%S"), job5_fare))
        
    cursor.execute('SELECT COUNT(*) FROM users')
    user_count = cursor.fetchone()[0]
    
    if user_count == 0:
        cursor.execute('''
            INSERT INTO users (name, email, password_hash, role, phone, status, joined_date, lat, lng)
            VALUES 
            ('Juan Farmers', 'juan@farmer.kuha', 'salt$hash', 'farmer', '09171234567', 'active', ?, 10.8177, 122.7114),
            ('Maria Driver', 'maria@driver.kuha', 'salt$hash', 'driver', '09181234567', 'active', ?, 10.7202, 122.5621),
            ('Pedro Farmers', 'pedro@farmer.kuha', 'salt$hash', 'farmer', '09191234567', 'active', ?, 11.3347, 122.7521)
        ''', (datetime.now().strftime("%Y-%m-%d %H:%M:%S"),) * 3)
        
        print("Sample data seeded successfully")
    
    conn.commit()
    conn.close()

# ============ USER OPERATIONS ============

def create_user(name: str, email: str, password: str, role: str, phone: str = None) -> Dict:
    """Create a new user with hashed password"""
    conn = get_connection()
    cursor = conn.cursor()
    
    salt = secrets.token_hex(16)
    password_hash = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000).hex()
    password_hash = f"{salt}${password_hash}"
    joined_date = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    try:
        cursor.execute('''
            INSERT INTO users (name, email, password_hash, role, phone, status, joined_date)
            VALUES (?, ?, ?, ?, ?, 'active', ?)
        ''', (name, email, password_hash, role, phone, joined_date))
        
        conn.commit()
        user_id = cursor.lastrowid
        
        return {
            'id': user_id,
            'name': name,
            'email': email,
            'role': role,
            'phone': phone,
            'status': 'active',
            'joined': joined_date
        }
    except sqlite3.IntegrityError:
        return None
    finally:
        conn.close()

def get_user_by_email(email: str) -> Optional[Dict]:
    """Get user by email"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT * FROM users WHERE email = ?', (email,))
    row = cursor.fetchone()
    conn.close()
    
    if row:
        return dict(row)
    return None

def verify_password(email: str, password: str, role: str) -> Optional[Dict]:
    """Verify user credentials"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT * FROM users WHERE email = ? AND role = ?', (email, role))
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        return None
    
    stored_hash = row['password_hash']
    if '$' in stored_hash:
        salt, hash_value = stored_hash.split('$', 1)
        computed_hash = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000).hex()
        if not secrets.compare_digest(computed_hash, hash_value):
            return None
    else:
        simple_hash = hashlib.sha256(password.encode()).hexdigest()
        if not secrets.compare_digest(simple_hash, stored_hash):
            return None
    
    user = dict(row)
    user.pop('password_hash', None)
    return user

def get_user_by_email(email: str) -> Optional[Dict]:
    """Get user by email (any role)"""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM users WHERE email = ?', (email,))
    row = cursor.fetchone()
    conn.close()
    if row:
        user = dict(row)
        user.pop('password_hash', None)
        return user
    return None

def get_all_users() -> List[Dict]:
    """Get all users"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT * FROM users')
    rows = cursor.fetchall()
    conn.close()
    
    users = []
    for row in rows:
        user = dict(row)
        user.pop('password_hash', None)
        users.append(user)
    
    return users

def toggle_user_status(user_id: int) -> Optional[Dict]:
    """Toggle user status between active and suspended"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT status FROM users WHERE id = ?', (user_id,))
    row = cursor.fetchone()
    
    if row:
        new_status = 'suspended' if row['status'] == 'active' else 'active'
        cursor.execute('UPDATE users SET status = ? WHERE id = ?', (new_status, user_id))
        conn.commit()
        
        cursor.execute('SELECT * FROM users WHERE id = ?', (user_id,))
        updated_row = cursor.fetchone()
        conn.close()
        
        user = dict(updated_row)
        user.pop('password_hash', None)
        return user
    
    conn.close()
    return None

def delete_user(user_id: int) -> bool:
    """Delete a user"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute('DELETE FROM users WHERE id = ?', (user_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    
    return deleted

def get_users_by_role(role: str) -> List[Dict]:
    """Get users by role"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT * FROM users WHERE role = ?', (role,))
    rows = cursor.fetchall()
    conn.close()
    
    users = []
    for row in rows:
        user = dict(row)
        user.pop('password_hash', None)
        users.append(user)
    
    return users

# ============ JOB OPERATIONS ============

def create_job(location: str, crop: str, weight: int, destination: str,
               lat: float = None, lng: float = None,
               delivery_lat: float = None, delivery_lng: float = None,
               fare: float = None) -> Dict:
    """Create a new job"""
    if not location or not crop or not destination:
        raise ValueError("Location, crop, and destination are required")
    
    if weight <= 0:
        raise ValueError("Weight must be positive")
    
    # Calculate fare if not provided
    if fare is None and lat and lng and delivery_lat and delivery_lng:
        from math import radians, sin, cos, sqrt, atan2
        R = 6371  # Earth radius in km
        lat1, lng1 = radians(lat), radians(lng)
        lat2, lng2 = radians(delivery_lat), radians(delivery_lng)
        dlat = lat2 - lat1
        dlng = lng2 - lng1
        a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlng/2)**2
        c = 2 * atan2(sqrt(a), sqrt(1-a))
        distance_km = R * c
        
        from app import calculate_fare
        fare_result = calculate_fare(distance_km, weight)
        fare = fare_result['total']
    
    conn = get_connection()
    cursor = conn.cursor()
    
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    status_history = json.dumps([{"status": "Pending", "timestamp": timestamp}])
    
    cursor.execute('''
        INSERT INTO jobs (location, crop, weight, destination, status, timestamp, lat, lng, delivery_lat, delivery_lng, status_updated_at, status_history, fare)
        VALUES (?, ?, ?, ?, 'Pending', ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (location, crop, weight, destination, timestamp, lat, lng, delivery_lat, delivery_lng, timestamp, status_history, fare or 0))
    
    conn.commit()
    job_id = cursor.lastrowid
    
    cursor.execute('SELECT * FROM jobs WHERE id = ?', (job_id,))
    row = cursor.fetchone()
    conn.close()
    
    if row:
        return {key: row[key] for key in row.keys()}
    return None

def get_all_jobs() -> List[Dict]:
    """Get all jobs"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT * FROM jobs ORDER BY timestamp DESC')
    rows = cursor.fetchall()
    conn.close()
    
    return [dict(row) for row in rows]

def get_job_by_id(job_id: int) -> Optional[Dict]:
    """Get job by ID"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT * FROM jobs WHERE id = ?', (job_id,))
    row = cursor.fetchone()
    conn.close()
    
    if row:
        return {key: row[key] for key in row.keys()}
    return None

def update_job_status(job_id: int, new_status: str) -> Optional[Dict]:
    """Update job status and record in history"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT status, status_history FROM jobs WHERE id = ?', (job_id,))
    row = cursor.fetchone()
    
    if not row:
        conn.close()
        return None
    
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    import json
    history = json.loads(row['status_history'] or '[]')
    history.append({"status": new_status, "timestamp": timestamp})
    
    cursor.execute('''
        UPDATE jobs 
        SET status = ?, status_updated_at = ?, status_history = ?
        WHERE id = ?
    ''', (new_status, timestamp, json.dumps(history), job_id))
    
    conn.commit()
    
    cursor.execute('SELECT * FROM jobs WHERE id = ?', (job_id,))
    row = cursor.fetchone()
    conn.close()
    
    if row:
        return {key: row[key] for key in row.keys()}
    return None

def accept_job(job_id: int, driver_name: str) -> Optional[Dict]:
    """Accept a job"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT status FROM jobs WHERE id = ?', (job_id,))
    row = cursor.fetchone()
    
    if not row:
        conn.close()
        return None
    
    if row['status'] != 'Pending':
        conn.close()
        return None
    
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    history = json.dumps([
        {"status": "Pending", "timestamp": timestamp},
        {"status": "Accepted", "timestamp": timestamp}
    ])
    
    cursor.execute('''
        UPDATE jobs 
        SET status = 'Accepted', driver_name = ?, status_updated_at = ?, status_history = ?
        WHERE id = ?
    ''', (driver_name, timestamp, history, job_id))
    
    conn.commit()
    
    cursor.execute('SELECT * FROM jobs WHERE id = ?', (job_id,))
    row = cursor.fetchone()
    conn.close()
    
    if row:
        return {key: row[key] for key in row.keys()}
    return None

def delete_job(job_id: int) -> bool:
    """Delete a job"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute('DELETE FROM jobs WHERE id = ?', (job_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    
    return deleted

def get_nearby_jobs(lat: float, lng: float, radius: float) -> List[Dict]:
    """Get jobs within radius (in km) using bounding box pre-filter"""
    lat_delta = radius / 111.0
    lng_delta = radius / (111.0 * math.cos(math.radians(lat)))
    
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT * FROM jobs 
        WHERE lat IS NOT NULL AND lng IS NOT NULL 
        AND status = 'Pending'
        AND lat BETWEEN ? AND ?
        AND lng BETWEEN ? AND ?
    ''', (lat - lat_delta, lat + lat_delta, lng - lng_delta, lng + lng_delta))
    rows = cursor.fetchall()
    conn.close()
    
    nearby = []
    for row in rows:
        job = dict(row)
        if job.get('lat') and job.get('lng'):
            distance = calculate_distance(lat, lng, job['lat'], job['lng'])
            if distance <= radius:
                job['distance'] = round(distance, 2)
                nearby.append(job)
    
    nearby.sort(key=lambda x: x['distance'])
    return nearby

def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two coordinates in km"""
    if lat1 is None or lon1 is None or lat2 is None or lon2 is None:
        return float('inf')
    
    R = 6371
    dLat = math.radians(lat2 - lat1)
    dLon = math.radians(lon2 - lon1)
    a = (
        math.sin(dLat / 2) * math.sin(dLat / 2) +
        math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
        math.sin(dLon / 2) * math.sin(dLon / 2)
    )
    a = max(0, min(1, a))
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

# ============ ACTIVITY LOG OPERATIONS ============

def add_activity(description: str):
    """Add activity log entry"""
    conn = get_connection()
    cursor = conn.cursor()
    
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    cursor.execute('SELECT COUNT(*) FROM activity_logs')
    count = cursor.fetchone()[0]
    
    if count >= 1000:
        cursor.execute('DELETE FROM activity_logs WHERE timestamp = (SELECT MIN(timestamp) FROM activity_logs)')
    
    cursor.execute('''
        INSERT INTO activity_logs (timestamp, description)
        VALUES (?, ?)
    ''', (timestamp, description))
    
    conn.commit()
    conn.close()

def get_activity_logs(limit: int = 100) -> List[Dict]:
    """Get activity logs"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT * FROM activity_logs ORDER BY timestamp DESC LIMIT ?', (limit,))
    rows = cursor.fetchall()
    conn.close()
    
    return [dict(row) for row in rows]

def clear_activity_logs():
    """Clear all activity logs"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute('DELETE FROM activity_logs')
    conn.commit()
    conn.close()

# ============ NOTIFICATION OPERATIONS ============

def add_notification(message: str, type: str = 'info'):
    """Add notification"""
    conn = get_connection()
    cursor = conn.cursor()
    
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    cursor.execute('SELECT COUNT(*) FROM notifications')
    count = cursor.fetchone()[0]
    
    if count >= 100:
        cursor.execute('DELETE FROM notifications WHERE timestamp = (SELECT MIN(timestamp) FROM notifications)')
    
    cursor.execute('''
        INSERT INTO notifications (message, type, timestamp, unread)
        VALUES (?, ?, ?, 1)
    ''', (message, type, timestamp))
    
    conn.commit()
    conn.close()

def get_notifications(unread_only: bool = False) -> List[Dict]:
    """Get notifications"""
    conn = get_connection()
    cursor = conn.cursor()
    
    if unread_only:
        cursor.execute('SELECT * FROM notifications WHERE unread = 1 ORDER BY timestamp DESC LIMIT 20')
    else:
        cursor.execute('SELECT * FROM notifications ORDER BY timestamp DESC LIMIT 20')
    
    rows = cursor.fetchall()
    conn.close()
    
    return [dict(row) for row in rows]

def mark_notification_read(notification_id: int):
    """Mark notification as read"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute('UPDATE notifications SET unread = 0 WHERE id = ?', (notification_id,))
    conn.commit()
    conn.close()

def clear_notifications():
    """Clear all notifications"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute('DELETE FROM notifications')
    conn.commit()
    conn.close()

def reset_all_data():
    """Safely reset all data from all tables"""
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute('PRAGMA foreign_keys = OFF')
        cursor.execute('DELETE FROM notifications')
        cursor.execute('DELETE FROM activity_logs')
        cursor.execute('DELETE FROM jobs')
        cursor.execute('DELETE FROM users')
        cursor.execute("DELETE FROM sqlite_sequence WHERE name IN ('users', 'jobs', 'activity_logs', 'notifications')")
        conn.commit()
        return True
    except Exception as e:
        conn.rollback()
        print(f"Reset error: {e}")
        return False
    finally:
        cursor.execute('PRAGMA foreign_keys = ON')
        conn.close()

# ============ ANALYTICS ============

def get_analytics() -> Dict:
    """Get analytics data"""
    jobs = get_all_jobs()
    users = get_all_users()
    
    total_jobs = len(jobs)
    pending_jobs = len([j for j in jobs if j['status'] == 'Pending'])
    completed_jobs = len([j for j in jobs if j['status'] == 'Accepted'])
    
    # Crop distribution
    crop_distribution = {}
    for job in jobs:
        crop = job.get('crop', 'Unknown')
        crop_distribution[crop] = crop_distribution.get(crop, 0) + 1
    
    # Destination distribution
    destination_distribution = {}
    for job in jobs:
        dest = job.get('destination', 'Unknown')
        destination_distribution[dest] = destination_distribution.get(dest, 0) + 1
    
    # Weight calculations
    total_weight = sum(int(j.get('weight', 0)) for j in jobs)
    avg_weight = total_weight / total_jobs if total_jobs > 0 else 0
    
    return {
        'total_jobs': total_jobs,
        'pending_jobs': pending_jobs,
        'completed_jobs': completed_jobs,
        'total_users': len(users),
        'farmers': len([u for u in users if u['role'] == 'farmer']),
        'drivers': len([u for u in users if u['role'] == 'driver']),
        'crop_distribution': crop_distribution,
        'destination_distribution': dict(sorted(destination_distribution.items(), key=lambda x: x[1], reverse=True)[:10]),
        'avg_weight': round(avg_weight, 2),
        'total_weight': total_weight
    }

def get_stats_trends() -> Dict:
    """Get daily stats trends"""
    jobs = get_all_jobs()
    
    days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    daily_stats = {day: 0 for day in days}
    
    for job in jobs:
        try:
            timestamp = job.get('timestamp', '')
            if timestamp:
                # Try multiple formats
                for fmt in ['%Y-%m-%d %H:%M:%S', '%m/%d/%Y, %I:%M %p', '%Y-%m-%dT%H:%M:%S']:
                    try:
                        date_obj = datetime.strptime(timestamp, fmt)
                        day_name = days[date_obj.weekday()]
                        daily_stats[day_name] += 1
                        break
                    except ValueError:
                        continue
        except Exception:
            pass
    
    return daily_stats
