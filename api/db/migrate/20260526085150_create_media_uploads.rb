class CreateMediaUploads < ActiveRecord::Migration[8.1]
  def change
    create_table :media_uploads do |t|
      t.references :event, null: false, foreign_key: true
      t.string :guest_name
      t.text :guest_message
      t.string :status, null: false, default: "pending"
      t.string :media_kind, null: false
      t.string :original_filename, null: false
      t.string :content_type, null: false
      t.bigint :file_size, null: false, default: 0

      t.timestamps
    end

    add_index :media_uploads, [ :event_id, :status ]
    add_index :media_uploads, :created_at
  end
end
