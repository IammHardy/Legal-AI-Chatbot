class DocumentsController < ApplicationController
  skip_before_action :verify_authenticity_token
  require "openai"
  require "json"
  require "tempfile"

  def create
    uploaded = params[:file]
    title = params[:title].to_s.strip

    return render json: { error: "No file uploaded." }, status: 422 if uploaded.nil?

    doc = Document.new(
      title: title.presence || uploaded.original_filename.to_s,
      filename: uploaded.original_filename.to_s,
      content_type: uploaded.content_type.to_s
    )
    doc.save!

    doc.file.attach(uploaded)

    extracted = extract_text_from_upload(doc)
    doc.update!(extracted_text: extracted.to_s)

    # session default (so buttons work without passing id later)
    session[:current_document_id] = doc.id

    render json: {
      status: "ok",
      document: {
        id: doc.id,
        title: doc.title,
        filename: doc.filename,
        content_type: doc.content_type,
        chars: doc.extracted_text.to_s.length
      }
    }
  rescue => e
    Rails.logger.error("[DocumentsController#create] #{e.class} #{e.message}")
    render json: { error: "Upload failed." }, status: 500
  end

  # POST /document_review
  # POST /document_review
  # { task: "summary"|"risks"|"missing"|"questions", document_id?: number }
  def review
    data = JSON.parse(request.body.read) rescue {}
    task = data["task"].to_s.strip
    doc_id = (data["document_id"].presence || session[:current_document_id]).to_i

    return render json: { error: "No document uploaded yet." }, status: 422 if doc_id == 0
    return render json: { error: "Task is required." }, status: 422 if task.blank?

    doc = Document.find(doc_id)
    text = doc.extracted_text.to_s

    if text.blank? || text.length < 80
      return render json: { error: "Could not extract readable text from this document." }, status: 422
    end

    chunks = chunk_text(text, 1100) # ~1k chars each
    prompt = build_cited_prompt(task, chunks)

    client = OpenAI::Client.new(access_token: ENV["OPENAI_API_KEY"])
    resp = client.chat(
      parameters: {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: <<~SYS
              You are a legal document intake assistant.
              Rules:
              - Do NOT give legal advice.
              - Be concise and practical.
              - You MUST ground every factual statement in the provided chunks.
              - When you cite, only use exact quotes copied from chunks.
              Output MUST be valid JSON only (no markdown fences).
            SYS
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.2,
        max_tokens: 900
      }
    )

    raw = resp.dig("choices", 0, "message", "content").to_s.strip
    parsed = safe_json_parse(raw)

    unless parsed.is_a?(Hash) && parsed["items"].is_a?(Array)
      Rails.logger.warn("[DocumentsController#review] Bad JSON output: #{raw[0, 800]}")
      return render json: { error: "Model returned invalid format. Try again." }, status: 502
    end

    # send chunks too (so UI can show source excerpts)
    render json: {
      status: "ok",
      task: task,
      items: parsed["items"],
      sources: chunks.map.with_index { |c, i| { id: i + 1, text: c } }
    }
  rescue => e
    Rails.logger.error("[DocumentsController#review] #{e.class} #{e.message}")
    render json: { error: "Document review failed." }, status: 500
  end

  private

  def chunk_text(text, max_chars)
    cleaned = text.to_s.gsub("\u0000", " ").gsub(/\s+/, " ").strip
    return [] if cleaned.blank?

    chunks = []
    i = 0
    while i < cleaned.length
      chunks << cleaned[i, max_chars]
      i += max_chars
    end
    chunks.first(40) # hard cap to avoid huge prompts
  end

  def safe_json_parse(raw)
    JSON.parse(raw)
  rescue JSON::ParserError
    # Try to salvage if model added text before/after JSON
    start = raw.index("{")
    finish = raw.rindex("}")
    return nil if start.nil? || finish.nil? || finish <= start
    JSON.parse(raw[start..finish]) rescue nil
  end

  def build_cited_prompt(task, chunks)
    chunk_block = chunks.map.with_index { |c, idx| "CHUNK #{idx + 1}:\n#{c}" }.join("\n\n")

    schema = <<~SCHEMA
      Return JSON with this shape:
      {
        "items": [
          {
            "title": "short title",
            "point": "1-3 sentences, non-legal-advice",
            "chunk_id": 3,
            "quote": "exact short quote from that chunk (max 180 chars)",
            "confidence": "low|medium|high"
          }
        ]
      }
    SCHEMA

    instruction =
      case task
      when "summary"
        "Create 10–12 summary bullets about the contract."
      when "risks"
        "List the top 8 potential risk areas for a signer."
      when "missing"
        "List 8 missing/unclear items or ambiguities."
      when "questions"
        "Ask 6 key intake questions someone should answer before signing."
      else
        "Produce 8 helpful intake observations."
      end

    <<~PROMPT
      #{instruction}

      Requirements:
      - Every item MUST cite exactly one chunk via chunk_id and include an exact quote from that chunk.
      - If the info is not in the chunks, do NOT invent it; instead write the point as a question and set confidence to low.
      - Keep it concise.

      #{schema}

      DOCUMENT CHUNKS:
      #{chunk_block}
    PROMPT
  end

  def extract_text_from_upload(doc)
    file = doc.file
    return "" unless file.attached?

    ext = File.extname(doc.filename.to_s).downcase

    tmp = Tempfile.new(["upload", ext])
    tmp.binmode
    tmp.write(file.download)
    tmp.close

    text =
      case ext
      when ".txt"
        File.read(tmp.path)
      when ".pdf"
        extract_pdf(tmp.path)
      when ".docx"
        extract_docx(tmp.path)
      else
        ""
      end

    tmp.unlink
    text.to_s
  rescue => e
    Rails.logger.warn("[extract_text_from_upload] #{e.class} #{e.message}")
    ""
  end

  def extract_pdf(path)
    reader = PDF::Reader.new(path)
    reader.pages.map(&:text).join("\n")
  end

  def extract_docx(path)
    d = Docx::Document.open(path)
    d.paragraphs.map(&:text).join("\n")
  end
end