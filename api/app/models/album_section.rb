# frozen_string_literal: true

class AlbumSection < ApplicationRecord
  belongs_to :event
  has_many :media_uploads, dependent: :nullify

  validates :name, presence: true, length: { maximum: 120 }
  validates :slug, presence: true, uniqueness: { scope: :event_id }, length: { maximum: 140 }, format: { with: /\A[a-z0-9]+(?:-[a-z0-9]+)*\z/, message: "may only contain lowercase letters, numbers, and hyphens" }
  validates :description, length: { maximum: 500 }, allow_blank: true
  validates :sort_order, numericality: { only_integer: true }
  validates :visible, inclusion: { in: [ true, false ] }

  before_validation :ensure_slug

  scope :ordered, -> { order(:sort_order, :name) }
  scope :visible, -> { where(visible: true) }

  private

  def ensure_slug
    self.slug = slug.to_s.parameterize if slug.present?
    self.slug = name.to_s.parameterize if slug.blank? && name.present?
    self.slug = "section-#{SecureRandom.hex(4)}" if slug.blank?
  end
end
