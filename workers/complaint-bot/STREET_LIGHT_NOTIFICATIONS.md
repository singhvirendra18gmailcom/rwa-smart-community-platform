# Service fault background notifications

The Complaint Bot Cloudflare Worker sends agency fault notifications in the background.

## WhatsApp

The Worker uses the same WhatsApp Business phone number configured for the Complaint System:

- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_ACCESS_TOKEN`

No WhatsApp composer is opened in the supervisor's browser.

For business-initiated messages outside the WhatsApp customer-service window, use these two approved Hindi Utility templates. They are intentionally generic so the same templates can be reused for Street Lights, Camera AMC, LED AMC, and future service categories.

### First-day template

Template name:

`service_fault_first_day_hi`

Optional Worker override:

`SERVICE_WHATSAPP_TEMPLATE_FIRST_DAY`

Suggested template body:

```
दिनांक: {{1}}
सेवा में {{2}},

पॉकेट-A, सेक्टर-105 में निम्न समस्या पाई गई है:
सेवा / उपकरण: {{3}}
खराब संख्या: {{4}}

कृपया जल्द से जल्द ठीक करवाने की कृपा करें।
अधिक जानकारी के लिए संपर्क करें:
RWA Staff / Supervisor: {{5}}
RWA Executive: {{6}}

धन्यवाद
RWA Pocket-A
```

Parameters:

1. Date
2. Agency name
3. Service / equipment label, e.g. स्ट्रीट लाइट, कैमरा, LED स्क्रीन
4. Faulty count
5. Common Supervisor name/mobile
6. Category RWA Executive name/mobile

### Pending template

Template name:

`service_fault_pending_hi`

Optional Worker override:

`SERVICE_WHATSAPP_TEMPLATE_PENDING`

Suggested template body:

```
दिनांक: {{1}}
सेवा में {{2}},

पॉकेट-A, सेक्टर-105 में निम्न समस्या पाई गई है:
सेवा / उपकरण: {{3}}
खराब संख्या: {{4}}
यह समस्या {{5}} दिन से लंबित है।

कृपया जल्द से जल्द ठीक करवाने की कृपा करें।
अधिक जानकारी के लिए संपर्क करें:
RWA Staff / Supervisor: {{6}}
RWA Executive: {{7}}

धन्यवाद
RWA Pocket-A
```

Parameters:

1. Date
2. Agency name
3. Service / equipment label
4. Faulty count
5. Pending days
6. Common Supervisor name/mobile
7. Category RWA Executive name/mobile

Optional language override:

`SERVICE_WHATSAPP_TEMPLATE_LANGUAGE=hi`

The Worker always uses an approved template for service-fault notifications. There is no free-form fallback, so this flow does not depend on the 24-hour customer-service window.

Current automatic Hindi service labels:

- `STREET_LIGHT` → `स्ट्रीट लाइट`
- `CAMERA_AMC` → `कैमरा`
- `LED_AMC` → `LED स्क्रीन`

Other categories fall back to their configured service label.

## SMS

The browser does not open the phone SMS composer. It calls the Worker background SMS endpoint.

The Worker expects a server-side SMS gateway adapter configured with:

- `SMS_GATEWAY_URL`
- `SMS_GATEWAY_TOKEN`
- `SMS_SENDER_ID` (optional provider/adapter field)
- `SMS_TEMPLATE_ID` (optional provider/adapter field)

For India, connect this adapter only after the RWA's required DLT sender/header/content-template setup is complete.

## Delivery audit

Every notification attempt is written to `street_light_notifications` with the provider reference and delivery state. WhatsApp delivery-status webhooks update the record after Meta reports delivery or failure.
