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
    return render json: { error: "User is not invited" }, status: :forbidden unless @current_user

    render json: { error: "User access is inactive" }, status: :forbidden unless @current_user.active?
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
    identity = identity_from(payload)
    return nil if identity[:clerk_id].blank?

    user = User.find_by(clerk_id: identity[:clerk_id])
    user ||= invited_user_for(identity[:email])
    user ||= bootstrap_first_admin(identity)
    return nil unless user

    update_authenticated_user!(user, identity)
  end

  def identity_from(payload)
    {
      clerk_id: payload["sub"].to_s,
      email: normalized_email(payload["email"].presence || payload["primary_email_address"].presence || payload.dig("email_addresses", 0, "email_address")),
      first_name: payload["first_name"].presence || payload["given_name"].presence,
      last_name: payload["last_name"].presence || payload["family_name"].presence
    }
  end

  def normalized_email(email)
    email.to_s.strip.downcase.presence
  end

  def invited_user_for(email)
    return nil if email.blank?

    user = User.find_by("LOWER(email) = ?", email)
    return nil unless user&.invitation_pending?

    user
  end

  def bootstrap_first_admin(identity)
    User.transaction do
      lock_users_table_for_bootstrap
      return nil unless User.count.zero?

      User.create!(
        clerk_id: identity[:clerk_id],
        email: identity[:email].presence || "#{identity[:clerk_id]}@placeholder.local",
        first_name: identity[:first_name],
        last_name: identity[:last_name],
        role: "admin",
        invitation_status: "accepted",
        last_sign_in_at: Time.current
      )
    end
  rescue ActiveRecord::RecordNotUnique, ActiveRecord::RecordInvalid
    User.find_by(clerk_id: identity[:clerk_id])
  end

  def lock_users_table_for_bootstrap
    return unless ActiveRecord::Base.connection.adapter_name.downcase.include?("postgres")

    User.connection.execute("LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE")
  end

  def update_authenticated_user!(user, identity)
    should_link_clerk_id = user.invitation_pending?

    user.assign_attributes(
      email: safe_email_for(user, identity),
      first_name: identity[:first_name].presence || user.first_name,
      last_name: identity[:last_name].presence || user.last_name,
      invitation_status: "accepted",
      last_sign_in_at: Time.current
    )
    user.clerk_id = identity[:clerk_id] if should_link_clerk_id
    user.save!
    user
  rescue ActiveRecord::RecordInvalid, ActiveRecord::RecordNotUnique => e
    Rails.logger.warn("Clerk user sync failed for clerk_id=#{identity[:clerk_id]}: #{e.message}")
    User.find_by(clerk_id: identity[:clerk_id])
  end

  def safe_email_for(user, identity)
    email = identity[:email].presence
    return user.email || "#{identity[:clerk_id]}@placeholder.local" if email.blank?

    conflicting_user = User.where.not(id: user.id).find_by("LOWER(email) = ?", email)
    return user.email if conflicting_user

    email
  end
end
