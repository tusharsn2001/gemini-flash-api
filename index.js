const express = require("express");
const cors = require("cors");
require('dotenv').config();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(cors());
app.use(express.json());

// Multer config
const upload = multer({ dest: "uploads/" });

// Google Gemini setup
const API_KEY = process.env.API_KEY;

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
const port = process.env.PORT
/**
 * POST /generate
 * form-data:
 *  - prompt: string
 *  - file: optional file (image or PDF)
 */
app.post("/generate", upload.single("file"), async (req, res) => {
  try {
    const prompt = `Analyze the document and generate 12-15 mock test mcq questions, Separate questions by a blank line. mark the correct option with a '*', example`
    let filePart = null;

    if (req.file) {
      const filePath = path.join(__dirname, req.file.path);
      const fileBuffer = fs.readFileSync(filePath);
      const base64Data = Buffer.from(fileBuffer).toString("base64");

      // If it's an image
      if (req.file.mimetype.startsWith("image/")) {
        filePart = {
          inlineData: {
            data: base64Data,
            mimeType: req.file.mimetype
          }
        };
      }
      // If it's a PDF
      else if (req.file.mimetype === "application/pdf") {
        filePart = {
          inlineData: {
            data: base64Data,
            mimeType: "application/pdf"
          }
        };
      }

      // Clean up uploaded file
      fs.unlinkSync(filePath);
    }

    // Gemini request
    const requestParts = filePart
      ? [{ text: prompt }, filePart]
      : [{ text: prompt }];

    const result = await model.generateContent(requestParts);
    const text = result.response.text();

    res.json({
      success: true,
      prompt,
      output: text
    });
  } catch (error) {
    console.error("Error generating content:", error);
    res.status(500).json({ error: "Failed to generate content" });
  }
});


app.listen(port, () => console.log(`Server running on port ${port}`));
