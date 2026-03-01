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

  # POST /clause_search
  # body: { query: "termination", document_id?: 1 }
  def clause_search
    data = JSON.parse(request.body.read) rescue {}
    query = data["query"].to_s.strip
    doc_id = (data["document_id"].presence || session[:current_document_id]).to_i

    return render json: { error: "No document uploaded yet." }, status: 422 if doc_id == 0
    return render json: { error: "Enter a clause to find (e.g., termination, payment, liability)." }, status: 422 if query.blank?

    doc = Document.find(doc_id)
    text = doc.extracted_text.to_s
    return render json: { error: "Document text is empty." }, status: 422 if text.blank?

    chunks = chunk_text(text, 1100)
    ranked = rank_chunks_by_query(chunks, query, limit: 6)

    if ranked.empty?
      return render json: { status: "ok", matches: [] }
    end

    render json: {
      status: "ok",
      query: query,
      matches: ranked.map do |m|
        {
          chunk_id: m[:chunk_id],
          score: m[:score],
          preview: m[:text][0, 220]
        }
      end
    }
  rescue => e
    Rails.logger.error("[DocumentsController#clause_search] #{e.class} #{e.message}")
    render json: { error: "Clause search failed." }, status: 500
  end

  # POST /clause_rewrite
  # body: { query: "termination", document_id?: 1 }
  def clause_rewrite
    data = JSON.parse(request.body.read) rescue {}
    query = data["query"].to_s.strip
    doc_id = (data["document_id"].presence || session[:current_document_id]).to_i

    return render json: { error: "No document uploaded yet." }, status: 422 if doc_id == 0
    return render json: { error: "Enter a clause to analyze (e.g., termination, payment, liability)." }, status: 422 if query.blank?

    doc = Document.find(doc_id)
    text = doc.extracted_text.to_s
    return render json: { error: "Document text is empty." }, status: 422 if text.blank?

    chunks = chunk_text(text, 1100)
    ranked = rank_chunks_by_query(chunks, query, limit: 6)

    if ranked.empty?
      return render json: { error: "No relevant clause found for that query." }, status: 422
    end

    # Build prompt using top-ranked chunks only (token efficient)
    selected = ranked.map { |m| { id: m[:chunk_id], text: m[:text] } }
    prompt = build_clause_intel_prompt(query, selected)

    client = OpenAI::Client.new(access_token: ENV["OPENAI_API_KEY"])
    resp = client.chat(
      parameters: {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: <<~SYS
              You are a legal document clause assistant.
              Strict rules:
              - Do NOT give legal advice.
              - Use neutral language: "may", "often", "commonly", "consider".
              - Do NOT cite laws or statutes.
              - You MUST ground outputs in the provided chunks.
              - Quotes MUST be exact substrings copied from chunks.
              Output MUST be valid JSON only (no markdown).
            SYS
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.2,
        max_tokens: 1100
      }
    )

    raw = resp.dig("choices", 0, "message", "content").to_s.strip
    parsed = safe_json_parse(raw)

    unless parsed.is_a?(Hash) && parsed["clause"].is_a?(Hash)
      Rails.logger.warn("[DocumentsController#clause_rewrite] Bad JSON output: #{raw[0, 900]}")
      return render json: { error: "Model returned invalid format. Try again." }, status: 502
    end

    render json: {
      status: "ok",
      query: query,
      clause: parsed["clause"],
      sources: selected
    }
  rescue => e
    Rails.logger.error("[DocumentsController#clause_rewrite] #{e.class} #{e.message}")
    render json: { error: "Clause rewrite failed." }, status: 500
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

    # Simple, fast local relevance scoring (no embeddings needed)
  def rank_chunks_by_query(chunks, query, limit:)
    q = normalize(query)
    q_terms = q.split.uniq
    return [] if q_terms.empty?

    scored = chunks.map.with_index do |text, idx|
      t = normalize(text)
      score = 0

      # Term frequency scoring
      q_terms.each do |term|
        next if term.length < 3
        score += t.scan(/\b#{Regexp.escape(term)}\b/).length * 3
      end

      # Bonus if query phrase appears
      score += 10 if t.include?(q)

      { chunk_id: idx + 1, score: score, text: text }
    end

    scored
      .select { |x| x[:score] > 0 }
      .sort_by { |x| -x[:score] }
      .first(limit)
  end

  def normalize(s)
    s.to_s.downcase.gsub(/[^a-z0-9\s\/\-]/, " ").gsub(/\s+/, " ").strip
  end

  def build_clause_intel_prompt(query, selected_chunks)
    chunk_block = selected_chunks.map { |c| "CHUNK #{c[:id]}:\n#{c[:text]}" }.join("\n\n")

    schema = <<~SCHEMA
      Return JSON in this shape:
      {
        "clause": {
          "found": true,
          "label": "e.g., Termination",
          "extracted_clause": "the best clause text you can extract (can be multi-paragraph)",
          "citations": [
            { "chunk_id": 3, "quote": "exact short quote (max 200 chars)" }
          ],
          "risks": [
            { "title": "short", "why_it_matters": "1-2 sentences", "chunk_id": 3, "quote": "exact quote", "severity": "low|medium|high" }
          ],
          "rewrite_options": {
            "neutral": "rewrite clause (clean drafting)",
            "signer_friendly": "rewrite more protective of signer",
            "counterparty_friendly": "rewrite more protective of other party"
          },
          "missing_or_ambiguous": [
            { "item": "short", "question": "short question to clarify", "confidence": "low|medium|high" }
          ]
        }
      }

      Rules:
      - If clause not clearly present, set found=false and use missing_or_ambiguous to ask questions. Do NOT invent.
      - Every risk MUST include chunk_id + exact quote from chunks.
      - Rewrite options are "draft language for discussion" (not legal advice).
    SCHEMA

    <<~PROMPT
      Task: Clause intelligence

      Query clause: "#{query}"

      Use the chunks below to:
      1) Identify and extract the most relevant clause text.
      2) List 4–7 risk observations (non-legal advice), each with a citation.
      3) Produce 3 rewrite options (neutral / signer-friendly / counterparty-friendly).
      4) List 3–6 missing/ambiguous items as questions.

      #{schema}

      DOCUMENT CHUNKS:
      #{chunk_block}
    PROMPT
  end
end