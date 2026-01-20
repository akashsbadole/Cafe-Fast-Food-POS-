# Configuration Documentation

## Overview

The Cafe POS system provides comprehensive configuration options through environment variables, configuration files, and setup scripts. This documentation covers all configuration aspects including database setup, application settings, and deployment options.

## Configuration Files

### Environment Variables

The `.env` file contains all environment-specific configuration:

```env
# Database Configuration
DB_TYPE=sqlite  # or postgres
DB_PATH=./data/cafe_pos.db
DB_HOST=localhost
DB_PORT=5432
DB_USER=your_username
DB_PASSWORD=your_password
DB_NAME=cafe_pos

# Server Configuration
PORT=3000
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=1h

# Application Settings
AUTO_LOCK_TIMEOUT=2
TAX_RATE=0.18
MIN_PIN_LENGTH=4

# Email Configuration
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your_email@example.com
SMTP_PASSWORD=your_email_password

# Backup Configuration
BACKUP_ENABLED=true
BACKUP_INTERVAL=24
BACKUP_RETENTION=7
BACKUP_PATH=./data/backups/
```

### Configuration File

The `config/database.js` file provides database configuration:

```javascript
module.exports = {
  getConfig: () => {
    return {
      type: process.env.DB_TYPE || 'sqlite',
      connection: {
        filename: process.env.DB_PATH || './data/cafe_pos.db'
      },
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      pool: {
        min: parseInt(process.env.DB_POOL_MIN) || 2,
        max: parseInt(process.env.DB_POOL_MAX) || 10,
        idle: parseInt(process.env.DB_POOL_IDLE) || 10000,
        reap: parseInt(process.env.DB_POOL_REAP) || 10000
      }
    };
  },
  
  initialize: async () => {
    // Initialize database connection
    const config = this.getConfig();
    
    if (config.type === 'sqlite') {
      await this.initSQLite(config);
    } else if (config.type === 'postgres') {
      await this.initPostgreSQL(config);
    }
  }
};
```

## Setup and Installation

### Quick Start Scripts

#### Windows
```bat
@echo off

:: Check if Node.js is installed
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo Node.js is not installed. Please install Node.js 16.x or higher.
    pause
    exit /b 1
)

:: Check Node.js version
for /f "tokens=2 delims=[]" %%v in ('node -p "process.versions.node"') do set NODE_VERSION=%%v
if %NODE_VERSION:.=%==0 (
    echo Node.js version is too old. Please upgrade to 16.x or higher.
    pause
    exit /b 1
)

:: Install dependencies
npm install

:: Create data directory
if not exist "data" mkdir data
if not exist "data\logs" mkdir data\logs
if not exist "data\backups" mkdir data\backups

:: Create .env file if it doesn't exist
if not exist ".env" (
    echo Creating .env file...
    echo DB_TYPE=sqlite>> .env
    echo DB_PATH=./data/cafe_pos.db>> .env
    echo PORT=3000>> .env
    echo JWT_SECRET=change_this_secret_key>> .env
    echo JWT_EXPIRES_IN=1h>> .env
    echo AUTO_LOCK_TIMEOUT=2>> .env
    echo TAX_RATE=0.18>> .env
    echo MIN_PIN_LENGTH=4>> .env
)

:: Run migrations
node config/migrations/run-migrations.js

:: Create default admin user
node scripts/create-admin.js

echo Installation complete!
echo You can now start the application with: npm start
echo Default credentials: admin / 1234
pause
```

#### Linux/Mac
```bash
#!/bin/bash

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Node.js is not installed. Please install Node.js 16.x or higher."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -p "process.versions.node")
MAJOR_VERSION=$(echo $NODE_VERSION | cut -d. -f1)
if [ $MAJOR_VERSION -lt 16 ]; then
    echo "Node.js version is too old. Please upgrade to 16.x or higher."
    exit 1
fi

# Install dependencies
npm install

# Create data directory
mkdir -p data/logs
mkdir -p data/backups

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo "Creating .env file..."
    cat > .env << EOL
DB_TYPE=sqlite
DB_PATH=./data/cafe_pos.db
PORT=3000
JWT_SECRET=change_this_secret_key
JWT_EXPIRES_IN=1h
AUTO_LOCK_TIMEOUT=2
TAX_RATE=0.18
MIN_PIN_LENGTH=4
EOL
fi

# Run migrations
node config/migrations/run-migrations.js

# Create default admin user
node scripts/create-admin.js

echo "Installation complete!"
echo "You can now start the application with: npm start"
echo "Default credentials: admin / 1234"
```

## Database Configuration

### SQLite Configuration

SQLite is the default database and requires no additional setup:

```javascript
{
  type: 'sqlite',
  connection: {
    filename: './data/cafe_pos.db'
  }
}
```

### PostgreSQL Configuration

For PostgreSQL, configure the connection settings:

```env
DB_TYPE=postgres
DB_HOST=localhost
DB_PORT=5432
DB_USER=cafe_pos
DB_PASSWORD=your_password
DB_NAME=cafe_pos
```

Then run migrations:
```bash
node config/migrations/run-migrations.js
```

## Application Configuration

### Auto-Lock Settings

Configure the auto-lock timeout:

```env
AUTO_LOCK_TIMEOUT=2  # minutes
```

### Tax Configuration

Set tax rates for billing:

```env
TAX_RATE=0.18  # 18% GST
```

### PIN Requirements

Set minimum PIN length:

```env
MIN_PIN_LENGTH=4
```

## Email Configuration

Configure email for report delivery:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_app_password
SMTP_SECURE=false
```

## Backup Configuration

Configure automatic backups:

```env
BACKUP_ENABLED=true
BACKUP_INTERVAL=24  # hours
BACKUP_RETENTION=7  # days
BACKUP_PATH=./data/backups/
```

## Running the Application

### Development Mode

```bash
npm run dev
```

This starts:
- Express server on port 3000
- Electron application
- Auto-restart on file changes
- Development logging

### Production Mode

```bash
npm start
```

This starts:
- Express server on configured port
- Electron application
- Production logging
- Optimized performance

### Running Tests

```bash
npm test
```

This runs:
- All unit tests
- Integration tests
- End-to-end tests
- Generates coverage report

## Configuration Options

### Database Options

| Option | Description | Default |
|--------|-------------|---------|
| `DB_TYPE` | Database type (sqlite or postgres) | sqlite |
| `DB_PATH` | SQLite database file path | ./data/cafe_pos.db |
| `DB_HOST` | PostgreSQL host | localhost |
| `DB_PORT` | PostgreSQL port | 5432 |
| `DB_USER` | PostgreSQL username | - |
| `DB_PASSWORD` | PostgreSQL password | - |
| `DB_NAME` | PostgreSQL database name | cafe_pos |

### Server Options

| Option | Description | Default |
|--------|-------------|---------|
| `PORT` | Server port | 3000 |
| `JWT_SECRET` | JWT secret key | - |
| `JWT_EXPIRES_IN` | JWT expiration time | 1h |

### Application Options

| Option | Description | Default |
|--------|-------------|---------|
| `AUTO_LOCK_TIMEOUT` | Auto-lock timeout in minutes | 2 |
| `TAX_RATE` | Tax rate (decimal) | 0.18 |
| `MIN_PIN_LENGTH` | Minimum PIN length | 4 |

### Email Options

| Option | Description | Default |
|--------|-------------|---------|
| `SMTP_HOST` | SMTP server host | - |
| `SMTP_PORT` | SMTP server port | - |
| `SMTP_USER` | SMTP username | - |
| `SMTP_PASSWORD` | SMTP password | - |
| `SMTP_SECURE` | Use SSL/TLS | false |

### Backup Options

| Option | Description | Default |
|--------|-------------|---------|
| `BACKUP_ENABLED` | Enable automatic backups | true |
| `BACKUP_INTERVAL` | Backup interval in hours | 24 |
| `BACKUP_RETENTION` | Backup retention in days | 7 |
| `BACKUP_PATH` | Backup directory | ./data/backups/ |

## Troubleshooting Configuration Issues

### Common Configuration Problems

#### Database Connection Failed
- Verify database file permissions (SQLite)
- Check PostgreSQL server is running
- Verify connection credentials
- Check network connectivity (PostgreSQL)

#### Application Won't Start
- Check `.env` file exists
- Verify environment variables are set
- Check Node.js version
- Review error logs

#### Login Issues
- Verify JWT secret is set
- Check PIN hashing configuration
- Review authentication settings

#### Email Not Working
- Verify SMTP settings
- Check network connectivity
- Test SMTP credentials
- Review email configuration

#### Backup Failed
- Check backup directory permissions
- Verify backup path exists
- Review backup schedule
- Check database access

## Best Practices

### Configuration Management

1. **Use environment variables** for sensitive data
2. **Never commit secrets** to version control
3. **Document all configuration options**
4. **Provide sensible defaults**
5. **Validate configuration** on startup

### Security

1. **Use strong JWT secrets**
2. **Rotate secrets regularly**
3. **Encrypt sensitive data**
4. **Use HTTPS in production**
5. **Implement proper access controls**

### Performance

1. **Optimize database configuration**
2. **Tune connection pooling**
3. **Configure appropriate timeouts**
4. **Set reasonable cache sizes**
5. **Monitor resource usage**

### Maintainability

1. **Document all options**
2. **Provide setup scripts**
3. **Include validation**
4. **Support multiple environments**
5. **Allow runtime configuration**

## See Also

- [Core Features Documentation](../CORE-FEATURES/README.md)
- [Database Documentation](../DATABASE/README.md)
- [Authentication Documentation](../AUTHENTICATION/README.md)
- [Business Logic Documentation](../BUSINESS-LOGIC/README.md)
- [UI Documentation](../UI/README.md)
- [Testing Documentation](../TESTING/README.md)

## Additional Resources

- [Environment Variables Reference](../README.md#environment-variables) - Complete environment variable documentation
- [Installation Scripts](../install-mvp.bat) and [../install-mvp.sh] - Platform-specific installation scripts
