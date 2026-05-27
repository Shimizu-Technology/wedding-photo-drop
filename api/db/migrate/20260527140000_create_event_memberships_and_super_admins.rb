# frozen_string_literal: true

class CreateEventMembershipsAndSuperAdmins < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :super_admin, :boolean, default: false, null: false
    add_index :users, :super_admin

    create_table :event_memberships do |t|
      t.references :event, null: false, foreign_key: true
      t.references :user, null: false, foreign_key: true
      t.string :role, null: false, default: "admin"
      t.boolean :active, null: false, default: true
      t.references :invited_by, foreign_key: { to_table: :users }
      t.datetime :invited_at

      t.timestamps
    end

    add_index :event_memberships, [ :event_id, :user_id ], unique: true
    add_index :event_memberships, [ :user_id, :active ]
  end
end
