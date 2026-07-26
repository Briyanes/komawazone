/**
 * HTML email templates for Olluq.
 *
 * Design: mobile-first, inline styles (email-client compatible),
 * dark theme with purple accent matching the site brand.
 *
 * All templates use https://olluq.xyz/vip as the primary CTA.
 */

const READER_URL = 'https://olluq.xyz';
const VIP_URL = `${READER_URL}/vip`;

interface BaseTemplateInput {
  expiryDate?: string;
  recipientName?: string;
}

/**
 * Shared email shell — header, body wrapper, footer with unsubscribe.
 */
function emailShell(
  title: string,
  bodyHtml: string,
  recipientEmail: string
): string {
  return `<!doctype html>
<html lang="id">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background:#0f0f12;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e5e5e5;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f12;min-height:100vh;">
      <tr>
        <td align="center" style="padding:24px 16px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#1a1a20;border:1px solid #2a2a35;border-radius:16px;overflow:hidden;">

            <!-- Header -->
            <tr>
              <td style="padding:28px 32px 16px;background:linear-gradient(135deg,#7c3aed 0%,#a855f7 100%);">
                <div style="font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Olluq</div>
                <div style="font-size:13px;color:#e9d5ff;margin-top:2px;">Baca Manga Tanpa Batas</div>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:32px;">
                ${bodyHtml}
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding:20px 32px 28px;border-top:1px solid #2a2a35;background:#15151a;">
                <p style="margin:0 0 8px;font-size:12px;color:#71717a;line-height:1.5;">
                  Email ini dikirim ke <strong style="color:#a1a1aa;">${recipientEmail}</strong> karena kamu terdaftar di Olluq.
                </p>
                <p style="margin:0;font-size:12px;color:#52525b;line-height:1.5;">
                  © ${new Date().getFullYear()} Olluq. Jika tidak ingin menerima email lagi, balas "unsubscribe".
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Primary CTA button */
function ctaButton(label: string, url: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;">
      <tr>
        <td style="border-radius:10px;background:linear-gradient(135deg,#7c3aed 0%,#a855f7 100%);overflow:hidden;">
          <a href="${url}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">${label}</a>
        </td>
      </tr>
    </table>`;
}

// ============================================================
// 1) TRIAL EXPIRING — H-3 reminder to convert trial → paid
// ============================================================
export function trialExpiringEmail(input: BaseTemplateInput & { recipientEmail: string }): { subject: string; html: string } {
  const name = input.recipientName ? `, ${input.recipientName}` : '';
  const body = `
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#ffffff;">Hai${name}! 👋</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#d4d4d8;">
      Trial VIP gratis kamu akan <strong style="color:#fbbf24;">berakhir dalam 3 hari</strong>${input.expiryDate ? ` (${input.expiryDate})` : ''}.
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#d4d4d8;">
      Jangan sampai kehilangan akses ke ribuan chapter eksklusif. Perpanjang VIP sekarang untuk tetap membaca tanpa batas!
    </p>
    ${ctaButton('Perpanjang VIP →', VIP_URL)}
    <p style="margin:16px 0 0;font-size:13px;color:#71717a;">
      💡 Tip: Ajak teman pakai referral code-mu, kamu & teman dapat <strong style="color:#a855f7;">+7 hari VIP gratis</strong>!
    </p>`;

  return {
    subject: '⏰ Trial VIP kamu berakhir 3 hari lagi!',
    html: emailShell('Trial VIP berakhir soon', body, input.recipientEmail),
  };
}

// ============================================================
// 2) VIP EXPIRING — H-3 renewal reminder for paid VIP
// ============================================================
export function vipExpiringEmail(input: BaseTemplateInput & { recipientEmail: string }): { subject: string; html: string } {
  const name = input.recipientName ? `, ${input.recipientName}` : '';
  const body = `
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#ffffff;">VIP kamu sebentar lagi berakhir${name === '' ? '' : ''}!</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#d4d4d8;">
      Membership VIP kamu aktif sampai <strong style="color:#fbbf24;">${input.expiryDate ?? 'segera'}</strong>.
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#d4d4d8;">
      Perpanjang sekarang agar baca manga tetap nyaman: bebas iklan, akses semua chapter, dan konten mature tanpa batas.
    </p>
    ${ctaButton('Perpanjang Sekarang →', VIP_URL)}
    <p style="margin:16px 0 0;font-size:13px;color:#71717a;">
      Paket mulai dari <strong style="color:#a855f7;">Rp 15.000/bulan</strong>. Pembayaran mudah via QRIS / marketplace.
    </p>`;

  return {
    subject: '🔑 VIP Olluq berakhir 3 hari lagi — perpanjang sekarang',
    html: emailShell('VIP berakhir soon', body, input.recipientEmail),
  };
}

// ============================================================
// 3) REFERRAL REWARD — sent when a referral succeeds (+7 days)
// ============================================================
export function referralRewardEmail(input: BaseTemplateInput & {
  recipientEmail: string;
  rewardDays: number;
  inviterName?: string;
  totalExpiry?: string;
}): { subject: string; html: string } {
  const name = input.recipientName ? `, ${input.recipientName}` : '';
  const body = `
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#ffffff;">🎉 Selamat${name}!</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#d4d4d8;">
      Kamu mendapat <strong style="color:#22c55e;">+${input.rewardDays} hari VIP gratis</strong>${input.inviterName ? ` karena diajak oleh <strong>${input.inviterName}</strong>` : ''}!
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#d4d4d8;">
      VIP kamu sekarang aktif sampai <strong style="color:#fbbf24;">${input.totalExpiry ?? 'diperpanjang'}</strong>.
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#d4d4d8;">
      Mau dapat lagi? Bagikan referral code-mu ke teman — setiap teman yang join, kalian berdua dapat +7 hari!
    </p>
    ${ctaButton('Lihat Referral Code →', VIP_URL)}
    <p style="margin:16px 0 0;font-size:13px;color:#71717a;">
      📚 Langsung lanjut baca manga favoritmu sekarang.
    </p>`;

  return {
    subject: `🎉 +${input.rewardDays} hari VIP gratis untukmu!`,
    html: emailShell('Referral reward berhasil', body, input.recipientEmail),
  };
}