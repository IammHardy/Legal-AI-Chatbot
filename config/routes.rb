Rails.application.routes.draw do
  get "admin/index"
  root "chat#index"
  post "/chat", to: "chat#chat"
  post "/summary", to: "chat#summary"
  post "/clear_chat", to: "chat#clear_chat"
  get "/admin", to: "admin#index"
   # New route for lead capture
  post "/leads", to: "leads#create"
end
