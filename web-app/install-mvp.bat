@echo off
echo 🚀 Installing Cafe POS Web Application MVP...

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed. Please install Node.js first.
    pause
    exit /b 1
)

REM Check if npm is installed
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ npm is not installed. Please install npm first.
    pause
    exit /b 1
)

REM Install dependencies
echo 📦 Installing dependencies...
npm install

REM Check if PostgreSQL is available
psql --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ⚠️  PostgreSQL is not installed or not in PATH.
    echo    Please install PostgreSQL and create a database named 'cafe_pos'
    echo    You can also configure database connection in .env file
)

REM Create .env file if it doesn't exist
if not exist .env (
    echo 📝 Creating .env file...
    (
        echo # Database Configuration
        echo DB_HOST=localhost
        echo DB_USER=postgres
        echo DB_PASSWORD=password
        echo DB_NAME=cafe_pos
        echo DB_PORT=5432
        echo.
        echo # Server Configuration
        echo PORT=3000
        echo JWT_SECRET=your-secret-key-change-this-in-prod
        echo.
        echo # Application Settings
        echo NODE_ENV=development
    ) > .env
    echo ✅ Created .env file with default settings
    echo    Please update the database credentials in .env file
)

echo.
echo 🎉 Installation completed!
echo.
echo 📋 Next steps:
echo    1. Update database credentials in .env file
echo    2. Create PostgreSQL database: createdb cafe_pos
echo    3. Start the server: npm start
echo    4. Open http://localhost:3000 in your browser
echo.
echo 🔐 Default login PIN: 1234
echo.
pause