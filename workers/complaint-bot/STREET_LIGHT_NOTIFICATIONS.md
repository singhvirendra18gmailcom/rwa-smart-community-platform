# Service fault WhatsApp notifications

The RWA notification flow is intentionally designed to stay zero-cost.

## Zero-cost WhatsApp strategy

The Complaint Bot Worker uses the same WhatsApp Business number already configured for the complaint system:

- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_ACCESS_TOKEN`

For service-fault notifications such as Street Lights, Camera AMC and LED AMC:

1. The app first attempts a normal background WhatsApp text through the existing Cloud API.
2. If the recipient has interacted with the RWA WhatsApp number within the permitted customer-service window, Meta can deliver the message automatically.
3. If Meta rejects the background message because the customer-service window is closed, the app opens WhatsApp for the supervisor with the complaint text and recipient pre-filled.
4. The supervisor only needs to press **Send**.

This avoids paid business-initiated template messaging and keeps the workflow zero-cost.

## Message content

The complaint contains:

- inspection date
- agency/service provider
- faulty count
- pending age when applicable
- common RWA Staff / Supervisor contact
- category-specific RWA Executive contact

Street-light fault locations remain internal to the inspection record and are not included in the outbound agency message.

## Delivery audit

Every background Cloud API attempt is recorded in `street_light_notifications`.

WhatsApp delivery-status webhooks update the corresponding notification to:

- `PENDING` after Meta accepts the API request
- `SENT` after a delivered/read status
- `FAILED` if Meta rejects delivery

When a background delivery fails, the frontend switches to the manual WhatsApp fallback.

## SMS

Background SMS remains disabled until an India DLT-compliant SMS gateway is configured. A physical SIM alone is not used by the cloud application for automated SMS.
