# Digital Receipts Setup Guide

## Overview

This guide provides step-by-step instructions for configuring digital receipts (email, WhatsApp, and SMS) in the Cafe POS System.

## Prerequisites

- Cafe POS System installed and running
- Administrative access to the POS system
- Email server or email service provider
- WhatsApp Business API account (optional)
- SMS gateway account (optional)
- Customer contact information in the system

## Benefits of Digital Receipts

- **Environmental**: Reduce paper waste
- **Convenience**: Customers receive receipts instantly
- **Marketing**: Include promotions and loyalty information
- **Compliance**: Meet tax regulations with digital records
- **Customer Service**: Easy access to receipts for returns/refunds

## Setup Process

### Step 1: Configure Email Settings

#### Option A: SMTP Server Configuration

1. Log in to the Cafe POS System as an administrator
2. Navigate to **Settings > Digital Receipts > Email**
3. Click **Configure SMTP**
4. Enter SMTP server details:
   - **SMTP Host**: Your SMTP server address (e.g., `smtp.gmail.com`, `smtp.mailgun.org`)
   - **SMTP Port**: SMTP port (typically 587 for TLS, 465 for SSL)
   - **SMTP Username**: Email username
   - **SMTP Password**: Email password
   - **Encryption**: TLS or SSL
   - **From Email**: Sender email address (e.g., `receipts@yourbusiness.com`)
   - **From Name**: Sender name (e.g., "Your Business Name")
   - **Reply-To**: Reply-to email address

5. Click **Test Connection** to verify the configuration
6. If successful, click **Save**

#### Option B: Email Service Provider

1. Sign up for an email service provider (Mailgun, SendGrid, etc.)
2. Get API credentials from the provider
3. In the POS system, navigate to **Settings > Digital Receipts > Email**
4. Select **Email Service Provider** tab
5. Enter provider details:
   - **Provider**: Select your provider (Mailgun, SendGrid, etc.)
   - **API Key**: Your provider API key
   - **Domain**: Your verified domain
   - **From Email**: Sender email address
   - **From Name**: Sender name

6. Click **Test Connection** to verify
7. Click **Save**

### Step 2: Configure WhatsApp Settings

#### Prerequisites
- WhatsApp Business API account
- Approved business profile
- Phone number verified

1. Log in to the Cafe POS System as an administrator
2. Navigate to **Settings > Digital Receipts > WhatsApp**
3. Click **Configure WhatsApp**
4. Enter WhatsApp API details:
   - **API URL**: WhatsApp Business API endpoint (e.g., `https://graph.facebook.com/v13.0`)
   - **API Key**: Your WhatsApp API key
   - **Phone Number ID**: Your WhatsApp phone number ID
   - **Business Account ID**: Your WhatsApp business account ID
   - **From Phone Number**: Your business phone number (with country code, e.g., `15551234567`)
   - **Template NSO ID**: Your approved message template namespace

5. Click **Test Connection** to verify
6. If successful, click **Save**

#### Approving Message Templates

1. Go to **Settings > Digital Receipts > WhatsApp Templates**
2. Click **Create Template**
3. Fill in template details:
   - **Name**: Template name (e.g., "receipt_template_1")
   - **Category**: Select "marketing" or "utility"
   - **Language**: Template language
   - **Header**: Optional header text
   - **Body**: Template body with variables:
     ```
     Your order #{{1}} is ready!
     
     Total: ${{2}}
     
     Thank you for your business!
     ```
   - **Footer**: Optional footer text
   - **Buttons**: Optional call-to-action buttons

4. Submit for approval (this may take 24-48 hours)
5. Once approved, select the template in the WhatsApp settings

### Step 3: Configure SMS Settings

#### Option A: SMS Gateway Configuration

1. Log in to the Cafe POS System as an administrator
2. Navigate to **Settings > Digital Receipts > SMS**
3. Click **Configure SMS Gateway**
4. Enter SMS gateway details:
   - **Gateway**: Select your SMS gateway (Twilio, Plivo, etc.)
   - **API URL**: Gateway API endpoint
   - **API Key**: Your API key
   - **API Secret**: Your API secret
   - **Account SID**: Your account SID (if applicable)
   - **From Number**: Sender ID or phone number
   - **Message Type**: Transactional or promotional

5. Click **Test Connection** to verify
6. Click **Save**

#### Option B: Direct Carrier Configuration

1. Navigate to **Settings > Digital Receipts > SMS**
2. Select **Direct Carrier** tab
3. Enter carrier details:
   - **Carrier**: Select your mobile carrier
   - **API URL**: Carrier API endpoint
   - **Username**: API username
   - **Password**: API password
   - **From Number**: Sender ID
   - **Message Type**: Transactional or promotional

4. Click **Test Connection** to verify
5. Click **Save**

### Step 4: Create Receipt Templates

#### Email Receipt Template

1. Go to **Settings > Digital Receipts > Templates**
2. Click **Add New Template**
3. Select **Email** as the template type
4. Fill in template details:
   - **Name**: Template name (e.g., "Standard Email Receipt")
   - **Description**: Brief description
   - **Subject Template**: Email subject with variables:
     ```
     Your receipt from {{business_name}} - Order #{{order_number}}
     ```
   - **Body Template**: Email body with variables:
     ```
     Thank you for your order!
     
     Order: {{order_number}}
     Date: {{order_date}}
     Time: {{order_time}}
     
     Items:
     {{items}}
     
     Subtotal: ${{subtotal}}
     Tax: ${{tax}}
     Total: ${{total}}
     
     Payment Method: {{payment_method}}
     
     Thank you for your business!
     {{business_name}}
     {{business_address}}
     ```
   - **HTML Template**: Optional HTML version:
     ```html
     <h1>Your Receipt</h1>
     <p>Thank you for your order!</p>
     <p><strong>Order #{{order_number}}</strong></p>
     <table>
       <tr><th>Item</th><th>Qty</th><th>Price</th></tr>
       {{items_table}}
     </table>
     <p>Total: ${{total}}</p>
     ```
   - **Is Default**: Check to make this the default template
   - **Is Active**: Enable the template

5. Click **Save**

#### WhatsApp Receipt Template

1. Go to **Settings > Digital Receipts > Templates**
2. Click **Add New Template**
3. Select **WhatsApp** as the template type
4. Fill in template details:
   - **Name**: Template name (e.g., "WhatsApp Receipt")
   - **Description**: Brief description
   - **Body Template**: WhatsApp message with variables:
     ```
     📋 *Your Receipt*
     
     🛒 Order #{{order_number}}
     📅 {{order_date}}
     ⏰ {{order_time}}
     
     🍔 *Items:*
     {{items}}
     
     💰 *Subtotal:* ${{subtotal}}
     💰 *Tax:* ${{tax}}
     💰 *Total:* ${{total}}
     
     💳 *Payment:* {{payment_method}}
     
     🙏 *Thank you!*
     {{business_name}}
     ```
   - **Media URL**: Optional image URL (business logo)
   - **Is Default**: Check to make this the default template
   - **Is Active**: Enable the template

5. Click **Save**

#### SMS Receipt Template

1. Go to **Settings > Digital Receipts > Templates**
2. Click **Add New Template**
3. Select **SMS** as the template type
4. Fill in template details:
   - **Name**: Template name (e.g., "SMS Receipt")
   - **Description**: Brief description
   - **Body Template**: SMS message with variables (keep under 160 characters):
     ```
     Receipt {{order_number}}: ${{total}}. {{business_name}}
     ```
   - **Is Default**: Check to make this the default template
   - **Is Active**: Enable the template

5. Click **Save**

### Step 5: Configure Customer Preferences

1. Go to **Settings > Customers > Communication Preferences**
2. Configure default preferences:
   - **Default Email Enabled**: Enable email by default
   - **Default WhatsApp Enabled**: Enable WhatsApp by default
   - **Default SMS Enabled**: Enable SMS by default
   - **Preferred Language**: Default language

3. For individual customers:
   - Edit customer profile
   - Update communication preferences
   - Set preferred receipt method
   - Verify contact information

### Step 6: Configure Delivery Settings

1. Go to **Settings > Digital Receipts > Delivery**
2. Configure delivery settings:
   - **Auto-Send Receipts**: Enable automatic receipt sending
   - **Delay**: Delay before sending (e.g., 5 minutes)
   - **Retry Failed**: Enable retry for failed deliveries
   - **Max Retries**: Maximum retry attempts (default: 3)
   - **Retry Delay**: Delay between retries (default: 1 hour)
   - **Delivery Window**: Time window for sending receipts
   - **Time Zone**: Time zone for delivery scheduling

3. Configure delivery notifications:
   - **Success Notification**: Notify staff when receipt sent successfully
   - **Failure Notification**: Notify staff when receipt fails to send
   - **Delivery Confirmation**: Request delivery confirmation (for email)

4. Click **Save**

### Step 7: Test Digital Receipts

#### Test Email Receipt

1. Go to **Settings > Digital Receipts > Test**
2. Select **Email** as the test method
3. Enter test email address
4. Select test order or create a test order
5. Click **Send Test Email**
6. Verify the email is received and formatted correctly

#### Test WhatsApp Receipt

1. Go to **Settings > Digital Receipts > Test**
2. Select **WhatsApp** as the test method
3. Enter test phone number (must be registered with WhatsApp)
4. Select test order or create a test order
5. Click **Send Test Message**
6. Verify the message is received and formatted correctly

#### Test SMS Receipt

1. Go to **Settings > Digital Receipts > Test**
2. Select **SMS** as the test method
3. Enter test phone number
4. Select test order or create a test order
5. Click **Send Test SMS**
6. Verify the SMS is received and formatted correctly

### Step 8: Enable Automatic Sending

1. Go to **Settings > Digital Receipts > Automation**
2. Enable **Automatic Receipt Sending**
3. Configure automation rules:
   - **Send on Order Completion**: Send receipt when order is completed
   - **Send on Payment**: Send receipt when payment is processed
   - **Send on Refund**: Send refund receipt when payment is refunded
   - **Send on Void**: Send void notification when order is voided

4. Configure customer preferences:
   - **Respect Customer Preferences**: Use customer's preferred method
   - **Fallback Method**: Fallback method if preferred method fails
   - **Multiple Methods**: Allow sending to multiple methods

5. Click **Save**

### Step 9: Monitor and Optimize

1. **Enable Monitoring**: Go to **Reports > Digital Receipts > Monitoring**
2. **Set Up Alerts**: Configure alerts for:
   - Failed receipt deliveries
   - Low delivery rates
   - High bounce rates (for email)
   - Revenue tracking

3. **Review Performance**: Regularly review digital receipt performance:
   - Delivery success rate
   - Delivery speed
   - Customer engagement
   - Revenue impact

4. **Optimize Templates**: Based on performance data, optimize templates:
   - Improve readability
   - Add promotional content
   - Include loyalty information
   - Add call-to-action buttons

5. **Adjust Settings**: Fine-tune settings based on performance data

## Template Variables

### Available Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `{{business_name}}` | Business name | "Cafe POS" |
| `{{business_address}}` | Business address | "123 Main St, City" |
| `{{business_phone}}` | Business phone | "+1-555-123-4567" |
| `{{business_email}}` | Business email | "info@cafe-pos.com" |
| `{{order_number}}` | Order number | "1001" |
| `{{order_date}}` | Order date | "2026-01-20" |
| `{{order_time}}` | Order time | "14:30" |
| `{{order_total}}` | Order total | "25.50" |
| `{{subtotal}}` | Subtotal | "22.00" |
| `{{tax}}` | Tax amount | "3.50" |
| `{{discount}}` | Discount amount | "0.00" |
| `{{payment_method}}` | Payment method | "Credit Card" |
| `{{payment_transaction_id}}` | Payment transaction ID | "TXN12345" |
| `{{customer_name}}` | Customer name | "John Doe" |
| `{{customer_email}}` | Customer email | "john@example.com" |
| `{{customer_phone}}` | Customer phone | "+1-555-123-4567" |
| `{{items}}` | List of items | See below |
| `{{items_table}}` | HTML table of items | See below |
| `{{loyalty_points_earned}}` | Loyalty points earned | "50" |
| `{{loyalty_points_balance}}` | Loyalty points balance | "150" |
| `{{loyalty_tier}}` | Loyalty tier | "Gold" |

### Items Variable Format

**Text format:**
```
1x Coffee - $3.50
2x Croissant - $4.00
```

**HTML format:**
```html
<table>
  <tr><th>Item</th><th>Qty</th><th>Price</th></tr>
  <tr><td>Coffee</td><td>1</td><td>$3.50</td></tr>
  <tr><td>Croissant</td><td>2</td><td>$4.00</td></tr>
</table>
```

### Conditional Content

You can use conditional content in templates:

```
{{#if loyalty_points_earned}}
You earned {{loyalty_points_earned}} loyalty points!
{{/if}}

{{#if discount}}
Discount: ${{discount}}
{{/if}}
```

## Customer Opt-In Process

### Collecting Consent

1. **At Checkout**: Ask customers if they want digital receipts
2. **Registration Form**: Include digital receipt preference in customer registration
3. **Loyalty Program**: Offer digital receipts as part of loyalty program signup
4. **In-Store Signage**: Display information about digital receipts
5. **Staff Training**: Train staff to explain digital receipt benefits

### Consent Management

1. **Explicit Consent**: Require explicit opt-in from customers
2. **Double Opt-In**: For email, use double opt-in verification
3. **Consent Records**: Maintain records of customer consent
4. **Easy Opt-Out**: Make it easy for customers to opt out
5. **Regular Reviews**: Review consent records regularly

### Compliance

- **GDPR**: Comply with GDPR regulations for EU customers
- **CCPA**: Comply with CCPA regulations for California customers
- **CAN-SPAM**: Comply with email marketing regulations
- **TCPA**: Comply with SMS marketing regulations
- **Local Laws**: Comply with local data protection laws

## Troubleshooting

### Email Issues

#### Emails Not Sending
- **Check**: Is the SMTP configuration correct?
- **Check**: Is the email server accessible?
- **Check**: Are there any firewall rules blocking emails?
- **Check**: Is the sender email verified?
- **Solution**: Test SMTP connection and verify settings

#### Emails Going to Spam
- **Check**: Is the sender domain properly configured?
- **Check**: Are SPF, DKIM, and DMARC records set up?
- **Check**: Is the email content spam-like?
- **Solution**: Configure email authentication and review content

#### Email Bounces
- **Check**: Is the recipient email address valid?
- **Check**: Is the recipient mailbox full?
- **Check**: Is the email address blacklisted?
- **Solution**: Verify recipient email and check bounce reasons

### WhatsApp Issues

#### Messages Not Sending
- **Check**: Is the WhatsApp API configuration correct?
- **Check**: Is the phone number verified?
- **Check**: Is the message template approved?
- **Check**: Is the business profile approved?
- **Solution**: Verify API credentials and template status

#### Message Delivery Failed
- **Check**: Is the recipient's phone number valid?
- **Check**: Is the recipient opted in to receive messages?
- **Check**: Is there a rate limit in effect?
- **Solution**: Verify recipient number and check rate limits

#### Template Not Approved
- **Check**: Is the template submitted for approval?
- **Check**: Does the template comply with WhatsApp policies?
- **Check**: Has the template been approved?
- **Solution**: Submit template for approval and wait for approval

### SMS Issues

#### SMS Not Sending
- **Check**: Is the SMS gateway configuration correct?
- **Check**: Is the gateway accessible?
- **Check**: Are there sufficient credits?
- **Check**: Is the sender ID approved?
- **Solution**: Verify gateway settings and credits

#### SMS Delivery Failed
- **Check**: Is the recipient phone number valid?
- **Check**: Is the phone number in the correct format?
- **Check**: Is the phone number opted in?
- **Solution**: Verify recipient number and opt-in status

#### Character Limit Issues
- **Check**: Is the message within 160 characters?
- **Check**: Are special characters being counted correctly?
- **Solution**: Shorten message or use multiple parts

## Best Practices

### Email Best Practices
- **Subject Lines**: Use clear, descriptive subject lines
- **Content**: Keep content concise and easy to read
- **Mobile-Friendly**: Ensure emails are mobile-friendly
- **Branding**: Include business branding and logo
- **Call-to-Action**: Include clear call-to-action buttons
- **Unsubscribe**: Include easy unsubscribe option
- **Personalization**: Personalize emails with customer name

### WhatsApp Best Practices
- **Message Length**: Keep messages concise (WhatsApp has limits)
- **Rich Media**: Use images, videos, and documents when appropriate
- **Interactive**: Use buttons and quick replies for interaction
- **Timing**: Send messages at appropriate times
- **Frequency**: Don't spam customers with too many messages
- **Opt-In**: Ensure customers have opted in to receive messages

### SMS Best Practices
- **Message Length**: Keep messages under 160 characters
- **Clear**: Be clear and concise in your messaging
- **Value**: Provide value in each message
- **Timing**: Send messages at appropriate times
- **Frequency**: Don't send too many SMS messages
- **Opt-In**: Ensure customers have opted in to receive SMS
- **Compliance**: Comply with all SMS marketing regulations

### General Best Practices
- **Testing**: Always test templates before using them
- **Monitoring**: Monitor delivery rates and performance
- **Optimization**: Continuously optimize based on performance data
- **Customer Feedback**: Collect and act on customer feedback
- **Compliance**: Stay compliant with all regulations
- **Security**: Protect customer data and information

## Advanced Configuration

### Multiple Templates
1. **Create Multiple Templates**: Create different templates for different scenarios
2. **Template Selection**: Configure rules for template selection
3. **A/B Testing**: Test different templates to see which performs better
4. **Seasonal Templates**: Create seasonal or promotional templates
5. **Location-Specific**: Create templates for different locations

### Automated Campaigns
1. **Welcome Series**: Send welcome series to new customers
2. **Abandoned Cart**: Send reminders for abandoned orders
3. **Loyalty Rewards**: Send notifications about loyalty rewards
4. **Birthday Offers**: Send birthday special offers
5. **Anniversary Offers**: Send anniversary special offers

### Personalization
1. **Customer Data**: Use customer data for personalization
2. **Purchase History**: Reference past purchases in messages
3. **Preferences**: Use customer preferences for targeting
4. **Behavior**: Use customer behavior for personalization
5. **Location**: Use location data for relevant offers

### Analytics and Reporting
1. **Delivery Rates**: Track delivery success rates
2. **Open Rates**: Track email open rates
3. **Click Rates**: Track link click rates
4. **Conversion Rates**: Track conversion from receipts
5. **Revenue Impact**: Track revenue impact of digital receipts

## Security Considerations

### Data Protection
- **Customer Data**: Protect customer data and information
- **Payment Data**: Never include sensitive payment data in receipts
- **Encryption**: Use encryption for all communications
- **Access Control**: Implement proper access controls
- **Regular Audits**: Conduct regular security audits

### Compliance
- **GDPR**: Comply with GDPR for EU customers
- **CCPA**: Comply with CCPA for California customers
- **CAN-SPAM**: Comply with email marketing regulations
- **TCPA**: Comply with SMS marketing regulations
- **Local Laws**: Comply with local data protection laws

### Monitoring
- **Activity Logs**: Maintain activity logs for auditing
- **Access Logs**: Track who accesses digital receipt features
- **Change Logs**: Track changes to templates and settings
- **Alerts**: Set up alerts for suspicious activity
- **Regular Reviews**: Review logs regularly

## Support and Resources

### Troubleshooting Guides
- [Email Troubleshooting](#email-issues)
- [WhatsApp Troubleshooting](#whatsapp-issues)
- [SMS Troubleshooting](#sms-issues)

### Template Examples
- [Standard Email Receipt Template](#email-receipt-template)
- [WhatsApp Receipt Template](#whatsapp-receipt-template)
- [SMS Receipt Template](#sms-receipt-template)

### Support Contact
- **POS Support**: support@cafe-pos.com
- **Email Provider Support**: Contact your email service provider
- **WhatsApp Support**: Contact WhatsApp Business support
- **SMS Gateway Support**: Contact your SMS gateway provider

## Appendix

### Common Error Codes

| Error Code | Description | Solution |
|------------|-------------|----------|
| DRE-001 | Email configuration error | Verify SMTP settings |
| DRE-002 | Email sending failed | Check email server and credentials |
| DRE-003 | Email bounce | Verify recipient email address |
| DRE-004 | WhatsApp API error | Check WhatsApp API credentials |
| DRE-005 | WhatsApp template not approved | Submit template for approval |
| DRE-006 | SMS gateway error | Check SMS gateway settings |
| DRE-007 | SMS delivery failed | Verify recipient phone number |
| DRE-008 | Template rendering error | Check template syntax |
| DRE-009 | Delivery timeout | Check network connectivity |
| DRE-010 | Rate limit exceeded | Reduce sending frequency |

### Recommended Settings

#### Email Settings
- **SMTP Port**: 587 (TLS) or 465 (SSL)
- **Encryption**: TLS (recommended)
- **From Email**: Use a dedicated email address
- **Reply-To**: Use a monitored email address
- **Bounce Handling**: Enable bounce handling

#### WhatsApp Settings
- **Message Templates**: Have multiple approved templates
- **Business Profile**: Complete and verified profile
- **Phone Number**: Dedicated business number
- **Message Frequency**: Keep within WhatsApp limits
- **Opt-In**: Clear opt-in process

#### SMS Settings
- **Message Length**: Keep under 160 characters
- **Sender ID**: Use approved sender ID
- **Message Type**: Use appropriate message type
- **Opt-In**: Clear opt-in process
- **Compliance**: Comply with all regulations

### Performance Metrics

#### Key Metrics to Track
- **Delivery Success Rate**: Percentage of successfully delivered receipts
- **Delivery Speed**: Time from order completion to receipt delivery
- **Open Rate**: Percentage of emails opened
- **Click Rate**: Percentage of links clicked
- **Conversion Rate**: Percentage of customers who return based on receipts
- **Revenue Impact**: Revenue generated from digital receipt promotions

#### Benchmark Goals
- **Delivery Success Rate**: > 95%
- **Delivery Speed**: < 5 minutes
- **Open Rate**: > 30%
- **Click Rate**: > 5%
- **Conversion Rate**: > 2%
- **Customer Satisfaction**: High positive feedback
