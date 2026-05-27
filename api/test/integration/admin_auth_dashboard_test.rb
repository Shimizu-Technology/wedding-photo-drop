# frozen_string_literal: true

require "test_helper"

class AdminAuthDashboardTest < ActionDispatch::IntegrationTest
  setup do
    @user = User.create!(clerk_id: "test_clerk_admin", email: "admin@example.com", role: "admin", super_admin: true)
    @event = events(:leon)
    @event.event_memberships.create!(user: @user, role: "admin")
    @headers = { "Authorization" => "Bearer test_token_#{@user.id}" }
    @photo_path = Rails.root.join("test/fixtures/files/photo.png")
    media_uploads(:pending).file.attach(io: File.open(@photo_path), filename: "pending.jpg", content_type: "image/jpeg") unless media_uploads(:pending).file.attached?
  end

  test "authenticated admin can list events" do
    get "/api/v1/admin/events", headers: @headers

    assert_response :success
    assert response.parsed_body.fetch("events").any?
  end

  test "authenticated admin can create an event" do
    assert_difference -> { Event.count }, 1 do
      post "/api/v1/admin/events", params: { event: { name: "Reception Party" } }, headers: @headers
    end

    assert_response :created
    assert_equal "Reception Party", response.parsed_body.dig("event", "name")
  end

  test "authenticated admin can update event controls" do
    patch "/api/v1/admin/events/#{@event.id}", params: { event: { uploads_enabled: false, public_gallery_enabled: false } }, headers: @headers

    assert_response :success
    assert_equal false, @event.reload.uploads_enabled
    assert_equal false, @event.public_gallery_enabled
  end

  test "authenticated admin can review event uploads" do
    upload = media_uploads(:pending)

    patch "/api/v1/admin/events/#{@event.id}/uploads/#{upload.id}/approve", headers: @headers

    assert_response :success
    assert_equal "approved", upload.reload.status
  end

  test "admin dashboard endpoints require auth" do
    get "/api/v1/admin/events"
    assert_response :unauthorized
  end
end
