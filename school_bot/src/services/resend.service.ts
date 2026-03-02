import { Resend } from "resend";
import { config } from "../config";

let _client: Resend | null = null;

function getClient(): Resend {
  if (!_client) {
    _client = new Resend(config.resend.apiKey);
  }
  return _client;
}

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const { error } = await getClient().emails.send({
    from: config.resend.from,
    to,
    subject,
    html,
  });

  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
}
