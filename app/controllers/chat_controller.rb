class ChatController < ApplicationController
  skip_before_action :verify_authenticity_token
  require "openai"

  LEAD_THRESHOLD = 60

  SYSTEM_PROMPT = <<~PROMPT
    You are a conversational legal intake assistant.

    Rules:
    - Be empathetic and human
    - Ask short clarifying questions
    - Do NOT give legal advice
    - Do NOT recommend consultation unless explicitly told
    - Do NOT solve the problem
    - Your job is to understand the user's situation
  PROMPT

  def index
    session[:inquiry_score] ||= 0
    session[:disclaimer_shown] ||= false
    session[:conversation] ||= []
    session[:last_user_message] ||= nil
  end

  def chat
    user_message = params[:message].to_s.strip
    return render json: { reply: "Please enter a message.", score: session[:inquiry_score] } if user_message.empty?

    session[:last_user_message] = user_message
    session[:conversation] << { role: "user", content: user_message }

    session[:inquiry_score] += calculate_score(user_message)

    # 🚨 HANDOFF — STOP AI COMPLETELY
    if session[:inquiry_score] >= LEAD_THRESHOLD
      return render json: {
        reply: handoff_message,
        cta: "Please submit your details so a legal professional can contact you.",
        score: session[:inquiry_score]
      }
    end

    begin
      client = OpenAI::Client.new(access_token: ENV["OPENAI_API_KEY"])
      response = client.chat(
        parameters: {
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: user_message }
          ],
          temperature: 0.4
        }
      )

      reply = response.dig("choices", 0, "message", "content")

      disclaimer = nil
      unless session[:disclaimer_shown]
        disclaimer = "This does not constitute legal advice."
        session[:disclaimer_shown] = true
      end

    rescue
      reply = "I understand. Could you tell me a bit more about what's going on?"
      disclaimer = nil
    end

    render json: {
      reply: reply,
      disclaimer: disclaimer,
      score: session[:inquiry_score]
    }
  end

  def calculate_score(message)
    keywords = {
      "lawyer" => 30,
      "court" => 20,
      "divorce" => 30,
      "custody" => 30,
      "assets" => 20,
      "help" => 10
    }

    keywords.sum { |word, value| message.downcase.include?(word) ? value : 0 }
  end

  def handoff_message
    "Thanks for explaining your situation. This looks like something a legal professional should review directly. Please share your details below and someone will contact you shortly."
  end

  def leads
    data = JSON.parse(request.body.read)
    name = data["name"]
    email = data["email"]

    Dir.mkdir(Rails.root.join("leads")) unless Dir.exist?(Rails.root.join("leads"))
    File.write(
      Rails.root.join("leads", "#{Time.now.to_i}_#{name.gsub(' ', '_')}.txt"),
      "Name: #{name}\nEmail: #{email}\nLast Message: #{session[:last_user_message]}"
    )

    render json: { status: "saved" }
  end
end
