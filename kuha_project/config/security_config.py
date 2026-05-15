"""
KUHA Security Configuration
IMPORTANT: Change these values in production!
"""

import os
import secrets
import sys

def generate_secret():
    """Generate a secure random secret key"""
    return secrets.token_hex(32)

# JWT Configuration
JWT_SECRET_KEY = os.environ.get('KUHA_JWT_SECRET') or generate_secret()
JWT_EXPIRATION_HOURS = int(os.environ.get('KUHA_JWT_EXPIRATION', 24))
JWT_ALGORITHM = os.environ.get('KUHA_JWT_ALGORITHM', 'HS256')

# Admin Credentials - MUST be set via environment variables in production
ADMIN_EMAIL = os.environ.get('KUHA_ADMIN_EMAIL', 'admin@gmail.com')
ADMIN_PASSWORD = os.environ.get('KUHA_ADMIN_PASSWORD', 'admin123')

if not ADMIN_EMAIL:
    print("WARNING: Admin email not set. Using defaults (INSECURE!).")
    print("Set KUHA_ADMIN_EMAIL and KUHA_ADMIN_PASSWORD environment variables.")

# CORS Settings
ALLOWED_ORIGINS = os.environ.get('KUHA_ALLOWED_ORIGINS', '*').split(',')

# Database
DATABASE_PATH = 'kuha.db'

# Security Best Practices:
# 1. Set KUHA_JWT_SECRET environment variable to a random 32+ character string
# 2. Set KUHA_ADMIN_USERNAME and KUHA_ADMIN_PASSWORD environment variables
# 3. Set KUHA_ALLOWED_ORIGINS to specific domains (comma-separated)
# 4. Use environment variables for sensitive data in production
# 5. Enable HTTPS in production
# 6. Implement rate limiting for API endpoints
