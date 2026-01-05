Rails.application.routes.draw do
  root "chat#index"
  post "/chat", to: "chat#chat"
  post "/summary", to: "chat#summary"
end
