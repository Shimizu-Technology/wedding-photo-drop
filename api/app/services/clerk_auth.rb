# frozen_string_literal: true

require "uri"

class ClerkAuth
  JWKS_CACHE_KEY = "clerk_jwks"
  JWKS_CACHE_TTL = 1.hour

  class << self
    def verify(token)
      return nil if token.blank?
      return test_payload(token) if Rails.env.test? && token.start_with?("test_token_")
      return dev_payload(token) if Rails.env.local? && token == ENV["DEV_AUTH_TOKEN"].presence

      jwks = fetch_jwks
      return nil unless jwks

      JWT.decode(token, nil, true, decode_options(jwks)).first
    rescue JWT::DecodeError => e
      Rails.logger.warn("Clerk JWT decode error: #{e.message}")
      nil
    end

    private

    def decode_options(jwks)
      options = { algorithms: [ "RS256" ], jwks: jwks }

      issuer = token_issuer
      if issuer.present?
        options[:iss] = issuer
        options[:verify_iss] = true
      end

      audiences = token_audiences
      if audiences.present?
        options[:aud] = audiences.length == 1 ? audiences.first : audiences
        options[:verify_aud] = true
      end

      options
    end

    def fetch_jwks
      cached = Rails.cache.read(JWKS_CACHE_KEY)
      return cached if cached.present?

      url = ENV["CLERK_JWKS_URL"].presence || clerk_jwks_url_from_issuer
      return nil unless url

      response = HTTParty.get(url, timeout: 5)
      return nil unless response.success?

      jwks = response.parsed_response
      Rails.cache.write(JWKS_CACHE_KEY, jwks, expires_in: JWKS_CACHE_TTL)
      jwks
    rescue HTTParty::Error, Timeout::Error => e
      Rails.logger.error("Clerk JWKS fetch failed: #{e.message}")
      nil
    end

    def clerk_jwks_url_from_issuer
      issuer = ENV["CLERK_ISSUER"].presence
      "#{issuer}/.well-known/jwks.json" if issuer
    end

    def token_issuer
      issuer = ENV["CLERK_ISSUER"].presence
      return issuer if issuer

      url = ENV["CLERK_JWKS_URL"].presence
      return nil unless url

      uri = URI.parse(url)
      return nil if uri.scheme.blank? || uri.host.blank?

      origin = +"#{uri.scheme}://#{uri.host}"
      origin << ":#{uri.port}" unless [ 80, 443 ].include?(uri.port)
      origin
    rescue URI::InvalidURIError => e
      Rails.logger.warn("Invalid Clerk JWKS URL: #{e.message}")
      nil
    end

    def token_audiences
      raw = ENV.fetch("CLERK_AUDIENCE", ENV.fetch("CLERK_AUDIENCES", nil))
      return nil if raw.blank?

      raw.split(",").map(&:strip).reject(&:blank?)
    end

    def test_payload(token)
      id = token.delete_prefix("test_token_")
      user = User.find(id)
      {
        "sub" => user.clerk_id,
        "email" => user.email,
        "first_name" => user.first_name,
        "last_name" => user.last_name
      }
    rescue ActiveRecord::RecordNotFound
      nil
    end

    def dev_payload(token)
      {
        "sub" => "dev_user_#{Digest::SHA256.hexdigest(token).first(12)}",
        "email" => ENV.fetch("DEV_AUTH_EMAIL", "admin@example.test"),
        "first_name" => "Local",
        "last_name" => "Admin"
      }
    end
  end
end
