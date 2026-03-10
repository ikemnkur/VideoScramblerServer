#!/bin/bash

# cd to /python folder directory
cd "$(dirname "$0")/python"

echo "Activating virtual environment..."
source venv/bin/activate

echo "Starting Flask server..."
python app.py