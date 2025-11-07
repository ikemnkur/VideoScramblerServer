import json
import math
import os
from flask import Flask, send_from_directory, current_app
from config import UPLOAD_FOLDER
import secrets
from dataclasses import dataclass
from typing import List, Dict, Any, Tuple

app = Flask(__name__)
# Configure the upload folder location
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

@app.route('/')
def index():
    return "Server is running. Access files via the /download/<filename> route."

@app.route('/download/<path:filename>')
def download_file(filename):
    # Construct the absolute path to the upload folder for security
    # send_from_directory ensures the requested filename is within this directory
    # protecting against directory traversal attacks.
    directory = os.path.join(current_app.root_path, app.config['UPLOAD_FOLDER'])
    return send_from_directory(
        directory=directory, 
        filename=filename, 
        as_attachment=True # Forces the browser to download the file
    )

if __name__ == '__main__':
    # Use the development server only for testing, not production on a VPS
    app.run(host='0.0.0.0', port=5000)
