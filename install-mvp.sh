#!/bin/bash

echo "Installing MVP dependencies for Cafe POS..."

echo ""
echo "Installing Node.js dependencies..."
npm install

echo ""
echo "Creating data directories..."
mkdir -p data/logs
mkdir -p uploads

echo ""
echo "Setting up environment file..."
if [ ! -f ".env" ]; then
    cat > .env << EOL
PORT=3000
JWT_SECRET=your-secret-key-change-this-in-production
NODE_ENV=development
DB_HOST=localhost
DB_USER=postgres
DB_PASSWORD=password
DB_NAME=cafe_pos
DB_PORT=5432
EOL
fi

echo ""
echo "Making scripts executable..."
chmod +x install-mvp.sh

echo ""
echo "MVP installation complete!"
echo ""
echo "To start the application:"
echo "1. Run: npm start"
echo "2. Open your browser to: http://localhost:3000"
echo "3. Login with PIN: 1234"
echo ""
echo "MVP Features Added:"
echo "- Multi-user support with roles"
echo "- Essential reporting and analytics"
echo "- Basic inventory tracking"
echo "- Customer management with phone lookup"
echo "- Backup and data export"
echo "- Error handling and logging"
echo ""