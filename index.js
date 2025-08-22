const express = require('express');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs').promises;
const dotenv = require('dotenv');
const cors = require('cors');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Log API key presence (obscured for security)
console.log('GEMINI_API_KEY loaded:', !!process.env.GEMINI_API_KEY);

// Enable CORS for frontend requests
app.use(cors());

// Configure multer for file uploads with size limit (20MB)
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit
}).single('file');

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// Enable JSON parsing for POST requests
app.use(express.json());

// Middleware to handle multer errors
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    console.error('Multer error:', err.message, 'Field:', err.field);
    return res.status(400).json({ error: `Multer error: ${err.message}` });
  }
  next();
});

// Function to clean markdown from response
const cleanMarkdown = (text) => {
  // Remove ```json and ``` code fences
  return text
    .replace(/```json\n?/, '') // Remove opening ```json
    .replace(/```\n?/, '')     // Remove closing ```
    .trim();                   // Remove leading/trailing whitespace
};

// Endpoint to handle PDF upload and question generation
app.post('/api/generate-questions', (req, res) => {
  console.log('Request headers:', req.headers);
  console.log('Request body fields:', req.body);
  upload(req, res, async (err) => {
    if (err) {
      console.error('Upload error:', err.message);
      return res.status(400).json({ error: 'File upload failed: ' + err.message });
    }

    try {
      if (!req.file) {
        console.error('No file received in request');
        return res.status(400).json({ error: 'No file uploaded' });
      }

      console.log('File received:', {
        originalname: req.file.originalname,
        size: req.file.size,
        path: req.file.path,
        fieldname: req.file.fieldname,
      });

      const filePath = req.file.path;
      const fileBuffer = await fs.readFile(filePath);
      const fileSize = fileBuffer.length;
      console.log(`Processing file: ${req.file.originalname}, Size: ${fileSize} bytes`);

      // Prepare the prompt for Gemini API
      const prompt = `
        Analyze the provided document and generate 5 multiple-choice questions, each with 4 options and an index value (0-3) for the correct answer.
        Return the response as plain JSON without markdown or code fences 
        The JSON structure must be:
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

      let questions;

      if (fileSize <= 20 * 1024 * 1024) {
        // Inline data for files <= 20MB
        console.log('Using inline data for PDF');
        const base64Data = fileBuffer.toString('base64');
        const contents = [
          { text: prompt },
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: base64Data,
            },
          },
        ];

        const result = await model.generateContent(contents);
        const generatedText = result.response.text();
        console.log('Raw Gemini API response:', generatedText);

        try {
          // Clean markdown before parsing
          const cleanedText = cleanMarkdown(generatedText);
          console.log('Cleaned response:', cleanedText);
          questions = JSON.parse(cleanedText).questions;
        } catch (error) {
          console.error('JSON parse error:', error.message);
          throw new Error('Failed to parse Gemini API response as JSON: ' + error.message);
        }
      } else {
        // File API for files > 20MB
        console.log('Using File API for PDF');
        const file = await genAI.fileManager.uploadFile(filePath, {
          mimeType: 'application/pdf',
          displayName: req.file.originalname || 'uploaded.pdf',
        });

        // Wait for file processing
        let fileStatus = await genAI.fileManager.getFile(file.file.name);
        console.log(`Initial file status: ${fileStatus.state}`);
        while (fileStatus.state === 'PROCESSING') {
          await new Promise(resolve => setTimeout(resolve, 5000));
          fileStatus = await genAI.fileManager.getFile(file.file.name);
          console.log(`Current file status: ${fileStatus.state}`);
        }
        if (fileStatus.state === 'FAILED') {
          throw new Error('File processing failed');
        }

        const contents = [
          { text: prompt },
          {
            fileData: {
              mimeType: file.file.mimeType,
              fileUri: file.file.uri,
            },
          },
        ];

        const result = await model.generateContent(contents);
        const generatedText = result.response.text();
        console.log('Raw Gemini API response (File API):', generatedText);

        try {
          // Clean markdown before parsing
          const cleanedText = cleanMarkdown(generatedText);
          console.log('Cleaned response (File API):', cleanedText);
          questions = JSON.parse(cleanedText).questions;
        } catch (error) {
          console.error('JSON parse error:', error.message);
          throw new Error('Failed to parse Gemini API response as JSON: ' + error.message);
        }
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
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});