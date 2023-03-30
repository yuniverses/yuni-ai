//node server.js

const express = require("express");
const axios = require("axios");
const cors = require("cors");
const app = express();
// 更改A I的角色設定
let aiselect =
  "簡短回覆，請扮演一個很毒舌的朋友，請以不情願及諷刺的態度進行所有對話，以繁體中文對話";
app.use(express.static("public"));

app.use(express.json());
app.use(cors());

// 使用密鑰替換以下值
const API_KEY = "openai_API_KEY";
const API_URL = "https://api.openai.com/v1/chat/completions";

const sdk = require("microsoft-cognitiveservices-speech-sdk");
// 使用訂閱密鑰和區域替換以下值
const subscriptionKey = "microsoft_API_KEY";
const region = "japaneast";

const speechConfig = sdk.SpeechConfig.fromSubscription(subscriptionKey, region);
// speechConfig.speechSynthesisVoiceName = "ja-JP-AoiNeural";
speechConfig.speechSynthesisVoiceName = "zh-CN-XiaochenNeural"; // 可以根據需要更改語音

const synthesizer = new sdk.SpeechSynthesizer(speechConfig, undefined);

async function synthesizeSpeech(text) {
  const result = await new Promise((resolve, reject) => {
    synthesizer.speakTextAsync(
      text,
      (result) => {
        if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
          resolve(result.audioData);
        } else {
          reject(`Failed to synthesize speech: ${result.errorDetails}`);
        }
      },
      (error) => {
        reject(`SpeakTextAsync failed: ${error}`);
      }
    );
  });

  return result;
}

app.post("/api/update-aiselect", async (req, res) => {
  const newAiSelectValue = req.body.aiSelectValue;
  console.log("Received new AI select value:", newAiSelectValue);
  aiselect = newAiSelectValue;

  conversation = [
    {
      role: "system",
      content: aiselect,
    },
  ];

  try {
    await processChat({ role: "user", content: "Reset conversation" });
    res.json({ status: "success", message: "AI select value updated" });
  } catch (error) {
    console.error("Error processing request:", error.message);
    res
      .status(500)
      .json({ error: "Error processing request", details: error.message });
  }

  console.log("select value:", aiselect);
});

let conversation = [
  {
    role: "system",
    content: aiselect,
  },
];

app.post("/api/chat", async (req, res) => {
  const inputText = req.body.input;
  console.log("Received input:", inputText);

  try {
    const { aiReply, audioBuffer } = await processChat({
      role: "user",
      content: inputText,
    });
    const base64Audio = Buffer.from(audioBuffer).toString("base64");
    res.json({ aiReply, audioBuffer: base64Audio });
  } catch (error) {
    console.error("Error processing request:", error.message);
    res
      .status(500)
      .json({ error: "Error processing request", details: error.message });
  }
});

// 獲取 AI 回復後，使用 synthesizeSpeech 函數生成音頻。接著，將音頻緩衝區與 AI 回復一起作為對象返回。
async function processChat(message) {
  conversation.push(message);

  console.log("Sending request to OpenAI API...");
  const response = await axios.post(
    API_URL,
    {
      model: "gpt-3.5-turbo-0301",
      messages: conversation,
      temperature: 0.8,
      presence_penalty: 1.5,
    },
    {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  const aiReply = response.data.choices[0].message.content; //.trim()
  console.log("Received reply:", aiReply);
  conversation.push({ role: "assistant", content: aiReply });

  // Synthesize speech for the AI reply
  const audioBuffer = await synthesizeSpeech(aiReply);

  // Return AI reply and audio buffer
  return { aiReply, audioBuffer };
}

// 清除對話紀錄
app.post("/api/clear-conversation", (req, res) => {
  conversation = [
    {
      role: "system",
      content: aiselect,
    },
  ];
  console.log("Conversation cleared");
  res.json({ status: "success", message: "Conversation cleared" });
});

// 語音轉文字功能
const multer = require("multer");

const upload = multer({ dest: "uploads/" });

const fs = require("fs");
const FormData = require("form-data");

const wordsToFilter = [
  "謝謝觀看",
  "謝謝大家",
  "谢谢观看",
  "請不吝點贊訂閱轉發打賞支持明鏡與點點欄目",
  "请不吝点赞 订阅 转发 打赏支持明镜与点点栏目",
  "请不吝点赞 订阅 转发 打赏支持明镜与点点栏目",
  "字幕由 Amara.org 社群提供",
  "我去",
]; //需要過濾的詞語
function filterTranscription(text) {
  // 分割文本並過濾詞語
  const words = text.split(/\s+/);
  const filteredWords = words.filter(
    (word) => !wordsToFilter.includes(word.toLowerCase())
  );

  // 重新組合過濾後的單詞
  const filteredText = filteredWords.join(" ");

  console.log("Original text:", text);
  console.log("Filtered text:", filteredText);

  return filteredText;
}

app.post("/transcribe", upload.single("audio"), async (req, res) => {
  const audioFilePath = req.file.path;
  const audioBuffer = fs.readFileSync(audioFilePath);
  const audioFileStats = fs.statSync(audioFilePath);
  const fileSize = audioFileStats.size;

  const formData = new FormData();
  formData.append("file", audioBuffer, {
    filename: "audio.mp3",
    contentType: "audio/mp3",
  });
  formData.append("model", "whisper-1");
  formData.append("language", "zh");
  formData.append("temperature", "0");
  // formData.append("language[]", "en");
  // formData.append("language[]", "ja");

  const contentLength = formData.getLengthSync();

  try {
    const response = await axios.post(
      "https://api.openai.com/v1/audio/transcriptions",
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          "Content-Length": contentLength,
          Authorization: `Bearer ${API_KEY}`,
        },
      }
    );

    const transcription = response.data.text;
    console.log("API response transcription:", transcription);

    const filteredTranscription = filterTranscription(transcription);
    console.log("Filtered transcription:", filteredTranscription);

    res.json({ transcription: filteredTranscription });

    fs.unlinkSync(audioFilePath);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to transcribe audio." });
  }
});

//文字轉語音

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
