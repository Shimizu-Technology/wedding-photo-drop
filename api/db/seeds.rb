# frozen_string_literal: true

Event.find_or_create_by!(slug: ENV["SEED_EVENT_SLUG"].presence || "leon-wedding") do |event|
  event.name = ENV["SEED_EVENT_NAME"].presence || "Leon & Kami's Wedding"
  event.upload_token = ENV["SEED_UPLOAD_TOKEN"].presence || SecureRandom.urlsafe_base64(18)
  event.admin_token = ENV["SEED_ADMIN_TOKEN"].presence || SecureRandom.urlsafe_base64(24)
  event.public_gallery_enabled = true
  event.uploads_enabled = true
end

if ENV["SUPER_ADMIN_EMAIL"].present?
  email = ENV.fetch("SUPER_ADMIN_EMAIL").strip.downcase
  user = User.find_or_initialize_by(email: email)
  user.assign_attributes(
    clerk_id: user.clerk_id.presence || "seed_super_admin_#{Digest::SHA256.hexdigest(email).first(12)}",
    role: "admin",
    super_admin: true,
    active: true,
    invitation_status: "accepted",
    accepted_at: user.accepted_at || Time.current
  )
  user.save!
  puts "Seeded super admin: #{user.email}"
end

puts "Seeded events:"
Event.find_each do |event|
  puts "- #{event.name}"
  puts "  Upload: /upload/#{event.upload_token}"
  puts "  Gallery: /gallery/#{event.upload_token}"
  puts "  Admin: /admin"
end
