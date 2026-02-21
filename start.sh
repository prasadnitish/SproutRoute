#!/bin/bash

echo "🚀 Starting SproutRoute..."
echo ""

if [ ! -f "src/backend/.env" ]; then
    echo "❌ Error: .env file not found in src/backend/"
    echo "Please copy .env.example to .env and add your Claude API key"
    exit 1
fi

if grep -q "your_api_key_here" src/backend/.env; then
    echo "⚠️  Warning: API key not configured in src/backend/.env"
    echo "Please replace 'your_api_key_here' with your actual Claude API key"
    exit 1
fi

echo "✅ Environment configured"
echo ""
echo "Starting backend on http://localhost:3000"
echo "Starting frontend on http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop both servers"
echo ""

npm run dev
