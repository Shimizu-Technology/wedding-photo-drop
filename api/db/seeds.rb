# frozen_string_literal: true

Event.find_or_create_by!(slug: "leon-wedding") do |event|
  event.name = "Leon & Kami's Wedding"
  event.upload_token = ENV.fetch("SEED_UPLOAD_TOKEN", SecureRandom.urlsafe_base64(18))
  event.admin_token = ENV.fetch("SEED_ADMIN_TOKEN", SecureRandom.urlsafe_base64(24))
  event.public_gallery_enabled = true
end

puts "Seeded events:"
Event.find_each do |event|
  puts "- #{event.name}"
  puts "  Upload: /upload/#{event.upload_token}"
  puts "  Gallery: /gallery/#{event.upload_token}"
  puts "  Admin: /admin"
end
