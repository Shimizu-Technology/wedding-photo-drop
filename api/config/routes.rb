Rails.application.routes.draw do
  namespace :api do
    namespace :v1 do
      get "events/:token", to: "events#show"
      post "events/:event_token/uploads", to: "uploads#create"
      get "events/:event_token/gallery", to: "galleries#show"

      namespace :admin do
        get "event", to: "events#show"
        patch "uploads/:id/approve", to: "uploads#approve"
        patch "uploads/:id/reject", to: "uploads#reject"
        delete "uploads/:id", to: "uploads#destroy"
      end
    end
  end

  get "up" => "rails/health#show", as: :rails_health_check
end
