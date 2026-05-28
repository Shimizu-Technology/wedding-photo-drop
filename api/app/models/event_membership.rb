# frozen_string_literal: true

class EventMembership < ApplicationRecord
  ROLES = %w[admin reviewer].freeze

  belongs_to :event
  belongs_to :user
  belongs_to :invited_by, class_name: "User", optional: true

  validates :role, presence: true, inclusion: { in: ROLES }
  validates :active, inclusion: { in: [ true, false ] }
  validates :user_id, uniqueness: { scope: :event_id }

  def admin?
    role == "admin"
  end

  def reviewer?
    role == "reviewer"
  end
end
