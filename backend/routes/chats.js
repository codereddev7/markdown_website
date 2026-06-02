const express = require('express');
const router = express.Router();
const Chat = require('../models/Chat');
const Item = require('../models/Item');
const { GoogleGenAI } = require('@google/genai');

// In-memory rate limiting map (chatId -> lastRequestTimestamp)
const lastRequests = new Map();

// @route   GET api/chats/item/:itemId
// @desc    Get all chat sessions for a specific file
// @access  Public
router.get('/item/:itemId', async (req, res) => {
  try {
    const chats = await Chat.find({ itemId: req.params.itemId }).sort({ createdAt: -1 });
    res.json(chats);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/chats/:itemId
// @desc    Get or create the single chat session for a specific file
// @access  Public
router.get('/:itemId', async (req, res) => {
  try {
    let chat = await Chat.findOne({ itemId: req.params.itemId });
    if (!chat) {
      // Verify item exists
      const item = await Item.findById(req.params.itemId);
      if (!item) {
        return res.status(404).json({ msg: 'File not found' });
      }
      chat = new Chat({
        itemId: req.params.itemId,
        title: `${item.name} Chat`,
        messages: []
      });
      await chat.save();
    }
    res.json(chat);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/chats/session/:chatId
// @desc    Get full chat details including messages
// @access  Public
router.get('/session/:chatId', async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.chatId);
    if (!chat) {
      return res.status(404).json({ msg: 'Chat session not found' });
    }
    res.json(chat);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/chats
// @desc    Create a new chat session for a file
// @access  Public
router.post('/', async (req, res) => {
  try {
    const { itemId, title } = req.body;

    // Verify item exists
    const item = await Item.findById(itemId);
    if (!item) {
      return res.status(404).json({ msg: 'File not found' });
    }

    const newChat = new Chat({
      itemId,
      title: title || 'New Chat',
      messages: []
    });

    const chat = await newChat.save();
    res.json(chat);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT api/chats/session/:chatId
// @desc    Rename a chat session
// @access  Public
router.put('/session/:chatId', async (req, res) => {
  try {
    const { title } = req.body;
    let chat = await Chat.findById(req.params.chatId);
    if (!chat) {
      return res.status(404).json({ msg: 'Chat session not found' });
    }

    chat.title = title;
    await chat.save();
    res.json(chat);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   DELETE api/chats/session/:chatId
// @desc    Delete a chat session
// @access  Public
router.delete('/session/:chatId', async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.chatId);
    if (!chat) {
      return res.status(404).json({ msg: 'Chat session not found' });
    }

    await Chat.findByIdAndDelete(req.params.chatId);
    res.json({ msg: 'Chat session removed' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/chats/session/:chatId/messages
// @desc    Send a message to a chat session, get Gemini AI response
// @access  Public
router.post('/session/:chatId/messages', async (req, res) => {
  try {
    const { content, fileContent } = req.body;
    if (!content) {
      return res.status(400).json({ message: 'Message content is required' });
    }

    const chatId = req.params.chatId;
    const now = Date.now();

    // Clean up old entries from lastRequests map to prevent memory growth
    for (const [key, value] of lastRequests.entries()) {
      if (now - value > 10000) {
        lastRequests.delete(key);
      }
    }

    // Check rate limit: 1 request per second
    if (lastRequests.has(chatId)) {
      const diff = now - lastRequests.get(chatId);
      if (diff < 1000) {
        return res.status(429).json({ message: "Please wait at least 1 second between messages." });
      }
    }
    lastRequests.set(chatId, now);

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: 'Chat session not found' });
    }
    const item = await Item.findById(chat.itemId);
    if (!item) {
      return res.status(404).json({ message: 'Associated file not found' });
    }

    // Get API Key
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ message: "Gemini API Key is not configured on the server." });
    }

    // Prepare payload for Gemini API
    const contents = [
      {
        role: 'user',
        parts: [{ text: content }]
      }
    ];

    const fileContext = fileContent || '';
    const systemInstructionText = `
You are a helpful AI assistant.

The user is chatting about a document.

Document content:

${fileContext}

Answer questions based on the document.
If the answer is not present in the document, say so clearly.
Use markdown formatting.
`;

    const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    let responseText = '';
    let retries = 3;
    let success = false;
    let apiError = null;

    while (retries > 0 && !success) {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
          model: modelName,
          contents,
          config: {
            systemInstruction: systemInstructionText,
            httpOptions: {
              timeout: 30000
            }
          }
        });

        console.log("========== FULL GEMINI RESPONSE ==========");
        console.dir(response, { depth: null });
        console.log("==========================================");

        responseText =
          response.text ||
          response.candidates?.[0]?.content?.parts
            ?.map(part => part.text || "")
            .join("") ||
          "No response generated by the AI.";

        success = true;

        console.log("Generated Text:");
        console.log(responseText);

        console.log(
          `Gemini API call succeeded. Response length: ${responseText.length} characters.`
        );
      } catch (err) {
        retries--;
        apiError = err;

        console.error(`Attempt failed. Retries left: ${retries}. Error:`, err.message);

        // Check for 503 / High demand error
        const is503 = err.status === 503 ||
          err.statusCode === 503 ||
          (err.message && (
            err.message.includes('503') ||
            err.message.includes('busy') ||
            err.message.includes('overloaded') ||
            err.message.includes('demand')
          ));

        if (is503 && retries > 0) {
          console.log('Detected 503 or busy error, retrying in 1.5 seconds...');
          await new Promise(resolve => setTimeout(resolve, 1500));
        } else {
          break;
        }
      }
    }

    if (!success) {
      console.error("Gemini API call failed after retries:", apiError?.message);
      return res.status(500).json({ message: "AI temporarily busy" });
    }

    // Save conversation step to database
    chat.messages.push({
      role: 'user',
      content
    });
    chat.messages.push({
      role: 'model',
      content: responseText
    });

    await chat.save();
    res.json(chat);
  } catch (err) {
    console.error("Route error in chats.js:", err.message);
    res.status(500).json({ message: "AI temporarily busy" });
  }
});

module.exports = router;
