# frozen_string_literal: true

class AddUploadsEnabledToEvents < ActiveRecord::Migration[8.1]
  def change
    add_column :events, :uploads_enabled, :boolean, null: false, default: true
  end
end
