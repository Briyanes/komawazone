/**
 * Google Sheets Integration
 * Export sitemap import data to Google Sheets for review and backup
 */

import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'googleapis-common';

export interface SheetMangaData {
  url: string;
  slug: string;
  title: string;
  type: 'MANGA' | 'MANHWA' | 'MANHUA' | 'WEBTOON';
  status: 'NEW' | 'UPDATED' | 'EXISTING';
  lastmod: string;
  imported: boolean;
  notes?: string;
}

const TABS = {
  RAW_DATA: 'Sitemap Data',
  IMPORT_QUEUE: 'Import Queue',
  HISTORY: 'Import History',
  UPDATES: 'Updates',
};

/**
 * Initialize Google Sheets client
 */
async function getSheetClient(): Promise<GoogleSpreadsheet | null> {
  try {
    const sheetId = process.env.GOOGLE_SHEETS_SHEET_ID;
    if (!sheetId) {
      console.warn('Google Sheets: SHEET_ID not configured');
      return null;
    }

    // Check if credentials are configured
    const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;

    if (!clientEmail || !privateKey) {
      console.warn('Google Sheets: Credentials not configured');
      return null;
    }

    // Parse private key (handle both string with \n and actual newlines)
    const formattedKey = privateKey.replace(/\\n/g, '\n');

    const serviceAccountAuth = new JWT({
      email: clientEmail,
      key: formattedKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(sheetId, serviceAccountAuth);
    await doc.loadInfo();

    return doc;

  } catch (error) {
    console.error('Google Sheets initialization error:', error);
    return null;
  }
}

/**
 * Export sitemap data to Google Sheets
 */
export async function exportToGoogleSheet(
  data: SheetMangaData[],
  tab: keyof typeof TABS = 'RAW_DATA'
): Promise<{ success: boolean; error?: string; rowsExported?: number }> {
  try {
    const doc = await getSheetClient();
    if (!doc) {
      return {
        success: false,
        error: 'Google Sheets not configured',
      };
    }

    // Get or create sheet
    const tabName = TABS[tab];
    let sheet = doc.sheetsByTitle[tabName];

    if (!sheet) {
      // Create new sheet
      sheet = await doc.addSheet({
        title: tabName,
        headers: Object.keys(data[0] || {}),
      });
    }

    // Clear existing data (keep header row)
    await sheet.clearRows();

    // Prepare rows
    const rows = data.map(item => [
      item.url,
      item.slug,
      item.title,
      item.type,
      item.status,
      item.lastmod,
      item.imported ? 'Yes' : 'No',
      item.notes || '',
    ]);

    // Add header row
    const headers = ['URL', 'Slug', 'Title', 'Type', 'Status', 'Last Modified', 'Imported', 'Notes'];
    await sheet.setHeaderRow(headers);

    // Append data rows
    if (rows.length > 0) {
      await sheet.addRows(rows);
    }

    console.log(`Google Sheets: Exported ${rows.length} rows to ${tabName}`);

    return {
      success: true,
      rowsExported: rows.length,
    };

  } catch (error) {
    console.error('Google Sheets export error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Import data from Google Sheets (for manual review/approval)
 */
export async function importFromGoogleSheet(
  tab: keyof typeof TABS = 'IMPORT_QUEUE'
): Promise<{ success: boolean; data?: SheetMangaData[]; error?: string }> {
  try {
    const doc = await getSheetClient();
    if (!doc) {
      return {
        success: false,
        error: 'Google Sheets not configured',
      };
    }

    const tabName = TABS[tab];
    const sheet = doc.sheetsByTitle[tabName];

    if (!sheet) {
      return {
        success: false,
        error: `Tab ${tabName} not found`,
      };
    }

    // Get all rows
    const rows = await sheet.getRows();

    // Convert to SheetMangaData
    const data: SheetMangaData[] = rows
      .slice(1) // Skip header row
      .map((row: any) => ({
        url: row.URL || row.url || '',
        slug: row.Slug || row.slug || '',
        title: row.Title || row.title || '',
        type: (row.Type || row.type || 'MANHWA') as 'MANGA' | 'MANHWA' | 'MANHUA' | 'WEBTOON',
        status: (row.Status || row.status || 'NEW') as 'NEW' | 'UPDATED' | 'EXISTING',
        lastmod: row['Last Modified'] || row.lastmod || new Date().toISOString(),
        imported: (row.Imported || row.imported) === 'Yes' || row.imported === true,
        notes: row.Notes || row.notes || '',
      }))
      .filter(item => item.url && item.slug); // Only valid entries

    console.log(`Google Sheets: Imported ${data.length} rows from ${tabName}`);

    return {
      success: true,
      data,
    };

  } catch (error) {
    console.error('Google Sheets import error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Sync import results back to sheet (mark as imported)
 */
export async function syncImportResults(
  importedSlugs: string[],
  tab: keyof typeof TABS = 'IMPORT_QUEUE'
): Promise<{ success: boolean; error?: string }> {
  try {
    const doc = await getSheetClient();
    if (!doc) {
      return {
        success: false,
        error: 'Google Sheets not configured',
      };
    }

    const tabName = TABS[tab];
    const sheet = doc.sheetsByTitle[tabName];

    if (!sheet) {
      return {
        success: false,
        error: `Tab ${tabName} not found`,
      };
    }

    // Get all rows
    const rows = await sheet.getRows();

    // Update imported status
    for (const row of rows.slice(1)) { // Skip header
      const slug = row.Slug || row.slug;

      if (importedSlugs.includes(slug)) {
        row.Imported = 'Yes';
        row.Notes = `Imported at ${new Date().toISOString()}`;
        await row.save();
      }
    }

    console.log(`Google Sheets: Synced ${importedSlugs.length} imported items to ${tabName}`);

    return { success: true };

  } catch (error) {
    console.error('Google Sheets sync error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Move items from one tab to another (e.g., RAW_DATA → IMPORT_QUEUE → HISTORY)
 */
export async function moveSheetItems(
  slugs: string[],
  fromTab: keyof typeof TABS,
  toTab: keyof typeof TABS
): Promise<{ success: boolean; error?: string }> {
  try {
    const doc = await getSheetClient();
    if (!doc) {
      return {
        success: false,
        error: 'Google Sheets not configured',
      };
    }

    const fromTabName = TABS[fromTab];
    const toTabName = TABS[toTab];

    const fromSheet = doc.sheetsByTitle[fromTabName];
    const toSheet = doc.sheetsByTitle[toTabName];

    if (!fromSheet || !toSheet) {
      return {
        success: false,
        error: 'One or both tabs not found',
      };
    }

    // Get rows from source tab
    const fromRows = await fromSheet.getRows();

    // Find matching rows and move them
    for (const row of fromRows.slice(1)) { // Skip header
      const slug = row.Slug || row.slug;

      if (slugs.includes(slug)) {
        // Add to destination tab
        await toSheet.addRow(row);
        // Delete from source tab
        await row.delete();
      }
    }

    console.log(`Google Sheets: Moved ${slugs.length} items from ${fromTabName} to ${toTabName}`);

    return { success: true };

  } catch (error) {
    console.error('Google Sheets move error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}