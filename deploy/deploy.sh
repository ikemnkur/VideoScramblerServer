#!/bin/bash
set -e

PROJECT_ROOT="/root/VideoScramblerServer"
PYTHON_APP_PATH="$PROJECT_ROOT/python"
NODE_APP_NAME="video-scrambler-node"
PYTHON_APP_NAME="python-ext-vss"

echo "🚀 Starting deployment for VideoScramblerServer..."
echo "=================================================="

# Navigate to project root
cd $PROJECT_ROOT

# Pull latest code
echo ""
echo "📥 Pulling latest code from git..."
git pull origin main

# ============================================
# Deploy Node.js App
# ============================================
echo ""
echo "🟢 Deploying Node.js app..."
echo "----------------------------"

# Install Node.js dependencies
npm install --production

# Check if Node.js app exists in PM2
if pm2 describe $NODE_APP_NAME > /dev/null 2>&1; then
    echo "🔄 Restarting Node.js app: $NODE_APP_NAME"
    pm2 restart $NODE_APP_NAME
else
    echo "🚀 Starting Node.js app for the first time: $NODE_APP_NAME"
    pm2 start server.cjs --name $NODE_APP_NAME
fi

# ============================================
# Deploy Python Flask App
# ============================================
echo ""
echo "🐍 Deploying Python Flask app..."
echo "----------------------------"

cd $PYTHON_APP_PATH

# Check if venv exists, create if not
if [ ! -d "venv" ]; then
    echo "⚠️  Virtual environment not found. Creating new venv..."
    python3 -m venv venv
    source venv/bin/activate
    pip install --upgrade pip
    echo "✅ Virtual environment created"
else
    echo "✅ Virtual environment found"
    source venv/bin/activate
fi

# Install/update Python dependencies
echo "📦 Installing Python dependencies..."
pip install -r requirements.txt

# Restart Python app with PM2
echo "🔄 Restarting Python app: $PYTHON_APP_NAME"
pm2 restart $PYTHON_APP_NAME

# ============================================
# Finalize
# ============================================
echo ""
echo "💾 Saving PM2 configuration..."
pm2 save

echo ""
echo "✅ Deployment complete!"
echo "=================================================="
echo ""
echo "📊 Current PM2 Status:"
pm2 status

echo ""
echo "📝 Recent logs (Node.js):"
pm2 logs $NODE_APP_NAME --lines 5 --nostream

echo ""
echo "📝 Recent logs (Python):"
pm2 logs $PYTHON_APP_NAME --lines 5 --nostream

echo ""
echo "🌐 Application URLs:"
echo "   Node.js: http://142.93.82.161"
echo "   Python:  http://142.93.82.161 (your configured route)"
