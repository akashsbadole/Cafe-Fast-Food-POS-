@echo off
echo Installing MVP dependencies for Cafe POS...

echo.
echo Installing Node.js dependencies...
npm install

echo.
echo Creating data directories...
if not exist "data" mkdir data
if not exist "data\logs" mkdir data\logs
if not exist "uploads" mkdir uploads

echo.
echo Setting up environment file...
if not exist ".env" (
    echo PORT=3000 > .env
    echo JWT_SECRET=your-secret-key-change-this-in-production >> .env
    echo NODE_ENV=development >> .env
    echo DB_HOST=localhost >> .env
    echo DB_USER=postgres >> .env
    echo DB_PASSWORD=password >> .env
    echo DB_NAME=cafe_pos >> .env
    echo DB_PORT=5432 >> .env
)

echo.
echo MVP installation complete!
echo.
echo To start the application:
echo 1. Run: npm start
echo 2. Open your browser to: http://localhost:3000
echo 3. Login with PIN: 1234
echo.
echo MVP Features Added:
echo - Multi-user support with roles
echo - Essential reporting and analytics
echo - Basic inventory tracking
echo - Customer management with phone lookup
echo - Backup and data export
echo - Error handling and logging
echo.
pause