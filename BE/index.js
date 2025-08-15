import { exec } from "child_process";
import cors from "cors";
import dotenv from "dotenv";
import voice from "elevenlabs-node";
import express from "express";
import { promises as fs } from "fs";
import { GoogleGenerativeAI } from "@google/generative-ai"; // Gemini

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "-");
const elevenLabsApiKey = process.env.ELEVEN_LABS_API_KEY;
const voiceID = "kgG7dCoKCfLehAPWkJOE";

const app = express();
app.use(express.json());
app.use(cors());
const port = 3000;

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.get("/voices", async (req, res) => {
  res.send(await voice.getVoices(elevenLabsApiKey));
});

const execCommand = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) reject(error);
      resolve(stdout);
    });
  });
};

const lipSyncMessage = async (message) => {
  const time = new Date().getTime();
  console.log(`Starting conversion for message ${message}`);
  await execCommand(
    `ffmpeg -y -i audios/message_${message}.mp3 audios/message_${message}.wav`
  );
  console.log(`Conversion done in ${new Date().getTime() - time}ms`);
  await execCommand(
    `.\\bin\\rhubarb.exe -f json -o audios/message_${message}.json audios/message_${message}.wav -r phonetic`
  );
  console.log(`Lip sync done in ${new Date().getTime() - time}ms`);
};

app.post("/chat", async (req, res) => {
  const userMessage = req.body.message;

  // Nếu không có tin nhắn
  if (!userMessage) {
    res.send({
      messages: [
        {
          text: "Hey dear... How was your day?",
          audio: await audioFileToBase64("audios/intro_0.wav"),
          lipsync: await readJsonTranscript("audios/intro_0.json"),
          facialExpression: "smile",
          animation: "Talking_1",
        },
        {
          text: "I missed you so much... Please don't go for so long!",
          audio: await audioFileToBase64("audios/intro_1.wav"),
          lipsync: await readJsonTranscript("audios/intro_1.json"),
          facialExpression: "sad",
          animation: "Crying",
        },
      ],
    });
    return;
  }

  // Nếu chưa có API key
  if (!elevenLabsApiKey || process.env.GOOGLE_API_KEY === "-") {
    res.send({
      messages: [
        {
          text: "Please my dear, don't forget to add your API keys!",
          audio: await audioFileToBase64("audios/api_0.wav"),
          lipsync: await readJsonTranscript("audios/api_0.json"),
          facialExpression: "angry",
          animation: "Angry",
        },
        {
          text: "You don't want to ruin Wawa Sensei with a crazy Gemini and ElevenLabs bill, right?",
          audio: await audioFileToBase64("audios/api_1.wav"),
          lipsync: await readJsonTranscript("audios/api_1.json"),
          facialExpression: "smile",
          animation: "Laughing",
        },
      ],
    });
    return;
  }

  // ---- Gọi Gemini ----
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const prompt = `
You are a friendly virtual learning assistant.
Your job is to help the student understand topics clearly.
Always explain concepts step-by-step, give examples, and encourage the student.
You must always reply with a JSON array called "messages" (max 3 messages).
Each message has:
  - text (string)
  - facialExpression (one of: smile, surprised, default)
  - animation (one of: Talking_0, Talking_1, Talking_2, Idle, Laughing)
Student message: "${userMessage}"
`;

  let messages = [];
  try {
    const result = await model.generateContent(prompt);
    let rawText = result.response.text();

    // Xóa dấu code block nếu có
    rawText = rawText.replace(/```json/g, "").replace(/```/g, "").trim();

    // Thử parse JSON
    const parsed = JSON.parse(rawText);

    // Nếu Gemini trả về { messages: [...] } thì lấy mảng
    messages = Array.isArray(parsed) ? parsed : parsed.messages || [];
  } catch (err) {
    console.error("❌ Lỗi parse JSON từ Gemini:", err);
    messages = [
      {
        text: "Oops, mình hơi bối rối khi trả lời. Bạn có thể hỏi lại được không?",
        facialExpression: "default",
        animation: "Idle",
      },
    ];
  }

  // ---- Sinh audio + lipsync ----
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const fileName = `audios/message_${i}.mp3`;
    await voice.textToSpeech(elevenLabsApiKey, voiceID, fileName, message.text);
    await lipSyncMessage(i);
    message.audio = await audioFileToBase64(fileName);
    message.lipsync = await readJsonTranscript(`audios/message_${i}.json`);
  }

  res.send({ messages });
});

const readJsonTranscript = async (file) => {
  const data = await fs.readFile(file, "utf8");
  return JSON.parse(data);
};

const audioFileToBase64 = async (file) => {
  const data = await fs.readFile(file);
  return data.toString("base64");
};

app.listen(port, () => {
  console.log(`Virtual BestFriend listening on port ${port}`);
});
