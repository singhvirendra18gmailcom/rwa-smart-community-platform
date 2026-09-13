# RWA Pocket-A Accounts Module - Setup

This project now includes a complete Income & Expense / Accounts module inside the existing RWA-AI Supervisor application.

## 1. Apply the Supabase migration

Open Supabase -> SQL Editor and run:

`supabase/migrations/20260912_accounts_module.sql`

The migration creates the `accounts_*` tables, RLS policies, master heads, audit trail and a private `accounts-documents` storage bucket.

## 2. Deploy the updated application

The existing environment variables are unchanged:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Run locally:

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

Then deploy to the same Cloudflare Pages project as the existing RWA-AI app.

## 3. First-time Accounts setup

Open **Income & Expense** from the existing RWA dashboard, then go to **Settings**.

Set:

- Society name / subtitle
- Receipt prefix and voucher prefix
- First Accounts month
- Opening Cash in Hand
- Opening Bank Balance

The first month's opening balance comes from these settings. After a month is closed, its closing cash and bank balances automatically become the opening balances for the next month.

## 4. Daily workflow

### Income

Use **Income Entry** for:

- Maintenance Charges
- Car Sticker
- Challan
- Advertisement / Promotion
- Other Income

Payment modes:

- `CASH` -> classified as Cash
- `CHEQUE` -> classified as Bank
- `UPI` -> classified as Bank

Maintenance entries additionally capture Flat, Resident and Maintenance From / To month.

### Expense

Use **Expense Entry** for daily RWA payments. Required data includes Voucher No., Paid To, Expense Head, Description, Payment Mode and Amount.

## 5. Bank statement workflow

Go to **Bank Statement** and select the month.

Automatic extraction supports:

- CSV
- XLS
- XLSX

PDF bank statements can be uploaded and retained as supporting documents, but this V1 does not attempt generic PDF transaction extraction because different banks use different PDF layouts.

Only transactions belonging to the selected month are imported.

Reconciliation is deliberately separated into:

1. Online Income Reconciliation - Bank Credits vs Cheque/UPI Income
2. Online Expense Reconciliation - Bank Debits vs Cheque/UPI Expenses

Cash entries never appear in bank reconciliation.

## 6. Cash / Bank transfer workflow

On **Monthly Statement**, record:

- Cash deposited into RWA Bank Account (`CASH_TO_BANK`)
- Cash withdrawn from RWA Bank Account (`BANK_TO_CASH`)

These are transfers between Cash and Bank. They do **not** change total RWA funds.

Closing Cash formula:

`Opening Cash + Cash Income + Cash Withdrawn from Bank - Cash Expense - Cash Deposited to Bank`

Closing Bank formula:

`Opening Bank + Bank Income + Cash Deposited to Bank - Bank Expense - Cash Withdrawn from Bank`

Total Closing Balance:

`Closing Cash + Closing Bank`

## 7. Monthly closing

Review:

- Income details
- Expense details
- Cash / Bank transfers
- Bank reconciliation
- Closing Cash
- Closing Bank

Then click **Close Month**.

Closed months are locked for normal Income / Expense editing. A month can be reopened from Monthly Statement if an authorised member needs to correct it.

## 8. Reports

The Reports screen includes:

- Monthly Statement
- Income Register
- Expense Register
- Cash Book
- Bank Book
- Maintenance Collection
- Receipt Register
- Voucher Register
- Income Head Summary
- Expense Head Summary

Monthly Statement and the other reports support Excel, PDF and Print output.

## Browser report libraries

The existing app has not been converted to a new bundler/package architecture. Spreadsheet and PDF helper scripts are loaded in `index.html` from their browser CDNs:

- SheetJS
- jsPDF
- jsPDF-AutoTable

This keeps the current RWA-AI Vite project simple. The app itself and all accounting data remain in your existing deployment/Supabase setup.

## Important production recommendation

The migration currently permits all authenticated users to use the Accounts tables. Before resident login is enabled inside the same app, tighten the RLS policies so only RWA_MEMBER / SUPERVISOR / TREASURER roles can create or edit Accounts data.
