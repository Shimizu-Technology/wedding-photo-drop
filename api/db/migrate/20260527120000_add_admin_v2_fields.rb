# frozen_string_literal: true

class AddAdminV2Fields < ActiveRecord::Migration[8.1]
  def change
    change_table :users, bulk: true do |t|
      t.boolean :active, null: false, default: true
      t.datetime :invited_at
      t.datetime :accepted_at
      t.references :invited_by, foreign_key: { to_table: :users }
      t.string :clerk_invitation_id
    end

    create_table :album_sections do |t|
      t.references :event, null: false, foreign_key: true
      t.string :name, null: false
      t.string :slug, null: false
      t.text :description
      t.integer :sort_order, null: false, default: 0
      t.boolean :visible, null: false, default: true

      t.timestamps
    end

    add_index :album_sections, [ :event_id, :slug ], unique: true
    add_index :album_sections, [ :event_id, :sort_order ]

    change_table :media_uploads, bulk: true do |t|
      t.references :album_section, foreign_key: true
      t.integer :sort_order, null: false, default: 0
    end
  end
end
