# frozen_string_literal: true

class User < ApplicationRecord
  ROLES = %w[admin reviewer].freeze
  INVITATION_STATUSES = %w[pending accepted revoked].freeze

  belongs_to :invited_by, class_name: "User", optional: true

  validates :clerk_id, :email, :role, presence: true
  validates :clerk_id, uniqueness: true
  validates :email, uniqueness: { case_sensitive: false }
  validates :role, inclusion: { in: ROLES }
  validates :invitation_status, inclusion: { in: INVITATION_STATUSES }
  validates :active, inclusion: { in: [ true, false ] }

  before_validation :normalize_email

  def admin?
    role == "admin"
  end

  def reviewer?
    role == "reviewer"
  end

  def staff?
    admin? || reviewer?
  end

  def invitation_pending?
    invitation_status == "pending" || clerk_id.to_s.start_with?("pending_")
  end

  def invitation_accepted?
    invitation_status == "accepted" && !invitation_pending?
  end

  def mark_invitation_accepted!
    update!(invitation_status: "accepted", accepted_at: accepted_at || Time.current)
  end

  def full_name
    [ first_name, last_name ].compact_blank.join(" ").presence || email.to_s.split("@").first
  end

  def serializable_hash(*args)
    super(*args).merge(
      "full_name" => full_name,
      "is_admin" => admin?,
      "is_staff" => staff?,
      "invitation_pending" => invitation_pending?,
      "active" => active?
    )
  end

  private

  def normalize_email
    self.email = email.to_s.strip.downcase if email.present?
  end
end
