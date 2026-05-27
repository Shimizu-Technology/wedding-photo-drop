# frozen_string_literal: true

class MediaUpload < ApplicationRecord
  STATUSES = %w[pending approved rejected].freeze
  MEDIA_KINDS = %w[image video other].freeze
  ALLOWED_CONTENT_TYPES = %w[
    image/jpeg
    image/png
    image/heic
    image/heif
    image/webp
    video/mp4
    video/quicktime
  ].freeze
  MAX_FILE_SIZE = 250.megabytes

  belongs_to :event
  belongs_to :album_section, optional: true
  has_one_attached :file

  validates :status, presence: true, inclusion: { in: STATUSES }
  validates :media_kind, presence: true, inclusion: { in: MEDIA_KINDS }
  validates :original_filename, :content_type, presence: true
  validates :original_filename, length: { maximum: 255 }
  validates :guest_name, length: { maximum: 80 }, allow_nil: true
  validates :guest_message, length: { maximum: 1_000 }, allow_nil: true
  validates :content_type, inclusion: { in: ALLOWED_CONTENT_TYPES }
  validates :file_size, numericality: { greater_than: 0, less_than_or_equal_to: MAX_FILE_SIZE }
  validate :file_presence
  validate :attached_file_matches_metadata
  validate :album_section_belongs_to_event

  scope :newest_first, -> { order(created_at: :desc) }
  scope :approved, -> { where(status: "approved") }
  scope :pending, -> { where(status: "pending") }
  scope :gallery_order, -> { left_joins(:album_section).order("album_sections.sort_order ASC NULLS LAST", :sort_order, created_at: :desc) }

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

  def attached_file_matches_metadata
    return unless file.attached?

    blob = file.blob
    if blob.byte_size > MAX_FILE_SIZE
      errors.add(:file, "must be #{MAX_FILE_SIZE / 1.megabyte}MB or smaller")
    end
  end

  def album_section_belongs_to_event
    return if album_section_id.blank? || album_section&.event_id == event_id

    errors.add(:album_section, "must belong to this event")
  end
end
