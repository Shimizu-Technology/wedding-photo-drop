# frozen_string_literal: true

require "test_helper"

class AdminV2Test < ActionDispatch::IntegrationTest
  setup do
    @admin = User.create!(clerk_id: "admin_v2", email: "admin-v2@example.com", role: "admin")
    @reviewer = User.create!(clerk_id: "reviewer_v2", email: "reviewer-v2@example.com", role: "reviewer")
    @event = events(:leon)
    @headers = { "Authorization" => "Bearer test_token_#{@admin.id}" }
    @pending_upload = media_uploads(:pending)
    @pending_upload.file.attach(io: File.open(Rails.root.join("test/fixtures/files/photo.jpg")), filename: @pending_upload.original_filename, content_type: @pending_upload.content_type) unless @pending_upload.file.attached?
  end

  test "admin can create and resend pending users" do
    assert_difference -> { User.count }, 1 do
      post "/api/v1/admin/users", params: { user: { email: "new-reviewer@example.com", role: "reviewer" } }, headers: @headers
    end

    assert_response :created
    user = User.find_by!(email: "new-reviewer@example.com")
    assert user.invitation_pending?

    post "/api/v1/admin/users/#{user.id}/resend_invitation", headers: @headers
    assert_response :success
  end

  test "reviewer cannot manage users" do
    get "/api/v1/admin/users", headers: { "Authorization" => "Bearer test_token_#{@reviewer.id}" }
    assert_response :forbidden
  end

  test "updating a pending user email reissues invitation feedback" do
    user = User.create!(
      clerk_id: "pending_email_update",
      email: "old-pending@example.com",
      role: "reviewer",
      invitation_status: "pending",
      clerk_invitation_id: "inv_old"
    )

    patch "/api/v1/admin/users/#{user.id}", params: { user: { email: "new-pending@example.com" } }, headers: @headers

    assert_response :success
    assert_equal "new-pending@example.com", user.reload.email
    assert response.parsed_body.key?("invitation_sent")
  end

  test "accepted user email cannot be changed through admin update" do
    patch "/api/v1/admin/users/#{@reviewer.id}", params: { user: { email: "changed@example.com" } }, headers: @headers

    assert_response :unprocessable_entity
    assert_equal "reviewer-v2@example.com", @reviewer.reload.email
  end

  test "cannot deactivate the last active admin" do
    inactive_admin = User.create!(clerk_id: "inactive_admin_v2", email: "inactive-admin@example.com", role: "admin", active: false)

    patch "/api/v1/admin/users/#{@admin.id}", params: { user: { active: false } }, headers: @headers

    assert_response :unprocessable_entity
    assert_equal false, inactive_admin.reload.active?
    assert_equal true, @admin.reload.active?
  end

  test "admin can create album sections and assign uploads" do
    post "/api/v1/admin/events/#{@event.id}/album_sections", params: { album_section: { name: "Reception" } }, headers: @headers
    assert_response :created
    section_id = response.parsed_body.dig("album_section", "id")

    patch "/api/v1/admin/events/#{@event.id}/uploads/#{@pending_upload.id}", params: { upload: { album_section_id: section_id } }, headers: @headers
    assert_response :success
    assert_equal section_id, @pending_upload.reload.album_section_id
  end

  test "admin cannot assign an upload to another event album section" do
    other_event = events(:closed)
    other_section = other_event.album_sections.create!(name: "Other Event")

    patch "/api/v1/admin/events/#{@event.id}/uploads/#{@pending_upload.id}", params: { upload: { album_section_id: other_section.id } }, headers: @headers

    assert_response :unprocessable_entity
    assert_nil @pending_upload.reload.album_section_id
  end

  test "admin can bulk review and delete scoped uploads" do
    patch "/api/v1/admin/events/#{@event.id}/uploads/bulk_approve", params: { ids: [ @pending_upload.id ] }, headers: @headers
    assert_response :success
    assert_equal "approved", @pending_upload.reload.status

    assert_difference -> { MediaUpload.count }, -1 do
      delete "/api/v1/admin/events/#{@event.id}/uploads/bulk_destroy", params: { ids: [ @pending_upload.id ] }, headers: @headers
    end
    assert_response :success
  end

  test "bulk destroy returns validation error when no uploads are selected" do
    delete "/api/v1/admin/events/#{@event.id}/uploads/bulk_destroy", params: { ids: [] }, headers: @headers

    assert_response :unprocessable_entity
    assert_equal "No uploads selected", response.parsed_body.fetch("error")
  end
end
