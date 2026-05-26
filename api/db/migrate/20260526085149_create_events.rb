class CreateEvents < ActiveRecord::Migration[8.1]
  def change
    create_table :events do |t|
      t.string :name, null: false
      t.string :slug, null: false
      t.string :upload_token, null: false
      t.string :admin_token, null: false
      t.boolean :public_gallery_enabled, null: false, default: true

      t.timestamps
    end

    add_index :events, :slug, unique: true
    add_index :events, :upload_token, unique: true
    add_index :events, :admin_token, unique: true
  end
end
