# Online Order Integration Setup Guide

## Overview

This guide provides step-by-step instructions for integrating online order platforms with the Cafe POS System.

## Prerequisites

- Cafe POS System installed and running
- Administrative access to the POS system
- Online order platform account
- API credentials from the online platform
- Webhook URL accessible from the internet

## Supported Platforms

The Cafe POS System supports integration with various online order platforms:
- Food delivery services (Uber Eats, DoorDash, Grubhub, etc.)
- Restaurant aggregators
- Direct online ordering websites
- Mobile food ordering apps

## Setup Process

### Step 1: Register with Online Platform

1. **Create Account**: Sign up for an account with your online order platform
2. **Verify Business**: Complete business verification process
3. **Set Up Menu**: Upload your menu to the platform
4. **Configure Delivery**: Set up delivery zones and fees
5. **Get API Access**: Request API access from the platform

### Step 2: Configure Platform Credentials

1. Log in to the Cafe POS System as an administrator
2. Navigate to **Settings > Online Orders > Providers**
3. Click **Add New Provider**
4. Fill in the provider details:
   - **Name**: Platform name (e.g., "uber_eats", "doordash")
   - **Display Name**: Friendly name (e.g., "Uber Eats", "DoorDash")
   - **Description**: Brief description of the platform
   - **API Base URL**: Platform's API endpoint (e.g., "https://api.uber.com/v1")
   - **Webhook URL Pattern**: Platform's webhook URL pattern
   - **Logo URL**: URL to platform logo
   - **Support Email**: Platform support email
   - **Support Phone**: Platform support phone
   - **Is Active**: Enable the integration

5. Click **Save**

### Step 3: Configure API Credentials

1. Go to **Settings > Online Orders > Providers**
2. Select the provider you just added
3. Click **Configure Credentials**
4. Enter the API credentials provided by the platform:
   - **Client ID**: Your application client ID
   - **Client Secret**: Your application client secret
   - **API Key**: Platform API key
   - **API Secret**: Platform API secret
   - **Webhook Secret**: Webhook signing secret
   - **Signature Key**: Signature verification key
   - **Auth Header Name**: Authorization header name (default: "Authorization")
   - **Auth Header Format**: Authorization header format (default: "Bearer {token}")

5. Click **Save Credentials**

### Step 4: Test API Connection

1. Select the provider
2. Click **Test Connection**
3. The system will attempt to authenticate with the platform
4. If successful, you'll see a confirmation message
5. If failed, check your credentials and try again

### Step 5: Configure Webhook Settings

1. Go to **Settings > Online Orders > Webhooks**
2. Click **Add New Webhook**
3. Configure webhook settings:
   - **Provider**: Select the online platform
   - **Webhook URL**: Your POS system's webhook URL (e.g., "https://yourpos.com/api/online-orders/webhooks")
   - **Event Types**: Select events to receive (order_created, order_updated, order_cancelled, etc.)
   - **Is Active**: Enable the webhook

4. Click **Save**

5. **Configure Platform Webhook**:
   - Log in to your online platform's dashboard
   - Navigate to webhook settings
   - Enter your POS system's webhook URL
   - Set the webhook secret (must match what's in POS)
   - Select the events to send
   - Save the webhook configuration

### Step 6: Map Menu Items

1. Go to **Settings > Online Orders > Menu Mapping**
2. Click **Sync Menu** to import menu from the platform
3. Review the imported menu items
4. Map POS menu items to platform menu items:
   - **POS Item**: Your POS menu item
   - **Platform Item**: Platform menu item
   - **Price Mapping**: Map prices if different
   - **Modifier Mapping**: Map modifiers if applicable

5. Click **Save Mappings**

### Step 7: Configure Order Settings

1. Go to **Settings > Online Orders > Order Settings**
2. Configure order settings:
   - **Order Prefix**: Prefix for online order numbers (e.g., "ON-")
   - **Auto-Accept Orders**: Automatically accept orders (recommended: disabled for manual review)
   - **Auto-Send to KDS**: Automatically send to Kitchen Display System
   - **Default Order Type**: Default order type (delivery, pickup, etc.)
   - **Default Location**: Default location for online orders
   - **Default Station**: Default KDS station for online orders
   - **Priority Orders**: Treat online orders as priority
   - **Estimated Prep Time**: Default estimated preparation time

3. Configure delivery settings:
   - **Delivery Fee Handling**: How to handle delivery fees
   - **Service Fee Handling**: How to handle service fees
   - **Tax Calculation**: How to calculate taxes for online orders
   - **Tip Handling**: How to handle tips

4. Click **Save Settings**

### Step 8: Configure Status Mapping

1. Go to **Settings > Online Orders > Status Mapping**
2. Map platform statuses to POS statuses:
   - **Platform Status**: Platform's order status
   - **POS Status**: Corresponding POS status
   - **Action**: What action to take when status changes

Example mappings:
- **Platform**: "pending" → **POS**: "received" → **Action**: None
- **Platform**: "accepted" → **POS**: "in-progress" → **Action**: Send to KDS
- **Platform**: "completed" → **POS**: "completed" → **Action**: None
- **Platform**: "cancelled" → **POS**: "cancelled" → **Action**: Void order

3. Click **Save Mappings**

### Step 9: Test the Integration

1. **Create Test Order**: Place a test order through the online platform
2. **Verify Webhook**: Check that the webhook is received in POS logs
3. **Check Order**: Verify the order appears in the POS system
4. **Process Order**: Process the order through the POS
5. **Update Status**: Update the order status and verify it syncs back to the platform
6. **Complete Order**: Complete the order and verify final status

### Step 10: Monitor and Optimize

1. **Enable Monitoring**: Go to **Reports > Online Orders > Monitoring**
2. **Set Up Alerts**: Configure alerts for:
   - Failed webhook deliveries
   - Orders not processed within time limits
   - High cancellation rates
   - Revenue tracking

3. **Review Performance**: Regularly review online order performance:
   - Order volume
   - Average order value
   - Completion times
   - Cancellation rates
   - Revenue by platform

4. **Optimize Menu**: Based on sales data, optimize your online menu
5. **Adjust Settings**: Fine-tune settings based on performance data

## Platform-Specific Guides

### Uber Eats Integration

1. **Register**: Sign up at https://restaurant.ubereats.com
2. **Verify**: Complete business verification
3. **API Access**: Request API access through Uber Eats support
4. **Credentials**: Obtain client ID, client secret, and webhook secret
5. **Menu**: Upload menu with categories and modifiers
6. **Delivery Zones**: Configure delivery zones and fees
7. **POS Configuration**: Follow steps 2-10 above

**Uber Eats Specific Settings:**
- Use API Base URL: `https://api.uber.com/v1`
- Webhook URL Pattern: `https://api.uber.com/webhooks/{provider_id}`
- Enable real-time order updates
- Configure delivery fee handling

### DoorDash Integration

1. **Register**: Sign up at https://www.doordash.com/dashboard
2. **Verify**: Complete business verification
3. **API Access**: Request API access through DoorDash support
4. **Credentials**: Obtain API key, secret, and webhook secret
5. **Menu**: Upload menu with categories
6. **Delivery Zones**: Configure delivery zones
7. **POS Configuration**: Follow steps 2-10 above

**DoorDash Specific Settings:**
- Use API Base URL: `https://api.doordash.com/v2`
- Webhook URL Pattern: `https://api.doordash.com/webhooks/{provider_id}`
- Enable order status updates
- Configure service fee handling

### Grubhub Integration

1. **Register**: Sign up at https://restaurant.grubhub.com
2. **Verify**: Complete business verification
3. **API Access**: Request API access through Grubhub support
4. **Credentials**: Obtain API key, secret, and webhook secret
5. **Menu**: Upload menu with categories and modifiers
6. **Delivery Zones**: Configure delivery zones
7. **POS Configuration**: Follow steps 2-10 above

**Grubhub Specific Settings:**
- Use API Base URL: `https://api.grubhub.com/restaurant/v1`
- Webhook URL Pattern: `https://api.grubhub.com/webhooks/{provider_id}`
- Enable real-time order updates
- Configure tax calculation method

## Webhook Configuration

### Webhook URL Format

Your webhook URL should be in the format:
```
https://yourdomain.com/api/online-orders/webhooks
```

### Webhook Signature Verification

The POS system verifies webhook signatures to ensure they come from legitimate sources.

**Signature Format:**
```
X-Signature: sha256=abc123def456...
```

### Webhook Events

The POS system handles the following webhook events:

| Event Type | Description | Action |
|------------|-------------|--------|
| `order_created` | New order received | Create order in POS |
| `order_updated` | Order status updated | Update order status |
| `order_accepted` | Order accepted by restaurant | Update status |
| `order_rejected` | Order rejected | Cancel order |
| `order_completed` | Order completed | Mark as completed |
| `order_cancelled` | Order cancelled | Void order |
| `order_picked_up` | Order picked up | Update status |
| `order_delivered` | Order delivered | Mark as delivered |

### Webhook Retry Policy

If a webhook fails to deliver, the POS system will:
1. Retry immediately (1st attempt)
2. Retry after 1 minute (2nd attempt)
3. Retry after 5 minutes (3rd attempt)
4. Retry after 15 minutes (4th attempt)
5. Retry after 1 hour (5th attempt)
6. Give up after 5 failed attempts

## Order Processing Workflow

### Order Reception
1. **Webhook Received**: Online platform sends order via webhook
2. **Order Created**: POS creates order with online order metadata
3. **Validation**: Order is validated and assigned to appropriate station
4. **Notification**: Staff is notified of new online order

### Order Preparation
1. **Order Accepted**: Order is accepted and sent to KDS
2. **Status Updates**: KDS updates order status in real-time
3. **Progress Tracking**: Online platform receives status updates
4. **Customer Notifications**: Customer receives preparation updates

### Order Completion
1. **Order Ready**: Order is marked as ready
2. **Status Synced**: Status synced back to online platform
3. **Customer Notified**: Customer notified order is ready
4. **Completion**: Order marked as completed

### Order Cancellation
1. **Cancellation Request**: Online platform sends cancellation
2. **Order Voided**: Order is voided in POS
3. **Inventory Adjusted**: Inventory is adjusted if needed
4. **Refund Processed**: Refund processed if payment was received
5. **Confirmation**: Cancellation confirmed to platform

## Troubleshooting

### Webhook Issues

#### Webhook Not Received
- **Check**: Is the webhook URL correct in the platform?
- **Check**: Is the webhook active in POS?
- **Check**: Is the POS system accessible from the internet?
- **Check**: Are there firewall rules blocking the webhook?
- **Solution**: Test webhook with a tool like Postman

#### Webhook Signature Mismatch
- **Check**: Is the webhook secret correct?
- **Check**: Is the signature header being sent?
- **Check**: Is the signature format correct?
- **Solution**: Regenerate webhook secret and update in platform

#### Webhook Processing Failed
- **Check**: Are there errors in the POS logs?
- **Check**: Is the order data valid?
- **Check**: Are menu mappings correct?
- **Solution**: Review logs and fix any data issues

### Order Sync Issues

#### Orders Not Syncing to Platform
- **Check**: Is the sync interval configured?
- **Check**: Is the platform API accessible?
- **Check**: Are API credentials valid?
- **Solution**: Manually trigger sync or check API connection

#### Status Not Updating
- **Check**: Are status mappings configured?
- **Check**: Is the sync interval set correctly?
- **Check**: Are there API errors in logs?
- **Solution**: Manually update status or check API connection

### Menu Sync Issues

#### Menu Not Syncing
- **Check**: Is the menu sync enabled?
- **Check**: Are there API errors in logs?
- **Check**: Is the platform menu up to date?
- **Solution**: Manually sync menu or check API connection

#### Price Mismatches
- **Check**: Are price mappings configured?
- **Check**: Are platform prices up to date?
- **Check**: Is tax calculation correct?
- **Solution**: Review price mappings and adjust if needed

## Best Practices

### Menu Optimization
- **Clear Descriptions**: Use clear, concise item descriptions
- **High-Quality Images**: Upload high-quality food images
- **Category Organization**: Organize menu into logical categories
- **Modifier Setup**: Configure modifiers for customization options
- **Pricing Strategy**: Set competitive prices for online orders

### Order Management
- **Quick Acceptance**: Accept orders promptly to improve customer experience
- **Real-Time Updates**: Keep order statuses updated in real-time
- **Clear Communication**: Communicate any delays or issues promptly
- **Quality Control**: Maintain consistent food quality for online orders
- **Packaging**: Use appropriate packaging for delivery orders

### Performance Monitoring
- **Track Metrics**: Monitor key performance indicators:
  - Order volume
  - Average order value
  - Order completion time
  - Cancellation rate
  - Revenue by platform

- **Set Goals**: Establish performance goals and track progress
- **Regular Reviews**: Review performance data regularly
- **Adjust Strategies**: Adjust based on performance data

### Customer Experience
- **Fast Response**: Respond quickly to online orders
- **Clear Instructions**: Provide clear delivery instructions
- **Order Accuracy**: Ensure orders are prepared correctly
- **Timely Delivery**: Deliver orders on time
- **Follow-Up**: Follow up on customer feedback

## Advanced Configuration

### Multiple Platform Integration
1. **Add Multiple Providers**: Configure multiple online platforms
2. **Unified Menu**: Maintain a unified menu across all platforms
3. **Platform-Specific Settings**: Configure settings per platform
4. **Performance Tracking**: Track performance by platform
5. **Revenue Analysis**: Analyze revenue by platform

### Custom Webhook Processing
1. **Custom Logic**: Add custom logic for webhook processing
2. **Order Routing**: Route orders to specific stations based on platform
3. **Priority Handling**: Handle high-priority orders differently
4. **Special Instructions**: Process special instructions from platforms
5. **Integration Hooks**: Use integration hooks for custom processing

### Automated Order Processing
1. **Auto-Accept**: Configure automatic order acceptance
2. **Auto-Assignment**: Automatically assign orders to stations
3. **Auto-Send to KDS**: Automatically send orders to KDS
4. **Auto-Status Updates**: Automatically update order statuses
5. **Auto-Notifications**: Automatically notify staff of new orders

## Security Considerations

### API Security
- **Secure Credentials**: Store API credentials securely
- **HTTPS**: Use HTTPS for all API communications
- **Authentication**: Use strong authentication methods
- **Authorization**: Implement proper authorization checks
- **Rate Limiting**: Apply rate limiting to API endpoints

### Webhook Security
- **Signature Verification**: Verify webhook signatures
- **IP Whitelisting**: Whitelist platform IP addresses
- **Input Validation**: Validate all webhook data
- **Error Handling**: Handle webhook errors gracefully
- **Logging**: Log webhook activity for auditing

### Data Protection
- **Customer Data**: Protect customer data and information
- **Payment Data**: Handle payment data securely
- **Order Data**: Secure order data and history
- **Access Control**: Implement proper access controls
- **Regular Audits**: Conduct regular security audits

## Support and Resources

### Troubleshooting Guides
- [Webhook Troubleshooting](#webhook-issues)
- [Order Sync Troubleshooting](#order-sync-issues)
- [Menu Sync Troubleshooting](#menu-sync-issues)

### Platform Documentation
- Consult platform-specific documentation for detailed API information
- Review platform webhook documentation for event formats
- Check platform status pages for any outages

### Support Contact
- **POS Support**: support@cafe-pos.com
- **Platform Support**: Contact your online platform's support team
- **Technical Support**: +1-800-555-1234

## Appendix

### Common Error Codes

| Error Code | Description | Solution |
|------------|-------------|----------|
| ONL-001 | Webhook signature mismatch | Verify webhook secret |
| ONL-002 | API authentication failed | Check API credentials |
| ONL-003 | Menu sync failed | Check menu mapping |
| ONL-004 | Order creation failed | Check order data validation |
| ONL-005 | Status update failed | Check status mapping |
| ONL-006 | Webhook processing failed | Check POS logs |
| ONL-007 | API rate limit exceeded | Reduce API calls or upgrade plan |
| ONL-008 | Connection timeout | Check network connectivity |
| ONL-009 | Invalid order data | Validate order data |
| ONL-010 | Platform API error | Check platform status |

### Recommended Settings

#### General Settings
- **Sync Interval**: 30 seconds (for real-time updates)
- **Auto-Accept Orders**: Disabled (for manual review)
- **Auto-Send to KDS**: Enabled (for efficiency)
- **Default Prep Time**: 15-20 minutes (adjust based on menu)

#### Webhook Settings
- **Signature Verification**: Enabled (for security)
- **IP Whitelisting**: Enabled (if platform provides IPs)
- **Retry Policy**: 5 attempts with exponential backoff
- **Error Logging**: Enabled (for troubleshooting)

#### Order Settings
- **Order Prefix**: "ON-" (for easy identification)
- **Default Location**: Appropriate location for online orders
- **Default Station**: Appropriate KDS station for online orders
- **Priority Orders**: Enabled (for faster processing)

### Performance Metrics

#### Key Metrics to Track
- **Order Volume**: Number of orders per day/hour
- **Average Order Value**: Average spend per order
- **Order Completion Time**: Time from order to completion
- **Cancellation Rate**: Percentage of cancelled orders
- **Revenue by Platform**: Revenue from each platform
- **Customer Ratings**: Customer ratings and feedback

#### Benchmark Goals
- **Order Acceptance**: < 1 minute
- **Order Completion**: < 30 minutes (from acceptance)
- **Cancellation Rate**: < 5%
- **Customer Ratings**: > 4.5/5
- **Revenue Growth**: Consistent month-over-month growth
