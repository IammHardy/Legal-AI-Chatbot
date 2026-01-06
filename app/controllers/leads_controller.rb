class LeadsController < ApplicationController
  skip_before_action :verify_authenticity_token

  def create
    data = JSON.parse(request.body.read)
    name = data["name"]
    email = data["email"]
    last_message = data["last_message"]

    Dir.mkdir(Rails.root.join("leads")) unless Dir.exist?(Rails.root.join("leads"))
    File.write(
      Rails.root.join("leads", "#{Time.now.to_i}_#{name.gsub(' ', '_')}.txt"),
      "Name: #{name}\nEmail: #{email}\nLast Message: #{last_message}"
    )

    render json: { status: "saved" }
  end
end
