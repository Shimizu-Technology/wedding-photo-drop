# frozen_string_literal: true

class Rack::Attack
  Rack::Attack.cache.store = Rails.cache

  throttle("uploads/ip", limit: ENV.fetch("UPLOAD_RATE_LIMIT_PER_MINUTE", 12).to_i, period: 1.minute) do |request|
    remote_ip = request.get_header("action_dispatch.remote_ip")&.to_s.presence || request.ip
    remote_ip if request.post? && request.path.match?(%r{\A/api/v1/events/[^/]+/uploads\z})
  end

  throttle("uploads/event", limit: ENV.fetch("EVENT_UPLOAD_RATE_LIMIT_PER_MINUTE", 60).to_i, period: 1.minute) do |request|
    request.path[%r{\A/api/v1/events/([^/]+)/uploads\z}, 1] if request.post?
  end

  self.throttled_responder = lambda do |_request|
    [
      429,
      { "Content-Type" => "application/json" },
      [ { error: "Too many uploads. Please wait a moment and try again." }.to_json ]
    ]
  end
end

Rails.application.config.middleware.use Rack::Attack
