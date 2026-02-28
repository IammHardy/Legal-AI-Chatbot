class LeadsController < ApplicationController
  skip_before_action :verify_authenticity_token

  def create
    data = JSON.parse(request.body.read)
    name = data["name"].to_s.strip
    email = data["email"].to_s.strip

    last_message = session[:last_user_message].to_s

    Dir.mkdir(Rails.root.join("leads")) unless Dir.exist?(Rails.root.join("leads"))

    safe_name = name.empty? ? "unknown" : name.gsub(/[^a-zA-Z0-9_ -]/, "").gsub(" ", "_")
    File.write(
      Rails.root.join("leads", "#{Time.now.to_i}_#{safe_name}.txt"),
      "Name: #{name}\nEmail: #{email}\nLast Message: #{last_message}"
    )

    render json: { status: "saved" }
  end
end