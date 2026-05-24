# Google Sheets Setup Guide

## 1. Create Google Cloud Project
1. Go to https://console.cloud.google.com/
2. Create new project: "OLLUQ Manga Import"
3. Enable Google Sheets API:
   - APIs & Services → Library
   - Search "Google Sheets API"
   - Click "Enable"

## 2. Create Service Account
1. APIs & Services → Credentials
2. Create Credentials → Service Account
3. Name: "olluq-sheets-integration"
4. Click "Create and Continue"
5. Skip granting roles (optional)
6. Click "Done"

## 3. Create & Download Key
1. Click on the service account email
2. Go to "Keys" tab
3. Add Key → Create new key → JSON
4. Download the JSON file
5. Copy contents for environment variables

## 4. Create Google Sheet
1. Go to https://sheets.google.com/
2. Create new sheet: "OLLUQ Manga Import"
3. Create tabs (optional):
   - RAW_DATA
   - IMPORT_QUEUE
   - HISTORY
   - UPDATES

## 5. Share Sheet with Service Account
1. Open the Google Sheet
2. Click "Share" → Enter service account email
3. Give "Editor" permission
4. Copy Sheet ID from URL: `https://docs.google.com/spreadsheets/d/SHEET_ID/edit`

## 6. Add Environment Variables
Add these to Vercel (Project Settings → Environment Variables):

```bash
GOOGLE_SHEETS_CLIENT_EMAIL=xxx@xxx.iam.gserviceaccount.com
GOOGLE_SHEETS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
GOOGLE_SHEETS_SHEET_ID=1AbCdEfGhIjKlMnOpQrStUvWxYz
```

**Important**: For private key, replace newlines with `\n` and keep quotes!

## 7. Test Export
After setup, try exporting again from admin dashboard.
