"""
Configuration file for the Flask scrambling server
"""
import os

# Get the directory where this config file is located
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Upload folder configuration (for input files)
# UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'inputs')  # Changed to inputs folder

# Output folder configuration (for processed files)
OUTPUTS_FOLDER = os.path.join(BASE_DIR, 'outputs')

# Ensure folders exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUTS_FOLDER, exist_ok=True)

# Maximum file size (16MB)
MAX_CONTENT_LENGTH = 16 * 1024 * 1024

# Allowed file extensions
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'bmp', 'mp4', 'avi', 'mov', 'mkv', 'webm'}

# Server configuration
HOST = '0.0.0.0'
PORT = 5000
DEBUG = True
