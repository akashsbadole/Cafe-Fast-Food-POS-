/**
 * ESC/POS Printer Driver
 * 
 * Handles communication with ESC/POS compatible thermal printers
 * 
 * @module escpos-driver
 */

const { Logger } = require('./logger');
const net = require('net');
const usb = require('usb');
const serialport = require('serialport');

class ESCPOSDriver {
    /**
     * Initialize ESC/POS Driver
     * @param {Object} device - Device configuration
     */
    constructor(device) {
        this.device = device;
        this.logger = new Logger(`ESCPOS-${device.device_name}`);
        this.connection = null;
        this.isConnected = false;
        this.paperLevel = 100;
        this.inkLevel = 100;
        this.retryCount = 0;
        this.maxRetries = 3;
    }

    /**
     * Connect to the printer
     */
    async connect() {
        try {
            this.logger.info(`Connecting to ${this.device.device_name} (${this.device.connection_type})`);
            
            switch (this.device.connection_type) {
                case 'network':
                    await this.connectNetwork();
                    break;
                case 'usb':
                    await this.connectUSB();
                    break;
                case 'serial':
                    await this.connectSerial();
                    break;
                case 'bluetooth':
                    await this.connectBluetooth();
                    break;
                default:
                    throw new Error(`Unsupported connection type: ${this.device.connection_type}`);
            }
            
            this.isConnected = true;
            this.device.status = 'connected';
            this.retryCount = 0;
            
            this.logger.info(`Connected to ${this.device.device_name}`);
        } catch (error) {
            this.logger.error(`Connection failed: ${error.message}`);
            this.isConnected = false;
            this.device.status = 'disconnected';
            
            if (this.retryCount < this.maxRetries) {
                this.retryCount++;
                this.logger.info(`Retrying connection (${this.retryCount}/${this.maxRetries})...`);
                setTimeout(() => this.connect(), 5000);
            }
            
            throw error;
        }
    }

    /**
     * Connect via network (TCP/IP)
     */
    async connectNetwork() {
        return new Promise((resolve, reject) => {
            this.connection = net.createConnection({
                host: this.device.ip_address,
                port: this.device.port || 9100
            }, () => {
                this.logger.info(`Network connection established to ${this.device.ip_address}:${this.device.port}`);
                resolve();
            });
            
            this.connection.on('error', (err) => {
                reject(new Error(`Network connection error: ${err.message}`));
            });
            
            this.connection.on('close', () => {
                this.logger.info('Network connection closed');
                this.isConnected = false;
            });
        });
    }

    /**
     * Connect via USB
     */
    async connectUSB() {
        return new Promise((resolve, reject) => {
            try {
                // Find USB device
                const devices = usb.getDeviceList();
                const device = devices.find(d => d.deviceDescriptor.idVendor === this.device.vendor_id 
                    && d.deviceDescriptor.idProduct === this.device.product_id);
                
                if (!device) {
                    throw new Error('USB device not found');
                }
                
                // Open device
                device.open();
                const iface = device.interface(0);
                iface.claim();
                
                this.connection = {
                    write: (data) => {
                        const endpoint = iface.endpoint(1);
                        endpoint.transfer(data, (err) => {
                            if (err) {
                                this.logger.error('USB write error:', err);
                            }
                        });
                    },
                    close: () => {
                        iface.release();
                        device.close();
                    }
                };
                
                this.logger.info('USB connection established');
                resolve();
            } catch (err) {
                reject(new Error(`USB connection error: ${err.message}`));
            }
        });
    }

    /**
     * Connect via Serial
     */
    async connectSerial() {
        return new Promise((resolve, reject) => {
            const port = new serialport(this.device.connection_string, {
                baudRate: this.device.baud_rate || 9600,
                dataBits: 8,
                parity: 'none',
                stopBits: 1,
                flowControl: false,
                autoOpen: false
            });
            
            port.on('error', (err) => {
                reject(new Error(`Serial connection error: ${err.message}`));
            });
            
            port.open((err) => {
                if (err) {
                    reject(new Error(`Failed to open serial port: ${err.message}`));
                    return;
                }
                
                this.connection = port;
                this.logger.info('Serial connection established');
                resolve();
            });
        });
    }

    /**
     * Connect via Bluetooth
     */
    async connectBluetooth() {
        // Bluetooth implementation would use a library like noble or bluetooth-hci-socket
        // For now, we'll use a generic approach
        return new Promise((resolve, reject) => {
            // This is a placeholder - actual Bluetooth implementation would vary
            this.connection = {
                write: (data) => {
                    // Simulate Bluetooth write
                    this.logger.info('Bluetooth data sent');
                },
                close: () => {
                    this.logger.info('Bluetooth connection closed');
                }
            };
            
            this.logger.info('Bluetooth connection established (simulated)');
            resolve();
        });
    }

    /**
     * Disconnect from printer
     */
    disconnect() {
        if (this.connection && typeof this.connection.close === 'function') {
            this.connection.close();
        }
        
        this.isConnected = false;
        this.logger.info('Disconnected from printer');
    }

    /**
     * Send raw data to printer
     * @param {string|Buffer} data - Data to send
     */
    async sendRaw(data) {
        if (!this.isConnected) {
            await this.connect();
        }
        
        return new Promise((resolve, reject) => {
            try {
                const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
                
                this.connection.write(buffer, (err) => {
                    if (err) {
                        this.logger.error('Write error:', err);
                        this.isConnected = false;
                        reject(new Error(`Write failed: ${err.message}`));
                        return;
                    }
                    
                    resolve();
                });
            } catch (err) {
                reject(err);
            }
        });
    }

    /**
     * Print text with formatting
     * @param {string} text - Text to print
     * @param {Object} [options] - Formatting options
     * @param {boolean} [options.bold] - Bold text
     * @param {boolean} [options.italic] - Italic text
     * @param {boolean} [options.underline] - Underlined text
     * @param {number} [options.size] - Text size (1-8)
     * @param {string} [options.align] - Text alignment (left, center, right)
     */
    async printText(text, options = {}) {
        let commands = '';
        
        // Text alignment
        if (options.align === 'center') {
            commands += '\x1b\x61\x01'; // Center align
        } else if (options.align === 'right') {
            commands += '\x1b\x61\x02'; // Right align
        } else {
            commands += '\x1b\x61\x00'; // Left align (default)
        }
        
        // Text size
        if (options.size) {
            const size = Math.min(Math.max(options.size, 1), 8);
            commands += '\x1d\x21' + String.fromCharCode(size);
        }
        
        // Bold
        if (options.bold) {
            commands += '\x1b\x45\x01';
        }
        
        // Italic
        if (options.italic) {
            commands += '\x1b\x34';
        }
        
        // Underline
        if (options.underline) {
            commands += '\x1b\x2d\x01';
        }
        
        // Text
        commands += text;
        
        // Reset formatting
        commands += '\x1b\x45\x00'; // Reset bold
        commands += '\x1b\x34'; // Reset italic
        commands += '\x1b\x2d\x00'; // Reset underline
        commands += '\x1b\x61\x00'; // Reset alignment
        commands += '\x1d\x21\x00'; // Reset size
        
        // Add line feed
        commands += '\n';
        
        await this.sendRaw(commands);
    }

    /**
     * Print a line
     * @param {string} text - Text to print
     */
    async printLine(text) {
        await this.printText(text, { align: 'left' });
    }

    /**
     * Print centered text
     * @param {string} text - Text to print
     */
    async printCentered(text) {
        await this.printText(text, { align: 'center' });
    }

    /**
     * Print a horizontal line
     * @param {number} [length=48] - Length of the line
     */
    async printHorizontalLine(length = 48) {
        await this.printText('─'.repeat(length));
    }

    /**
     * Print a barcode
     * @param {string} text - Text to encode
     * @param {string} type - Barcode type (EAN13, CODE128, etc.)
     * @param {Object} [options] - Barcode options
     * @param {number} [options.width] - Barcode width
     * @param {number} [options.height] - Barcode height
     * @param {string} [options.position] - Human readable position (above, below, both)
     */
    async printBarcode(text, type = 'EAN13', options = {}) {
        let commands = '';
        
        // Barcode type
        switch (type.toUpperCase()) {
            case 'UPC-A':
                commands += '\x1d\x6b\x41';
                break;
            case 'UPC-E':
                commands += '\x1d\x6b\x42';
                break;
            case 'EAN13':
                commands += '\x1d\x6b\x43';
                break;
            case 'EAN8':
                commands += '\x1d\x6b\x44';
                break;
            case 'CODE39':
                commands += '\x1d\x6b\x45';
                break;
            case 'ITF':
                commands += '\x1d\x6b\x46';
                break;
            case 'CODE93':
                commands += '\x1d\x6b\x47';
                break;
            case 'CODE128':
                commands += '\x1d\x6b\x48';
                break;
            case 'GS1-128':
                commands += '\x1d\x6b\x49';
                break;
            case 'GS1-DATABAR':
                commands += '\x1d\x6b\x5a';
                break;
            default:
                commands += '\x1d\x6b\x43'; // Default to EAN13
        }
        
        // Barcode width
        const width = options.width || 2;
        commands += String.fromCharCode(width);
        
        // Barcode height
        const height = options.height || 50;
        commands += String.fromCharCode(height);
        
        // Human readable position
        const position = (options.position || 'below').toLowerCase();
        let posCode = 0;
        if (position === 'above') posCode = 1;
        else if (position === 'both') posCode = 2;
        commands += String.fromCharCode(posCode);
        
        // Barcode data
        commands += text;
        
        // Print
        await this.sendRaw(commands);
        await this.printLine(''); // Add space after barcode
    }

    /**
     * Print a QR code
     * @param {string} text - Text to encode
     * @param {Object} [options] - QR code options
     * @param {number} [options.size] - QR code size (1-16)
     * @param {string} [options.errorCorrection] - Error correction level (L, M, Q, H)
     * @param {string} [options.align] - Alignment
     */
    async printQRCode(text, options = {}) {
        let commands = '';
        
        // QR code model
        commands += '\x1d\x28\x6b\x03\x00\x31\x50\x30';
        
        // Size
        const size = options.size || 4;
        commands += String.fromCharCode(size);
        
        // Error correction level
        const ecLevel = (options.errorCorrection || 'M').toUpperCase();
        let ecCode = 0;
        if (ecLevel === 'L') ecCode = 1;
        else if (ecLevel === 'M') ecCode = 0;
        else if (ecLevel === 'Q') ecCode = 3;
        else if (ecLevel === 'H') ecCode = 2;
        commands += String.fromCharCode(ecCode);
        
        // Data length
        const length = text.length;
        commands += String.fromCharCode(Math.floor(length / 256));
        commands += String.fromCharCode(length % 256);
        
        // Data
        commands += text;
        
        // Print
        await this.sendRaw(commands);
        await this.printLine(''); // Add space after QR code
    }

    /**
     * Print an image
     * @param {Buffer} imageData - Image data
     * @param {Object} [options] - Image options
     * @param {string} [options.type] - Image type (bitmap, raster)
     * @param {number} [options.width] - Image width
     * @param {number} [options.height] - Image height
     */
    async printImage(imageData, options = {}) {
        if (!Buffer.isBuffer(imageData)) {
            throw new Error('Image data must be a Buffer');
        }
        
        // For simplicity, we'll use the raster bitmap command
        // In a real implementation, you would need to convert the image to the proper format
        
        let commands = '';
        
        // Raster bitmap command
        commands += '\x1d\x76\x30\x00';
        
        // Image data
        commands += imageData;
        
        // Print
        await this.sendRaw(commands);
        await this.printLine(''); // Add space after image
    }

    /**
     * Cut paper
     * @param {string} [mode='full'] - Cut mode (full, partial)
     */
    async cutPaper(mode = 'full') {
        let command = '';
        
        if (mode === 'full') {
            command = '\x1d\x56\x42\x00';
        } else {
            command = '\x1d\x56\x41\x00';
        }
        
        await this.sendRaw(command);
    }

    /**
     * Open cash drawer
     * @param {number} [pin=2] - Cash drawer pin (1 or 2)
     */
    async openCashDrawer(pin = 2) {
        let command = '';
        
        if (pin === 1) {
            command = '\x1b\x70\x00\x10\x90';
        } else {
            command = '\x1b\x70\x01\x10\x90';
        }
        
        await this.sendRaw(command);
    }

    /**
     * Print receipt
     * @param {Object} receiptData - Receipt data
     * @param {number} [copies=1] - Number of copies
     */
    async printReceipt(receiptData, copies = 1) {
        for (let i = 0; i < copies; i++) {
            // Header
            await this.printCentered(receiptData.storeName || 'STORE NAME');
            await this.printCentered(receiptData.storeAddress || 'STORE ADDRESS');
            await this.printCentered(receiptData.storePhone || 'PHONE NUMBER');
            await this.printHorizontalLine();
            await this.printLine('');
            
            // Date and time
            await this.printLine(`Date: ${receiptData.date || new Date().toLocaleDateString()}`);
            await this.printLine(`Time: ${receiptData.time || new Date().toLocaleTimeString()}`);
            await this.printLine(`Receipt #: ${receiptData.receiptNumber || '12345'}`);
            await this.printLine('');
            
            // Customer info
            if (receiptData.customerName) {
                await this.printLine(`Customer: ${receiptData.customerName}`);
            }
            if (receiptData.customerPhone) {
                await this.printLine(`Phone: ${receiptData.customerPhone}`);
            }
            await this.printLine('');
            
            // Items
            await this.printLine('ITEMS:');
            await this.printHorizontalLine();
            
            receiptData.items.forEach(item => {
                const line = `${item.quantity}x ${item.name} ${' '.repeat(20 - item.name.length - item.quantity.toString().length)} ${item.price.toFixed(2)}`;
                this.printLine(line);
            });
            
            await this.printLine('');
            await this.printHorizontalLine();
            
            // Totals
            await this.printLine(`Subtotal: ${receiptData.subtotal.toFixed(2)}`);
            await this.printLine(`Tax: ${receiptData.tax.toFixed(2)}`);
            await this.printLine(`Total: ${receiptData.total.toFixed(2)}`);
            await this.printLine('');
            
            // Payment
            await this.printLine(`Payment: ${receiptData.paymentMethod}`);
            if (receiptData.change) {
                await this.printLine(`Change: ${receiptData.change.toFixed(2)}`);
            }
            await this.printLine('');
            
            // Barcode (if available)
            if (receiptData.barcode) {
                await this.printBarcode(receiptData.barcode);
            }
            
            // QR Code (if available)
            if (receiptData.qrCode) {
                await this.printQRCode(receiptData.qrCode);
            }
            
            // Footer
            await this.printHorizontalLine();
            await this.printCentered('THANK YOU FOR YOUR PURCHASE!');
            await this.printLine('');
            
            // Cut paper
            await this.cutPaper();
        }
    }

    /**
     * Print KOT (Kitchen Order Ticket)
     * @param {Object} kotData - KOT data
     */
    async printKOT(kotData) {
        // Header
        await this.printCentered('KITCHEN ORDER TICKET');
        await this.printCentered(`Order #: ${kotData.orderNumber}`);
        await this.printCentered(`Table: ${kotData.tableNumber || 'N/A'}`);
        await this.printLine(`Time: ${kotData.time || new Date().toLocaleTimeString()}`);
        await this.printHorizontalLine();
        await this.printLine('');
        
        // Items
        kotData.items.forEach(item => {
            const line = `${item.quantity}x ${item.name}`;
            if (item.specialInstructions) {
                this.printLine(line);
                this.printLine(`  ${item.specialInstructions}`);
            } else {
                this.printLine(line);
            }
        });
        
        await this.printLine('');
        await this.printHorizontalLine();
        
        // Footer
        await this.printCentered('READY TO SERVE');
        await this.printLine('');
        
        // Cut paper
        await this.cutPaper();
    }

    /**
     * Get printer status
     * @returns {Object} Printer status
     */
    async getStatus() {
        if (!this.isConnected) {
            return {
                status: 'disconnected',
                details: 'Printer is not connected',
                paper_level: 0,
                ink_level: 0,
                error_code: null
            };
        }
        
        // In a real implementation, we would query the printer for status
        // For now, we'll return simulated status
        
        return {
            status: 'connected',
            details: 'Printer is ready',
            paper_level: this.paperLevel,
            ink_level: this.inkLevel,
            error_code: null
        };
    }

    /**
     * Test printer connection
     * @returns {boolean} True if connection is working
     */
    async testConnection() {
        try {
            if (!this.isConnected) {
                await this.connect();
            }
            
            // Send a test command
            await this.printText('TEST PRINT', { bold: true });
            await this.cutPaper('partial');
            
            return true;
        } catch (error) {
            this.logger.error('Connection test failed:', error);
            return false;
        }
    }

    /**
     * Feed paper
     * @param {number} [lines=1] - Number of lines to feed
     */
    async feedPaper(lines = 1) {
        const command = '\n'.repeat(lines);
        await this.sendRaw(command);
    }

    /**
     * Initialize printer
     */
    async initializePrinter() {
        // Reset printer
        await this.sendRaw('\x1b\x40');
        
        // Set default character set
        await this.sendRaw('\x1b\x74\x11'); // UTF-8
        
        // Set line spacing
        await this.sendRaw('\x1b\x33\x24'); // 24 dots per line
    }
}

module.exports = ESCPOSDriver;
