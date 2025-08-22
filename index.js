const express = require('express');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs').promises;
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// Enable JSON parsing for POST requests
app.use(express.json());

// Endpoint to handle PDF upload and question generation
app.post('/api/generate-questions', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Read the uploaded PDF file
    const filePath = req.file.path;
    const fileBuffer = await fs.readFile(filePath);
    const base64Data = fileBuffer.toString('base64');

    // Prepare the prompt for Gemini API
    const prompt = `
      Analyze the provided document and generate 5 multiple-choice questions, each with 4 options and an index value (0-3) for the correct answer.
      Return the response in JSON format with the following structure:
      {
        "questions": [
          {
            "question": "Question text",
            "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
            "correctAnswer": 0
          },
          ...
        ]
      }
    `;

    // Send request to Gemini API
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: 'application/pdf',
          data: base64Data,
        },
      },
    ]);

    const generatedText = result.response.text();

    // Parse the JSON response
    let questions;
    try {
      questions = JSON.parse(generatedText).questions;
    } catch (error) {
      throw new Error('Failed to parse Gemini API response as JSON');
    }

    // Map questions to the frontend's expected format
    const formattedQuestions = questions.map(q => ({
      question: q.question,
      options: q.options,
      answerIndex: q.correctAnswer,
    }));

    // Clean up the uploaded file
    await fs.unlink(filePath);

    // Send the formatted questions to the frontend
    res.status(200).json(formattedQuestions);
  } catch (error) {
    console.error('Error processing PDF:', error.message);
    res.status(500).json({ error: 'Failed to process PDF: ' + error.message });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});