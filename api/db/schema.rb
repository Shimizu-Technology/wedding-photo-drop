# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_05_27_120000) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "active_storage_attachments", force: :cascade do |t|
    t.bigint "blob_id", null: false
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.bigint "record_id", null: false
    t.string "record_type", null: false
    t.index ["blob_id"], name: "index_active_storage_attachments_on_blob_id"
    t.index ["record_type", "record_id", "name", "blob_id"], name: "index_active_storage_attachments_uniqueness", unique: true
  end

  create_table "active_storage_blobs", force: :cascade do |t|
    t.bigint "byte_size", null: false
    t.string "checksum"
    t.string "content_type"
    t.datetime "created_at", null: false
    t.string "filename", null: false
    t.string "key", null: false
    t.text "metadata"
    t.string "service_name", null: false
    t.index ["key"], name: "index_active_storage_blobs_on_key", unique: true
  end

  create_table "active_storage_variant_records", force: :cascade do |t|
    t.bigint "blob_id", null: false
    t.string "variation_digest", null: false
    t.index ["blob_id", "variation_digest"], name: "index_active_storage_variant_records_uniqueness", unique: true
  end

  create_table "album_sections", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.text "description"
    t.bigint "event_id", null: false
    t.string "name", null: false
    t.string "slug", null: false
    t.integer "sort_order", default: 0, null: false
    t.datetime "updated_at", null: false
    t.boolean "visible", default: true, null: false
    t.index ["event_id", "slug"], name: "index_album_sections_on_event_id_and_slug", unique: true
    t.index ["event_id", "sort_order"], name: "index_album_sections_on_event_id_and_sort_order"
    t.index ["event_id"], name: "index_album_sections_on_event_id"
  end

  create_table "events", force: :cascade do |t|
    t.string "admin_token", null: false
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.boolean "public_gallery_enabled", default: true, null: false
    t.string "slug", null: false
    t.datetime "updated_at", null: false
    t.string "upload_token", null: false
    t.boolean "uploads_enabled", default: true, null: false
    t.index ["admin_token"], name: "index_events_on_admin_token", unique: true
    t.index ["slug"], name: "index_events_on_slug", unique: true
    t.index ["upload_token"], name: "index_events_on_upload_token", unique: true
  end

  create_table "media_uploads", force: :cascade do |t|
    t.bigint "album_section_id"
    t.string "content_type", null: false
    t.datetime "created_at", null: false
    t.bigint "event_id", null: false
    t.bigint "file_size", default: 0, null: false
    t.text "guest_message"
    t.string "guest_name"
    t.string "media_kind", null: false
    t.string "original_filename", null: false
    t.integer "sort_order", default: 0, null: false
    t.string "status", default: "pending", null: false
    t.datetime "updated_at", null: false
    t.index ["album_section_id"], name: "index_media_uploads_on_album_section_id"
    t.index ["created_at"], name: "index_media_uploads_on_created_at"
    t.index ["event_id", "status"], name: "index_media_uploads_on_event_id_and_status"
    t.index ["event_id"], name: "index_media_uploads_on_event_id"
  end

  create_table "users", force: :cascade do |t|
    t.datetime "accepted_at"
    t.boolean "active", default: true, null: false
    t.string "clerk_id", null: false
    t.string "clerk_invitation_id"
    t.datetime "created_at", null: false
    t.string "email", null: false
    t.string "first_name"
    t.string "invitation_status", default: "accepted", null: false
    t.datetime "invited_at"
    t.bigint "invited_by_id"
    t.string "last_name"
    t.datetime "last_sign_in_at"
    t.string "role", default: "admin", null: false
    t.datetime "updated_at", null: false
    t.index "lower((email)::text)", name: "index_users_on_lower_email", unique: true
    t.index ["clerk_id"], name: "index_users_on_clerk_id", unique: true
    t.index ["invited_by_id"], name: "index_users_on_invited_by_id"
  end

  add_foreign_key "active_storage_attachments", "active_storage_blobs", column: "blob_id"
  add_foreign_key "active_storage_variant_records", "active_storage_blobs", column: "blob_id"
  add_foreign_key "album_sections", "events"
  add_foreign_key "media_uploads", "album_sections"
  add_foreign_key "media_uploads", "events"
  add_foreign_key "users", "users", column: "invited_by_id"
end
