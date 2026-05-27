# frozen_string_literal: true

require "test_helper"

class AlbumSectionTest < ActiveSupport::TestCase
  test "normalizes unsafe slugs" do
    section = events(:leon).album_sections.create!(name: "Reception", slug: "../../outside")

    assert_equal "outside", section.slug
  end
end
