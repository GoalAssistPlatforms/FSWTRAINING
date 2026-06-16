import { Resend } from 'resend';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const resendApiKey = process.env.RESEND_API_KEY;

  if (!resendApiKey) {
    console.warn("RESEND_API_KEY is not set. Email dispatch skipped.");
    return res.status(200).json({ status: 'skipped', message: 'No Resend API key configured' });
  }

  const resend = new Resend(resendApiKey);

  try {
    const { to, subject, html, text } = req.body;

    if (!to || !subject || (!html && !text)) {
      return res.status(400).json({ error: 'Missing required email fields' });
    }

    const { data, error } = await resend.emails.send({
      from: 'Altius Insight Team <noreply@pegdev.co.uk>', // Using a verified domain might be needed, but for testing resend default works if verified
      to: Array.isArray(to) ? to : [to],
      subject: subject,
      html: html,
      text: text
    });

    if (error) {
      console.error("Resend API error:", error);
      return res.status(400).json({ error });
    }

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Failed to send email:", error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
