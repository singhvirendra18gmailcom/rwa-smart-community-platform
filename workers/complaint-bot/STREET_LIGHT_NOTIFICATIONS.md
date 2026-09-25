# Street-light background notifications

Street-light complaint notifications are sent by the Complaint Bot Cloudflare Worker.

## WhatsApp

The Worker uses the same WhatsApp Business phone number configured for the Complaint System:

- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_ACCESS_TOKEN`

No WhatsApp composer is opened in the supervisor's browser.

For reliable business-initiated messages outside the WhatsApp customer-service window, configure two approved Hindi templates:

### First-day template

Worker variable:

`STREET_LIGHT_WHATSAPP_TEMPLATE_FIRST_DAY`

Suggested template body:

```
दिनांक: {{1}}
सेवा में {{2}},

पॉकेट-A, सेक्टर-105 में {{3}} स्ट्रीट लाइट खराब हैं। कृपया जल्द से जल्द ठीक करवाने की कृपा करें।
अधिक जानकारी के लिए संपर्क करें:
RWA Staff / Supervisor: {{4}}
RWA Executive: {{5}}

धन्यवाद
RWA Pocket-A
```

Parameters:

1. Date
2. Agency name
3. Faulty street-light count
4. Common Supervisor name/mobile
5. Category RWA Executive name/mobile

### Pending template

Worker variable:

`STREET_LIGHT_WHATSAPP_TEMPLATE_PENDING`

Suggested template body:

```
दिनांक: {{1}}
सेवा में {{2}},

पॉकेट-A, सेक्टर-105 में {{3}} स्ट्रीट लाइट खराब हैं और यह समस्या {{4}} दिन से लंबित है। कृपया जल्द से जल्द ठीक करवाने की कृपा करें।
अधिक जानकारी के लिए संपर्क करें:
RWA Staff / Supervisor: {{5}}
RWA Executive: {{6}}

धन्यवाद
RWA Pocket-A
```

Parameters:

1. Date
2. Agency name
3. Faulty street-light count
4. Pending days
5. Common Supervisor name/mobile
6. Category RWA Executive name/mobile

Optional language override:

`STREET_LIGHT_WHATSAPP_TEMPLATE_LANGUAGE=hi`

Until the template variables are configured, the Worker falls back to the existing background text-message API. That can work only where WhatsApp permits a free-form outbound text.

## SMS

The browser no longer opens the phone SMS composer. It calls:

`POST /api/street-lights/notify-sms`

The Worker expects a server-side SMS gateway adapter configured with:

- `SMS_GATEWAY_URL`
- `SMS_GATEWAY_TOKEN`
- `SMS_SENDER_ID` (optional provider/adapter field)
- `SMS_TEMPLATE_ID` (optional provider/adapter field)

The gateway endpoint is expected to accept:

```json
{
  "to": "91XXXXXXXXXX",
  "message": "...",
  "sender_id": "...",
  "template_id": "..."
}
```

and use Bearer authentication.

For India, connect this adapter only after the RWA's required DLT sender/header/content-template setup is complete.

## Delivery audit

Every attempt is written to `street_light_notifications` with:

- channel: `WHATSAPP` or `SMS`
- recipient
- message
- status: `SENT` or `FAILED`
- provider reference/response where available
- sender user
- timestamp
