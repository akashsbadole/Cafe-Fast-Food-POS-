#!/bin/bash

echo "🚀 Installing Cafe POS Web Application MVP..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Check if PostgreSQL is running
if ! command -v psql &> /dev/null; then
    echo "⚠️  PostgreSQL is not installed or not in PATH."
    echo "   Please install PostgreSQL and create a database named 'cafe_pos'"
    echo "   You can also configure database connection in .env file"
fi

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cat > .env << EOL
# Database Configuration
DB_HOST=localhost
DB_USER=postgres
DB_PASSWORD=password
DB_NAME=cafe_pos
DB_PORT=5432

# Server Configuration
PORT=3000
JWT_SECRET=your-secret-key-change-this-in-prod

# Application Settings
NODE_ENV=development
EOL
    echo "✅ Created .env file with default settings"
    echo "   Please update the database credentials in .env file"
fi

echo ""
echo "🎉 Installation completed!"
echo ""
echo "📋 Next steps:"
echo "   1. Update database credentials in .env file"
echo "   2. Create PostgreSQL database: createdb cafe_pos"
echo "   3. Start the server: npm start"
echo "   4. Open http://localhost:3000 in your browser"
echo ""
echo "🔐 Default login PIN: 1234"
echo ""