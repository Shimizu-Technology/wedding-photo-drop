# frozen_string_literal: true

require "test_helper"

class ApiFlowTest < ActionDispatch::IntegrationTest
  setup do
    @event = events(:leon)
    @closed_event = events(:closed)
    @photo_path = Rails.root.join("test/fixtures/files/photo.png")
    @text_path = Rails.root.join("test/fixtures/files/not_photo.txt")
    @empty_path = Rails.root.join("test/fixtures/files/empty.png")
    attach_fixture_files
  end

  test "public event lookup hides admin token" do
    get "/api/v1/events/#{@event.upload_token}"

    assert_response :success
    body = response.parsed_body
    assert_equal @event.name, body.dig("event", "name")
    assert_nil body.dig("event", "admin_token")
    assert_equal true, body.dig("event", "uploads_enabled")
  end

  test "guest upload creates pending media" do
    file = Rack::Test::UploadedFile.new(@photo_path, "image/png")

    assert_difference -> { @event.media_uploads.count }, 1 do
      post "/api/v1/events/#{@event.upload_token}/uploads", params: {
        guest_name: "Wedding Guest",
        guest_message: "Beautiful ceremony",
        files: [ file ]
      }
    end

    assert_response :created
    upload = @event.media_uploads.order(:created_at).last
    assert_equal "pending", upload.status
    assert_equal "image/png", upload.content_type
    assert upload.file.attached?
  end

  test "guest upload rejects unsupported files" do
    file = Rack::Test::UploadedFile.new(@text_path, "text/plain")

    assert_no_difference -> { @event.media_uploads.count } do
      post "/api/v1/events/#{@event.upload_token}/uploads", params: { files: [ file ] }
    end

    assert_response :unprocessable_entity
    assert_match(/JPEG, PNG, HEIC, WebP, MP4, or MOV/, response.parsed_body["error"])
  end

  test "guest upload rejects empty files before attachment" do
    file = Rack::Test::UploadedFile.new(@empty_path, "image/png")

    assert_no_difference -> { @event.media_uploads.count } do
      post "/api/v1/events/#{@event.upload_token}/uploads", params: { files: [ file ] }
    end

    assert_response :unprocessable_entity
    assert_match(/empty files/, response.parsed_body["error"])
  end

  test "guest upload rejects overlong filenames before attachment" do
    file = Rack::Test::UploadedFile.new(@photo_path, "image/png")
    file.define_singleton_method(:original_filename) { "#{'a' * 256}.png" }

    assert_no_difference -> { @event.media_uploads.count } do
      post "/api/v1/events/#{@event.upload_token}/uploads", params: { files: [ file ] }
    end

    assert_response :unprocessable_entity
    assert_match(/Filenames/, response.parsed_body["error"])
  end

  test "guest upload uses detected mime type when browser declaration is wrong" do
    file = Rack::Test::UploadedFile.new(@photo_path, "image/svg+xml")

    assert_difference -> { @event.media_uploads.count }, 1 do
      post "/api/v1/events/#{@event.upload_token}/uploads", params: { files: [ file ] }
    end

    assert_response :created
    assert_equal "image/png", @event.media_uploads.order(:created_at).last.content_type
  end

  test "direct upload rejects blob whose declared content type is spoofed" do
    blob = ActiveStorage::Blob.create_and_upload!(
      io: StringIO.new("<script>alert('not an image')</script>"),
      filename: "spoofed.jpg",
      content_type: "image/jpeg",
      identify: false
    )

    assert_no_difference -> { @event.media_uploads.count } do
      post "/api/v1/events/#{@event.upload_token}/uploads", params: { signed_blob_ids: [ blob.signed_id ] }
    end

    assert_response :unprocessable_entity
    assert_match(/JPEG, PNG, HEIC, WebP, MP4, or MOV/, response.parsed_body["error"])
  end

  test "direct upload stores sniffed content type" do
    blob = ActiveStorage::Blob.create_and_upload!(
      io: File.open(@photo_path),
      filename: "photo-as-jpeg.jpg",
      content_type: "image/jpeg",
      identify: false
    )

    assert_difference -> { @event.media_uploads.count }, 1 do
      post "/api/v1/events/#{@event.upload_token}/uploads", params: { signed_blob_ids: [ blob.signed_id ] }
    end

    assert_response :created
    upload = @event.media_uploads.order(:created_at).last
    assert_equal "image/png", upload.content_type
    assert_equal "image/png", upload.file.blob.content_type
  end

  test "guest upload rejects closed event" do
    file = Rack::Test::UploadedFile.new(@photo_path, "image/png")

    post "/api/v1/events/#{@closed_event.upload_token}/uploads", params: { files: [ file ] }

    assert_response :forbidden
  end

  test "gallery returns approved uploads only" do
    get "/api/v1/events/#{@event.upload_token}/gallery"

    assert_response :success
    statuses = response.parsed_body.fetch("uploads").map { |upload| upload.fetch("status") }
    assert_equal [ "approved" ], statuses
  end

  test "gallery includes limit and offset pagination metadata" do
    get "/api/v1/events/#{@event.upload_token}/gallery", params: { limit: 1, offset: 0 }

    assert_response :success
    assert_equal 1, response.parsed_body.dig("pagination", "limit")
    assert_equal 0, response.parsed_body.dig("pagination", "offset")
  end

  test "legacy header-token admin routes are removed" do
    get "/api/v1/admin/event", headers: { "X-Admin-Token" => @event.admin_token }
    assert_response :not_found

    patch "/api/v1/admin/uploads/#{media_uploads(:pending).id}/approve", headers: { "X-Admin-Token" => @event.admin_token }
    assert_response :not_found
  end

  test "legacy admin token in url route is removed" do
    user = User.create!(clerk_id: "legacy_route_test", email: "legacy-route@example.com", role: "admin")

    get "/api/v1/admin/events/#{@event.admin_token}", headers: { "Authorization" => "Bearer test_token_#{user.id}" }

    assert_response :not_found
  end

  test "local dev event index exposes convenient local links" do
    get "/api/v1/dev/events"

    assert_response :success
    first_event = response.parsed_body.fetch("events").first
    assert_equal "/upload/#{@event.upload_token}", first_event.fetch("upload_path")
    assert_equal "/admin", first_event.fetch("admin_path")
  end

  private

  def attach_fixture_files
    media_uploads(:pending, :approved, :rejected).each do |upload|
      next if upload.file.attached?

      upload.file.attach(io: File.open(@photo_path), filename: upload.original_filename, content_type: upload.content_type)
    end
  end
end
