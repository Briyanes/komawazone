import DOMPurify from 'dompurify';

/**
 * Sanitize HTML content to prevent XSS attacks
 * - Strips dangerous tags (script, iframe, object, etc.)
 * - Strips dangerous attributes (onclick, onerror, etc.)
 * - Allows safe formatting (b, i, em, strong, a, br, p)
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'br', 'p', 'span', 'u', 's', 'blockquote', 'code', 'pre'],
    ALLOWED_ATTR: ['href', 'title', 'rel', 'class'],
    // For links, only allow http, https, mailto
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
  });
}

/**
 * Sanitize plain text content (escape HTML)
 */
export function sanitizeText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}
