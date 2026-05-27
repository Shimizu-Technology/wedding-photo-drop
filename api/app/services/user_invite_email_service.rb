# frozen_string_literal: true

require "cgi"

class UserInviteEmailService
  class << self
    def send_invite(user:, invited_by:, invitation_url:)
      return false unless configured?

      response = HTTParty.post(
        "https://api.resend.com/emails",
        headers: {
          "Authorization" => "Bearer #{ENV.fetch('RESEND_API_KEY')}",
          "Content-Type" => "application/json"
        },
        body: {
          from: from_email,
          to: user.email,
          subject: "You're invited to Wedding Photo Drop",
          html: invite_html(user: user, invited_by: invited_by, invitation_url: invitation_url)
        }.to_json,
        timeout: 10
      )

      response.success?
    rescue HTTParty::Error, Timeout::Error, SocketError, Errno::ECONNREFUSED, Errno::EHOSTUNREACH => e
      Rails.logger.error("Invite email failed for #{user.email}: #{e.message}")
      false
    end

    def configured?
      ENV["RESEND_API_KEY"].present? && from_email.present?
    end

    private

    def from_email
      ENV["RESEND_FROM_EMAIL"].presence || ENV["MAILER_FROM_EMAIL"].presence
    end

    def h(value)
      CGI.escapeHTML(value.to_s)
    end

    def invite_html(user:, invited_by:, invitation_url:)
      inviter = h(invited_by&.full_name.presence || invited_by&.email.presence || "An administrator")
      role = h(user.role.to_s.titleize)
      url = h(invitation_url)

      <<~HTML
        <!doctype html>
        <html>
          <body style="margin:0;padding:0;background:#fff7ed;color:#3b2418;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;background:#fff7ed;">
              <tr><td align="center">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fffaf1;border:1px solid #ead7bd;border-radius:28px;overflow:hidden;">
                  <tr><td style="height:6px;background:#b86b4b;"></td></tr>
                  <tr><td style="padding:34px 30px;text-align:center;">
                    <p style="margin:0 0 10px;color:#9b4f34;font-size:12px;letter-spacing:.22em;text-transform:uppercase;font-weight:800;">Wedding Photo Drop</p>
                    <h1 style="margin:0 0 16px;color:#2b1a13;font-size:32px;line-height:1.15;">You've been invited</h1>
                    <p style="margin:0 0 18px;color:#6f5a4b;font-size:16px;line-height:1.7;">#{inviter} added you as <strong style="color:#2b1a13;">#{role}</strong>. Use the invited email address <strong style="color:#2b1a13;">#{h(user.email)}</strong> to create your account.</p>
                    <a href="#{url}" style="display:inline-block;margin:8px 0 18px;padding:14px 24px;border-radius:999px;background:#9b4f34;color:#fffaf1;text-decoration:none;font-weight:800;">Accept invitation</a>
                    <p style="margin:0;color:#8a7668;font-size:13px;line-height:1.6;word-break:break-all;">Or copy this link:<br>#{url}</p>
                  </td></tr>
                </table>
              </td></tr>
            </table>
          </body>
        </html>
      HTML
    end
  end
end
