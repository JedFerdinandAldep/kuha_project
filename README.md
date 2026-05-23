# KUHA
### Farm-to-Route Platform


> A smart logistics platform connecting small-holder farmers with local drivers to reduce food waste and maximize farmer profits.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Fare Calculation System](#fare-calculation-system)
- [Project Structure](#project-structure)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Security](#security)
- [API Endpoints](#api-endpoints)
- [User Roles](#user-roles)
- [Job Status Flow](#job-status-flow)
- [Pages](#pages)
- [Environment Variables](#environment-variables)
- [Troubleshooting](#troubleshooting)
- [Known Issues & Limitations](#known-issues--limitations)
- [Future Enhancements](#future-enhancements)
- [Contributing](#contributing)
- [Contributors](#contributors)
- [Acknowledgments](#acknowledgments)

---

## Overview

KUHA (Filipino for "Carry") is a farm-to-market logistics platform that bridges the gap between farmers and transport drivers. It streamlines agricultural delivery coordination, enabling farmers to post delivery requests and drivers to accept and fulfill them in real-time.

---

## Features

| Feature | Description |
|---------|-------------|
| **Role-Based System** | Three user roles: Farmer, Driver, and Admin |
| **Real-Time Tracking** | WebSocket-based live job updates and driver location tracking |
| **Smart Fare Calculation** | Automatic pricing based on distance, weight, and transport costs |
| **Geocoding & Routing** | OpenStreetMap integration for address lookup and route planning |
| **Admin Dashboard** | User management, analytics, and system controls |
| **Offline Support** | Local storage caching for offline operation |

---

## Tech Stack

### Backend
- **Framework:** Flask 3.0+
- **Database:** SQLite
- **Authentication:** JWT (JSON Web Tokens)
- **Real-time:** Flask-SocketIO
- **External APIs:** OSRM (Routing), Nominatim (Geocoding)

### Frontend
- **UI:** Vanilla JavaScript + CSS
- **Maps:** Leaflet.js with OpenStreetMap
- **Icons:** Font Awesome 6.4
- **Fonts:** Montserrat

---

## Fare Calculation System

The platform uses a transparent fare calculation formula:

```
Total = (Fuel Cost + Transport Cost + Weight Surcharge + Loading Fee + Base Flagdown) + System Fee (10%)
```

### Breakdown

| Component | Calculation |
|-----------|-------------|
| **Base Flagdown** | ₱500 (fixed) |
| **Fuel Cost** | (Distance / 7) × ₱80 |
| **Transport Cost** | Fuel Cost × 2.0 |
| **Weight Surcharge** | < 500kg: ₱300, 500-1000kg: weight×2, > 1000kg: weight×2 + ₱500 |
| **Loading Fee** | ₱500 (for > 1000kg only) |
| **System Fee** | 10% of subtotal |

---

## Project Structure

```
kuha_project/
├── app.py                 # Main Flask application with all routes & logic
├── database.py            # SQLite database operations
├── config/
│   ├── __init__.py
│   └── security_config.py # JWT secret & admin credentials
├── templates/
│   ├── index.html         # Main landing page
│   ├── map.html          # Live map tracking page
│   └── admin.html        # Admin dashboard
├── static/design/
│   ├── css/
│   │   ├── style.css     # Main styles
│   │   └── map-pro.css   # Map-specific styles
│   └── js/
│       ├── app.js        # Main application logic
│       ├── utils.js      # Utility functions
│       └── map-pro.js    # Map functionality
└── kuha.db               # SQLite database file
```

---

## Quick Start

```bash
# Clone and navigate to the project
cd kuha_project

# Create virtual environment (optional but recommended)
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # Linux/Mac

# Install dependencies
pip install -r requirements.txt

# Run the application
python app.py

# Open in browser
# http://localhost:5000
```

---

## Installation

### Prerequisites

- Python 3.8+
- pip

### Setup

1. **Clone or navigate to the project:**
   ```bash
   cd kuha_project
   ```

2. **Create a virtual environment (recommended):**
   ```bash
   python -m venv venv
   source venv/bin/activate  # Linux/Mac
   # or
   venv\Scripts\activate    # Windows
   ```

3. **Install dependencies:**
   ```bash
   pip install flask flask-cors flask-socketio eventlet requests pyjwt
   ```
   Or use the requirements file:
   ```bash
   pip install -r requirements.txt
   ```

4. **Run the application:**
   ```bash
   python app.py
   ```

5. **Open in browser:**
   ```
   http://localhost:5000
   ```

---

## Security

### Default Admin Credentials

| Field | Value |
|-------|-------|
| Email | Check `config/security_config.py` |
| Password | Check `config/security_config.py` |

> ⚠️ **Important:** Always change the default admin credentials in production!

### Production Deployment

When deploying to production, consider the following:

1. **Change default secrets** - Update JWT_SECRET and SECRET_KEY in `config/security_config.py`
2. **Use environment variables** - Store sensitive credentials in `.env` file
3. **Enable HTTPS** - Use a reverse proxy like Nginx with SSL certificates
4. **Database backup** - Regularly backup your `kuha.db` file
5. **Rate limiting** - Implement rate limiting for API endpoints to prevent abuse

---

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/register` | Register new user (farmer/driver) |
| POST | `/api/login` | User login (auto-detects role) |

### Jobs
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/jobs` | Get all jobs |
| POST | `/api/jobs` | Create new job |
| PUT | `/api/jobs/<id>/accept` | Accept a job (requires auth) |
| PUT | `/api/jobs/<id>/status` | Update job status |
| DELETE | `/api/jobs/<id>` | Delete job (requires auth) |
| GET | `/api/jobs/nearby` | Get jobs within radius |

### Fare Calculation
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/calculate-fare` | Calculate fare by distance & weight |
| POST | `/api/calculate-distance` | Calculate distance between two points |

### Users (Admin)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users` | Get all users |
| PUT | `/api/users/<id>/toggle` | Toggle user status |
| DELETE | `/api/users/<id>` | Delete user |

### Analytics
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/analytics` | Get system analytics |
| GET | `/api/stats/trends` | Get daily trends |

### Routing & Maps
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/routing` | Get route from OSRM |
| GET | `/api/geocode` | Geocode address via Nominatim |

---

## User Roles

### Farmer
- Post delivery jobs with crop details, weight, and destination
- View posted jobs and assigned drivers
- Calculate estimated fare before posting

### Driver
- Browse available jobs
- Accept and fulfill delivery jobs
- Update job status (Accepted → Picked Up → In Transit → Delivered)
- View earnings history

### Admin
- Manage all users (activate/suspend/delete)
- View system analytics and trends
- Monitor activity logs
- System-wide controls (reset data, recalculate fares)

---

## Job Status Flow

```
Pending → Accepted → Picked Up → In Transit → Delivered
```

---

## Pages

| Page | URL | Description |
|------|-----|-------------|
| Home | `/` | Landing page with registration/login |
| Map | `/map` | Real-time driver location tracking |
| Admin | `/admin` | Admin dashboard |

---

## Environment Variables (Optional)

Create a `.env` file for custom configuration:

```env
FLASK_ENV=development
SECRET_KEY=your-secret-key
JWT_SECRET=your-jwt-secret
ADMIN_EMAIL=admin@kuha.com
ADMIN_PASSWORD=your-admin-password
```

---

## Database

The SQLite database (`kuha.db`) is automatically created when you first run the application. No manual setup is required.

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| **Module not found error** | Ensure all dependencies are installed: `pip install -r requirements.txt` |
| **Port 5000 in use** | Change the port in `app.py` or kill the process using that port |
| **Geocoding not working** | Check internet connection; Nominatim has rate limits |
| **WebSocket connection failed** | Ensure `flask-socketio` and `eventlet` are installed |
| **Database locked error** | Close any other applications accessing `kuha.db` |

### Getting Help

If you encounter other issues, please open an issue on GitHub with:
- Error message/screenshot
- Steps to reproduce
- Your environment details

---

## Known Issues & Limitations

1. **Fare Discrepancy** - Previous versions may have mismatch between displayed and calculated fare (fixed in latest update)
2. **Offline Mode** - Basic caching enabled, but real-time features require internet
3. **Geocoding Rate Limits** - Nominatim has usage limits; use responsibly

---

## Future Enhancements

- [ ] Push notifications for job updates
- [ ] Payment integration (GCash, etc.)
- [ ] Driver ratings and reviews
- [ ] Multiple vehicle types support
- [ ] Delivery proof (photo upload)
- [ ] SMS notifications

---

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## Contributors

- **Jed Ferdinand Aldep** — Database & Backend
- **Crizlhor Andreaz Fernando** — Frontend & Backend
- **Romer Zion Alonday** — UI/UX Design & Frontend

---

## Acknowledgments

- [OpenStreetMap](https://www.openstreetmap.org/) - Map data
- [OSRM](https://project-osrm.org/) - Routing service
- [Nominatim](https://nominatim.openstreetmap.org/) - Geocoding service
- [Leaflet.js](https://leafletjs.com/) - Interactive maps

---


*Built for Filipino Farmers* 🇵🇭
