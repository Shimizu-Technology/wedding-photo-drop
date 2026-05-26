# frozen_string_literal: true

module ClerkAuthenticatable
  extend ActiveSupport::Concern

  private

  def authenticate_user!
    if Rails.env.development? && ENV.fetch("CLERK_ALLOW_DEV_AUTH", "true") == "true" && bearer_token.blank?
      @current_user = local_dev_user
      return
    end

    token = bearer_token
    return render json: { error: "Authorization required" }, status: :unauthorized unless token

    payload = ClerkAuth.verify(token)
    return render json: { error: "Invalid or expired authorization" }, status: :unauthorized unless payload

    @current_user = find_or_link_user(payload)
    render json: { error: "User is not invited" }, status: :forbidden unless @current_user
  end

  def require_staff!
    authenticate_user! unless @current_user
    return if performed?
    return if @current_user&.staff?

    render json: { error: "Staff access required" }, status: :forbidden
  end

  def require_admin!
    authenticate_user! unless @current_user
    return if performed?
    return if @current_user&.admin?

    render json: { error: "Admin access required" }, status: :forbidden
  end

  def current_user
    @current_user
  end

  def local_dev_user
    User.find_or_create_by!(clerk_id: "local_dev_admin") do |user|
      user.email = ENV.fetch("DEV_AUTH_EMAIL", "admin@example.test")
      user.first_name = "Local"
      user.last_name = "Admin"
      user.role = "admin"
      user.invitation_status = "accepted"
    end
  end

  def bearer_token
    header = request.headers["Authorization"].to_s
    scheme, token = header.split(" ", 2)
    return token if scheme&.casecmp("Bearer")&.zero? && token.present?

    nil
  end

  def find_or_link_user(payload)
    clerk_id = payload["sub"].to_s
    email = payload["email"].presence || payload["primary_email_address"].presence || payload.dig("email_addresses", 0, "email_address")
    first_name = payload["first_name"].presence || payload["given_name"].presence
    last_name = payload["last_name"].presence || payload["family_name"].presence
    return nil if clerk_id.blank?

    user = User.find_by(clerk_id: clerk_id)
    user ||= User.find_by("LOWER(email) = ?", email.downcase) if email.present?
    user ||= User.new(role: "admin", invitation_status: "accepted") if User.count.zero?
    return nil unless user

    user.assign_attributes(
      clerk_id: clerk_id,
      email: email.presence || user.email || "#{clerk_id}@placeholder.local",
      first_name: first_name.presence || user.first_name,
      last_name: last_name.presence || user.last_name,
      invitation_status: "accepted",
      last_sign_in_at: Time.current
    )
    user.save!
    user
  end
end
