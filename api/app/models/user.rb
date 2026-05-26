# frozen_string_literal: true

class User < ApplicationRecord
  ROLES = %w[admin reviewer].freeze

  validates :clerk_id, :email, :role, presence: true
  validates :clerk_id, uniqueness: true
  validates :email, uniqueness: { case_sensitive: false }
  validates :role, inclusion: { in: ROLES }

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

  def full_name
    [ first_name, last_name ].compact_blank.join(" ").presence || email.to_s.split("@").first
  end

  def serializable_hash(*args)
    super(*args).merge(
      "full_name" => full_name,
      "is_admin" => admin?,
      "is_staff" => staff?
    )
  end

  private

  def normalize_email
    self.email = email.to_s.strip.downcase if email.present?
  end
end
