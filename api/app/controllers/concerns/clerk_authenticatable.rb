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

  def require_super_admin!
    authenticate_user! unless @current_user
    return if performed?
    return if @current_user&.super_admin?

    render json: { error: "Super admin access required" }, status: :forbidden
  end

  def require_event_staff!(event)
    authenticate_user! unless @current_user
    return if performed?
    return if @current_user&.can_manage_event?(event)

    render json: { error: "Event access required" }, status: :forbidden
  end

  def require_event_admin!(event)
    authenticate_user! unless @current_user
    return if performed?
    return if @current_user&.can_admin_event?(event)

    render json: { error: "Event admin access required" }, status: :forbidden
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
      user.super_admin = true if user.respond_to?(:super_admin=)
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

    user = super_admin_user_for(identity)
    user ||= User.find_by(clerk_id: identity[:clerk_id])
    user ||= invited_user_for(identity[:email])
    user ||= bootstrap_first_admin(identity)
    return nil unless user
    return user unless user.active?

    update_authenticated_user!(user, identity)
  end

  def identity_from(payload)
    clerk_id = payload["sub"].to_s
    email = normalized_email(payload["email"].presence || payload["primary_email_address"].presence || payload.dig("email_addresses", 0, "email_address"))
    first_name = payload["first_name"].presence || payload["given_name"].presence
    last_name = payload["last_name"].presence || payload["family_name"].presence

    clerk_profile = email.blank? || first_name.blank? || last_name.blank? ? clerk_profile_for(clerk_id) : {}

    {
      clerk_id: clerk_id,
      email: email || normalized_email(clerk_profile[:email]),
      first_name: first_name || clerk_profile[:first_name],
      last_name: last_name || clerk_profile[:last_name]
    }
  end

  def normalized_email(email)
    email.to_s.strip.downcase.presence
  end

  def clerk_profile_for(clerk_id)
    return {} if clerk_id.blank? || ENV["CLERK_SECRET_KEY"].blank?

    response = HTTParty.get(
      "https://api.clerk.com/v1/users/#{clerk_id}",
      headers: { "Authorization" => "Bearer #{ENV.fetch('CLERK_SECRET_KEY')}" },
      timeout: 5
    )
    return {} unless response.success?

    body = response.parsed_response
    primary_email_id = body["primary_email_address_id"]
    email_record = Array(body["email_addresses"]).find { |record| record["id"] == primary_email_id } || Array(body["email_addresses"]).first
    {
      email: email_record&.dig("email_address"),
      first_name: body["first_name"],
      last_name: body["last_name"]
    }
  rescue HTTParty::Error, Timeout::Error, SocketError, Errno::ECONNREFUSED, Errno::EHOSTUNREACH => e
    Rails.logger.warn("Clerk profile fetch failed for clerk_id=#{clerk_id}: #{e.message}")
    {}
  end

  def invited_user_for(email)
    return nil if email.blank?

    user = User.find_by("LOWER(email) = ?", email)
    return nil unless user&.invitation_pending?

    user
  end

  def super_admin_user_for(identity)
    return nil unless super_admin_email?(identity[:email])

    User.transaction do
      user = User.find_or_initialize_by(email: identity[:email])
      conflicting_user = User.where.not(id: user.id).find_by(clerk_id: identity[:clerk_id])
      conflicting_user&.destroy! if conflicting_user&.email.to_s.end_with?("@placeholder.local")

      user.assign_attributes(
        clerk_id: user.clerk_id.presence || identity[:clerk_id],
        role: "admin",
        super_admin: true,
        active: true,
        invitation_status: "accepted",
        accepted_at: user.accepted_at || Time.current
      )
      user.save! if user.new_record? || user.changed?
      user
    end
  rescue ActiveRecord::RecordInvalid, ActiveRecord::RecordNotUnique => e
    Rails.logger.warn("Super admin sync failed for clerk_id=#{identity[:clerk_id]}: #{e.message}")
    User.find_by(clerk_id: identity[:clerk_id]) || User.find_by("LOWER(email) = ?", identity[:email])
  end

  def super_admin_email?(email)
    email.present? && normalized_email(email) == normalized_email(ENV["SUPER_ADMIN_EMAIL"])
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
        super_admin: true,
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
    should_link_clerk_id = user.invitation_pending? || user.super_admin? && user.clerk_id.to_s.start_with?("seed_super_admin_")

    accepted_now = user.invitation_pending? && user.accepted_at.blank?

    user.assign_attributes(
      email: safe_email_for(user, identity),
      first_name: identity[:first_name].presence || user.first_name,
      last_name: identity[:last_name].presence || user.last_name,
      role: super_admin_email?(identity[:email]) ? "admin" : user.role,
      super_admin: super_admin_email?(identity[:email]) || user.super_admin?,
      invitation_status: "accepted",
      accepted_at: accepted_now ? Time.current : user.accepted_at,
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
