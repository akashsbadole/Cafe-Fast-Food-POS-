# Hardware Setup Guide

## Overview

This guide provides step-by-step instructions for setting up hardware devices (printers, Customer Facing Displays, and cash drawers) with the Cafe POS System.

## Prerequisites

- Cafe POS System installed and running
- Hardware devices connected and powered on
- Appropriate drivers installed for your operating system
- Administrative access to the POS system

## Hardware Compatibility

### Supported Printers
- ESC/POS compatible printers (Epson, Star, Bixolon, etc.)
- Thermal printers (80mm, 58mm paper sizes)
- Impact printers (for kitchen orders)
- USB, Network, and Serial connections

### Supported Customer Facing Displays (CFD)
- Customer display systems with web interface
- Android-based displays
- Raspberry Pi with touchscreen
- Network-connected displays

### Supported Cash Drawers
- Standard 24V cash drawers
- USB-connected cash drawers
- Printer-triggered cash drawers
- Network-controlled cash drawers

## Printer Setup

### Step 1: Connect the Printer

#### USB Connection
1. Connect the printer to an available USB port on your POS terminal
2. Ensure the printer is powered on
3. Check that the device is recognized by your operating system

#### Network Connection
1. Connect the printer to your network (Ethernet or WiFi)
2. Note the printer's IP address (check printer settings or network router)
3. Ensure the printer is on the same network as your POS system

#### Serial Connection
1. Connect the printer to a serial port
2. Configure the correct baud rate (typically 9600, 19200, or 38400)
3. Ensure proper cable connections

### Step 2: Register the Printer in POS System

1. Log in to the Cafe POS System as an administrator
2. Navigate to **Settings > Hardware > Printers**
3. Click **Add New Printer**
4. Fill in the printer details:
   - **Device Name**: Descriptive name (e.g., "Kitchen Printer 1", "Receipt Printer")
   - **Device Type**: `escpos_printer`
   - **Device Identifier**: Unique identifier (e.g., "USB001", "NET192.168.1.100")
   - **Connection Type**: `usb`, `network`, or `serial`
   - **Connection String**:
     - USB: `/dev/usb/lp0` (Linux) or appropriate COM port
     - Network: `192.168.1.100:9100`
     - Serial: `/dev/ttyS0` with appropriate baud rate
   - **Device Model**: Printer model (e.g., "Epson TM-T20")
   - **Manufacturer**: Printer manufacturer
   - **Paper Size**: `80mm` or `58mm`
   - **Character Set**: `UTF-8` (recommended)

5. Click **Save**

### Step 3: Test the Printer

1. Navigate to **Hardware > Printers**
2. Select the printer you just added
3. Click **Test Connection**
4. If the connection is successful, click **Test Print**
5. Verify that the test receipt prints correctly

### Step 4: Configure Printer Settings

1. Go to **Settings > Hardware > Printers**
2. Select the printer
3. Configure advanced settings:
   - **Print Density**: Adjust for dark/light printing
   - **Print Speed**: Faster or slower printing
   - **Paper Cut**: Full cut, partial cut, or no cut
   - **Auto Cut**: Enable/disable automatic paper cutting
   - **Logo Printing**: Upload business logo for receipts
   - **Header/Footer**: Custom header and footer text

### Step 5: Assign Printer to Functions

1. Go to **Settings > System > Printer Assignments**
2. Assign printers to specific functions:
   - **Receipt Printer**: Prints customer receipts
   - **Kitchen Printer**: Prints Kitchen Order Tickets (KOT)
   - **Report Printer**: Prints daily reports
   - **Label Printer**: Prints product labels

## Customer Facing Display (CFD) Setup

### Step 1: Connect the CFD

#### Network Connection (Recommended)
1. Connect the CFD to your network
2. Note the IP address assigned to the CFD
3. Ensure the CFD can access the POS system's API

#### USB Connection
1. Connect the CFD to a USB port
2. Install any required drivers
3. Configure the connection settings

### Step 2: Register the CFD in POS System

1. Log in to the Cafe POS System as an administrator
2. Navigate to **Settings > Hardware > Devices**
3. Click **Add New Device**
4. Fill in the CFD details:
   - **Device Name**: Descriptive name (e.g., "Counter CFD", "Drive-Thru Display")
   - **Device Type**: `cfd_display`
   - **Device Identifier**: Unique identifier (e.g., "CFD001", "192.168.1.101")
   - **Connection Type**: `network` or `usb`
   - **Connection String**: IP address or USB port
   - **Device Model**: CFD model
   - **Manufacturer**: Manufacturer name
   - **Resolution**: Display resolution (e.g., "1024x768")
   - **Orientation**: Portrait or landscape

5. Click **Save**

### Step 3: Test the CFD Connection

1. Navigate to **Hardware > Devices**
2. Select the CFD
3. Click **Test Connection**
4. Verify the connection is successful

### Step 4: Configure CFD Content

1. Go to **Settings > Hardware > CFD Content**
2. Select the CFD device
3. Configure content types:
   - **Order Information**: Display current order details
   - **Payment Information**: Show payment status
   - **Loyalty Information**: Display customer loyalty status
   - **Promotions**: Show current promotions
   - **Custom Content**: Custom HTML/JS content

4. For each content type, configure:
   - **Display Duration**: How long to show each item
   - **Animation**: Transition effects
   - **Font Size**: Text size
   - **Color Scheme**: Colors to use
   - **Logo**: Business logo display

### Step 5: Set Up Content Templates

1. Go to **Settings > Hardware > CFD Templates**
2. Create templates for different scenarios:
   - **Order Waiting**: "Your order is being prepared"
   - **Order Ready**: "Order #123 is ready for pickup"
   - **Payment Processing**: "Processing payment..."
   - **Loyalty Message**: "You have 50 points!"

3. Use the template editor to design your content
4. Preview the template before saving

### Step 6: Assign CFD to Terminal

1. Go to **Settings > Terminals**
2. Select the terminal that will use the CFD
3. Assign the CFD device to this terminal
4. Configure display settings:
   - **Auto-rotate**: Rotate display based on time of day
   - **Brightness**: Adjust display brightness
   - **Sleep Timer**: When to dim/turn off display

## Cash Drawer Setup

### Step 1: Connect the Cash Drawer

#### Printer-Triggered Cash Drawer
1. Connect the cash drawer to the printer
2. Ensure proper cable connections
3. Power on the cash drawer

#### USB Cash Drawer
1. Connect the cash drawer to a USB port
2. Install any required drivers
3. Power on the cash drawer

#### Network Cash Drawer
1. Connect the cash drawer to your network
2. Note the IP address
3. Power on the cash drawer

### Step 2: Register the Cash Drawer in POS System

1. Log in to the Cafe POS System as an administrator
2. Navigate to **Settings > Hardware > Cash Drawers**
3. Click **Add New Cash Drawer**
4. Fill in the cash drawer details:
   - **Name**: Descriptive name (e.g., "Main Cash Drawer", "Counter 1")
   - **Location**: Physical location (e.g., "Counter 1", "Drive-Thru")
   - **Description**: Optional description
   - **Connection Type**: `printer`, `usb`, or `network`
   - **Connection String**:
     - Printer: Select associated printer
     - USB: COM port or USB identifier
     - Network: IP address and port
   - **Opening Method**: How the drawer opens
   - **Voltage**: 24V (standard)

5. Click **Save**

### Step 3: Test the Cash Drawer

1. Navigate to **Hardware > Cash Drawers**
2. Select the cash drawer you just added
3. Click **Test Open**
4. Verify that the cash drawer opens
5. Click **Test Close** to close it

### Step 4: Configure Cash Drawer Sessions

1. Go to **Settings > Cash Drawers > Sessions**
2. Configure session settings:
   - **Default Opening Balance**: Starting amount for new sessions
   - **Minimum Balance**: Minimum required balance
   - **Maximum Balance**: Maximum allowed balance
   - **Auto-Reconcile**: Enable automatic reconciliation
   - **Reconciliation Threshold**: Amount difference that triggers alert

### Step 5: Set Up Cash Drawer Locations

1. Go to **Settings > Locations**
2. Edit each location to assign cash drawers
3. Configure:
   - **Primary Cash Drawer**: Main drawer for this location
   - **Backup Cash Drawer**: Secondary drawer
   - **Float Amount**: Starting float for new sessions
   - **Expected End-of-Day Balance**: Target balance

## Troubleshooting Hardware Issues

### Printer Issues

#### Printer Not Detected
- **Check**: Is the printer powered on?
- **Check**: Are cables securely connected?
- **Check**: Is the correct port selected?
- **Check**: Are drivers installed?
- **Solution**: Reboot the printer and computer

#### Printer Not Printing
- **Check**: Is paper loaded correctly?
- **Check**: Is the printer online?
- **Check**: Is there a paper jam?
- **Check**: Are ink/toner levels sufficient?
- **Solution**: Clear any error messages on printer display

#### Print Quality Issues
- **Check**: Is the paper type correct?
- **Check**: Is the print density set correctly?
- **Check**: Are print heads clean?
- **Solution**: Run printer maintenance/cleaning cycle

### CFD Issues

#### CFD Not Connecting
- **Check**: Is the CFD powered on?
- **Check**: Is the network connection stable?
- **Check**: Is the IP address correct?
- **Check**: Is the firewall allowing connections?
- **Solution**: Restart the CFD and POS system

#### CFD Displaying Incorrect Information
- **Check**: Is the correct template assigned?
- **Check**: Is the content configuration correct?
- **Check**: Is the display refresh rate set properly?
- **Solution**: Clear cache and refresh the display

#### CFD Frozen
- **Check**: Is the device overheating?
- **Check**: Are there memory issues?
- **Solution**: Reboot the CFD device

### Cash Drawer Issues

#### Cash Drawer Not Opening
- **Check**: Is the drawer powered on?
- **Check**: Are cables securely connected?
- **Check**: Is the trigger signal being sent?
- **Check**: Is there a mechanical obstruction?
- **Solution**: Manually open the drawer and check for issues

#### Cash Drawer Opening Unexpectedly
- **Check**: Is the trigger signal being sent incorrectly?
- **Check**: Are there ghost signals from the printer?
- **Check**: Is the drawer locked properly?
- **Solution**: Check printer settings and cable connections

#### Cash Drawer Not Closing
- **Check**: Is there an obstruction?
- **Check**: Are the springs functioning properly?
- **Check**: Is the latch mechanism working?
- **Solution**: Manually close the drawer and check for issues

## Best Practices

### Printer Maintenance
- **Regular Cleaning**: Clean print heads weekly
- **Paper Quality**: Use high-quality thermal paper
- **Temperature Control**: Keep printers in temperature-controlled areas
- **Power Management**: Avoid frequent power cycles
- **Firmware Updates**: Keep printer firmware updated

### CFD Maintenance
- **Regular Reboots**: Reboot displays weekly
- **Screen Cleaning**: Clean screens with appropriate cleaners
- **Brightness Settings**: Adjust brightness for visibility
- **Network Stability**: Ensure stable network connection
- **Content Updates**: Keep content templates updated

### Cash Drawer Maintenance
- **Regular Inspection**: Check drawer mechanism monthly
- **Cleaning**: Keep drawer interior clean
- **Lock Mechanism**: Lubricate lock mechanism periodically
- **Security**: Secure drawer when not in use
- **Balance Tracking**: Monitor cash drawer balances regularly

## Advanced Configuration

### Multiple Printers
1. Register each printer with a unique identifier
2. Assign printers to different functions (receipt, kitchen, reports)
3. Configure printer-specific settings for each
4. Test each printer individually

### Redundant Printers
1. Set up a primary and backup printer
2. Configure automatic failover in settings
3. Test failover by disconnecting primary printer
4. Monitor printer status in real-time

### Network Printer Configuration
1. Assign static IP addresses to printers
2. Configure DNS settings for printer discovery
3. Set up VLAN for printer traffic (if needed)
4. Configure firewall rules to allow printer traffic

### Printer Pooling
1. Group multiple printers together
2. Distribute print jobs across printers
3. Configure load balancing settings
4. Monitor printer queue status

## Monitoring and Alerts

### Hardware Status Monitoring
1. Enable hardware status monitoring in **Settings > Hardware > Monitoring**
2. Configure monitoring intervals (recommended: every 5 minutes)
3. Set up alerts for:
   - Printer offline
   - CFD disconnected
   - Cash drawer not responding
   - Low paper levels
   - Print errors

### Alert Notifications
1. Configure notification methods:
   - Email alerts
   - SMS alerts
   - Desktop notifications
   - Mobile app notifications
2. Set up escalation policies for critical alerts
3. Test alert notifications regularly

### Logging
1. Enable detailed hardware logging in **Settings > System > Logging**
2. Configure log retention policies
3. Set up log rotation for large log files
4. Monitor logs for recurring issues

## Performance Optimization

### Printer Performance
- **Batch Printing**: Group multiple receipts together
- **Print Optimization**: Reduce unnecessary print elements
- **Network Priority**: Set QoS for printer traffic
- **Driver Optimization**: Use optimized printer drivers

### CFD Performance
- **Content Optimization**: Reduce complex animations
- **Network Bandwidth**: Allocate sufficient bandwidth
- **Display Refresh**: Optimize refresh rates
- **Caching**: Enable content caching where possible

### Cash Drawer Performance
- **Quick Access**: Position drawers for easy access
- **Organized**: Keep drawers organized for quick transactions
- **Training**: Train staff on efficient drawer usage

## Security Considerations

### Physical Security
- **Secure Location**: Place hardware in secure locations
- **Cable Locks**: Use cable locks for portable devices
- **Access Control**: Restrict physical access to hardware
- **Surveillance**: Monitor hardware areas with cameras

### Network Security
- **Firewall Rules**: Restrict access to hardware devices
- **VPN**: Use VPN for remote hardware access
- **Encryption**: Enable encryption for network devices
- **Authentication**: Require authentication for device access

### Data Security
- **Secure Connections**: Use HTTPS for all communications
- **Data Encryption**: Encrypt sensitive data
- **Audit Logs**: Maintain detailed audit logs
- **Regular Audits**: Conduct security audits regularly

## Support and Resources

### Troubleshooting Guides
- [Printer Troubleshooting Guide](#printer-issues)
- [CFD Troubleshooting Guide](#cfd-issues)
- [Cash Drawer Troubleshooting Guide](#cash-drawer-issues)

### Hardware Documentation
- Consult manufacturer documentation for specific devices
- Check POS system logs for hardware-related errors
- Review system requirements for hardware compatibility

### Support Contact
- Email: support@cafe-pos.com
- Phone: +1-800-555-1234
- Website: https://cafe-pos.com/support

## Appendix

### Common Error Codes

| Error Code | Description | Solution |
|------------|-------------|----------|
| PRN-001 | Printer not detected | Check connections and power |
| PRN-002 | Printer offline | Restart printer and check network |
| PRN-003 | Paper jam | Clear paper jam |
| PRN-004 | Print error | Check printer status and logs |
| CFD-001 | CFD not responding | Restart CFD device |
| CFD-002 | Connection failed | Check network settings |
| CFD-003 | Display error | Check display configuration |
| CD-001 | Cash drawer not responding | Check connections and power |
| CD-002 | Open failed | Check mechanical operation |
| CD-003 | Communication error | Check cable connections |

### Recommended Hardware

#### Printers
- Epson TM-T20 (thermal)
- Epson TM-T88 (thermal)
- Star Micronics TSP100 (thermal)
- Bixolon SRP-350 (thermal)

#### Customer Facing Displays
- Android-based displays (7-10 inch)
- Raspberry Pi with touchscreen
- Dedicated CFD hardware

#### Cash Drawers
- Standard 24V cash drawers
- USB cash drawers with lock
- Network-controlled cash drawers

### System Requirements

#### Printers
- ESC/POS compatible
- USB, Network, or Serial interface
- Thermal or impact printing
- 80mm or 58mm paper support

#### CFDs
- Web browser or dedicated app
- Network or USB connection
- Touchscreen support (recommended)
- Minimum 720p resolution

#### Cash Drawers
- 24V operation
- Printer-triggered or direct control
- USB, Network, or serial interface
- Secure locking mechanism
