# frozen_string_literal: true

class AddProcessingFieldsToMediaUploads < ActiveRecord::Migration[8.1]
  def change
    add_column :media_uploads, :processed_at, :datetime
    add_column :media_uploads, :processing_error, :text
  end
end
