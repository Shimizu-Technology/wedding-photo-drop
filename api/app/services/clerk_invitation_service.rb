# frozen_string_literal: true

class ClerkInvitationService
  BASE_URL = "https://api.clerk.com/v1"

  def initialize
    @secret_key = ENV["CLERK_SECRET_KEY"]
  end

  def configured?
    @secret_key.present?
  end

  def create_invitation(email:, redirect_url:, public_metadata: {}, ignore_existing: false)
    return { success: false, error: "Clerk API not configured" } unless configured?

    response = HTTParty.post(
      "#{BASE_URL}/invitations",
      headers: request_headers,
      body: {
        email_address: email,
        redirect_url: redirect_url,
        public_metadata: public_metadata,
        notify: false,
        ignore_existing: ignore_existing
      }.to_json,
      timeout: 10
    )

    if response.success?
      parsed = response.parsed_response
      { success: true, invitation_id: parsed["id"], status: parsed["status"], url: parsed["url"] }
    else
      { success: false, error: error_message(response), status_code: response.code }
    end
  rescue HTTParty::Error, Timeout::Error, SocketError, Errno::ECONNREFUSED, Errno::EHOSTUNREACH => e
    Rails.logger.error("Clerk invitation failed for #{email}: #{e.message}")
    { success: false, error: "Could not reach Clerk API" }
  end

  def revoke_invitation(invitation_id)
    return { success: false, error: "Clerk API not configured" } unless configured?

    response = HTTParty.post("#{BASE_URL}/invitations/#{invitation_id}/revoke", headers: request_headers, timeout: 10)
    response.success? ? { success: true } : { success: false, error: error_message(response) }
  rescue HTTParty::Error, Timeout::Error, SocketError, Errno::ECONNREFUSED, Errno::EHOSTUNREACH => e
    { success: false, error: e.message }
  end

  private

  def request_headers
    { "Authorization" => "Bearer #{@secret_key}", "Content-Type" => "application/json" }
  end

  def error_message(response)
    parsed = response.parsed_response
    if parsed.is_a?(Hash) && parsed["errors"].is_a?(Array)
      parsed["errors"].map { |error| error["long_message"] || error["message"] }.compact.join("; ").presence || "Clerk API error"
    elsif parsed.is_a?(Hash)
      parsed["message"] || "Clerk API error (#{response.code})"
    else
      "Clerk API error (#{response.code})"
    end
  end
end
