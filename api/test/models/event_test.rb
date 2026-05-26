# frozen_string_literal: true

require "test_helper"

class EventTest < ActiveSupport::TestCase
  test "generates unguessable tokens and slug" do
    event = Event.create!(name: "A Beautiful Wedding")

    assert event.upload_token.present?
    assert event.admin_token.present?
    assert_equal "a-beautiful-wedding", event.slug
  end

  test "tokens are unique" do
    event = Event.new(
      name: "Duplicate Token Event",
      slug: "duplicate-token-event",
      upload_token: events(:leon).upload_token,
      admin_token: "different-admin-token"
    )

    assert_not event.valid?
    assert_includes event.errors[:upload_token], "has already been taken"
  end
end
