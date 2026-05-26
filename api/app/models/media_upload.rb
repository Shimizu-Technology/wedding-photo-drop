# frozen_string_literal: true

class MediaUpload < ApplicationRecord
  STATUSES = %w[pending approved rejected].freeze
  MEDIA_KINDS = %w[image video other].freeze

  belongs_to :event
  has_one_attached :file

  validates :status, presence: true, inclusion: { in: STATUSES }
  validates :media_kind, presence: true, inclusion: { in: MEDIA_KINDS }
  validates :original_filename, :content_type, presence: true
  validates :file_size, numericality: { greater_than_or_equal_to: 0 }
  validate :file_presence

  scope :newest_first, -> { order(created_at: :desc) }
  scope :approved, -> { where(status: "approved") }
  scope :pending, -> { where(status: "pending") }

  def approve!
    update!(status: "approved")
  end

  def reject!
    update!(status: "rejected")
  end

  def image?
    media_kind == "image"
  end

  def video?
    media_kind == "video"
  end

  private

  def file_presence
    errors.add(:file, "must be attached") unless file.attached?
  end
end
