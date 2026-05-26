# frozen_string_literal: true

require "test_helper"

class MediaUploadTest < ActiveSupport::TestCase
  test "requires an attached file" do
    upload = events(:leon).media_uploads.build(
      status: "pending",
      media_kind: "image",
      original_filename: "photo.jpg",
      content_type: "image/jpeg",
      file_size: 12
    )

    assert_not upload.valid?
    assert_includes upload.errors[:file], "must be attached"
  end

  test "rejects unsupported content types including svg" do
    upload = build_upload(content_type: "image/svg+xml", filename: "unsafe.svg")

    assert_not upload.valid?
    assert_includes upload.errors[:content_type], "is not included in the list"
  end

  test "limits guest metadata lengths" do
    upload = build_upload(guest_name: "A" * 81, guest_message: "B" * 1001)

    assert_not upload.valid?
    assert upload.errors[:guest_name].any?
    assert upload.errors[:guest_message].any?
  end

  private

  def build_upload(content_type: "image/jpeg", filename: "photo.jpg", guest_name: nil, guest_message: nil)
    upload = events(:leon).media_uploads.build(
      guest_name: guest_name,
      guest_message: guest_message,
      status: "pending",
      media_kind: content_type.start_with?("video/") ? "video" : "image",
      original_filename: filename,
      content_type: content_type,
      file_size: 12
    )
    upload.file.attach(io: StringIO.new("file bytes"), filename: filename, content_type: content_type)
    upload
  end
end
