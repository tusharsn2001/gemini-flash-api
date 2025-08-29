# 📚 MCQ Generator API (Vibe Coded)

This is a lightweight Node.js + Express API that takes a PDF file, processes it using Google's **Gemini API**, and returns multiple-choice questions (MCQs) in JSON format.  
Yes, I vibe-coded this. 🚀

---

## ✨ Features

- Upload PDF documents (up to **20MB**)  
- Automatically generates **5 MCQs** per document  
- Each question includes:
  - The question text
  - 4 answer options
  - An `answerIndex` (0–3) for the correct option
- Cleans up uploaded files after processing
- Handles both **inline data** (≤20MB) and **Google File API** (>20MB)

