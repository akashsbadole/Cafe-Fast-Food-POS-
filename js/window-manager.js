const { BrowserWindow, screen } = require('electron');
const path = require('path');
const EventEmitter = require('events');

/**
 * Enhanced Window Manager for robust window creation and positioning
 * Handles window visibility, positioning validation, and scaling for different displays
 */
class WindowManager extends EventEmitter {
    constructor(config = {}) {
        super();

        // Default window configuration
        this.config = {
            defaultWidth: 1400,
            defaultHeight: 900,
            minWidth: 1024,
            minHeight: 768,
            centerOnScreen: true,
            showImmediately: false,
            maxRetries: 3,
            creationTimeout: 10000, // 10 seconds
            ...config
        };

        this.mainWindow = null;
        this.creationAttempts = 0;
        this.lastError = null;
    }

    /**
     * Creates the main window with robust error handling and positioning
     * @returns {Promise<BrowserWindow>} The created window
     */
    async createMainWindow() {
        this.creationAttempts++;

        try {
            // Validate display availability
            const primaryDisplay = screen.getPrimaryDisplay();
            if (!primaryDisplay) {
                throw new Error('No primary display available');
            }

            // Calculate optimal window dimensions
            const windowConfig = this._calculateWindowDimensions(primaryDisplay);

            // Create window with safe configuration
            this.mainWindow = new BrowserWindow({
                ...windowConfig,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    preload: path.join(__dirname, '../preload.js')
                },
                frame: true,
                resizable: true,
                titleBarStyle: 'default',
                show: this.config.showImmediately
            });

            // Validate and correct window position
            this.ensureWindowVisibility(this.mainWindow);

            // Load the application content
            await this._loadWindowContent();

            // Ensure window has focus and is visible
            this._ensureWindowFocus();

            this.emit('window-created', {
                window: this.mainWindow,
                attempts: this.creationAttempts
            });

            return this.mainWindow;

        } catch (error) {
            this.lastError = error;
            this.emit('window-creation-error', {
                error,
                attempts: this.creationAttempts
            });

            // Attempt recovery if within retry limit
            if (this.creationAttempts < this.config.maxRetries) {
                return this.handleWindowCreationError(error);
            }

            throw new Error(`Window creation failed after ${this.creationAttempts} attempts: ${error.message}`);
        }
    }

    /**
     * Validates window position and ensures it's within display bounds
     * @param {BrowserWindow} window - The window to validate
     * @returns {boolean} True if position is valid
     */
    validateWindowPosition(window) {
        if (!window) return false;

        const windowBounds = window.getBounds();
        const displays = screen.getAllDisplays();

        // Check if window intersects with any display
        for (const display of displays) {
            const workArea = display.workArea;

            // Check if window overlaps with this display's work area
            if (this._boundsIntersect(windowBounds, workArea)) {
                // Ensure at least part of the window is visible
                const intersection = this._calculateIntersection(windowBounds, workArea);
                const visibleArea = intersection.width * intersection.height;
                const windowArea = windowBounds.width * windowBounds.height;

                // At least 25% of the window should be visible
                return (visibleArea / windowArea) >= 0.25;
            }
        }

        return false;
    }

    /**
     * Ensures window is visible and properly positioned
     * @param {BrowserWindow} window - The window to make visible
     */
    ensureWindowVisibility(window) {
        if (!window) return;

        if (!this.validateWindowPosition(window)) {
            // Move window to primary display center
            const primaryDisplay = screen.getPrimaryDisplay();
            const workArea = primaryDisplay.workArea;
            const windowBounds = window.getBounds();

            const x = workArea.x + Math.max(0, (workArea.width - windowBounds.width) / 2);
            const y = workArea.y + Math.max(0, (workArea.height - windowBounds.height) / 2);

            window.setPosition(Math.floor(x), Math.floor(y));

            this.emit('window-repositioned', {
                oldPosition: windowBounds,
                newPosition: { x, y }
            });
        }

        // Ensure window is shown and focused
        if (!window.isVisible()) {
            window.show();
        }

        if (!window.isFocused()) {
            window.focus();
        }
    }

    /**
     * Handles window creation errors with recovery attempts
     * @param {Error} error - The error that occurred
     * @returns {Promise<BrowserWindow>} Recovered window or throws
     */
    async handleWindowCreationError(error) {
        this.emit('window-recovery-attempt', {
            error,
            attempt: this.creationAttempts
        });

        // Wait before retry with exponential backoff
        const delay = Math.min(1000 * Math.pow(2, this.creationAttempts - 1), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));

        // Try with more conservative settings
        const fallbackConfig = {
            ...this.config,
            defaultWidth: Math.min(this.config.defaultWidth, 1024),
            defaultHeight: Math.min(this.config.defaultHeight, 768),
            centerOnScreen: true,
            showImmediately: false
        };

        const fallbackManager = new WindowManager(fallbackConfig);
        return fallbackManager.createMainWindow();
    }

    /**
     * Gets current window status and information
     * @returns {Object} Window status information
     */
    getWindowStatus() {
        return {
            exists: !!this.mainWindow,
            visible: this.mainWindow ? this.mainWindow.isVisible() : false,
            focused: this.mainWindow ? this.mainWindow.isFocused() : false,
            position: this.mainWindow ? this.mainWindow.getBounds() : null,
            creationAttempts: this.creationAttempts,
            lastError: this.lastError
        };
    }

    /**
     * Calculates optimal window dimensions based on display size
     * @param {Electron.Display} display - The target display
     * @returns {Object} Window configuration
     * @private
     */
    _calculateWindowDimensions(display) {
        const workArea = display.workArea;

        // Calculate dimensions with scaling for small displays
        let width = Math.min(this.config.defaultWidth, workArea.width * 0.9);
        let height = Math.min(this.config.defaultHeight, workArea.height * 0.9);

        // Ensure minimum dimensions
        width = Math.max(width, this.config.minWidth);
        height = Math.max(height, this.config.minHeight);

        // If minimum dimensions don't fit, scale down proportionally
        if (width > workArea.width * 0.95) {
            const scale = (workArea.width * 0.95) / width;
            width = Math.floor(width * scale);
            height = Math.floor(height * scale);
        }

        if (height > workArea.height * 0.95) {
            const scale = (workArea.height * 0.95) / height;
            width = Math.floor(width * scale);
            height = Math.floor(height * scale);
        }

        // Calculate position
        let x, y;
        if (this.config.centerOnScreen) {
            x = workArea.x + Math.floor((workArea.width - width) / 2);
            y = workArea.y + Math.floor((workArea.height - height) / 2);
        } else {
            x = workArea.x + 50;
            y = workArea.y + 50;
        }

        return {
            width: Math.floor(width),
            height: Math.floor(height),
            minWidth: this.config.minWidth,
            minHeight: this.config.minHeight,
            x: Math.floor(x),
            y: Math.floor(y)
        };
    }

    /**
     * Loads window content with timeout handling
     * @returns {Promise<void>}
     * @private
     */
    async _loadWindowContent() {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Window content loading timeout'));
            }, this.config.creationTimeout);

            this.mainWindow.loadFile('index.html')
                .then(() => {
                    clearTimeout(timeout);

                    // Wait for content to be ready
                    this.mainWindow.webContents.once('did-finish-load', () => {
                        resolve();
                    });
                })
                .catch((error) => {
                    clearTimeout(timeout);
                    reject(error);
                });
        });
    }

    /**
     * Ensures window has focus and is brought to foreground
     * @private
     */
    _ensureWindowFocus() {
        if (!this.mainWindow) return;

        // Show window if not visible
        if (!this.mainWindow.isVisible()) {
            this.mainWindow.show();
        }

        // Focus window
        this.mainWindow.focus();

        // On Windows, additional steps might be needed
        if (process.platform === 'win32') {
            this.mainWindow.setAlwaysOnTop(true);
            this.mainWindow.setAlwaysOnTop(false);
        }

        this.emit('window-focused', { window: this.mainWindow });
    }

    /**
     * Checks if two rectangles intersect
     * @param {Object} rect1 - First rectangle
     * @param {Object} rect2 - Second rectangle
     * @returns {boolean} True if rectangles intersect
     * @private
     */
    _boundsIntersect(rect1, rect2) {
        return !(rect1.x + rect1.width <= rect2.x ||
            rect2.x + rect2.width <= rect1.x ||
            rect1.y + rect1.height <= rect2.y ||
            rect2.y + rect2.height <= rect1.y);
    }

    /**
     * Calculates intersection area of two rectangles
     * @param {Object} rect1 - First rectangle
     * @param {Object} rect2 - Second rectangle
     * @returns {Object} Intersection rectangle
     * @private
     */
    _calculateIntersection(rect1, rect2) {
        const x = Math.max(rect1.x, rect2.x);
        const y = Math.max(rect1.y, rect2.y);
        const width = Math.max(0, Math.min(rect1.x + rect1.width, rect2.x + rect2.width) - x);
        const height = Math.max(0, Math.min(rect1.y + rect1.height, rect2.y + rect2.height) - y);

        return { x, y, width, height };
    }

    /**
     * Destroys the window and cleans up resources
     */
    destroy() {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.destroy();
        }
        this.mainWindow = null;
        this.removeAllListeners();
    }
}

module.exports = { WindowManager };