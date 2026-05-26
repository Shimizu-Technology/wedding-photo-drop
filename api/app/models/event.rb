# frozen_string_literal: true

class Event < ApplicationRecord
  has_many :media_uploads, dependent: :destroy

  validates :name, :slug, :upload_token, :admin_token, presence: true
  validates :slug, :upload_token, :admin_token, uniqueness: true

  before_validation :ensure_tokens, on: :create
  before_validation :ensure_slug

  def self.find_by_public_token!(token)
    find_by!(upload_token: token)
  end

  def self.find_by_admin_token!(token)
    find_by!(admin_token: token)
  end

  private

  def ensure_tokens
    self.upload_token ||= SecureRandom.urlsafe_base64(18)
    self.admin_token ||= SecureRandom.urlsafe_base64(24)
  end

  def ensure_slug
    self.slug = name.to_s.parameterize if slug.blank? && name.present?
    self.slug = "event-#{SecureRandom.hex(4)}" if slug.blank?
  end
end
