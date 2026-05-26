# frozen_string_literal: true

Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    frontend_url = ENV["FRONTEND_URL"]
    origins = ENV.fetch("ALLOWED_ORIGINS", [frontend_url, "http://localhost:5173", "http://localhost:4173"].compact.join(","))
                 .split(",")
                 .map(&:strip)
                 .reject(&:blank?)

    origins(*origins)

    resource "*",
      headers: :any,
      methods: [ :get, :post, :put, :patch, :delete, :options, :head ],
      credentials: false
  end
end
