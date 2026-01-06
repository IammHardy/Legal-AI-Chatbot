class ChatController < ApplicationController
  skip_before_action :verify_authenticity_token
  require "openai"

  LEAD_THRESHOLD = 60

  # Use class variables for demo; for production use session or DB
  @@conversation = []
  @@inquiry_score = 0
  @@disclaimer_shown = false
  @@last_user_message = nil

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
  end

  def chat
    user_message = params[:message].to_s.strip
    return render json: { reply: "Please enter a message.", score: @@inquiry_score } if user_message.empty?

    @@last_user_message = user_message
    @@conversation << { role: "user", content: user_message }

    # ✅ Accumulate score based on each message
    score_increment = calculate_score(user_message)
    @@inquiry_score += score_increment

    # 🚨 HANDOFF — stop AI completely if threshold reached
    if @@inquiry_score >= LEAD_THRESHOLD
      return render json: {
        reply: handoff_message,
        cta: "Please submit your details so a legal professional can contact you.",
        score: @@inquiry_score
      }
    end

    # 🤖 AI CONVERSATION (only below threshold)
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

      # ✅ Show disclaimer only once
      disclaimer = nil
      if !@@disclaimer_shown
        disclaimer = "This does not constitute legal advice."
        @@disclaimer_shown = true
      end

    rescue
      reply = "I understand. Could you tell me a bit more about what's going on?"
      disclaimer = nil
    end

    render json: {
      reply: reply,
      disclaimer: disclaimer,
      score: @@inquiry_score
    }
  end

  # ✅ Keyword-based scoring
  def calculate_score(message)
    keywords = {
      "lawyer" => 30,
      "court" => 20,
      "divorce" => 30,
      "custody" => 30,
      "assets" => 20,
      "help" => 10
    }

    score = 0
    keywords.each do |word, value|
      score += value if message.downcase.include?(word)
    end
    score
  end

  def handoff_message
    "Thanks for explaining your situation. This looks like something a legal professional should review directly. Please share your details below and someone will contact you shortly."
  end

  # POST /leads
  def leads
    data = JSON.parse(request.body.read)
    name = data["name"]
    email = data["email"]

    Dir.mkdir(Rails.root.join("leads")) unless Dir.exist?(Rails.root.join("leads"))
    File.write(
      Rails.root.join("leads", "#{Time.now.to_i}_#{name.gsub(' ', '_')}.txt"),
      "Name: #{name}\nEmail: #{email}\nLast Message: #{@@last_user_message}"
    )

    render json: { status: "saved" }
  end

  # POST /summary
  def summary
    summaries_dir = Rails.root.join("summaries")
    Dir.mkdir(summaries_dir) unless Dir.exist?(summaries_dir)

    filename = summaries_dir.join("chat_#{Time.now.to_i}.txt")
    File.write(
      filename,
      @@conversation.map { |m| "#{m[:role].capitalize}: #{m[:content]}" }.join("\n")
    )

    render json: { status: "saved" }
  end
end
