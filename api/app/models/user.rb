# frozen_string_literal: true

class User < ApplicationRecord
  ROLES = %w[admin reviewer].freeze
  INVITATION_STATUSES = %w[pending accepted revoked].freeze

  belongs_to :invited_by, class_name: "User", optional: true
  has_many :event_memberships, dependent: :destroy
  has_many :events, through: :event_memberships

  validates :clerk_id, :email, :role, presence: true
  validates :clerk_id, uniqueness: true
  validates :email, uniqueness: { case_sensitive: false }
  validates :role, inclusion: { in: ROLES }
  validates :invitation_status, inclusion: { in: INVITATION_STATUSES }
  validates :active, inclusion: { in: [ true, false ] }

  before_validation :normalize_email

  def super_admin?
    super_admin
  end

  def admin?
    super_admin? || role == "admin"
  end

  def reviewer?
    role == "reviewer"
  end

  def staff?
    super_admin? || admin? || reviewer? || event_memberships.where(active: true).exists?
  end

  def event_role(event)
    return "super_admin" if super_admin?

    event_memberships.find_by(event: event, active: true)&.role
  end

  def can_manage_event?(event)
    super_admin? || event_role(event).present?
  end

  def can_admin_event?(event)
    super_admin? || event_role(event) == "admin"
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
      "is_super_admin" => super_admin?,
      "invitation_pending" => invitation_pending?,
      "active" => active?
    )
  end

  private

  def normalize_email
    self.email = email.to_s.strip.downcase if email.present?
  end
end
